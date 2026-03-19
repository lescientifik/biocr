/**
 * Medical laboratory terms dictionary for OCR post-processing.
 * Used for fuzzy matching correction of misrecognized terms.
 */
export const MEDICAL_TERMS: string[] = [
	"Glycémie",
	"Hémoglobine",
	"Créatinine",
	"Cholestérol",
	"Triglycérides",
	"Transaminases",
	"Bilirubine",
	"Leucocytes",
	"Érythrocytes",
	"Plaquettes",
	"Hématocrite",
	"VGM",
	"TCMH",
	"CCMH",
	"CRP",
	"TSH",
	"LDH",
	"CPK",
	"HDL",
	"LDL",
	"HbA1c",
	"INR",
	"TCA",
	"Ferritine",
	"Albumine",
	"Sodium",
	"Potassium",
	"Chlore",
	"Calcium",
	"Phosphore",
	"Magnésium",
	"Fibrinogène",
	"TP",
];

/**
 * Computes Levenshtein distance between two strings.
 * Early-exits if distance exceeds maxDist.
 */
export function levenshtein(a: string, b: string, maxDist = 2): number {
	const lenA = a.length;
	const lenB = b.length;

	// Quick length-based early exit
	if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
	if (a === b) return 0;

	// Single-row DP
	const row = Array.from({ length: lenB + 1 }, (_, i) => i);

	for (let i = 1; i <= lenA; i++) {
		let prev = i - 1;
		row[0] = i;
		let rowMin = i; // track minimum in this row for early exit

		for (let j = 1; j <= lenB; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const val = Math.min(
				row[j] + 1, // deletion
				row[j - 1] + 1, // insertion
				prev + cost, // substitution
			);
			prev = row[j];
			row[j] = val;
			if (val < rowMin) rowMin = val;
		}

		// Early exit: if the minimum value in this row already exceeds maxDist,
		// the final distance will too
		if (rowMin > maxDist) return maxDist + 1;
	}

	return row[lenB];
}

/** Pre-computed lowercase terms for fast lookup. */
const TERMS_LOWER = MEDICAL_TERMS.map((t) => t.toLowerCase());

/** Map from lowercase term to original for O(1) exact match. */
const EXACT_MAP = new Map<string, string>(
	MEDICAL_TERMS.map((t) => [t.toLowerCase(), t]),
);

/** Cache for findClosestTerm results to avoid repeated computation. */
const closestTermCache = new Map<string, string | null>();

/**
 * Finds the closest medical term for a word.
 * Returns null if word.length < 4 (exact match only for short words).
 * Returns null if no term within maxDist, or if two terms are equidistant.
 */
export function findClosestTerm(word: string, maxDist = 2): string | null {
	const cached = closestTermCache.get(word);
	if (cached !== undefined) return cached;

	const result = findClosestTermUncached(word, maxDist);
	closestTermCache.set(word, result);
	return result;
}

function findClosestTermUncached(word: string, maxDist: number): string | null {
	const lower = word.toLowerCase();

	// Exact case-insensitive match (works for all word lengths)
	const exact = EXACT_MAP.get(lower);
	if (exact !== undefined) return exact;

	// For short words (< 4 chars): exact match only, no fuzzy
	if (word.length < 4) return null;

	let bestTerm: string | null = null;
	let bestDist = maxDist + 1;
	let ambiguous = false;

	for (let i = 0; i < TERMS_LOWER.length; i++) {
		const termLower = TERMS_LOWER[i];

		const dist = levenshtein(lower, termLower, maxDist);
		if (dist < bestDist) {
			bestDist = dist;
			bestTerm = MEDICAL_TERMS[i];
			ambiguous = false;
		} else if (dist === bestDist && bestTerm !== null) {
			ambiguous = true;
		}
	}

	if (ambiguous || bestDist > maxDist) return null;
	return bestTerm;
}
