import type { BioParameter } from "@/types/bio.ts";
import { levenshtein } from "@/lib/post-processing/medical-dictionary.ts";
import { lookupExact, lookupFuzzy } from "./lookup.ts";

export type ParsedLine = {
	/** The matched BioParameter from the dictionary. */
	param: BioParameter;
	/** The extracted numeric value. */
	value: number;
	/** The extracted unit string. */
	unit: string;
	/** Value qualifier: "<" or ">" when below/above detection threshold. */
	qualifier?: "<" | ">";
};

/**
 * Common units found in French lab results, ordered by specificity (longer first).
 * Used to identify unit strings in parsed lines.
 */
const KNOWN_UNITS = [
	"mL/min/1.73m²",
	"mUI/mL",
	"µUI/mL",
	"µmol/L",
	"mmol/L",
	"µmol/l",
	"mmol/l",
	"nmol/L",
	"pmol/L",
	"µg/dL",
	"ng/dL",
	"pg/mL",
	"ng/mL",
	"mg/dL",
	"mUI/L",
	"µg/L",
	"UI/mL",
	"UI/L",
	"g/dL",
	"mg/L",
	"mm/h",
	"g/24h",
	"mg/24h",
	"g/L",
	"T/L",
	"giga/L",
	"G/L",
	"fL",
	"pg",
	"%",
	"s",
	"ratio",
	"mmol/mol",
];

const KNOWN_UNITS_LOWER = new Set(KNOWN_UNITS.map((u) => u.toLowerCase()));

/** Aliases that should be normalized to a canonical unit after matching. */
const UNIT_ALIASES: Record<string, string> = {
	"giga/L": "G/L",
	"giga/l": "G/L",
};

/**
 * Regex to find numeric values in text.
 * Matches: optional sign, digits, optional decimal (dot or comma) + digits.
 */
const NUMERIC_RE = /[<>]?\s*[+-]?\d+(?:[.,]\d+)?/g;

/** Parameters that are legitimately unitless. */
const UNITLESS_PARAMS = new Set(["INR"]);

type Candidate = {
	param: BioParameter;
	value: number;
	unit: string;
	score: number;
	/** End index of this match (number + unit) in the original line. */
	endIndex: number;
	qualifier?: "<" | ">";
};

/**
 * Parse a single cleaned line to extract biological parameters.
 * Returns an array of results (may contain 0, 1, or multiple results).
 *
 * Supports multi-value lines like "PNN 4.50 G/L 45 %" by extracting
 * multiple parameter+value+unit triples.
 *
 * Requires a recognized unit for the result to be valid (prevents false
 * positives from header/address lines). Unitless parameters (INR) are exempt.
 */
export function parseLine(line: string): ParsedLine | null {
	const results = parseLineMulti(line);
	return results.length > 0 ? results[0] : null;
}

/**
 * Parse a line and return ALL bio results found (for multi-value lines).
 */
