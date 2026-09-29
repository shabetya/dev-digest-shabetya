# Workflow retro: Project Context spec, then workflow-retro skill (2026-09-29)

Session 08ef45ac-6cb2-4247-943b-b9ca51e5fefc. Only one subagent ran (`spec-creator`).

## 1. Summary
- Goal: write SPEC-01 "Project Context", update it, build the `workflow-retro` skill, run it.
- Outcome: done. Spec ready for planning, no open questions; skill exists and works.
- Agents launched: 1 (`spec-creator`, foreground, 136.5 s, 0 tool errors).
- Tokens: ~14k output, 206k cache-write, 2.17M cache-read.
- Verdict: efficient delegation, but the spec revision was done by the main session, not an agent.

## 2. Token table

| Session | Input | Output | Cache-write | Cache-read | Thinking | Tool calls | Seconds |
|---|---|---|---|---|---|---|---|
| main | 24 | 12,512 | 66,785 | 1,089,669 | 1,312 | 9 | n/m |
| spec-creator (sonnet-5-5) | 22 | 1,545 | 138,856 | 1,075,750 | 0 | 43 | 136.5 |
| Total | 46 | 14,057 | 205,641 | 2,165,419 | 1,312 | 52 | |

- Top spender: `spec-creator` (139k cache-write).
- Cache hit ratio ~91%; cache-read is 10x cache-write, so context size drives cost.
- Main row includes the retro's own steps, so it is approximate.

## 3. Execution sequence
1. Main: sent requirements + screenshot paths to `spec-creator`.
2. `spec-creator` (136.5 s): 22 Reads, 12 Greps, 7 Globs, 1 Skill, 1 Write.
3. Main: relayed report, patched the spec itself after user accepted all proposals, then built the skill.

No parallelism; none was possible (update waited on user decisions).

## 4. Per-agent insights
**spec-creator**
- Easy: precise repo grounding (unused `specs` slot, missing route, vendored drift); code-based view-only decision; 0 errors, 22 distinct files read.
- Struggled: pushed 7 items to NEEDS CLARIFICATION, some with obvious defaults.
- Duplicated: nothing measurable.
- Possibly missed: two items numbered 4; a Ukrainian heading in an English spec; unclear whether 7.webp was examined.

**Main session**
- Delegation prompt (~3.5k chars) restated what the screenshots already show.
- Agent is create-only, so revision required a manual edit (workflow-shape gap).

## 5. Cross-agent findings
- 0 files read by multiple agents.
- Rework: clarification round accepted defaults wholesale, so a "ready with proposed defaults" status could save a round trip.
- Language inconsistency in the spec heading.

## 6. Recommendations
1. Give `spec-creator` a revise mode (edit its own SPEC file) instead of create-only.
2. Fix section-heading language (English) in its prompt.
3. Number clarification items uniquely and self-check for duplicate IDs.
4. Keep delegation prompts short when images are attached; one line per image.
5. Have it mark obvious defaults as "Proposed default" and set status ready-with-defaults.
6. `metrics.py`: add `--until` so the retro does not measure itself.
7. `metrics.py`: add a per-model price table for dollar cost.

## 7. Extra signals
- Measured: cache hit ratio ~91%, tool errors 0, duplicated reads 0.
- Not measured: dollar cost, first-pass acceptance, AC coverage, model fit, trend (no earlier retros).
