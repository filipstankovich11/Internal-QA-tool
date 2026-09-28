# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

QA reviewers and team leads use this internal tool to assess Gorgias support tickets consistently. Support agents receive and review feedback on their work. Admins manage access, agents, teams, and the QA rubric.

## Product Purpose

The tool applies an AI assisted, structured QA rubric to support tickets so reviewers can evaluate responses consistently, inspect the reasons behind a score, and use the results for feedback and coaching.

## Positioning

It brings ticket retrieval from Gorgias, rubric based scoring, review, agent and team tracking, and feedback into one internal workflow for the Gorgias support team.

## Operating Context

- Reviewers score a single Gorgias ticket by URL or ID, or score tickets in batches from CSV files or Gorgias views.
- Reviewers inspect score breakdowns, verdicts, history, and tickets pending review.
- Team leads and admins manage agents and teams and use score and coaching views.
- Agents review their feedback, inbox, and coaching information.

## Capabilities and Constraints

- Preserve the existing Gorgias workflows and branding when refining the interface.
- The current web app uses React, Vite, and Tailwind CSS, with Supabase authentication and role based access.
- Scoring uses a configurable QA rubric and a Python API that integrates with Gorgias and Anthropic.
- Slack feedback messages are optional and shown in a preview before sending.
- Keep reviewer and agent access appropriate to their roles.

## Brand Commitments

Keep the existing Gorgias identity and established interface conventions during refinements. No replacement visual direction has been requested.

## Evidence on Hand

- `README.md` documents the current features and setup.
- `src/` contains the implemented interface, roles, and workflows.
- `NOTION_DOC.md` contains earlier product and rubric notes; confirm any details that differ from the current implementation before relying on them.

## Product Principles

1. Make ticket evaluation consistent and its reasoning inspectable.
2. Keep review and coaching workflows clear for each role.
3. Preserve the established Gorgias context and terminology.
4. Let reviewers verify feedback before it reaches agents.