export function parseLineMulti(line: string): ParsedLine[] {
	const trimmed = line.trim();
	if (trimmed.length === 0) return [];

	const matches = [...trimmed.matchAll(NUMERIC_RE)];
	if (matches.length === 0) return [];

	// Collect all valid candidates
	const candidates: Candidate[] = [];

	for (const numMatch of matches) {
		if (numMatch.index === undefined) continue;

		const beforeValue = trimmed.slice(0, numMatch.index);
		const cleanedName = beforeValue.replace(/[\s:.…·\-_\t]+$/, "").trim();
		if (cleanedName.length === 0) continue;

		const param = resolveParameter(cleanedName);
		if (!param) continue;

		const matchStr = numMatch[0];
		const qualifier = matchStr.startsWith("<")
			? ("<" as const)
			: matchStr.startsWith(">")
				? (">" as const)
				: undefined;
		const rawValue = matchStr.replace(/^[<>]\s*/, "").replace(",", ".");
		const value = Number.parseFloat(rawValue);
		if (Number.isNaN(value)) continue;

		const afterNumberRaw = trimmed.slice(
			numMatch.index + numMatch[0].length,
		);
		const leadingSpaceCount =
			afterNumberRaw.length - afterNumberRaw.trimStart().length;
		const afterNumber = afterNumberRaw.trimStart();
		let unitResult = matchUnitWithLength(afterNumber, param.preferredUnit);
		// If the matched unit is not accepted by this param, check if the real
		// unit follows right after (e.g., "% g/dL" → skip stray %, take g/dL)
		const unitAccepted = (u: string) =>
			param.units.some((pu) => pu.unit.toLowerCase() === u.toLowerCase());
		if (unitResult.unit && !unitAccepted(unitResult.unit)) {
			const restRaw = afterNumber.slice(unitResult.consumed);
			const restSpaces = restRaw.length - restRaw.trimStart().length;
			const rest = restRaw.trimStart();
			if (rest) {
				const alt = matchUnitWithLength(rest, param.preferredUnit);
				if (alt.unit && unitAccepted(alt.unit)) {
					unitResult = {
						unit: alt.unit,
						consumed:
							unitResult.consumed + restSpaces + alt.consumed,
					};
				}
			}
		}
		let unit = unitResult.unit;

		// If the unit is missing or unknown but the param only has one accepted unit
		// and the value is within its plausible range, assume OCR mangled/dropped the unit.
		// When unit is empty, only apply if nothing significant follows (avoid matching
		// numbers in parameter names like "Cyfra 21-1 2.3 ng/mL").
		const canFallbackUnit =
			(!unit && afterNumber.trim().length === 0) ||
			(unit && !isKnownUnit(unit));
		if (canFallbackUnit && param.units.length === 1) {
			const only = param.units[0];
			if (value >= only.min && value <= only.max) {
				unit = only.unit;
			}
		}

		// Require a known unit (or unitless param) to avoid false positives
		// from header/address lines like "CRP 75012 Paris"
		if (!unit && !UNITLESS_PARAMS.has(param.name)) continue;
		if (unit && !isKnownUnit(unit) && !UNITLESS_PARAMS.has(param.name))
			continue;

		let score = 0;
		if (unit && isKnownUnit(unit)) score += 2;
		else if (unit) score += 1;
		if (lookupExact(cleanedName)) score += 1;
		// Boost when the unit is in the param's accepted units list
		if (
			unit &&
			param.units.some(
				(u) => u.unit.toLowerCase() === unit.toLowerCase(),
			)
		)
			score += 5;
		if (
			param.preferredUnit &&
			unit &&
			unit.toLowerCase() === param.preferredUnit.toLowerCase()
		)
			score += 10;

		const endIndex =
			numMatch.index +
			numMatch[0].length +
			leadingSpaceCount +
			unitResult.consumed;
		candidates.push({ param, value, unit, score, endIndex, qualifier });
	}

	if (candidates.length === 0) return [];

	// Find the best candidate (highest score)
	const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
	const results: ParsedLine[] = [
		{ param: best.param, value: best.value, unit: best.unit, qualifier: best.qualifier },
	];

	// Collect other candidates for the same param with a different unit
	// (multi-value lines like "PNN 70.9 % 4.05 G/L")
	for (const c of candidates) {
		if (
			c === best ||
			c.param.name !== best.param.name ||
			c.unit === best.unit
		)
			continue;
		if (!results.some((r) => r.unit === c.unit)) {
			results.push({ param: c.param, value: c.value, unit: c.unit, qualifier: c.qualifier });
		}
	}

	// Also check the remainder after best for a second value not already found
	if (best.endIndex < trimmed.length) {
		const remainder = trimmed.slice(best.endIndex).trim();
		const secondMatch = remainder.match(/[+-]?\d+(?:[.,]\d+)?/);
		if (secondMatch && secondMatch.index !== undefined) {
			const secondRaw = secondMatch[0].replace(",", ".");
			const secondValue = Number.parseFloat(secondRaw);
			if (!Number.isNaN(secondValue)) {
				const afterSecond = remainder
					.slice(secondMatch.index + secondMatch[0].length)
					.trim();
				const secondUnit = matchUnit(afterSecond, best.param.preferredUnit);
				if (
					secondUnit &&
					isKnownUnit(secondUnit) &&
					!results.some((r) => r.unit === secondUnit)
				) {
					results.push({
						param: best.param,
						value: secondValue,
						unit: secondUnit,
					});
				}
			}
		}
	}

	// If the parameter has a preferred unit, reorder so it comes first
	if (results.length > 1 && best.param.preferredUnit) {
		const prefLower = best.param.preferredUnit.toLowerCase();
		const prefIdx = results.findIndex(
			(r) => r.unit.toLowerCase() === prefLower,
		);
		if (prefIdx > 0) {
			const [preferred] = results.splice(prefIdx, 1);
			results.unshift(preferred);
		}
	}

	return results;
}

/** Check if a unit string is in our known units list. */
function isKnownUnit(unit: string): boolean {
	return KNOWN_UNITS_LOWER.has(unit.toLowerCase());
}

/**
 * Try to resolve a parameter from a name string.
 * Tries exact match first (full string and right-trimmed substrings),
 * then fuzzy match. Returns null if nothing matches.
 */
