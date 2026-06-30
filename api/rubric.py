import json

# ── Default rubric config ────────────────────────────────────────────────────
# This is the source-of-truth fallback. The frontend stores an editable copy
# in Supabase (rubric table) and passes it with each score request.

DEFAULT_RUBRIC = {
    "dimensions": [
        {
            "id": "inquiry_resolution",
            "name": "Inquiry Resolution",
            "weight": 50,
            "criteria": [
                {
                    "id": "core_inquiry_resolved",
                    "name": "Core Inquiry Resolution",
                    "description": (
                        "Does the agent fully address all customer questions, the root cause, "
                        "and offer workarounds where applicable?\n"
                        "- 5: All questions answered, root cause identified, limitations explained "
                        "with workarounds offered, no roundabout answers\n"
                        "- 4: Main inquiry resolved, minor gaps (e.g., one sub-question lightly addressed)\n"
                        "- 3: Partially resolved — some questions unanswered or root cause not addressed\n"
                        "- 2: Mostly missed the inquiry or provided incorrect/misleading info\n"
                        "- 1: Failed to address the inquiry at all"
                    ),
                },
                {
                    "id": "troubleshooting_procedure",
                    "name": "Troubleshooting Procedure",
                    "description": (
                        "Did the agent follow proper troubleshooting steps and keep the client informed?\n"
                        "- 5: Proper TS steps followed, client kept informed throughout, solution verified, "
                        "all available tools used (KB, HC, Vitally, Loom, etc.)\n"
                        "- 4: Good procedure with minor gaps (e.g., didn't share test ticket URL)\n"
                        "- 3: Some steps followed but inconsistent or client left waiting without updates\n"
                        "- 2: Poor procedure — jumped to conclusions, didn't verify solution, client uninformed\n"
                        "- 1: No discernible troubleshooting procedure"
                    ),
                },
                {
                    "id": "forward_resolution",
                    "name": "Forward Resolution",
                    "description": (
                        "Did the agent empower the client to resolve future issues independently?\n"
                        "- 5: Direct links to relevant HC articles/product pages, visual aids "
                        "(screenshots/Loom), educational resources shared proactively\n"
                        "- 4: Some resources shared but not fully tailored to the issue\n"
                        "- 3: Minimal forward resolution — generic link or no link at all\n"
                        "- 2: No educational value provided\n"
                        "- 1: Agent left customer with no path forward"
                    ),
                },
            ],
        },
        {
            "id": "internal_processes",
            "name": "Internal Processes",
            "weight": 25,
            "criteria": [
                {
                    "id": "ticket_handling_procedure",
                    "name": "Ticket Handling Procedure",
                    "description": (
                        "Did the agent follow internal ticket handling guidelines?\n"
                        "- 5: Proper escalation when needed, correct tagging/fields used, macros leveraged, "
                        "documentation referenced, feedback passed on\n"
                        "- 4: Mostly followed with minor gaps\n"
                        "- 3: Some procedures followed but notable omissions\n"
                        "- 2: Multiple procedural gaps — wrong escalation path, missing tags/fields\n"
                        "- 1: Procedures not followed at all\n\n"
                        "Note: If you cannot assess internal process adherence from the ticket content alone, "
                        "score 3 (neutral) and note the limitation."
                    ),
                },
            ],
        },
        {
            "id": "customer_perception",
            "name": "Customer Perception",
            "weight": 25,
            "criteria": [
                {
                    "id": "tone_professionalism",
                    "name": "Tone & Professionalism",
                    "description": (
                        "How warm, empathetic, and professional was the agent throughout the interaction?\n"
                        "- 5: Warm, empathetic, professional throughout — treats every interaction as an opportunity\n"
                        "- 4: Generally professional with minor lapses\n"
                        "- 3: Neutral — neither positive nor negative\n"
                        "- 2: Somewhat cold, dismissive, or unprofessional\n"
                        "- 1: Rude, disrespectful, or condescending"
                    ),
                },
                {
                    "id": "communication_clarity",
                    "name": "Communication Clarity",
                    "description": (
                        "How clear, structured, and easy to follow were the agent's communications?\n"
                        "- 5: Crystal clear, well-structured, easy to follow — instructions match the customer's level\n"
                        "- 4: Generally clear with minor confusion\n"
                        "- 3: Somewhat clear but could be significantly improved\n"
                        "- 2: Confusing, poorly structured, or hard to follow\n"
                        "- 1: Very unclear — customer would struggle to follow instructions"
                    ),
                },
            ],
        },
    ],
    "auto_fail_conditions": [
        {
            "id": "negative_account_billing_impact",
            "name": "Negative Account/Billing Impact",
            "description": (
                "Changes/suggestions causing data loss, downtime, billing overages without warning "
                "(e.g., suggesting an auto-reply rule without warning about billing impact)"
            ),
        },
        {
            "id": "compliance_security_breach",
            "name": "Compliance/Security Breach",
            "description": (
                "Sharing API keys, passwords, sensitive account info with unauthorized parties; "
                "not verifying customer identity before sharing account data; "
                "violating screen-recording protocols"
            ),
        },
        {
            "id": "harmful_incorrect_info",
            "name": "Harmful/Incorrect Information",
            "description": (
                "Providing incorrect information that causes significant customer harm, "
                "financial loss, or public negative feedback (churn, public reviews)"
            ),
        },
        {
            "id": "communication_misconduct",
            "name": "Communication Misconduct",
            "description": (
                "Profanity, discriminatory or offensive language, disclosing internal frustrations, "
                "blaming colleagues/the product to the customer"
            ),
        },
    ],
    "verdict_thresholds": {"pass": 80, "needs_review": 60},
    "scoring_guidance": "",
    "slack_webhook_url": "",
}


