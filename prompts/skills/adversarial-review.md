---
name: adversarial-review
description: Adversarial code/plan review with 3 OPUS agents on orthogonal axes, loop until 0 CRITICAL / 0 MAJOR.
---

# Adversarial Review

## Workflow

1. **Review** — Launch 3 OPUS subagents on 3 orthogonal review axes. Each agent must classify every finding as **CRITICAL**, **MAJOR**, or **MINOR**.
2. **Fix** — Analyse their findings and correct code or plan accordingly. Depending on the scope of corrections, use one or several OPUS subagents to apply the fixes.
3. **Repeat** — Go back to step 1. Vary the review angles between rounds to collect diverse perspectives.

## Exit condition

The loop **MUST end on a review round**, never on a fix round. The final round must be a clean review where all 3 agents report **0 CRITICAL and 0 MAJOR** findings. Do NOT skip this. Do NOT declare the review done after a fix — always verify with one more review round.

**ALWAYS 3 agents.** Do NOT use 1 or 2 agents. Every review round uses exactly 3 OPUS subagents, including the final verification round.
