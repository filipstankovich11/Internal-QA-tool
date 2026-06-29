import json
import os
import random
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))

import anthropic
from flask import Flask, request, jsonify
from flask_cors import CORS

from auth import require_auth
from gorgias_client import GorgiasClient
from scorer import score_ticket

app = Flask(__name__)

_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', 'http://localhost:5173').split(',') if o.strip()]
CORS(app, origins=_cors_origins)


def get_env():
    return (
        os.environ.get('GORGIAS_AUTH'),
        os.environ.get('GORGIAS_DOMAIN', 'gorgias.gorgias.com'),
        os.environ.get('ANTHROPIC_API_KEY'),
    )


def extract_ticket_id(value: str):
    value = value.strip()
    # /ticket/123 or /tickets/123
    match = re.search(r'/tickets?/(\d+)', value)
    if match:
        return int(match.group(1))
    # /views/123456/571031713 — ticket ID is the last numeric segment
    match = re.search(r'/views/\d+/(\d+)', value)
    if match:
        return int(match.group(1))
    if value.isdigit():
        return int(value)
    return None


def extract_agent_senders(ticket: dict, messages: list) -> list:
    """Extract unique agent participants — assignee + message senders — deduped by Gorgias user ID."""
    seen, senders = set(), []

    def add(user: dict):
        if not user:
            return
        gorgias_id = user.get('id')
        key = gorgias_id or user.get('email') or user.get('name')
        if not key or key in seen:
            return
        seen.add(key)
        senders.append({
            'gorgias_user_id': gorgias_id,
            'name':  user.get('name', ''),
            'email': user.get('email', ''),
        })

    # 1. Ticket assignee
    add(ticket.get('assignee_user') or {})

    # 2. All agent message senders
    for msg in messages:
        if msg.get('from_agent'):
            add(msg.get('sender') or {})

    return senders


# ─── Slack webhook ───────────────────────────────────────────────────────────

