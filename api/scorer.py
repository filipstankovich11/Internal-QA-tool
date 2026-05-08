import json
import anthropic
from rubric import build_system_prompt, DEFAULT_RUBRIC, SCORING_SYSTEM_PROMPT

# change model here for A/B testing
MODEL = "claude-opus-4-6"


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

        lines.append(f"[{sender}]{note} — {timestamp} ({channel})")

        body = msg.get("body_text") or ""
        if not body and msg.get("body_html"):
            # Strip basic HTML tags for readability
            import re
            body = re.sub(r"<[^>]+>", " ", msg.get("body_html", ""))
            body = re.sub(r"\s+", " ", body).strip()

        lines.append(body or "(no text content)")
        lines.append("")

    return "\n".join(lines)


def score_ticket(client: anthropic.Anthropic, ticket: dict, messages: list[dict], rubric: dict | None = None) -> dict:
    """Score a single ticket thread using Claude."""
    system_prompt = build_system_prompt(rubric) if rubric else SCORING_SYSTEM_PROMPT
    thread_text = _format_thread(ticket, messages)
    ticket_id = ticket["id"]

    user_message = f"""Please evaluate the following Gorgias support ticket thread and return a QA score JSON.

{thread_text}

Return only the JSON score object as specified in your instructions."""

    # Use streaming to handle long ticket threads
    result_text = ""
    with client.messages.stream(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
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
    return score
