import json
import os
import urllib.request
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta, timezone


# ── Supabase helpers ──────────────────────────────────────────────────────────

def _supabase_headers():
    key = (os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or
           os.environ.get('VITE_SUPABASE_ANON_KEY') or '')
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }


def _supabase_get(table, params=None):
    base = os.environ.get('VITE_SUPABASE_URL', '').rstrip('/')
    url  = f'{base}/rest/v1/{table}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_supabase_headers())
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


# ── Digest data builder ───────────────────────────────────────────────────────

def build_digest_data():
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    scores = _supabase_get('scores', {
        'select': 'full_score,verdict,weighted_score,agent_ids,scored_at',
        'scored_at': f'gte.{week_ago}',
        'order': 'scored_at.desc',
        'limit': 1000,
    })

    agents_raw = _supabase_get('agents', {'select': 'id,name,email'})
    agent_map  = {a['id']: a for a in agents_raw}

    total = len(scores)
    if total == 0:
        return None

    verdicts  = Counter(s.get('verdict', '') for s in scores)
    pass_rate = round((verdicts.get('PASS', 0) / total) * 100)
    avg_score = sum((s.get('weighted_score') or 0) for s in scores) / total

    # Per-agent averages
    agent_score_map = {}
    for s in scores:
        for aid in (s.get('agent_ids') or []):
            agent_score_map.setdefault(aid, []).append(s.get('weighted_score') or 0)

    top_agents = sorted(
        [
            {
                'name':  agent_map.get(aid, {}).get('name', 'Unknown'),
                'avg':   round(sum(vals) / len(vals), 1),
                'count': len(vals),
            }
            for aid, vals in agent_score_map.items()
        ],
        key=lambda x: -x['avg'],
    )[:5]

    # Most common failure reasons from key_improvements
    all_improvements = []
    for s in scores:
        full = s.get('full_score') or {}
        if isinstance(full, str):
            try:    full = json.loads(full)
            except: full = {}
        for imp in (full.get('key_improvements') or []):
            if imp:
                all_improvements.append(str(imp).strip())

    top_improvements = [text for text, _ in Counter(all_improvements).most_common(5)]

    return {
        'total':            total,
        'pass_rate':        pass_rate,
        'avg_score':        round(avg_score, 1),
        'verdicts':         dict(verdicts),
        'top_agents':       top_agents,
        'top_improvements': top_improvements,
        'week_start':       week_ago[:10],
        'week_end':         datetime.now(timezone.utc).strftime('%Y-%m-%d'),
    }


# ── HTML email builder ────────────────────────────────────────────────────────

