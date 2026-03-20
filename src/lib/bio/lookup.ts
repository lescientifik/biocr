import { levenshtein } from "@/lib/post-processing/medical-dictionary.ts";
import type { BioParameter, UnitConfig } from "@/types/bio.ts";
import { BIO_PARAMETERS } from "./parameters.ts";

/** Pre-built index: lowercase canonical name → BioParameter. */
const nameIndex = new Map<string, BioParameter>();

/** Pre-built index: lowercase abbreviation → BioParameter. */
const abbrIndex = new Map<string, BioParameter>();

/** Pre-built index: lowercase alias → BioParameter. */
const aliasIndex = new Map<string, BioParameter>();

/** All searchable terms for fuzzy matching: { lower, param }. */
const fuzzyEntries: { lower: string; param: BioParameter }[] = [];

// Build indexes once at module load
for (const param of BIO_PARAMETERS) {
	const nameLower = param.name.toLowerCase();
	nameIndex.set(nameLower, param);
	fuzzyEntries.push({ lower: nameLower, param });

	for (const abbr of param.abbreviations) {
		abbrIndex.set(abbr.toLowerCase(), param);
	}

	for (const alias of param.aliases) {
		const aliasLower = alias.toLowerCase();
		aliasIndex.set(aliasLower, param);
		fuzzyEntries.push({ lower: aliasLower, param });
	}
}

/**
 * Look up a biological parameter by exact name, abbreviation, or alias.
 * Case-insensitive. Returns null if not found.
 */
export function lookupExact(term: string): BioParameter | null {
	const lower = term.toLowerCase();
	return (
		nameIndex.get(lower) ??
		abbrIndex.get(lower) ??
		aliasIndex.get(lower) ??
		null
	);
}

/** Bounded LRU cache for fuzzy lookup results (avoids repeated Levenshtein on same terms). */
const FUZZY_CACHE_MAX = 128;
const fuzzyCache = new Map<string, BioParameter | null>();

/**
 * Fuzzy-match a term against the dictionary.
 * Uses Levenshtein distance with adaptive maxDist based on word length.
 * Results are cached (bounded LRU, 128 entries) to avoid repeated computation.
 * Returns the best matching BioParameter, or null if no match within threshold.
 */
export function lookupFuzzy(
	term: string,
	maxDist?: number,
): BioParameter | null {
	// Try exact first
	const exact = lookupExact(term);
	if (exact) return exact;

	// Don't fuzzy-match very short terms (too ambiguous)
	if (term.length < 4) return null;

	const cacheKey = maxDist !== undefined ? `${term}:${maxDist}` : term;
	const cached = fuzzyCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const result = lookupFuzzyUncached(term, maxDist);

	// Bounded cache: evict oldest entry if full
	if (fuzzyCache.size >= FUZZY_CACHE_MAX) {
		const firstKey = fuzzyCache.keys().next().value;
		if (firstKey !== undefined) fuzzyCache.delete(firstKey);
	}
	fuzzyCache.set(cacheKey, result);

	return result;
}

function lookupFuzzyUncached(
	term: string,
	maxDist?: number,
): BioParameter | null {
	// Adaptive max distance: scale with word length to avoid false positives
	// 4-5 chars → max 1, 6-8 chars → max 2, 9+ chars → max 3
	const effectiveMaxDist =
		maxDist ?? (term.length <= 5 ? 1 : term.length <= 8 ? 2 : 3);

	const lower = term.toLowerCase();
	let bestParam: BioParameter | null = null;
	let bestDist = effectiveMaxDist + 1;
	let ambiguous = false;

	for (const entry of fuzzyEntries) {
		const dist = levenshtein(lower, entry.lower, effectiveMaxDist);
		if (dist < bestDist) {
			bestDist = dist;
			bestParam = entry.param;
			ambiguous = false;
		} else if (
			dist === bestDist &&
			bestParam !== null &&
			bestParam !== entry.param
		) {
			ambiguous = true;
		}
	}

	if (ambiguous || bestDist > effectiveMaxDist) return null;
	return bestParam;
}

/**
 * Get the plausible range for a parameter and unit.
 * Returns null if the parameter or unit is not found.
 */
export function getPlausibleRange(
	paramName: string,
	unit: string,
): UnitConfig | null {
	const param = lookupExact(paramName);
	if (!param) return null;

	const normalizedUnit = unit.trim();
	return (
		param.units.find(
			(u) => u.unit.toLowerCase() === normalizedUnit.toLowerCase(),
		) ?? null
	);
}
