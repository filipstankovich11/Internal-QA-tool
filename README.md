# Gorgias Internal QA Tool

An AI-powered QA scoring tool for Gorgias support tickets. Score individual tickets, run batch scoring via CSV or Gorgias views, manage agents and teams, coach agents from their scored tickets, and send Slack DM feedback.

---

## Features

- **Single ticket scoring** — paste a Gorgias ticket URL or ID and get an AI-generated QA score
- **Batch scoring** — upload a CSV or pull tickets directly from a Gorgias view
- **Score history** — filterable by agent, date range, and verdict
- **Agent & team management** — import agents from Gorgias, assign to teams
- **QA Guidance / Rubric editor** — customise shared scoring dimensions and publish team-specific guidance
- **Guidance testing** — compare a saved draft against published guidance on up to three existing tickets, then record which grade better matches each ticket
- **Slack DM notifications** — send formatted QA feedback directly to an agent's Slack DM with a preview before sending
- **Review queue** — manage tickets pending review
- **Coaching hub (leads)** — recurring issues and strengths surfaced per agent from score data; run coaching sessions, set plan goals, share strengths and team topics
- **Coaching page (agents)** — personal focus areas, sessions and goals shared by the lead
- **Reports** — scorecard, rubric question, and open dispute views for reviewers and leads; currently based on the latest 500 loaded score records
- **External / automated grading** — a scheduler (e.g. a Cortex automation) can trigger server-side grading per ticket, or push externally-computed scores in, through secret-gated API endpoints (see [External & automated grading](#external--automated-grading-cortex))
- **Role-based access** — admin / lead / agent roles via Supabase Auth, enforced by Postgres RLS and the API

---

## Setup

### Prerequisites

- **Node 18+**
- **Python 3.10+** (the API uses `dict | None` type syntax; the dev script prefers `python3.11`)
- A Supabase project — either access to the team's existing one (ask a lead for the URL + anon key and skip step 4), or your own free project at [supabase.com](https://supabase.com)

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
pip3.11 install -r api/requirements.txt
```

### 4. Set up the database (own Supabase project only)

Skip this if you're using the team's existing project — the schema is already there.

In the Supabase dashboard → SQL editor:

1. Run **`supabase/schema.sql`**
2. Run each file in **`supabase/migrations/`**, in filename (timestamp) order

### 5. Configure environment variables
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

# Gorgias (needed to fetch/score tickets)
GORGIAS_AUTH=Basic your-base64-encoded-credentials
GORGIAS_DOMAIN=yourcompany.gorgias.com

# Anthropic (needed for AI scoring)
ANTHROPIC_API_KEY=sk-ant-...

# Slack (optional — enables DM notifications)
SLACK_BOT_TOKEN=xoxb-...

# Cortex / external grading (optional — see "External & automated grading" below)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CORTEX_INGEST_SECRET=generate-a-long-random-value   # enables POST /api/grade-ticket
INGEST_WEBHOOK_SECRET=                               # enables POST /api/ingest-score
```

**Notes:**
- The anon key is public by design — row-level security is what protects the data. The other keys are server-side secrets: never commit `.env.local` (it's gitignored) and never add a `VITE_` prefix to them, or Vite will bundle them into the browser build.
- Without `GORGIAS_AUTH` / `ANTHROPIC_API_KEY` the app still runs for browsing, history, and coaching — only scoring, transcripts, and Gorgias imports need them.
- `VITE_SUPABASE_URL` is also used by the Python server to verify JWTs via Supabase's JWKS endpoint — no separate `SUPABASE_JWT_SECRET` needed. The server also uses `VITE_SUPABASE_ANON_KEY` to look up caller roles.
- `SLACK_BOT_TOKEN` requires a Slack app with `users:read.email` and `chat:write` scopes installed in your workspace.

### 6. Create your account

There is no self-signup. In the Supabase dashboard → Authentication → Users → **Add user** (email + password). A profile row is created automatically with the `agent` role; to grant scoring/coaching access, promote it in the SQL editor:

```sql
update public.profiles set role = 'lead' where email = 'you@company.com';  -- or 'admin'
```

Roles: `agent` sees only their own scores and coaching; `lead` adds scoring, review, teams, and the coaching hub; `admin` adds rubric editing and user-facing admin surfaces. Roles are enforced server-side (RLS + API), not just in the UI.

### 7. Run locally

```bash
npm run dev
```

This starts the Vite frontend (:5173) **and** the Flask API (:5001) together, and stops the API when Vite exits. To run them separately: `npm run dev:web` and `python3.11 api/score.py`.

App available at http://localhost:5173

---

## External & automated grading (Cortex)

Two optional, secret-gated API endpoints let an external scheduler (e.g. a Cortex automation) feed scores into the app. Both are **disabled until their secret is set**, both persist to the `scores` table using the Supabase **service-role key** (no user context), and the resulting rows appear in the app like any normally-scored ticket.

| Endpoint | Auth header | The caller sends | What happens | Needs |
|---|---|---|---|---|
| `POST /api/grade-ticket` *(recommended)* | `X-Cortex-Secret` = `CORTEX_INGEST_SECRET` | `{ "ticket_id": 12345 }` | The **server** fetches the ticket from Gorgias and grades it with Claude against the team's rubric, then stores it. The rubric is never trusted from the caller. | `CORTEX_INGEST_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `GORGIAS_AUTH`, `ANTHROPIC_API_KEY` |
| `POST /api/ingest-score` | `X-Ingest-Secret` = `INGEST_WEBHOOK_SECRET` | A finished result — a `verdict` + `weighted_score`, **or** a per-criterion `scores` breakdown the server recomputes from | The **caller** grades the ticket; the app just validates, resolves agents, and stores the result. | `INGEST_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` |

Example (server-side grading path):
```bash
curl -X POST https://<your-api-host>/api/grade-ticket \
  -H "X-Cortex-Secret: $CORTEX_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": 590573559}'
```

**Wiring a scheduler to it:** give the scheduler (1) the public API base URL and (2) the matching secret (stored in its secret manager — never in code). For `/api/ingest-score`, if the caller grades tickets itself, share the rubric (`api/rubric.py` renders the exact grading prompt) so its scores line up with the app's. The endpoints require a **publicly reachable** API — see hosting below.

---

## Hosting & deployment

There are three pieces: the **database** (already hosted by Supabase), the **frontend** (a static build), and the **Python API** (a long-running server). The database is set up once (schema + migrations, see step 4). The other two are deployed independently.

### Frontend (static)
```bash
npm run build          # outputs dist/
```
Serve `dist/` on any static host (Netlify, Vercel, Cloudflare Pages, S3 + CloudFront). Build-time env vars (must be present when `npm run build` runs):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` → the **public URL of the deployed API**
- `VITE_GORGIAS_DOMAIN`

### Python API (server)
Run `api/score.py` on any Python host (Render, Railway, Fly.io, Cloud Run, a VM). Use a production WSGI server rather than the Flask dev server — add `gunicorn` to `api/requirements.txt` and start it from the `api/` directory:
```bash
gunicorn --chdir api -b 0.0.0.0:$PORT score:app
```
Set these as real environment variables on the host (not `.env.local`, which is only auto-loaded for local `python api/score.py`):

- `VITE_SUPABASE_URL` (or `SUPABASE_URL`), `VITE_SUPABASE_ANON_KEY`
- `GORGIAS_AUTH`, `GORGIAS_DOMAIN`, `ANTHROPIC_API_KEY`
- `SLACK_BOT_TOKEN` (optional)
- `CORS_ORIGINS` → the deployed frontend origin(s), comma-separated (defaults to `http://localhost:5173`)
- Cortex secrets if using the integration: `SUPABASE_SERVICE_ROLE_KEY`, `CORTEX_INGEST_SECRET`, `INGEST_WEBHOOK_SECRET`

Once deployed, point the frontend's `VITE_API_URL` at the API's URL and rebuild.

### Quick public URL for testing only
To expose a **local** API to an external service (e.g. while testing the Cortex integration) without deploying, tunnel it:
```bash
cloudflared tunnel --url http://localhost:5001      # or: ngrok http 5001
```
⚠️ The tunnel URL is **ephemeral** — it changes on every restart and dies when the tunnel/laptop stops, so any scheduler pointed at it breaks. Use it for testing only; deploy the API for a stable URL.

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