def build_html_email(data):
    pass_color   = '#10b981'
    review_color = '#f59e0b'
    fail_color   = '#ef4444'
    brand_color  = '#FF9780'

    total    = data['total']
    verdicts = data['verdicts']
    n_pass   = verdicts.get('PASS', 0)
    n_review = verdicts.get('NEEDS_REVIEW', 0)
    n_fail   = verdicts.get('FAIL', 0)

    pass_pct   = round((n_pass   / total) * 100) if total else 0
    review_pct = round((n_review / total) * 100) if total else 0
    fail_pct   = round((n_fail   / total) * 100) if total else 0

    # Top agents rows
    agent_rows = ''
    medals = ['🥇', '🥈', '🥉', '', '']
    for i, a in enumerate(data['top_agents']):
        score_color = pass_color if a['avg'] >= 80 else (review_color if a['avg'] >= 60 else fail_color)
        agent_rows += f'''
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">
            {medals[i]} {a["name"]}
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:{score_color};font-weight:600;text-align:right;">
            {a["avg"]}/100
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#999;text-align:right;">
            {a["count"]} ticket{"s" if a["count"] != 1 else ""}
          </td>
        </tr>'''

    # Improvement items
    improvement_items = ''
    for imp in data['top_improvements']:
        improvement_items += f'<li style="margin-bottom:8px;font-size:14px;color:#555;line-height:1.5;">{imp}</li>'

    if not improvement_items:
        improvement_items = '<li style="font-size:14px;color:#999;">No recurring improvement patterns this week.</li>'

    return f'''<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0f0f0f;border-radius:16px 16px 0 0;padding:32px 40px;">
            <p style="margin:0 0 4px;font-size:12px;color:#666;letter-spacing:0.1em;text-transform:uppercase;">Weekly Digest</p>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff;">QA Summary</h1>
            <p style="margin:8px 0 0;font-size:13px;color:#888;">{data["week_start"]} – {data["week_end"]}</p>
          </td>
        </tr>

        <!-- Top metrics -->
        <tr>
          <td style="background:#fff;padding:32px 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="33%" style="text-align:center;padding:0 8px 0 0;">
                  <div style="background:#f9f9f9;border-radius:12px;padding:20px 16px;">
                    <p style="margin:0;font-size:32px;font-weight:700;color:#111;">{total}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#999;">Tickets scored</p>
                  </div>
                </td>
                <td width="33%" style="text-align:center;padding:0 4px;">
                  <div style="background:#f9f9f9;border-radius:12px;padding:20px 16px;">
                    <p style="margin:0;font-size:32px;font-weight:700;color:{pass_color if data["pass_rate"] >= 80 else (review_color if data["pass_rate"] >= 60 else fail_color)};">{data["pass_rate"]}%</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#999;">Pass rate</p>
                  </div>
                </td>
                <td width="33%" style="text-align:center;padding:0 0 0 8px;">
                  <div style="background:#f9f9f9;border-radius:12px;padding:20px 16px;">
                    <p style="margin:0;font-size:32px;font-weight:700;color:{pass_color if data["avg_score"] >= 80 else (review_color if data["avg_score"] >= 60 else fail_color)};">{data["avg_score"]}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#999;">Avg score</p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Verdict breakdown bar -->
            <div style="margin-top:24px;">
              <p style="margin:0 0 10px;font-size:12px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Verdict breakdown</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  {f'<td style="width:{pass_pct}%;background:{pass_color};height:8px;border-radius:4px 0 0 4px;"></td>' if pass_pct else ''}
                  {f'<td style="width:{review_pct}%;background:{review_color};height:8px;"></td>' if review_pct else ''}
                  {f'<td style="width:{fail_pct}%;background:{fail_color};height:8px;border-radius:0 4px 4px 0;"></td>' if fail_pct else ''}
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:{pass_color};"><span style="font-weight:600;">{n_pass}</span> Pass ({pass_pct}%)</td>
                  <td style="font-size:12px;color:{review_color};text-align:center;"><span style="font-weight:600;">{n_review}</span> Review ({review_pct}%)</td>
                  <td style="font-size:12px;color:{fail_color};text-align:right;"><span style="font-weight:600;">{n_fail}</span> Fail ({fail_pct}%)</td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- Top agents -->
        <tr>
          <td style="background:#fff;padding:0 40px 32px;">
            <p style="margin:0 0 14px;font-size:12px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Top agents this week</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;">
              {agent_rows if agent_rows else '<tr><td style="padding:16px;font-size:14px;color:#999;text-align:center;">No agent data this week.</td></tr>'}
            </table>
          </td>
        </tr>

        <!-- Common improvements -->
        <tr>
          <td style="background:#fff;padding:0 40px 40px;">
            <p style="margin:0 0 14px;font-size:12px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Most common coaching points</p>
            <div style="background:#fffbf8;border:1px solid #ffe8e0;border-radius:10px;padding:20px 24px;">
              <ul style="margin:0;padding-left:20px;">
                {improvement_items}
              </ul>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0f0f0f;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#555;">Sent automatically by your QA tool · Reply to unsubscribe</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>'''


# ── Email sender (Resend) ─────────────────────────────────────────────────────

def send_digest_email(data):
    api_key    = (os.environ.get('RESEND_API_KEY') or '').strip()
    recipients = [e.strip() for e in (os.environ.get('DIGEST_RECIPIENTS') or '').split(',') if e.strip()]
    from_addr  = (os.environ.get('DIGEST_FROM') or 'QA Tool <digest@yourdomain.com>').strip()

    if not api_key:
        raise ValueError('RESEND_API_KEY is not configured')
    if not recipients:
        raise ValueError('DIGEST_RECIPIENTS is not configured')

    html    = build_html_email(data)
    subject = f'QA Weekly Digest — {data["week_start"]} to {data["week_end"]}'

    payload = json.dumps({
        'from':    from_addr,
        'to':      recipients,
        'subject': subject,
        'html':    html,
    }).encode()

    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type':  'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())
