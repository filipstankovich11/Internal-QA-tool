import copy
import sys
import types
import unittest
from unittest.mock import patch

# Keep routing/math tests runnable without live Gorgias, Supabase, or AI SDKs.
sys.modules.setdefault('anthropic', types.SimpleNamespace())
sys.modules.setdefault('requests', types.SimpleNamespace())
sys.modules.setdefault('gorgias_client', types.SimpleNamespace(GorgiasClient=object))
sys.modules.setdefault('scorer', types.SimpleNamespace(score_ticket=None))

import automated_grader as grader
from automated_grader import GradingError, assigned_team_id, authorized, normalize_score
from rubric import DEFAULT_RUBRIC, LEGACY_RUBRIC_V7
from scorecard import SCORECARD_V8, nest_question_scores, recompute


class AutomatedGraderTests(unittest.TestCase):
    def test_team_assignment_formats(self):
        self.assertEqual(assigned_team_id({'assignee_team': {'id': 42}}), 42)
        self.assertEqual(assigned_team_id({'assignee_team_id': '43'}), 43)
        self.assertIsNone(assigned_team_id({}))

    def test_secret_fails_closed(self):
        with patch.dict('os.environ', {}, clear=True):
            self.assertFalse(authorized('anything'))
        with patch.dict('os.environ', {'CORTEX_INGEST_SECRET': 'correct'}, clear=True):
            self.assertFalse(authorized('incorrect'))
            self.assertTrue(authorized('correct'))

    def test_score_and_verdict_are_recalculated(self):
        result = {'scores': {}, 'weighted_score': 100, 'verdict': 'PASS',
                  'auto_fail': {'triggered': False, 'reasons': []}}
        for dim in LEGACY_RUBRIC_V7['dimensions']:
            result['scores'][dim['id']] = {crit['id']: {'score': 3} for crit in dim['criteria']}
        scored = normalize_score(result, copy.deepcopy(LEGACY_RUBRIC_V7))
        self.assertEqual(scored['weighted_score'], 60)
        self.assertEqual(scored['verdict'], 'NEEDS_REVIEW')
        scored['auto_fail']['triggered'] = True
        self.assertEqual(normalize_score(scored, LEGACY_RUBRIC_V7)['verdict'], 'FAIL')

    def test_missing_criterion_fails_before_persist(self):
        with self.assertRaises(GradingError):
            normalize_score({'scores': {}}, DEFAULT_RUBRIC)

    def test_published_guidance_is_used_and_draft_is_ignored(self):
        class Gorgias:
            def __init__(self, *_): pass
            def get_ticket(self, _): return {'id': 123, 'subject': 'Example', 'assignee_team': {'id': 42}}
            def get_ticket_messages(self, _): return [{'from_agent': True}]

        seen = {}
        def fake_score(_client, _ticket, _messages, rubric):
            seen['guidance'] = rubric['scoring_guidance']
            return {'scores': {dim['id']: {crit['id']: {'score': 5} for crit in dim['criteria']}
                               for dim in rubric['dimensions']}, 'auto_fail': {'triggered': False}}

        def fake_db(table, params=None, payload=None):
            if payload is not None:
                seen['saved'] = payload
                return [{'id': 'score-1'}]
            return {'scores': [], 'teams': [{'id': 'team-1', 'name': 'Specialists'}],
                    'rubric': [{'config': {**DEFAULT_RUBRIC, 'scoring_guidance': 'Shared policy'}}],
                    'team_guidance': [{'published_text': 'Published rule', 'published_version': 3,
                                       'draft_text': 'Unpublished change'}],
                    'agents': []}[table]

        with patch.dict('os.environ', {'GORGIAS_AUTH': 'fake', 'ANTHROPIC_API_KEY': 'fake'}), \
             patch.object(grader, 'GorgiasClient', Gorgias), \
             patch.object(grader.anthropic, 'Anthropic', return_value=object(), create=True), \
             patch.object(grader, 'score_ticket', fake_score), \
             patch.object(grader, 'supabase_request', fake_db):
            response = grader.grade(123, lambda _ticket, _messages: [])
        self.assertIn('Published rule', seen['guidance'])
        self.assertIn('Shared policy', seen['guidance'])
        self.assertNotIn('Unpublished change', seen['guidance'])
        self.assertEqual(seen['saved']['full_score']['scoring_context']['guidance_version'], 3)
        self.assertEqual(response['weighted_score'], 100)

    def test_preview_uses_saved_variants_without_persisting(self):
        class Gorgias:
            def __init__(self, *_): pass
            def get_ticket(self, _): return {'id': 123, 'subject': 'Example', 'assignee_team_id': 42}
            def get_ticket_messages(self, _): return [{'from_agent': True}]

        seen = []
        def fake_db(table, params=None, payload=None):
            self.assertIsNone(payload)
            return {'profiles': [{'role': 'admin'}],
                    'teams': [{'id': 'team-1', 'name': 'Specialists', 'gorgias_team_id': 42}],
                    'team_guidance': [{'draft_text': 'Draft rule', 'published_text': 'Published rule',
                                       'published_version': 3}],
                    'rubric': [{'config': DEFAULT_RUBRIC}]}[table]

        def fake_score(_client, _ticket, _messages, rubric):
            seen.append(rubric['scoring_guidance'])
            return {'scores': {dim['id']: {crit['id']: {'score': 4} for crit in dim['criteria']}
                               for dim in rubric['dimensions']}, 'auto_fail': {'triggered': False}}

        with patch.dict('os.environ', {'GORGIAS_AUTH': 'fake', 'ANTHROPIC_API_KEY': 'fake'}), \
             patch.object(grader, 'GorgiasClient', Gorgias), \
             patch.object(grader.anthropic, 'Anthropic', return_value=object(), create=True), \
             patch.object(grader, 'score_ticket', fake_score), \
             patch.object(grader, 'supabase_request', fake_db):
            baseline = grader.preview(123, 'team-1', 'published', 'admin-1')
            candidate = grader.preview(123, 'team-1', 'draft', 'admin-1')
        self.assertIn('Published rule', seen[0])
        self.assertNotIn('Draft rule', seen[0])
        self.assertIn('Draft rule', seen[1])
        self.assertEqual(baseline['guidance_version'], 3)
        self.assertEqual(candidate['variant'], 'draft')
        self.assertEqual(baseline['rubric_hash'], candidate['rubric_hash'])
        self.assertEqual(candidate['guidance_text'], 'Draft rule')

    def test_preview_requires_admin(self):
        with patch.object(grader, 'supabase_request', return_value=[{'role': 'agent'}]):
            with self.assertRaises(GradingError) as raised:
                grader.preview(123, 'team-1', 'draft', 'agent-1')
        self.assertEqual(raised.exception.status, 403)



