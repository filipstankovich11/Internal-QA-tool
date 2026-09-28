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
from rubric import DEFAULT_RUBRIC


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
        for dim in DEFAULT_RUBRIC['dimensions']:
            result['scores'][dim['id']] = {crit['id']: {'score': 3} for crit in dim['criteria']}
        scored = normalize_score(result, copy.deepcopy(DEFAULT_RUBRIC))
        self.assertEqual(scored['weighted_score'], 60)
        self.assertEqual(scored['verdict'], 'NEEDS_REVIEW')
        scored['auto_fail']['triggered'] = True
        self.assertEqual(normalize_score(scored, DEFAULT_RUBRIC)['verdict'], 'FAIL')

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


if __name__ == '__main__':
    unittest.main()
