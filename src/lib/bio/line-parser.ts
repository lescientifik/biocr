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

type Candidate = {
	param: BioParameter;
	value: number;
	unit: string;
	/** Higher is better: 2 = exact name + known unit, 1 = has unit, 0 = no unit */
	score: number;
};

/**
 * Parse a single cleaned line to extract a biological parameter, value, and unit.
 * Returns null if the line doesn't contain a recognizable bio parameter + value.
 *
 * Strategy: find all numeric values, try each as the result value, score matches,
 * and pick the best one. Prefers matches with known units and exact name matches.
 */
export function parseLine(line: string): ParsedLine | null {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;

	// Find all numeric values in the line
	const matches = [...trimmed.matchAll(NUMERIC_RE)];
	if (matches.length === 0) return null;

	let best: Candidate | null = null;

	// For each numeric match, try to identify a parameter name before it
	for (const numMatch of matches) {
		if (numMatch.index === undefined) continue;

		// Text before the number
		const beforeValue = trimmed.slice(0, numMatch.index);
		// Clean separators: trailing spaces, colons, dots (leaders), tabs
		const cleanedName = beforeValue.replace(/[\s:.…·\-_\t]+$/, "").trim();
		if (cleanedName.length === 0) continue;

		// Try to resolve the parameter name
		const param = resolveParameter(cleanedName);
		if (!param) continue;

		// Parse the numeric value
		const rawValue = numMatch[0].replace(",", ".");
		const value = Number.parseFloat(rawValue);
		if (Number.isNaN(value)) continue;

		// Extract the unit after the number
		const afterNumber = trimmed
			.slice(numMatch.index + numMatch[0].length)
			.trim();
		const unit = matchUnit(afterNumber);

		// Score: prefer matches with known units and longer name matches
		let score = 0;
		if (unit && isKnownUnit(unit)) score += 2;
		else if (unit) score += 1;
		// Bonus for exact name match (not fuzzy)
		if (lookupExact(cleanedName)) score += 1;

		if (!best || score > best.score) {
			best = { param, value, unit, score };
		}
	}

	return best
		? { param: best.param, value: best.value, unit: best.unit }
		: null;
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
	// Try exact match on the full name
	const exact = lookupExact(name);
	if (exact) return exact;

	// Try fuzzy match on the full name
	const fuzzy = lookupFuzzy(name);
	if (fuzzy) return fuzzy;

	// Try matching only the last N words (for lines with extra prefix text)
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
	const trimmed = text.trim();
	// Strip reference range markers like [0.70 - 1.10] or (0.70-1.10)
	const cleaned = trimmed.replace(/[(\[].*$/, "").trim();

	// Try known units (longest first for greedy match)
	const firstWord = cleaned.split(/\s/)[0] ?? "";
	for (const unit of KNOWN_UNITS) {
		const unitLower = unit.toLowerCase();
		const cleanedLower = cleaned.toLowerCase();
		// Single-char units (%, s) must match the whole first word to avoid false positives
		if (unit.length === 1) {
			if (firstWord.toLowerCase() === unitLower) return unit;
		} else if (cleanedLower.startsWith(unitLower)) {
			return unit;
		}
	}

	// If nothing matched but there's text, take the first word as unit
	if (firstWord && /^[a-zA-Zµ%°/²]+$/.test(firstWord)) {
		return firstWord;
	}

	return "";
}
