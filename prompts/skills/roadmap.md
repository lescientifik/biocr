---
name: roadmap
description: Create a phased TDD implementation roadmap from specs, with parallel OPUS agents and mandatory adversarial review gates.
---

# Roadmap Creation & Execution

The user wants to produce an **implementation roadmap** — a phased plan with TDD red/green, parallel OPUS subagent implementation whenever possible, and mandatory quality gates.

## Step 1 — Gather input

- Read the specification files from `docs/specs/` (or as provided by the user).
- Read relevant codebase files to understand the current architecture.
- If no spec exists, ask the user if they want to run `/specs` first.
- Use **AskUserQuestion** to clarify priorities or constraints. Batch up to 4 questions, mark your recommended answer.

## Step 2 — Write the roadmap

Produce a `.md` file in `docs/roadmap/` with YAML frontmatter containing a short `description` field (one sentence max).

### Structure

1. **Objectif** — Link to the spec(s). One sentence on what will be built.
2. **Phases** — Numbered phases. Each phase contains:
   - **Titre** — Short name.
   - **Objectif** — What this phase delivers.
   - **TDD Steps** — Tests to write first (RED), implementation (GREEN), refactoring (REFACTOR).
   - **Parallélisation** — Explicitly state which parts can be implemented by parallel OPUS subagents and which must be sequential.
   - **Review gate** — Insert `/adversarial-review` checkpoints at strategic moments (e.g., after foundational phases, after complex phases, before integration). This prevents accumulating bad code. Reference the skill explicitly.
   - **Critères de complétion** — Checklist to verify the phase is done.
   - **Dépendances** — Which prior phases must be complete.
3. **Out of scope** — Carry over from spec + implementation-specific exclusions.

### Phase design rules

- Each phase must leave the codebase in a **working state**.
- Include **small code snippets or pseudocode** when it clarifies intent. The roadmap is a plan, not the code.

## Step 3 — Adversarial review of the roadmap

Run `/adversarial-review` on the roadmap file. This step is **MANDATORY**. Do NOT declare the roadmap done before it passes clean.

## Step 4 — Present the result

- Show the user the final roadmap.
- Summarize what the adversarial review caught and what was fixed.
- Ask the user if they want to start executing.

## Execution mode

When the user asks to execute: **follow the roadmap to the letter.** Execute each phase in order, respect TDD steps, parallelize where the roadmap says to, and hit every review gate. Do not skip or defer any step.
