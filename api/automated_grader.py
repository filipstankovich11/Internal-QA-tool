"""Server-side grading for the Cortex scheduler. No rubric or team is trusted from callers."""

import copy
import hmac
import os

import anthropic
import requests

from gorgias_client import GorgiasClient
from rubric import DEFAULT_RUBRIC
from scorer import score_ticket


class GradingError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def authorized(secret):
    expected = os.environ.get('CORTEX_INGEST_SECRET', '')
    return bool(expected and secret and hmac.compare_digest(expected, secret))


def supabase_request(table, params=None, payload=None):
    base = os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not base or not key:
        raise GradingError('Supabase server credentials are not configured', 503)
    url = f"{base.rstrip('/')}/rest/v1/{table}"
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    if payload is not None:
        headers['Prefer'] = 'return=representation'
    response = (requests.post(url, params=params, json=payload, headers=headers, timeout=30)
                if payload is not None else
                requests.get(url, params=params, headers=headers, timeout=30))
    if not response.ok:
        raise GradingError(f'Score database request failed ({response.status_code})')
    return response.json()


def one(table, params):
    rows = supabase_request(table, params)
    return rows[0] if rows else None


def assigned_team_id(ticket):
    team = ticket.get('assignee_team') or {}
    value = team.get('id') if isinstance(team, dict) else team
    value = value or ticket.get('assignee_team_id')
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def normalize_score(result, rubric):
    """Recalculate numeric values from criterion scores; reject malformed model output."""
    if result.get('error') or not isinstance(result.get('scores'), dict):
        raise GradingError('AI scoring returned an invalid score', 502)
    total = 0.0
    for dimension in rubric['dimensions']:
        row = result['scores'].get(dimension['id'])
        if not isinstance(row, dict) or not dimension.get('criteria'):
            raise GradingError('AI scoring omitted a rubric dimension', 502)
        values = []
        for criterion in dimension['criteria']:
            item = row.get(criterion['id'])
            if not isinstance(item, dict):
                raise GradingError('AI scoring omitted a rubric criterion', 502)
            try:
                value = float(item['score'])
            except (KeyError, TypeError, ValueError):
                raise GradingError('AI scoring returned an invalid criterion score', 502)
            if not 1 <= value <= 5:
                raise GradingError('AI scoring returned a score outside 1–5', 502)
            values.append(value)
        average = sum(values) / len(values)
        row['dimension_average'] = round(average, 1)
        row['weight'] = dimension['weight'] / 100
        total += average * dimension['weight'] / 100
    total = round(total * 20, 1)
    result['weighted_score'] = total
    thresholds = rubric['verdict_thresholds']
    auto_fail = result.get('auto_fail') or {}
    result['verdict'] = ('FAIL' if auto_fail.get('triggered') or total < thresholds['needs_review']
                         else 'PASS' if total >= thresholds['pass'] else 'NEEDS_REVIEW')
    return result


def match_agents(senders):
    agents = supabase_request('agents', {'select': 'id,name,email,gorgias_user_id'})
    matches = []
    for sender in senders:
        for agent in agents:
            same_id = (sender.get('gorgias_user_id') is not None and agent.get('gorgias_user_id') is not None
                       and str(sender['gorgias_user_id']) == str(agent['gorgias_user_id']))
            same_email = (sender.get('email') and agent.get('email')
                          and sender['email'].casefold() == agent['email'].casefold())
            same_name = (sender.get('name') and agent.get('name')
                         and sender['name'].casefold() == agent['name'].casefold())
            if (same_id or same_email or same_name) and agent['id'] not in matches:
                matches.append(agent['id'])
                break
    return matches


def grade(ticket_id, extract_agent_senders):
    previous = one('scores', {'select': 'id,verdict,weighted_score', 'ticket_id': f'eq.{ticket_id}',
                              'source': 'eq.cortex', 'limit': 1})
    if previous:
        return {'score_id': previous['id'], 'verdict': previous['verdict'],
                'weighted_score': previous['weighted_score'], 'already_scored': True}

    gorgias_auth = os.environ.get('GORGIAS_AUTH')
    anthropic_key = os.environ.get('ANTHROPIC_API_KEY')
    if not gorgias_auth or not anthropic_key:
        raise GradingError('Gorgias or Anthropic credentials are not configured', 503)
    gorgias = GorgiasClient(os.environ.get('GORGIAS_DOMAIN', 'gorgias.gorgias.com'), gorgias_auth)
    ticket = gorgias.get_ticket(ticket_id)
    messages = gorgias.get_ticket_messages(ticket_id)
    if not any(msg.get('from_agent') for msg in messages):
        return {'ticket_id': ticket_id, 'skipped': True, 'reason': 'No agent response'}
    team_id = assigned_team_id(ticket)
    if team_id is None:
        raise GradingError('Ticket has no Gorgias assigned team; map it before grading', 422)
    team = one('teams', {'select': 'id,name', 'gorgias_team_id': f'eq.{team_id}', 'limit': 1})
    if not team:
        raise GradingError(f'Gorgias team {team_id} is not mapped in QA guidance', 422)

    saved_rubric = one('rubric', {'select': 'config', 'id': 'eq.1', 'limit': 1})
    rubric = copy.deepcopy(saved_rubric['config'] if saved_rubric else DEFAULT_RUBRIC)
    guidance = one('team_guidance', {'select': 'published_text,published_version',
                                     'team_id': f"eq.{team['id']}", 'limit': 1})
    published = (guidance or {}).get('published_text') or ''
    shared = (rubric.get('scoring_guidance') or '').strip()
    rubric['scoring_guidance'] = '\n\n'.join(part for part in (
        'Use this guidance as context. The shared rubric criteria, weights, and verdict thresholds remain authoritative.',
        f'Shared guidance:\n{shared}' if shared else '',
        f"Additional guidance for {team['name']}:\n{published}" if published else '',
    ) if part)

    result = score_ticket(anthropic.Anthropic(api_key=anthropic_key), ticket, messages, rubric=rubric)
    result = normalize_score(result, rubric)
    senders = extract_agent_senders(ticket, messages)
    result['agent_senders'] = senders
    result['ticket_subject'] = ticket.get('subject', '')
    result['scoring_context'] = {
        'source': 'cortex', 'team_id': team['id'], 'team_name': team['name'],
        'gorgias_team_id': team_id,
        'guidance_version': guidance['published_version'] if published else None,
        'guidance_text': published or None,
    }
    rows = supabase_request('scores', payload={
        'ticket_id': str(ticket_id), 'ticket_subject': result['ticket_subject'],
        'verdict': result['verdict'], 'weighted_score': result['weighted_score'],
        'agent_ids': match_agents(senders), 'full_score': result, 'source': 'cortex',
    })
    if not rows:
        raise GradingError('Score database returned no saved record')
    return {'score_id': rows[0]['id'], 'verdict': result['verdict'],
            'weighted_score': result['weighted_score'], 'team': team['name'],
            'guidance_version': result['scoring_context']['guidance_version'], 'already_scored': False}