function resolveParameter(name: string): BioParameter | null {
	const exact = lookupExact(name);
	if (exact) return exact;

	const fuzzy = lookupFuzzy(name);
	if (fuzzy) return fuzzy;

	// Strip punctuation noise (parentheses, #, dashes) and try individual tokens
	const cleaned = name.replace(/[()#.\-]/g, " ");
	const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

	// Try substrings: drop words from the left, then from the right
	for (let start = 1; start < words.length && start <= 3; start++) {
		const sub = words.slice(start).join(" ");
		const subExact = lookupExact(sub);
		if (subExact) return subExact;
		const subFuzzy = lookupFuzzy(sub);
		if (subFuzzy) return subFuzzy;
	}
	for (let end = words.length - 1; end >= 1; end--) {
		const sub = words.slice(0, end).join(" ");
		const subExact = lookupExact(sub);
		if (subExact) return subExact;
		const subFuzzy = lookupFuzzy(sub);
		if (subFuzzy) return subFuzzy;
	}

	// Try each word individually (catches abbreviations like TGO, ASAT)
	for (const word of words) {
		const wordExact = lookupExact(word);
		if (wordExact) return wordExact;
	}
	for (const word of words) {
		const wordFuzzy = lookupFuzzy(word);
		if (wordFuzzy) return wordFuzzy;
	}

	return null;
}

/**
 * Match a known unit at the start of a string.
 * Returns the matched unit or empty string if none found.
 */
function matchUnit(text: string, preferredUnit?: string): string {
	return matchUnitWithLength(text, preferredUnit).unit;
}

/**
 * Match a known unit at the start of a string.
 * Returns the matched unit and the number of characters consumed.
 */
function matchUnitWithLength(
	text: string,
	preferredUnit?: string,
): {
	unit: string;
	consumed: number;
} {
	const trimmed = text.trim();
	const leadingSpaces = text.length - text.trimStart().length;
	// Strip reference range markers like [0.70 - 1.10] or (0.70-1.10)
	const cleaned = trimmed.replace(/[(\[].*$/, "").trim();

	const firstWord = cleaned.split(/\s/)[0] ?? "";
	// First pass: case-sensitive (important: g/L ≠ G/L)
	for (const unit of KNOWN_UNITS) {
		const canonical = UNIT_ALIASES[unit] ?? unit;
		if (unit.length === 1) {
			if (firstWord === unit) {
				return {
					unit: canonical,
					consumed: leadingSpaces + firstWord.length,
				};
			}
		} else if (cleaned.startsWith(unit)) {
			return { unit: canonical, consumed: leadingSpaces + unit.length };
		}
	}
	// Second pass: case-insensitive fallback for OCR casing errors
	for (const unit of KNOWN_UNITS) {
		const unitLower = unit.toLowerCase();
		const cleanedLower = cleaned.toLowerCase();
		const canonical = UNIT_ALIASES[unit] ?? unit;
		if (unit.length === 1) {
			if (firstWord.toLowerCase() === unitLower) {
				return {
					unit: canonical,
					consumed: leadingSpaces + firstWord.length,
				};
			}
		} else if (cleanedLower.startsWith(unitLower)) {
			return { unit: canonical, consumed: leadingSpaces + unit.length };
		}
	}

	// Fuzzy fallback: try Levenshtein on the first word against known units.
	// When multiple units tie at the same distance, prefer the preferredUnit.
	// Adaptive threshold: short words (≤3 chars) allow max 1 edit, longer allow 2.
	if (firstWord && firstWord.length >= 2 && /[a-zA-Zµ]/.test(firstWord)) {
		const maxDist = firstWord.length <= 3 ? 1 : 2;
		const candidates: { canonical: string; dist: number }[] = [];
		for (const unit of KNOWN_UNITS) {
			const canonical = UNIT_ALIASES[unit] ?? unit;
			const dist = levenshtein(firstWord.toLowerCase(), unit.toLowerCase(), maxDist);
			if (dist <= maxDist) {
				candidates.push({ canonical, dist });
			}
		}
		if (candidates.length > 0) {
			const minDist = Math.min(...candidates.map((c) => c.dist));
			const tied = candidates.filter((c) => c.dist === minDist);
			// Tiebreak: prefer the param's preferredUnit if it's among the ties
			const winner =
				(preferredUnit &&
					tied.find((c) => c.canonical === preferredUnit)) ||
				tied[0];
			return {
				unit: winner.canonical,
				consumed: leadingSpaces + firstWord.length,
			};
		}
	}

	if (firstWord && /^[a-zA-Zµ%°/²]+$/.test(firstWord)) {
		return {
			unit: firstWord,
			consumed: leadingSpaces + firstWord.length,
		};
	}

	return { unit: "", consumed: 0 };
}
