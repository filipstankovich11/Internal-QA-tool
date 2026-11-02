"""Scorecard math shared by the in-app scorer, the Cortex grader, and ingestion.

Pure functions only (no SDK imports) so every write path derives the total and
verdict the same way. Handles both the legacy 1–5 rubric and Scorecard V8
(0–5 scale, N/A questions, Q9 candidate-fail gate). The frontend mirrors these
rules in src/lib/scorecard.js — change both together.
"""

import json
import os

with open(os.path.join(os.path.dirname(__file__), 'scorecard_v8.json'), encoding='utf-8') as _f:
    SCORECARD_V8 = json.load(_f)

NA_VALUES = ('N/A', 'NA', 'NOT APPLICABLE')


def scale_of(rubric):
    scale = (rubric or {}).get('scale') or {}
    return int(scale.get('min', 1)), int(scale.get('max', 5))


def fail_gate_mode(rubric):
    """'candidate' (V8: Q9 = Yes needs human approval) or 'auto' (legacy auto-fail)."""
    return ((rubric or {}).get('fail_gate') or {}).get('mode') or 'auto'


def is_na(cell):
    if isinstance(cell, str):
        return cell.strip().upper() in NA_VALUES
    if not isinstance(cell, dict):
        return False
    if cell.get('na') is True:
        return True
    score = cell.get('score')
    return isinstance(score, str) and score.strip().upper() in NA_VALUES


def criteria_by_code(rubric):
    """{'Q1': (dimension, criterion), …} for rubrics whose criteria carry codes."""
    out = {}
    for dim in (rubric or {}).get('dimensions', []):
        for crit in dim.get('criteria', []):
            if crit.get('code'):
                out[crit['code'].upper()] = (dim, crit)
    return out


def nest_question_scores(flat, rubric):
    """Turn a flat {'Q1': {...}, 'Q2': 'N/A', …} map into the nested
    {dimension_id: {criterion_id: cell}} shape every surface reads. Unknown keys
    are returned so callers can reject them."""
    codes = criteria_by_code(rubric)
    nested, unknown = {}, []
    for key, cell in (flat or {}).items():
        match = codes.get(str(key).strip().upper())
        if not match:
            unknown.append(key)
            continue
        dim, crit = match
        if isinstance(cell, (int, float)) or (isinstance(cell, str) and not is_na(cell)):
            cell = {'score': cell}
        elif isinstance(cell, str):
            cell = {'na': True}
        cell = dict(cell)
        if is_na(cell):
            cell['na'] = True
            cell['score'] = None
        nested.setdefault(dim['id'], {})[crit['id']] = cell
    return nested, unknown


def recompute(score, rubric):
    """Derive dimension averages, the weighted total, and the verdict from the
    criterion grades instead of trusting the grader's arithmetic.

    - Scores are rounded and clamped to the rubric scale (0–5 for V8, 1–5 legacy).
    - N/A cells (only where the criterion allows it) drop out of their section's
      average, which redistributes their points across the section's other
      questions. A fully N/A section redistributes across the other sections.
    - V8 fail gate: Q9 = Yes never finalizes a fail. The verdict becomes
      NEEDS_REVIEW with status 'candidate' until a human confirms it.
    Mutates and returns `score`; problems are recorded in `review_flags`."""
    scores = score.get('scores')
    if not isinstance(scores, dict):
        return score

    lo, hi = scale_of(rubric)
    flags = [f for f in (score.get('review_flags') or []) if isinstance(f, str)]
    earned = applicable_weight = 0.0
    for dim in rubric.get('dimensions', []):
        block = scores.get(dim['id'])
        if not isinstance(block, dict):
            continue
        vals = []
        for crit in dim.get('criteria', []):
            cell = block.get(crit['id'])
            if not isinstance(cell, dict):
                continue
            label = crit.get('code') or crit.get('name') or crit['id']
            if is_na(cell):
                cell['na'], cell['score'] = True, None
                if not crit.get('allow_na'):
                    flags.append(f'{label} was marked N/A but the scorecard requires a score')
                continue
            if cell.get('score') is None:
                continue
            try:
                value = max(lo, min(hi, round(float(cell['score']))))
            except (TypeError, ValueError):
                continue
            cell['score'] = value
            vals.append(value)
        weight = dim.get('weight', 0)
        block['weight'] = weight / 100
        if not vals:
            block.pop('dimension_average', None)
            block.pop('points', None)
            continue
        avg = sum(vals) / len(vals)
        block['dimension_average'] = round(avg, 1)
        block['points'] = round(avg / hi * weight, 1)
        earned += avg / hi * weight
        applicable_weight += weight

    weighted = round(earned / applicable_weight * 100, 1) if applicable_weight else 0.0
    score['weighted_score'] = weighted

    thresholds = rubric.get('verdict_thresholds') or {}
    pass_at = thresholds.get('pass', 80)
    review_at = thresholds.get('needs_review', 60)
    gate = score.get('auto_fail')
    if not isinstance(gate, dict):
        gate = {'triggered': False, 'reasons': []}
        score['auto_fail'] = gate
    gate['triggered'] = bool(gate.get('triggered'))

    if gate['triggered'] and fail_gate_mode(rubric) == 'candidate':
        # Callers can't finalize a fail — only a human override can.
        gate['status'] = 'candidate'
        score['verdict'] = 'NEEDS_REVIEW'
    elif gate['triggered'] or weighted < review_at:
        score['verdict'] = 'FAIL'
    elif weighted >= pass_at:
        score['verdict'] = 'PASS'
    else:
        score['verdict'] = 'NEEDS_REVIEW'

    if flags:
        score['review_flags'] = list(dict.fromkeys(flags))
    # Lets the UI pick the matching labels/scale even after the live rubric moves on.
    if rubric.get('version'):
        score['scorecard'] = {'version': rubric['version'], 'name': rubric.get('name')}
    return score
