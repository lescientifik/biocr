---
name: specs
description: Interactive specification writing using Gherkin scenarios, with research agents and adversarial review.
---

# Specification Writing

## Spec format

Specs are written as **Gherkin scenarios** (Given/When/Then) in `.md` files saved in `docs/specs/`.

- Each file has YAML frontmatter with a short `description` field (one sentence max).
- Files are named intelligently by topic/domain (e.g., `auth-flow.md`, `export-pipeline.md`), NOT numbered.
- Related features are grouped in the same file.
- Gherkin covers: happy paths, edge cases, error scenarios, and non-functional constraints (via scenario tags like `@performance`, `@security`).
- Add a brief **Out of scope** section at the end when needed — this is the only non-Gherkin section allowed.

## Step 1 — Interactive discussion

The user often provides an initial description of what they want. Your goal is to **push the user to think through every detail** so that later implementation is pure execution, not reflection.

- ALWAYS use **AskUserQuestion** to probe for missing details, ambiguities, and edge cases. Batch up to 4 questions per call, and mark your recommended answer for each.
- If the feature(s) may be complex to implement or the user asks to explore multiple approaches, propose launching **parallel OPUS subagents** to research (web search, codebase analysis) and produce concise reports in `docs/research/`. Always use OPUS for research. Reports must be `.md` with YAML frontmatter, dense in information but concise.
- Continue the discussion until you and the user agree that all details are covered.

## Step 2 — Write the Gherkin specs

Produce one or more `.md` files in `docs/specs/` with the scenarios agreed upon. Every scenario must be **testable** — no vague language ("should be fast", "user-friendly").

## Step 3 — Adversarial review

Run `/adversarial-review` on the spec files. This step is **MANDATORY**. Do NOT declare the spec done before it passes clean.

## Step 4 — Present the result

- Show a summary of the final specs.
- Ask if the user wants to proceed to `/roadmap` to plan the implementation.
