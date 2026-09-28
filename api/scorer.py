import json
import re
import anthropic
from rubric import build_system_prompt, DEFAULT_RUBRIC, SCORING_SYSTEM_PROMPT

# change model here for A/B testing
MODEL = "claude-sonnet-4-6"

# Scoring latency is dominated by how much the model "thinks" before emitting the
# JSON, not by the model tier. Adaptive thinking at low effort lets Claude spend
# few reasoning tokens on straightforward tickets and only dig in when a ticket
# needs it — much faster than a fixed 8k-token budget, same grading quality.
# (budget_tokens is deprecated on Sonnet 4.6 and rejected on the Claude 5 models.)
SCORING_EFFORT = "low"


def _format_thread(ticket: dict, messages: list[dict]) -> str:
    """Format a ticket thread into a readable string for Claude."""
    lines = [
        f"TICKET ID: {ticket['id']}",
        f"Subject: {ticket.get('subject', 'N/A')}",
        f"Channel: {ticket.get('channel', 'N/A')}",
        f"Status: {ticket.get('status', 'N/A')}",
        f"Created: {ticket.get('created_datetime', 'N/A')}",
        "",
        "--- FULL THREAD ---",
        "",
    ]

    for msg in messages:
        sender = "AGENT" if msg.get("from_agent") else "CUSTOMER"
        timestamp = msg.get("created_datetime", "")
        channel = msg.get("channel", "")
        is_public = msg.get("public", True)
        note = " [INTERNAL NOTE]" if not is_public else ""
        msg_id = msg.get("id")

        # MSG <id> lets the model cite exact messages in each criterion's `evidence`
        lines.append(f"[MSG {msg_id} · {sender}]{note} — {timestamp} ({channel})")

        body = msg.get("body_text") or ""
        if not body and msg.get("body_html"):
            body = re.sub(r"<[^>]+>", " ", msg.get("body_html", ""))
            body = re.sub(r"\s+", " ", body).strip()

        lines.append(body or "(no text content)")
        lines.append("")

    return "\n".join(lines)


def _recompute_weighted(score: dict, rubric: dict) -> dict:
    """Derive weighted_score, per-dimension averages, and the verdict from the
    criterion scores instead of trusting the model's own arithmetic.

    The model grades each criterion well but is unreliable at the final
    weighted-average math — it routinely returns a weighted_score that doesn't
    match its own per-criterion grades. The queue/modal display that reported
    number while the Edit-score screen recomputes from the criteria, so the two
    disagree (e.g. shows 74 but Edit shows 68). Recomputing here — with the same
    round-then-average the Edit screen uses — makes every surface consistent and
    keeps the score faithful to the rubric formula."""
    scores = score.get("scores")
    if not isinstance(scores, dict):
        return score

    thresholds = rubric.get("verdict_thresholds") or {"pass": 80, "needs_review": 60}
    weighted = 0.0
    for dim in rubric.get("dimensions", []):
        block = scores.get(dim["id"])
        if not isinstance(block, dict):
            continue
        vals = []
        for crit in dim.get("criteria", []):
            cell = block.get(crit["id"])
            if isinstance(cell, dict) and cell.get("score") is not None:
                try:
                    vals.append(max(1, min(5, round(float(cell["score"])))))
                except (TypeError, ValueError):
                    pass
        if not vals:
            continue
        avg = sum(vals) / len(vals)
        block["dimension_average"] = round(avg, 1)
        weighted += (avg / 5) * dim.get("weight", 0)

    weighted = round(weighted, 1)
    score["weighted_score"] = weighted

    auto_failed = bool((score.get("auto_fail") or {}).get("triggered"))
    if auto_failed or weighted < thresholds.get("needs_review", 60):
        score["verdict"] = "FAIL"
    elif weighted >= thresholds.get("pass", 80):
        score["verdict"] = "PASS"
    else:
        score["verdict"] = "NEEDS_REVIEW"
    return score


def score_ticket(client: anthropic.Anthropic, ticket: dict, messages: list[dict], rubric: dict | None = None, few_shot_examples: list | None = None) -> dict:
    """Score a single ticket thread using Claude."""
    system_prompt = build_system_prompt(rubric or DEFAULT_RUBRIC, few_shot_examples=few_shot_examples or [])
    thread_text = _format_thread(ticket, messages)
    ticket_id = ticket["id"]

    user_message = f"""Please evaluate the following Gorgias support ticket thread and return a QA score JSON.

{thread_text}

Return only the JSON score object as specified in your instructions."""

    # Use streaming to handle long ticket threads
    result_text = ""
    with client.messages.stream(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": SCORING_EFFORT},
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        for text in stream.text_stream:
            result_text += text

    # Parse the JSON response
    try:
        # Strip any potential markdown code fences
        clean = result_text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
            clean = clean.strip()
        score = json.loads(clean)
    except json.JSONDecodeError as e:
        # Return an error score if parsing fails
        score = {
            "ticket_id": ticket_id,
            "error": f"Failed to parse Claude response: {e}",
            "raw_response": result_text,
            "verdict": "ERROR",
        }

    # Ensure ticket_id is set correctly
    score["ticket_id"] = ticket_id
    # Recompute the weighted total/verdict from the criterion grades so the
    # stored score matches what the Edit-score screen derives (the model's own
    # weighted_score arithmetic is unreliable).
    if "error" not in score:
        _recompute_weighted(score, rubric or DEFAULT_RUBRIC)
    return score