def build_system_prompt(rubric: dict, few_shot_examples: list = None) -> str:
    """Generate a scoring system prompt from a rubric config dict."""
    dims = rubric.get("dimensions", [])
    auto_fails = rubric.get("auto_fail_conditions", [])
    thresholds = rubric.get("verdict_thresholds", {"pass": 80, "needs_review": 60})
    guidance = (rubric.get("scoring_guidance") or "").strip()

    lines = [
        "You are a QA analyst for a customer support team.",
        "Your job is to evaluate agent responses in support tickets using the official QA framework.",
        "",
        "You will be given a full ticket thread. Evaluate ONLY the agent (from_agent: true) responses.",
        "Customer messages provide context but are not scored.",
        "",
    ]

    if guidance:
        lines += [
            "---",
            "",
            "COMPANY-SPECIFIC SCORING GUIDANCE",
            "The following instructions are specific to this team and override general assumptions:",
            "",
            guidance,
            "",
        ]

    lines += [
        "---",
        "",
        "SCORING FRAMEWORK",
        "",
    ]

    for i, dim in enumerate(dims, 1):
        lines.append(f'## {i}. {dim["name"]} — Weight: {dim["weight"]}%')
        lines.append("")
        lines.append("Score each sub-dimension 1–5:")
        lines.append("")
        for j, crit in enumerate(dim.get("criteria", [])):
            letter = chr(ord("a") + j)
            lines.append(f'### {i}{letter}. {crit["name"]}')
            lines.append(crit.get("description", ""))
            lines.append("")
        lines.append("---")
        lines.append("")

    if auto_fails:
        lines += [
            "## AUTO-FAIL CONDITIONS",
            "If ANY of these are present, the entire scorecard FAILS regardless of scores:",
            "",
        ]
        for af in auto_fails:
            lines.append(f'- **{af["name"]}**: {af["description"]}')
        lines += ["", "---", ""]

    # Weighted score formula
    formula_parts = []
    for dim in dims:
        dim_avg_key = f'{dim["id"]}_avg'
        formula_parts.append(f'{dim_avg_key} * {dim["weight"] / 100:.2f}')
    lines += [
        "## WEIGHTED SCORE CALCULATION",
        f'weighted_score = ({" + ".join(formula_parts)}) * 20',
        "(Result is 0–100 scale)",
        "",
        "## VERDICT",
        f'- PASS: weighted_score >= {thresholds["pass"]} AND no auto-fail triggered',
        f'- NEEDS_REVIEW: weighted_score >= {thresholds["needs_review"]} AND no auto-fail triggered',
        f'- FAIL: weighted_score < {thresholds["needs_review"]} OR any auto-fail triggered',
        "",
        "---",
        "",
        "Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):",
        "",
    ]

    # ── Few-shot calibration examples ────────────────────────────────────────
    if few_shot_examples:
        lines += [
            "## CALIBRATION EXAMPLES",
            "The following are real tickets that have been reviewed and corrected by QA managers.",
            "Use them to calibrate your judgment — pay attention to where the AI score differed",
            "from the human reviewer's assessment and why.",
            "",
        ]
        for i, ex in enumerate(few_shot_examples, 1):
            ai_verdict   = ex.get("ai_verdict", "")
            ai_score     = ex.get("ai_score", "")
            human_verdict = ex.get("human_verdict", "")
            human_score   = ex.get("human_score", "")
            reviewer_note = (ex.get("reviewer_note") or "").strip()
            summary       = (ex.get("summary") or "").strip()
            dim_avgs      = ex.get("dimension_averages") or {}

            lines.append(f"### Example {i}")
            if summary:
                lines.append(f"Ticket summary: {summary}")
            if dim_avgs:
                avgs_str = ", ".join(f'{k}: {v}' for k, v in dim_avgs.items())
                lines.append(f"Dimension averages: {avgs_str}")
            lines.append(f"AI score: {ai_score}/100 ({ai_verdict})")
            lines.append(f"Human corrected to: {human_score}/100 ({human_verdict})")
            if reviewer_note:
                lines.append(f"Reviewer reasoning: {reviewer_note}")
            lines.append("")
        lines += ["---", ""]

    # Dynamic JSON output template
    scores_spec = {}
    for dim in dims:
        dim_obj = {"weight": dim["weight"] / 100}
        for crit in dim.get("criteria", []):
            dim_obj[crit["id"]] = {
                "score": "<1-5>",
                "notes": "<specific observation>",
                "confidence": "<high|medium|low — your certainty in this score>",
                "evidence": ["<MSG ids from the thread that justify this score, e.g. 12345>"],
            }
        dim_obj["dimension_average"] = "<float, 1 decimal>"
        scores_spec[dim["id"]] = dim_obj

    lines += [
        "For every criterion also return `confidence` (high/medium/low — how certain you are) "
        "and `evidence` (a list of the MSG ids from the thread, shown as `[MSG <id> · …]`, that "
        "most directly justify the score). Cite 1–3 message ids; use an empty list only if no "
        "single message is decisive.",
        "",
        "Also return `strengths`: 2–4 short, concrete things the agent did well (one phrase each, "
        "for a 'what went well' summary). And `annotations`: for the most telling individual "
        "messages, an inline note tied to that message — each is {\"message_id\": <MSG id>, "
        "\"type\": \"good\" or \"bad\", \"note\": \"<short, specific observation>\"}. Add 2–6 "
        "annotations across the thread; keep each note under ~8 words. Use [] if none apply.",
        "",
    ]

    output_template = {
        "ticket_id": "<integer>",
        "auto_fail": {"triggered": "<boolean>", "reasons": ["<string>"]},
        "scores": scores_spec,
        "weighted_score": "<float, 1 decimal, 0-100>",
        "verdict": "<PASS|NEEDS_REVIEW|FAIL>",
        "summary": "<2-3 sentence overall assessment focusing on what the agent did well and what needs improvement>",
        "strengths": ["<short phrase — something the agent did well>"],
        "key_improvements": ["<string — specific, actionable improvement>"],
        "annotations": [
            {"message_id": "<MSG id>", "type": "<good|bad>", "note": "<short observation>"}
        ],
    }
    lines.append(json.dumps(output_template, indent=2))

    return "\n".join(lines)


# Static fallback (generated once from DEFAULT_RUBRIC for backwards compat)
SCORING_SYSTEM_PROMPT = build_system_prompt(DEFAULT_RUBRIC)
