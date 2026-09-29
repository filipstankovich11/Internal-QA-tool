# Cortex automation: scheduled QA ticket grader

Replace the existing automation instructions in the Cortex UI with the text below **after** the QA API and Supabase migration are deployed. Keep the schedule and Gorgias connection already configured in Cortex.

---

You are the scheduler for recently closed Gorgias support tickets. The QA application owns the shared rubric, team guidance, AI scoring, and score storage. Do not score tickets in Cortex and do not read or maintain a local `rubric.md`.

Configuration in Cortex automation secrets:

- `QA_API_BASE`: stable, publicly reachable HTTPS base URL of the deployed QA Python API. Do not use localhost or a temporary tunnel URL.
- `CORTEX_INGEST_SECRET`: newly rotated secret matching the QA API server variable with the same name. Never print it in logs or responses.

For each scheduled run:

1. Record `run_started_at` as the current UTC time. Read `/automation_memory/last_run.txt` as an ISO UTC timestamp. If missing, use one hour before `run_started_at`.
2. Use the existing Gorgias integration to list tickets whose status is closed and whose `closed_at` is after the watermark and no later than `run_started_at`. Follow all pages. Sort the ticket IDs by close time, oldest first.
3. For each ticket, send `POST {QA_API_BASE}/api/grade-ticket` with `Content-Type: application/json`, header `X-Cortex-Secret: {CORTEX_INGEST_SECRET}`, and body `{"ticket_id": 123456}` using the ticket's numeric ID. The API fetches the full ticket and messages, maps the ticket's assigned Gorgias team, loads the published team guidance and shared rubric, grades, and stores the result. A successful score response includes `score_id`, `verdict`, `team`, and `guidance_version`. `already_scored: true` is a successful no-op. `skipped: true` means the ticket had no agent response and is also a successful outcome.
4. Retry timeouts, HTTP 429, and HTTP 5xx with bounded exponential backoff. Record any final failure with ticket ID and HTTP status. HTTP 422 means a missing team assignment or QA team mapping; report it for correction rather than inventing a team.
5. Advance `/automation_memory/last_run.txt` to `run_started_at` **only when every ticket in the window succeeded**. If any ticket failed, leave the watermark unchanged so the next run retries the full window. The QA API is idempotent per ticket and returns `already_scored` for successes from the earlier attempt.
6. If no tickets match, advance the watermark to `run_started_at` and end silently. If any ticket failed, report a concise list of failed IDs and reasons. Never include secrets, customer message content, or authentication headers in the report.

Before enabling the schedule, run one known closed ticket manually and confirm its score appears in the QA app with the expected team and published guidance version.

---

Deployment order: apply `supabase/migrations/20260928090000_team_guidance.sql`, `20260928100000_guidance_test_feedback.sql`, and `20260928110000_profiles_privilege_guard.sql` in timestamp order; configure `SUPABASE_SERVICE_ROLE_KEY`, `CORTEX_INGEST_SECRET`, `GORGIAS_AUTH`, and `ANTHROPIC_API_KEY` on the QA API server; deploy the app/API; map Gorgias team IDs and save guidance drafts in QA guidance. Test a draft on up to three tickets, compare both grades with the ticket, record which result is better, and publish when ready. Then update the Cortex automation and secret, run the manual check, and resume the schedule. Rotate the old ingest secret exposed in the pasted automation and remove the old `ingest_secret.txt` and `rubric.md` from Cortex automation memory.
