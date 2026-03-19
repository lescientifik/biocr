---
description: Prompt autonome pour implémenter Tier 2 YOLO layout detection dans biocr, suivant le flow specs → roadmap → implement avec adversarial review gates.
---

# Mission : Implémenter Tier 2 YOLO layout detection

Tu dois implémenter la détection de layout Tier 2 basée sur YOLO11n-doclaynet via ONNX Runtime Web dans le projet **biocr** (webapp Vite + React + TypeScript pour l'OCR de documents médicaux).

**Tier 2 est INDÉPENDANT de Tier 1 (OpenCV).** Il a son propre worker, son propre bouton, mais produit le **même format de sortie** (`DetectionResponse`) pour s'intégrer au cache, filtres et zones existants.

## Flow à suivre

Tu dois suivre **dans l'ordre** les étapes ci-dessous. Chaque étape a ses propres règles décrites dans les sections "Skills" plus bas.

### Étape 1 : Écrire/compléter la spec Gherkin

Suivre les règles du **Skill: specs** (voir plus bas).

- La spec Tier 2 existe DÉJÀ partiellement dans `docs/specs/12-layout-detection.md` (lignes 640-715). **Lis-la.**
- La compléter si nécessaire avec les scénarios manquants (intégration UI, choix du détecteur, etc.)
- Sauvegarder dans `docs/specs/12-layout-detection.md` (compléter la section Tier 2 existante)
- Lancer un **adversarial review** (Skill: adversarial-review) sur la spec

### Étape 2 : Écrire le roadmap d'implémentation

Suivre les règles du **Skill: roadmap** (voir plus bas).

- Lire la spec + la recherche dans `docs/research/yolo-browser-layout-detection.md`
- Produire un roadmap phasé avec TDD dans `docs/roadmaps/05-tier2-yolo.md`
- Lancer un **adversarial review** sur le roadmap

### Étape 3 : Implémenter

Suivre les règles du **Skill: implement** (voir plus bas).

- Suivre le roadmap phase par phase
- Utiliser des subagents OPUS parallèles quand le roadmap le permet
- **Adversarial review** après chaque phase critique (comme indiqué dans le roadmap)
- À la fin : `npx biome check --write . && npx vitest run` doit passer

## Contexte technique

### Fichiers à lire pour comprendre l'architecture

1. `src/types/layout.ts` — types partagés
2. `src/store/layout-store.ts` — store Zustand détection
3. `src/store/zone-store.ts` — store zones
4. `src/lib/layout-detection/worker-wrapper.ts` — pattern worker singleton (à reproduire)
5. `src/lib/layout-detection/cache.ts` — cache et conversion zones
6. `src/workers/layout-detection.worker.ts` — worker OpenCV (pattern de référence)
7. `src/components/Toolbar.tsx` — UI bouton détection
8. `src/App.tsx` — orchestration flow détection
9. `vite.config.ts` — config Vite
10. `docs/specs/12-layout-detection.md` — spec existante
11. `docs/research/yolo-browser-layout-detection.md` — recherche avec snippets

### Points clés

- **Modèle** : `yolo11n-doclaynet.onnx` (~5-6 MB) depuis HuggingFace `hantian/yolo-doclaynet`, placé dans `public/models/`
- **Runtime** : `onnxruntime-web` (installer via `bun add`), backend WASM, `numThreads = 1`
- **WASM paths** : CDN `cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/`
- **Input YOLO** : 640×640, Float32 [0,1], CHW, letterbox
- **Output YOLO** : `[1, 15, 8400]` (4 coords + 11 classes DocLayNet)
- **NMS** : IoU=0.5, confidence ≥ 0.3
- **Ajouter `"title"` à `LayoutRegionType`**
- **Pas de régression Tier 1** : l'OpenCV doit continuer à fonctionner
- **Linting** : `npx biome check --write`
- **Tests** : `npx vitest run`

---

## Skills (instructions à suivre verbatim)

### Skill: specs

Specs are written as **Gherkin scenarios** (Given/When/Then) in `.md` files saved in `docs/specs/`.

- Each file has YAML frontmatter with a short `description` field (one sentence max).
- Files are named intelligently by topic/domain (e.g., `auth-flow.md`, `export-pipeline.md`), NOT numbered.
- Related features are grouped in the same file.
- Gherkin covers: happy paths, edge cases, error scenarios, and non-functional constraints (via scenario tags like `@performance`, `@security`).
- Add a brief **Out of scope** section at the end when needed — this is the only non-Gherkin section allowed.

**Step 1 — Interactive discussion** : Since this is a remote session, skip interactive discussion. The spec already exists partially — complete it based on the research and context provided.

**Step 2 — Write the Gherkin specs** : Produce the scenarios. Every scenario must be **testable** — no vague language ("should be fast", "user-friendly").

**Step 3 — Adversarial review** : Run adversarial review on the spec (see Skill: adversarial-review below).

### Skill: roadmap

Produce a `.md` file in `docs/roadmaps/` with YAML frontmatter containing a short `description` field (one sentence max).

#### Structure

1. **Objectif** — Link to the spec(s). One sentence on what will be built.
2. **Phases** — Numbered phases. Each phase contains:
   - **Titre** — Short name.
   - **Objectif** — What this phase delivers.
   - **TDD Steps** — Tests to write first (RED), implementation (GREEN), refactoring (REFACTOR).
   - **Parallélisation** — Explicitly state which parts can be implemented by parallel OPUS subagents and which must be sequential.
   - **Review gate** — Insert adversarial review checkpoints at strategic moments (e.g., after foundational phases, after complex phases, before integration). This prevents accumulating bad code.
   - **Critères de complétion** — Checklist to verify the phase is done.

3. **Ordre des phases** — Dependency graph. Which phases can run in parallel?
4. **Risques** — Known risks and mitigations.

### Skill: implement

Ce skill définit comment écrire les prompts pour les subagents OPUS quand ils doivent implémenter du code.

**Principe fondamental** : **Les subagents savent lire.** Ne copie JAMAIS du code dans le prompt. Pointe vers les fichiers, l'agent les lira lui-même.

Un prompt doit contenir **uniquement** :

1. **Objectif** — Une phrase. Qu'est-ce que l'agent doit accomplir ?
2. **Fichiers à lire** — Chemins absolus vers les specs, roadmap, issues, et fichiers source concernés.
3. **Contraintes** — Règles spécifiques à respecter (TDD, ne pas toucher tel fichier, conventions du projet).
4. **Critères de complétion** — Comment l'agent sait qu'il a fini. Tests qui passent, lint clean, etc.

**Ce qu'un prompt ne doit JAMAIS contenir** :
- Du code source copié-collé
- Des stubs ou squelettes d'implémentation
- Le contenu des specs ou de la roadmap
- Des explications ligne par ligne des changements à faire — décrire le QUOI, pas le COMMENT

### Skill: adversarial-review

#### Workflow

1. **Review** — Launch 3 OPUS subagents on 3 orthogonal review axes. Each agent must classify every finding as **CRITICAL**, **MAJOR**, or **MINOR**.
2. **Fix** — Analyse their findings and correct code or plan accordingly. Depending on the scope of corrections, use one or several OPUS subagents to apply the fixes.
3. **Repeat** — Go back to step 1. Vary the review angles between rounds to collect diverse perspectives.

#### Exit condition

The loop **MUST end on a review round**, never on a fix round. The final round must be a clean review where all 3 agents report **0 CRITICAL and 0 MAJOR** findings. Do NOT skip this. Do NOT declare the review done after a fix — always verify with one more review round.

**ALWAYS 3 agents.** Do NOT use 1 or 2 agents. Every review round uses exactly 3 OPUS subagents, including the final verification round.
