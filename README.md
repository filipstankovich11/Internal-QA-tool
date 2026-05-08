# Gorgias Internal QA Tool

An AI-powered QA scoring tool for Gorgias support tickets. Score individual tickets, run batch scoring via CSV or Gorgias views, manage agents and teams, and send Slack DM feedback to agents.

---

## Features

- **Single ticket scoring** — paste a Gorgias ticket URL or ID and get an AI-generated QA score
- **Batch scoring** — upload a CSV or pull tickets directly from a Gorgias view
- **Score history** — filterable by agent, date range, and verdict
- **Agent & team management** — import agents from Gorgias, assign to teams
- **QA Guidance / Rubric editor** — customise scoring dimensions, weights, auto-fail conditions, and free-text scoring guidance
- **Slack DM notifications** — send formatted QA feedback directly to an agent's Slack DM with a preview before sending
- **Review queue** — manage tickets pending review
- **Coaching page** — agent-level coaching insights
- **Role-based access** — admin and agent roles via Supabase Auth

---

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/filipstankovich11/Internal-QA-tool.git
cd Internal-QA-tool
```

### 2. Install frontend dependencies
```bash
npm install
```

### 3. Install Python dependencies
```bash
cd api
pip3.11 install -r requirements.txt
cd ..
```

> Requires **Python 3.10+** (the API uses `dict | None` type syntax).

### 4. Configure environment variables
```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Python API
VITE_API_URL=http://localhost:5001

# Gorgias (required for API server)
GORGIAS_AUTH=Basic your-base64-encoded-credentials
GORGIAS_DOMAIN=yourcompany.gorgias.com

# Anthropic (required for AI scoring)
ANTHROPIC_API_KEY=sk-ant-...

# Slack (optional — enables DM notifications)
SLACK_BOT_TOKEN=xoxb-...
```

**Notes:**
- `VITE_SUPABASE_URL` is also used by the Python server to verify JWTs via Supabase's JWKS endpoint — no separate `SUPABASE_JWT_SECRET` needed.
- `SLACK_BOT_TOKEN` requires a Slack app with `users:read.email` and `chat:write` scopes installed in your workspace.

### 5. Run locally

In two separate terminals:

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — API server
python3.11 api/score.py
```

App available at http://localhost:5173

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Auth | Supabase Auth (ES256 JWT) |
| Database | Supabase (Postgres) |
| AI scoring | Anthropic Claude (claude-sonnet-4-6) |
| API server | Python 3.11, Flask |
| Notifications | Slack Bot API (Block Kit DMs) |
| Ticket source | Gorgias REST API |
