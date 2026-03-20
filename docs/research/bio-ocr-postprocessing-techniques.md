---
description: Research report on OCR post-processing techniques for structured extraction of biological parameters from French lab reports.
---

# Techniques de post-processing OCR pour bilans biologiques

## 1. Architecture de pipeline recommandée

L'approche la plus fiable pour les bilans biologiques est un pipeline séquentiel :

```
Raw OCR Text
  → Clean (strip, normalize, remove artifacts)
  → Split into lines
  → For each line:
    → Find numeric value(s) in line
    → Extract text before value as parameter candidate
    → Match candidate against dictionary (exact → abbreviation → fuzzy)
    → Extract unit after value
    → Validate value against plausible range
  → Produce BioResult[]
```

### Pourquoi cette approche

Les bilans biologiques ont un format semi-structuré prévisible : **Nom_paramètre [séparateur] Valeur Unité [Intervalle_référence]**. Les variantes sont dans le séparateur (espace, colon, points de suite) et le formatage, mais la structure fondamentale est constante.

## 2. Fuzzy matching de termes médicaux

### Approches évaluées

| Bibliothèque | Avantages | Inconvénients |
|-------------|-----------|---------------|
| **Levenshtein (maison)** | Simple, rapide, pas de dépendance | Sensible aux transpositions |
| **fuse.js** | API riche, scoring pondéré | Trop lourd pour ce cas d'usage, conçu pour la recherche full-text |
| **string-similarity** | Plusieurs algorithmes (Dice, Jaro-Winkler) | Dépendance externe non nécessaire |

### Recommandation

**Levenshtein maison** (déjà implémenté dans le projet) avec distance adaptative :
- Mots courts (4-5 chars) : max distance 1 (évite les faux positifs comme "Date" → "ACE")
- Mots moyens (6-8 chars) : max distance 2
- Mots longs (9+ chars) : max distance 3

Le projet utilise déjà une implémentation optimisée de Levenshtein avec early-exit dans `medical-dictionary.ts`. On la réutilise.

## 3. Erreurs OCR courantes et corrections

### Substitutions de caractères en contexte numérique

| OCR lit | Valeur réelle | Contexte |
|---------|--------------|----------|
| O | 0 | Adjacent à un chiffre |
| l (elle minuscule) | 1 | Adjacent à un chiffre |
| S | 5 | Adjacent à un chiffre |
| I | 1 | Adjacent à un chiffre |
| B | 8 | Plus rare |

Le post-processing existant (`post-processing.ts`) gère déjà ces cas via `contextualSubstitutions()`.

### Erreurs sur les termes médicaux

| OCR lit | Terme réel | Type d'erreur |
|---------|-----------|---------------|
| Glycérnie | Glycémie | m→rn (classique OCR) |
| Hérnatocrite | Hématocrite | m→rn |
| Creatinine | Créatinine | Accent perdu |
| Bilirubirie | Bilirubine | n→ri |

→ Le fuzzy matching avec Levenshtein corrige ces erreurs.

## 4. Regex pour l'extraction

### Pattern principal : trouver la valeur numérique

```typescript
const NUMERIC_RE = /[+-]?\d+(?:[.,]\d+)?/g;
```

Ce regex capture :
- Entiers : `78`
- Décimaux avec point : `0.95`
- Décimaux avec virgule : `0,95` (convention française)
- Valeurs signées : `-1.5` (rare mais possible)

### Stratégie d'extraction

1. Trouver toutes les valeurs numériques dans la ligne
2. Pour chaque valeur, vérifier si le texte avant est un paramètre connu
3. Extraire l'unité après la valeur

Cette approche est plus robuste que de tenter de matcher le pattern complet "Nom Valeur Unité" en une seule regex, car les séparateurs sont trop variables.

### Nettoyage des séparateurs

```typescript
// Retirer les séparateurs avant la valeur
const cleanedName = beforeValue.replace(/[\s:.…·\-_\t]+$/, "").trim();
```

Gère : espaces, colons, points de suite, tirets, tabs.

## 5. Stripping de caractères indésirables

### Artefacts OCR courants dans les bilans

| Artefact | Origine | Traitement |
|---------|---------|-----------|
| `\|` | Bordures de tableau | Remplacer par espace |
| `~` | Bruit OCR | Supprimer |
| `---`, `___` | Séparateurs | Supprimer la ligne |
| Espaces multiples | Colonnes mal détectées | Réduire à un espace |
| Lignes vides multiples | Zones sans texte | Supprimer |

### Pipeline de nettoyage

```typescript
function cleanLine(line: string): string {
  let result = line.trim();
  result = result.replace(/\|/g, " ");      // pipes → espaces
  result = result.replace(/~/g, " ");         // tildes
  if (/^[-_=.]{3,}$/.test(result)) return ""; // lignes séparatrices
  result = result.replace(/\s_\s/g, " ");     // underscores isolés
  result = result.replace(/\s{2,}/g, " ");    // espaces multiples
  return result.trim();
}
```

## 6. Validation des valeurs

### Approche

Chaque paramètre du dictionnaire a une plage de valeurs **physiologiquement plausibles** par unité. Ces plages sont plus larges que les normes de référence :
- **Normes** : valeurs attendues chez un sujet sain
- **Plage plausible** : valeurs qu'un être humain peut physiologiquement avoir

Un valeur hors plage plausible est **presque certainement une erreur OCR** (ex: glycémie 150 g/L — la valeur correcte est probablement 1.50 g/L).

### Règles de flagging

1. Valeur négative → toujours flagged
2. Valeur hors plage plausible pour l'unité → flagged
3. Unité inconnue → pas de flagging (bénéfice du doute)

## 7. Intégration avec le code existant

Le projet a déjà :
- `post-processing.ts` : substitutions contextuelles, normalisation d'unités, correction dictionnaire
- `medical-dictionary.ts` : dictionnaire simple (noms uniquement), Levenshtein

Le nouveau pipeline bio est **complémentaire** :
- Le post-processing existant corrige le texte brut (substitutions, unités)
- Le pipeline bio **extrait** des résultats structurés à partir du texte corrigé
- Les deux fonctionnent en cascade dans l'UI
