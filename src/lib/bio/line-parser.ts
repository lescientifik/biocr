import type { BioParameter } from "@/types/bio.ts";
import { lookupExact, lookupFuzzy } from "./lookup.ts";

export type ParsedLine = {
	/** The matched BioParameter from the dictionary. */
	param: BioParameter;
	/** The extracted numeric value. */
	value: number;
	/** The extracted unit string. */
	unit: string;
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
	"G/L",
	"fL",
	"pg",
	"%",
	"s",
	"ratio",
	"mmol/mol",
];

const KNOWN_UNITS_LOWER = new Set(KNOWN_UNITS.map((u) => u.toLowerCase()));

/**
 * Regex to find numeric values in text.
 * Matches: optional sign, digits, optional decimal (dot or comma) + digits.
 */
const NUMERIC_RE = /[+-]?\d+(?:[.,]\d+)?/g;

/** Parameters that are legitimately unitless. */
const UNITLESS_PARAMS = new Set(["INR"]);

type Candidate = {
	param: BioParameter;
	value: number;
	unit: string;
	score: number;
	/** End index of this match (number + unit) in the original line. */
	endIndex: number;
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

		const rawValue = numMatch[0].replace(",", ".");
		const value = Number.parseFloat(rawValue);
		if (Number.isNaN(value)) continue;

		const afterNumber = trimmed
			.slice(numMatch.index + numMatch[0].length)
			.trim();
		const unitResult = matchUnitWithLength(afterNumber);
		const unit = unitResult.unit;

		// Require a known unit (or unitless param) to avoid false positives
		// from header/address lines like "CRP 75012 Paris"
		if (!unit && !UNITLESS_PARAMS.has(param.name)) continue;
		if (unit && !isKnownUnit(unit) && !UNITLESS_PARAMS.has(param.name))
			continue;

		let score = 0;
		if (unit && isKnownUnit(unit)) score += 2;
		else if (unit) score += 1;
		if (lookupExact(cleanedName)) score += 1;

		const endIndex = numMatch.index + numMatch[0].length + unitResult.consumed;
		candidates.push({ param, value, unit, score, endIndex });
	}

	if (candidates.length === 0) return [];

	// Find the best candidate (highest score)
	const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
	const results: ParsedLine[] = [
		{ param: best.param, value: best.value, unit: best.unit },
	];

	// Check for a second value after the first result (multi-value lines)
	// e.g., "PNN 4.50 G/L 45 %" → extract the "45 %" part too
	if (best.endIndex < trimmed.length) {
		const remainder = trimmed.slice(best.endIndex).trim();
		const secondMatch = remainder.match(NUMERIC_RE);
		if (secondMatch && secondMatch.index !== undefined) {
			const secondRaw = secondMatch[0].replace(",", ".");
			const secondValue = Number.parseFloat(secondRaw);
			if (!Number.isNaN(secondValue)) {
				const afterSecond = remainder
					.slice(secondMatch.index + secondMatch[0].length)
					.trim();
				const secondUnit = matchUnit(afterSecond);
				if (secondUnit && isKnownUnit(secondUnit)) {
					results.push({
						param: best.param,
						value: secondValue,
						unit: secondUnit,
					});
				}
			}
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

	const words = name.split(/\s+/);
	for (let start = 1; start < words.length && start <= 3; start++) {
		const sub = words.slice(start).join(" ");
		const subExact = lookupExact(sub);
		if (subExact) return subExact;
		const subFuzzy = lookupFuzzy(sub);
		if (subFuzzy) return subFuzzy;
	}

	return null;
}

/**
 * Match a known unit at the start of a string.
 * Returns the matched unit or empty string if none found.
 */
function matchUnit(text: string): string {
	return matchUnitWithLength(text).unit;
}

/**
 * Match a known unit at the start of a string.
 * Returns the matched unit and the number of characters consumed.
 */
function matchUnitWithLength(text: string): {
	unit: string;
	consumed: number;
} {
	const trimmed = text.trim();
	const leadingSpaces = text.length - text.trimStart().length;
	// Strip reference range markers like [0.70 - 1.10] or (0.70-1.10)
	const cleaned = trimmed.replace(/[(\[].*$/, "").trim();

	const firstWord = cleaned.split(/\s/)[0] ?? "";
	for (const unit of KNOWN_UNITS) {
		const unitLower = unit.toLowerCase();
		const cleanedLower = cleaned.toLowerCase();
		if (unit.length === 1) {
			if (firstWord.toLowerCase() === unitLower) {
				return {
					unit,
					consumed: leadingSpaces + firstWord.length,
				};
			}
		} else if (cleanedLower.startsWith(unitLower)) {
			return { unit, consumed: leadingSpaces + unit.length };
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