def _post_slack(webhook_url: str, payload: dict):
    body = json.dumps(payload).encode()
    req  = urllib.request.Request(webhook_url, data=body, headers={'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=5)


def fire_slack_notification(webhook_url: str, result: dict, gorgias_domain: str):
    verdict = result.get('verdict', '')
    emoji   = {'PASS': '✅', 'NEEDS_REVIEW': '⚠️', 'FAIL': '❌'}.get(verdict, '❓')
    agents  = ', '.join(
        s['name'] for s in result.get('agent_senders', []) if s.get('name')
    ) or 'Unknown'
    score      = result.get('weighted_score', 0)
    ticket_id  = result.get('ticket_id', '')
    subject    = result.get('ticket_subject', '') or f'Ticket #{ticket_id}'
    summary    = result.get('summary', '')
    ticket_url = f'https://{gorgias_domain}/app/ticket/{ticket_id}'

    payload = {
        'blocks': [
            {
                'type': 'section',
                'text': {
                    'type': 'mrkdwn',
                    'text': f'{emoji} *QA Score — <{ticket_url}|#{ticket_id}>*\n{subject}',
                },
            },
            {
                'type': 'section',
                'fields': [
                    {'type': 'mrkdwn', 'text': f'*Agent*\n{agents}'},
                    {'type': 'mrkdwn', 'text': f'*Score*\n{score:.1f} / 100 — {verdict}'},
                ],
            },
        ]
    }
    if summary:
        payload['blocks'].append({
            'type': 'section',
            'text': {'type': 'mrkdwn', 'text': f'_{summary}_'},
        })

    _post_slack(webhook_url, payload)


# ─── Score a single ticket ───────────────────────────────────────────────────

@app.route('/api/score', methods=['POST'])
@require_auth
def score():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    ticket_id          = extract_ticket_id(data.get('ticket_url', ''))
    rubric             = data.get('rubric') or None
    few_shot_examples  = data.get('few_shot_examples') or []
    if not ticket_id:
        return jsonify({'error': 'Could not find a ticket ID in the URL'}), 400

    gorgias_auth, gorgias_domain, anthropic_key = get_env()
    if not gorgias_auth:
        return jsonify({'error': 'GORGIAS_AUTH not configured'}), 500
    if not anthropic_key:
        return jsonify({'error': 'ANTHROPIC_API_KEY not configured'}), 500

    gorgias = GorgiasClient(domain=gorgias_domain, auth_header=gorgias_auth)
    claude  = anthropic.Anthropic(api_key=anthropic_key)

    try:
        ticket   = gorgias.get_ticket(ticket_id)
        messages = gorgias.get_ticket_messages(ticket_id)
    except Exception as e:
        return jsonify({'error': f'Failed to fetch ticket: {e}'}), 502

    if not any(m.get('from_agent') for m in messages):
        return jsonify({'error': 'This ticket has no agent responses to evaluate'}), 400

    try:
        result = score_ticket(claude, ticket, messages, rubric=rubric, few_shot_examples=few_shot_examples)
        result['agent_senders'] = extract_agent_senders(ticket, messages)
        result['ticket_subject'] = ticket.get('subject', '')
    except Exception as e:
        return jsonify({'error': f'Scoring failed: {e}'}), 500

    webhook_url = ((rubric or {}).get('slack_webhook_url') or '').strip()
    if webhook_url:
        try:
            fire_slack_notification(webhook_url, result, gorgias_domain)
        except Exception:
            pass  # Don't fail the score response if the webhook errors

    return jsonify(result)


# ─── Test Slack webhook ───────────────────────────────────────────────────────

@app.route('/api/test-webhook', methods=['POST'])
@require_auth
def test_webhook():
    data        = request.get_json(silent=True) or {}
    webhook_url = (data.get('webhook_url') or '').strip()
    if not webhook_url:
        return jsonify({'error': 'webhook_url is required'}), 400
    try:
        _post_slack(webhook_url, {
            'text': '✅ Your QA Scorer webhook is connected and working!',
        })
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 502


# ─── Notify agent via Slack DM ───────────────────────────────────────────────

@app.route('/api/slack-status', methods=['GET'])
@require_auth
def slack_status():
    configured = bool((os.environ.get('SLACK_BOT_TOKEN') or '').strip())
    return jsonify({'configured': configured})


@app.route('/api/notify-agent', methods=['POST'])
@require_auth
def notify_agent():
    data          = request.get_json(silent=True) or {}
    bot_token     = (os.environ.get('SLACK_BOT_TOKEN') or '').strip()
    agent_email   = (data.get('agent_email') or '').strip()
    score_data    = data.get('score') or {}
    reviewer_note = (data.get('reviewer_note') or '').strip()

    if not bot_token:
        return jsonify({'error': 'SLACK_BOT_TOKEN is not configured on the server'}), 400
    if not agent_email:
        return jsonify({'error': 'Agent email is required to send a Slack DM'}), 400

    # ── Look up the Slack user by email ──────────────────────────────────────
    try:
        lookup_url = 'https://slack.com/api/users.lookupByEmail?' + urllib.parse.urlencode({'email': agent_email})
        lookup_req = urllib.request.Request(lookup_url, headers={'Authorization': f'Bearer {bot_token}'})
        with urllib.request.urlopen(lookup_req, timeout=8) as resp:
            lookup = json.loads(resp.read())
    except Exception as e:
        return jsonify({'error': f'Could not reach Slack API: {e}'}), 502

    if not lookup.get('ok'):
        slack_err = lookup.get('error', 'unknown')
        if slack_err == 'users_not_found':
            return jsonify({'error': f'No Slack account found for {agent_email}'}), 404
        if slack_err in ('invalid_auth', 'not_authed', 'token_revoked'):
            return jsonify({'error': 'Slack Bot Token is invalid or revoked'}), 401
        return jsonify({'error': f'Slack error: {slack_err}'}), 502

    slack_user_id = lookup['user']['id']

    # ── Build the DM message ─────────────────────────────────────────────────
    verdict    = score_data.get('verdict', '')
    score      = float(score_data.get('weighted_score') or 0)
    ticket_id  = score_data.get('ticket_id', '')
    subject    = score_data.get('ticket_subject', '') or f'Ticket #{ticket_id}'
    summary    = score_data.get('summary', '')
    improvements = score_data.get('key_improvements') or []
    emoji      = {'PASS': '✅', 'NEEDS_REVIEW': '⚠️', 'FAIL': '❌'}.get(verdict, '❓')
    _, gorgias_domain, _ = get_env()
    ticket_url = f'https://{gorgias_domain}/app/ticket/{ticket_id}'

    blocks = [
        {
            'type': 'section',
            'text': {
                'type': 'mrkdwn',
                'text': f'{emoji} *QA Score — <{ticket_url}|#{ticket_id}>*\n_{subject}_',
            },
        },
        {
            'type': 'section',
            'fields': [
                {'type': 'mrkdwn', 'text': f'*Score*\n{score:.1f} / 100'},
                {'type': 'mrkdwn', 'text': f'*Verdict*\n{verdict.replace("_", " ")}'},
            ],
        },
    ]

    if summary:
        blocks.append({
            'type': 'section',
            'text': {'type': 'mrkdwn', 'text': f'*Summary*\n{summary}'},
        })

    if improvements:
        imp_lines = '\n'.join(f'{i + 1}. {imp}' for i, imp in enumerate(improvements))
        blocks.append({
            'type': 'section',
            'text': {'type': 'mrkdwn', 'text': f'*Key Improvements*\n{imp_lines}'},
        })

    if reviewer_note:
        blocks.append({
            'type': 'section',
            'text': {'type': 'mrkdwn', 'text': f'*Reviewer Note*\n_{reviewer_note}_'},
        })

    blocks.append({'type': 'divider'})
    blocks.append({
        'type': 'context',
        'elements': [{'type': 'mrkdwn', 'text': 'Sent by your QA tool · <' + ticket_url + '|View ticket>'}],
    })

    # ── Send the DM ──────────────────────────────────────────────────────────
    try:
        msg_body = json.dumps({'channel': slack_user_id, 'blocks': blocks}).encode()
        msg_req  = urllib.request.Request(
            'https://slack.com/api/chat.postMessage',
            data=msg_body,
            headers={'Authorization': f'Bearer {bot_token}', 'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(msg_req, timeout=8) as resp:
            msg_result = json.loads(resp.read())
    except Exception as e:
        return jsonify({'error': f'Failed to send Slack message: {e}'}), 502

    if not msg_result.get('ok'):
        return jsonify({'error': f'Slack error: {msg_result.get("error", "unknown")}'}), 502

    return jsonify({'ok': True})


# ─── List Gorgias users (for agent import) ───────────────────────────────────

@app.route('/api/gorgias-users', methods=['GET'])
@require_auth
def gorgias_users():
    gorgias_auth, gorgias_domain, _ = get_env()
    if not gorgias_auth:
        return jsonify({'error': 'GORGIAS_AUTH not configured'}), 500

    gorgias = GorgiasClient(domain=gorgias_domain, auth_header=gorgias_auth)
    try:
        users, cursor = [], None
        while True:
            params = {'limit': 100, 'order_by': 'name:asc'}
            if cursor:
                params['cursor'] = cursor
            data = gorgias._get('/users', params=params)
            for u in data.get('data', []):
                # Skip bots / automation accounts
                if u.get('role') in ('bot', 'automation'):
                    continue
                users.append({
                    'gorgias_user_id': u['id'],
                    'name':  u.get('name', ''),
                    'email': u.get('email', ''),
                })
            cursor = data.get('meta', {}).get('next_cursor')
            if not cursor:
                break
        return jsonify({'users': users})
    except Exception as e:
        return jsonify({'error': str(e)}), 502


# ─── List Gorgias views ───────────────────────────────────────────────────────

@app.route('/api/views', methods=['GET'])
@require_auth
def list_views():
    gorgias_auth, gorgias_domain, _ = get_env()
    if not gorgias_auth:
        return jsonify({'error': 'GORGIAS_AUTH not configured'}), 500

    gorgias = GorgiasClient(domain=gorgias_domain, auth_header=gorgias_auth)
    try:
        data  = gorgias._get('/views', params={'limit': 100, 'order_by': 'created_datetime:desc'})
        views = [
            {'id': v['id'], 'name': v.get('name', f'View #{v["id"]}')}
            for v in data.get('data', [])
        ]
        return jsonify({'views': views})
    except Exception as e:
        return jsonify({'error': str(e)}), 502


# ─── Get ticket IDs from a view ───────────────────────────────────────────────

@app.route('/api/view-tickets', methods=['GET'])
@require_auth
def view_tickets():
    view_id = request.args.get('view_id')
    limit   = min(int(request.args.get('limit', 30)), 100)

    if not view_id:
        return jsonify({'error': 'view_id is required'}), 400

    gorgias_auth, gorgias_domain, _ = get_env()
    if not gorgias_auth:
        return jsonify({'error': 'GORGIAS_AUTH not configured'}), 500

    gorgias = GorgiasClient(domain=gorgias_domain, auth_header=gorgias_auth)
    try:
        data    = gorgias._get('/tickets', params={'view_id': view_id, 'limit': limit})
        tickets = [
            {'id': t['id'], 'subject': t.get('subject', ''), 'status': t.get('status', '')}
            for t in data.get('data', [])
        ]
        return jsonify({'tickets': tickets, 'total': data.get('meta', {}).get('total_resources', len(tickets))})
    except Exception as e:
        return jsonify({'error': str(e)}), 502


# ─── Random ticket sampler ────────────────────────────────────────────────────

@app.route('/api/sample-tickets', methods=['GET'])
@require_auth
def sample_tickets():
    gorgias_user_id = request.args.get('gorgias_user_id', type=int)
    date_from       = request.args.get('date_from')   # YYYY-MM-DD
    date_to         = request.args.get('date_to')     # YYYY-MM-DD
    count           = min(int(request.args.get('count', 5)), 20)

    if not gorgias_user_id:
        return jsonify({'error': 'gorgias_user_id is required'}), 400

    gorgias_auth, gorgias_domain, _ = get_env()
    if not gorgias_auth:
        return jsonify({'error': 'GORGIAS_AUTH not configured'}), 500

    gorgias = GorgiasClient(domain=gorgias_domain, auth_header=gorgias_auth)
    try:
        tickets = gorgias.list_tickets_by_agent(gorgias_user_id, date_from, date_to)
        sampled = random.sample(tickets, min(count, len(tickets)))
        return jsonify({
            'tickets': [{'id': t['id'], 'subject': t.get('subject', ''), 'status': t.get('status', '')} for t in sampled],
            'total_found': len(tickets),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 502


# ─── Ticket conversation (for the score form transcript) ──────────────────────

@app.route('/api/ticket-messages', methods=['GET'])
@require_auth
def ticket_messages():
    ticket_id = request.args.get('ticket_id', type=int)
    if not ticket_id:
        return jsonify({'error': 'ticket_id is required'}), 400

    gorgias_auth, gorgias_domain, _ = get_env()
    if not gorgias_auth:
        return jsonify({'error': 'GORGIAS_AUTH not configured'}), 500

    gorgias = GorgiasClient(domain=gorgias_domain, auth_header=gorgias_auth)
    try:
        msgs = gorgias.get_ticket_messages(ticket_id)
        out = []
        for m in msgs:
            body = m.get('body_text') or ''
            if not body and m.get('body_html'):
                body = re.sub(r'<[^>]+>', ' ', m.get('body_html', ''))
                body = re.sub(r'\s+', ' ', body).strip()
            sender = m.get('sender') or {}
            out.append({
                'id':         m.get('id'),
                'from_agent': bool(m.get('from_agent')),
                'public':     bool(m.get('public', True)),
                'author':     sender.get('name') or sender.get('email') or ('Agent' if m.get('from_agent') else 'Customer'),
                'created_at': m.get('created_datetime', ''),
                'body':       body or '(no text content)',
            })
        return jsonify({'messages': out})
    except Exception as e:
        return jsonify({'error': str(e)}), 502


# ─── Vercel handler ───────────────────────────────────────────────────────────

handler = app

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
    app.run(port=5001, debug=True)