def v8_questions(**overrides):
    answers = {f'Q{i}': {'score': 5} for i in range(1, 9)}
    answers.update(overrides)
    return answers


class ScorecardV8Tests(unittest.TestCase):
    def score(self, **overrides):
        scores, unknown = nest_question_scores(v8_questions(**overrides), SCORECARD_V8)
        self.assertEqual(unknown, [])
        return recompute({'scores': scores, 'auto_fail': {'triggered': False}}, SCORECARD_V8)

    def test_default_rubric_is_v8(self):
        self.assertEqual(DEFAULT_RUBRIC['version'], 'v8')
        self.assertEqual(sum(d['weight'] for d in DEFAULT_RUBRIC['dimensions']), 100)
        codes = [c['code'] for d in DEFAULT_RUBRIC['dimensions'] for c in d['criteria']]
        self.assertEqual(codes, [f'Q{i}' for i in range(1, 9)])

    def test_perfect_ticket_passes_at_100(self):
        scored = self.score()
        self.assertEqual(scored['weighted_score'], 100)
        self.assertEqual(scored['verdict'], 'PASS')

    def test_zero_is_a_valid_score(self):
        scored = self.score(Q4={'score': 0})
        # Section 2 = (0 + 5 + 5) / 3 of 5 -> 2/3 of 25 points.
        self.assertEqual(scored['scores']['customer_perception']['points'], 16.7)
        self.assertEqual(scored['weighted_score'], 91.7)

    def test_na_redistributes_within_section(self):
        # Q2 N/A: Q1 and Q3 now each carry 25 of the 50 section points.
        scored = self.score(Q2='N/A', Q3={'score': 3})
        section = scored['scores']['inquiry_resolution']
        self.assertTrue(section['troubleshooting_procedure']['na'])
        self.assertEqual(section['dimension_average'], 4.0)
        self.assertEqual(section['points'], 40.0)
        self.assertEqual(scored['weighted_score'], 90.0)
        self.assertEqual(scored['verdict'], 'PASS')

    def test_below_pass_goal_needs_review_not_fail(self):
        scored = self.score(Q1={'score': 3}, Q8={'score': 3})
        self.assertLess(scored['weighted_score'], 90)
        self.assertEqual(scored['verdict'], 'NEEDS_REVIEW')
        self.assertEqual(self.score(**{f'Q{i}': {'score': 0} for i in range(1, 9)})['verdict'], 'NEEDS_REVIEW')

    def test_q9_yes_is_only_a_candidate_fail(self):
        scores, _ = nest_question_scores(v8_questions(), SCORECARD_V8)
        scored = recompute({'scores': scores, 'auto_fail': {'triggered': True, 'status': 'confirmed'}}, SCORECARD_V8)
        self.assertEqual(scored['verdict'], 'NEEDS_REVIEW')
        self.assertEqual(scored['auto_fail']['status'], 'candidate')
        self.assertEqual(scored['weighted_score'], 100)

    def test_na_on_required_question_is_flagged_and_rejected(self):
        scored = self.score(Q1='N/A')
        self.assertIn('Q1', scored['review_flags'][0])
        scores, _ = nest_question_scores(v8_questions(Q5='N/A'), SCORECARD_V8)
        with self.assertRaises(GradingError):
            normalize_score({'scores': scores, 'auto_fail': {}}, SCORECARD_V8)

    def test_grader_accepts_zero_and_na(self):
        scores, _ = nest_question_scores(v8_questions(Q3={'na': True}, Q7={'score': 0}), SCORECARD_V8)
        scored = normalize_score({'scores': scores, 'auto_fail': {}}, copy.deepcopy(SCORECARD_V8))
        self.assertEqual(scored['scores']['internal_processes']['dimension_average'], 2.5)

    def test_unknown_question_codes_are_reported(self):
        _, unknown = nest_question_scores({'Q1': 5, 'Q42': 3}, SCORECARD_V8)
        self.assertEqual(unknown, ['Q42'])


if __name__ == '__main__':
    unittest.main()
