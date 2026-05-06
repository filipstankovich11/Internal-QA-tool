# Gorgias Ticket QA Scorer

## Purpose

An internal quality assurance tool for the Gorgias support team. It evaluates the quality of agent responses in support tickets by running them through a structured QA rubric powered by Claude AI. The goal is to give team leads and QA reviewers an objective, consistent score for every ticket — replacing manual review with an automated, rubric-driven assessment.

---

## What It Does

- **Score a single ticket** — Paste a Gorgias ticket URL and get an instant QA score with breakdown by dimension
- **Batch scoring** — Upload a CSV of ticket IDs or pull tickets directly from a Gorgias view and score them all at once
- **Agent tracking** — Automatically detect which agents replied to a ticket and assign scores to their profile
- **Team tracking** — Group agents into teams and track aggregate performance
- **Score history** — Every scored ticket is stored locally and accessible from any agent or team page

---

## Scoring System

Based on the official Gorgias Support Quality rubric. Each ticket is scored across three weighted dimensions:

| Dimension | Weight | What It Measures |
|---|---|---|
| Inquiry Resolution | 50% | Did the agent actually solve the customer's problem? |
| Internal Processes | 25% | Were proper procedures, tags, macros, and hygiene followed? |
| Customer Perception | 25% | Was the tone, empathy, and communication quality appropriate? |

Each dimension is scored 1–5 by Claude based on detailed sub-criteria. The final **weighted score is out of 100**.

### Verdicts

| Score | Verdict |
|---|---|
| ≥ 80 | ✅ PASS |
| 60–79 | ⚠️ NEEDS REVIEW |
| < 60 | ❌ FAIL |

**Auto-Fail conditions** (regardless of score): billing harm, security breach, harmful information shared, agent misconduct.

---

## Tech Stack

### Frontend
- **React 18** + **Vite 5** — UI framework and build tool
- **Tailwind CSS 3** — Utility-first styling
- **Design system** — Gorgias brand colors (`#070707` Enterprise Black, `#FF9780` AI Coral)
- **localStorage** — Persists agents, teams, and score history in the browser (no database needed)

### Backend
- **Python 3.9** — API server
- **Flask** — Lightweight web framework handling all `/api/*` routes
- **Anthropic SDK** — Calls `claude-opus-4-6` with adaptive thinking and streaming for ticket scoring

### Infrastructure
- **Vercel** — Hosts both the static React frontend and the Flask serverless function
- **Gorgias REST API** — Fetches ticket threads and views using Basic Auth

---

## How It Works — End to End

```
User pastes ticket URL
       ↓
Flask API fetches full ticket thread from Gorgias REST API
       ↓
Thread is formatted and sent to Claude (claude-opus-4-6)
with the full QA rubric as the system prompt
       ↓
Claude returns a structured JSON score:
  - weighted_score (0–100)
  - verdict (PASS / NEEDS_REVIEW / FAIL)
  - per-dimension scores + sub-scores + justifications
  - key_improvements list
  - agent_senders (who replied in the ticket)
       ↓
Score is saved to localStorage
Agent(s) who replied are auto-matched by email or name
Score is attributed to all matched agents
       ↓
Results shown in the Score Modal with animated ring,
dimension breakdown, and improvement suggestions
```

---

## Key Features

### Score Modal
Shows the full QA breakdown for a single ticket:
- Animated score ring (color-coded by verdict)
- Auto-fail banner if triggered
- Per-dimension scores with expandable sub-scores and justifications
- Summary paragraph
- Numbered key improvements list

### Batch Run
- **CSV Upload** — Drop a CSV with a `ticket_id` or `ticket_url` column; scores run sequentially with a live progress bar
- **Gorgias View** — Select any view from your Gorgias account, set a ticket limit, and run the batch directly

### Agents
- Add agents with name + email (email is used for auto-matching from ticket senders)
- Each agent card shows avg score, pass/review/fail distribution bar, and recent tickets
- Click an agent's name or "View all tickets →" to open their full scored ticket history

### Teams
- Group agents into teams
- Team cards aggregate all agent scores for collective performance tracking

---

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `GORGIAS_AUTH` | `Basic <base64 email:token>` — Gorgias API auth header |
| `GORGIAS_DOMAIN` | e.g. `gorgias.gorgias.com` |

---

## Project Structure

```
ticket-qa-web/
├── api/
│   └── score.py          # Flask app — all API routes (/api/score, /api/views, /api/view-tickets)
├── src/
│   ├── components/
│   │   ├── NavBar.jsx        # Top navigation with Gorgias logo
│   │   ├── ScoreModal.jsx    # Full score breakdown modal
│   │   ├── ScoreRing.jsx     # Animated SVG score ring
│   │   └── GorgiasLogo.jsx   # Official Gorgias SVG logo
│   ├── context/
│   │   └── AppContext.jsx    # Global state — agents, teams, score history
│   ├── pages/
│   │   ├── ScorePage.jsx     # Single ticket scoring + recent history
│   │   ├── BatchPage.jsx     # Batch run (CSV + Gorgias View)
│   │   ├── AgentsPage.jsx    # Agent management + per-agent ticket history
│   │   └── TeamsPage.jsx     # Team management + aggregate stats
│   └── index.css             # Gorgias design tokens + utility classes
├── vercel.json               # Routing config for Vercel deployment
└── .env.local                # Local environment variables (not committed)
```

---

## Deployment

Hosted on **Vercel**. The Flask function runs as a serverless Python function with a 60-second timeout (needed for Claude scoring). The React app is served as a static build.

To deploy:
```bash
cd ticket-qa-web
vercel          # first deploy / preview
vercel --prod   # promote to production
```

Set environment variables in Vercel dashboard or via CLI:
```bash
vercel env add ANTHROPIC_API_KEY
vercel env add GORGIAS_AUTH
vercel env add GORGIAS_DOMAIN
```
