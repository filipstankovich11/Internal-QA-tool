import os
import json
import time
import urllib.parse
import urllib.request
from functools import wraps

import jwt
from flask import request, jsonify, g

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
                claims = jwt.decode(token, public_key, algorithms=[alg], audience='authenticated')
            else:
                secret = os.environ.get('SUPABASE_JWT_SECRET', '')
                if not secret:
                    return jsonify({'error': 'SUPABASE_JWT_SECRET not configured on the server'}), 500
                claims = jwt.decode(token, secret, algorithms=['HS256'], audience='authenticated')

        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Session expired — please sign in again'}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({'error': f'Invalid token: {e}'}), 401

        g.jwt_claims = claims
        g.jwt_token = token
        return f(*args, **kwargs)
    return wrapper


# ─── App-role authorization ────────────────────────────────────────────────────
# The Supabase JWT proves identity but never carries the app role (that lives in
# public.profiles). All lookups below run against PostgREST as the caller —
# their own JWT plus the anon key — so row-level security stays in force and
# the API needs no privileged Supabase credential.

_role_cache = {}   # user_id -> (role, fetched_at)
_ROLE_TTL = 60     # seconds; keeps role changes near-immediate without a query per request


def _anon_key():
    return (
        os.environ.get('SUPABASE_ANON_KEY') or
        os.environ.get('VITE_SUPABASE_ANON_KEY', '')
    )


def _rest_get(path, token):
    base = _supabase_url()
    anon = _anon_key()
    if not base or not anon:
        return None
    req = urllib.request.Request(f"{base}/rest/v1/{path}", headers={
        'apikey': anon,
        'Authorization': f'Bearer {token}',
    })
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def get_caller_role():
    """App role ('admin' / 'lead' / 'agent') from the caller's own profiles row.

    Only usable inside a @require_auth-wrapped request. Returns None when the
    role can't be determined — callers must treat None as unauthorized.
    """
    user_id = (getattr(g, 'jwt_claims', None) or {}).get('sub')
    if not user_id:
        return None
    cached = _role_cache.get(user_id)
    if cached and time.time() - cached[1] < _ROLE_TTL:
        return cached[0]
    try:
        rows = _rest_get(f"profiles?id=eq.{urllib.parse.quote(user_id)}&select=role", g.jwt_token)
    except Exception:
        return None
    role = rows[0].get('role') if rows else None
    if role:  # cache successes only, so a transient failure can't lock a user out for the TTL
        _role_cache[user_id] = (role, time.time())
    return role


def require_role(*roles):
    """require_auth plus an app-role check: 403 unless the caller's profile
    role is one of `roles`. Use for endpoints that proxy privileged secrets
    (Gorgias, Anthropic, Slack) — mirror of the admin/lead RLS policies."""
    def decorator(f):
        @wraps(f)
        @require_auth
        def wrapper(*args, **kwargs):
            if get_caller_role() not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator


def caller_is_agent_on_ticket(ticket_id):
    """True when the caller's linked agent (matched by JWT email, same rule as
    the RLS policies) appears on a score row for this ticket."""
    email = (getattr(g, 'jwt_claims', None) or {}).get('email', '')
    if not email:
        return False
    try:
        agents = _rest_get(f"agents?email=eq.{urllib.parse.quote(email)}&select=id", g.jwt_token) or []
        for a in agents:
            scores = _rest_get(
                f"scores?ticket_id=eq.{urllib.parse.quote(str(ticket_id))}"
                f"&agent_ids=cs.{{{a['id']}}}&select=id&limit=1",
                g.jwt_token,
            ) or []
            if scores:
                return True
    except Exception:
        return False
    return False
