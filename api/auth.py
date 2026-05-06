import os
from functools import wraps

import jwt
from flask import request, jsonify

SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET', '')


def require_auth(f):
    """Validate the Supabase JWT on every request.

    The frontend passes `Authorization: Bearer <access_token>` with every
    API call.  We verify the signature using SUPABASE_JWT_SECRET (found in
    Supabase → Project Settings → API → JWT Settings).
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not SUPABASE_JWT_SECRET:
            # Fail loudly during development so misconfiguration is obvious
            return jsonify({'error': 'SUPABASE_JWT_SECRET not configured on the server'}), 500

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authentication required'}), 401

        token = auth_header[len('Bearer '):]
        try:
            jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=['HS256'],
                audience='authenticated',
            )
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Session expired — please sign in again'}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({'error': f'Invalid token: {e}'}), 401

        return f(*args, **kwargs)
    return wrapper
