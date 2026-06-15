import os
import json
import time
import urllib.request
from functools import wraps

import jwt
from flask import request, jsonify

_jwks_cache = None
_jwks_fetched_at = 0.0
_JWKS_TTL = 3600  # re-fetch signing keys at most once per hour


def _supabase_url():
    return (
        os.environ.get('SUPABASE_URL') or
        os.environ.get('VITE_SUPABASE_URL', '')
    ).rstrip('/')


def _get_jwks():
    global _jwks_cache, _jwks_fetched_at
    if _jwks_cache is not None and (time.time() - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache
    base = _supabase_url()
    if not base:
        return None
    try:
        url = f"{base}/auth/v1/.well-known/jwks.json"
        with urllib.request.urlopen(url, timeout=5) as resp:
            _jwks_cache = json.loads(resp.read())
            _jwks_fetched_at = time.time()
    except Exception:
        # Return stale cache if available rather than failing all auth requests
        pass
    return _jwks_cache


def _asymmetric_public_key(token):
    """Return the public key matching the token's kid from Supabase JWKS (RS256 or ES256)."""
    header = jwt.get_unverified_header(token)
    kid = header.get('kid')
    alg = header.get('alg', '')
    jwks = _get_jwks()
    if not jwks:
        return None
    for key in jwks.get('keys', []):
        if key.get('kid') == kid:
            if alg.startswith('RS'):
                return jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
            elif alg.startswith('ES'):
                return jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(key))
    return None


def require_auth(f):
    """Validate the Supabase JWT on every request.

    Supports both the legacy HS256 secret and the new RS256 signing keys
    (Supabase migrated projects to RS256 asymmetric keys).
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authentication required'}), 401

        token = auth_header[len('Bearer '):]
        try:
            header = jwt.get_unverified_header(token)
            alg = header.get('alg', 'HS256')

            if alg in ('RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'):
                public_key = _asymmetric_public_key(token)
                if not public_key:
                    return jsonify({'error': f'Could not resolve {alg} signing key — ensure SUPABASE_URL or VITE_SUPABASE_URL is set'}), 401
                jwt.decode(token, public_key, algorithms=[alg], audience='authenticated')
            else:
                secret = os.environ.get('SUPABASE_JWT_SECRET', '')
                if not secret:
                    return jsonify({'error': 'SUPABASE_JWT_SECRET not configured on the server'}), 500
                jwt.decode(token, secret, algorithms=['HS256'], audience='authenticated')

        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Session expired — please sign in again'}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({'error': f'Invalid token: {e}'}), 401

        return f(*args, **kwargs)
    return wrapper
