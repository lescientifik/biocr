import type { BioResult } from "@/types/bio.ts";
import { cleanOcrText } from "./cleaner.ts";
import { parseLineMulti } from "./line-parser.ts";
import { isValueFlagged } from "./validator.ts";

/** Parameters to exclude from extraction results. */
const DROPPED_PARAMS = new Set(["Hématocrite", "Hématies", "VGM", "TCMH", "CCMH", "INR", "TCA"]);

/**
 * Extracts structured biological parameters from raw OCR text.
 *
 * Pipeline:
 * 1. Clean OCR text (strip whitespace, remove artifacts, remove empty lines)
 * 2. Parse each line (identify parameter name, value, unit via dictionary lookup)
 *    Supports multi-value lines (e.g., "PNN 4.50 G/L 45 %")
 * 3. Validate each value against plausible ranges (flag implausible values)
 *
 * Returns an array of BioResult, one per successfully parsed parameter.
 * Lines that don't contain recognizable bio parameters are silently skipped.
 */
export function extractBioResults(rawText: string): BioResult[] {
	if (!rawText || rawText.trim().length === 0) return [];

	const cleaned = cleanOcrText(rawText);
	const lines = cleaned.split("\n");

	// Collect all parsed results with their param metadata
	type Intermediate = ReturnType<typeof parseLineMulti>[number];
	const all: Intermediate[] = [];
	for (const line of lines) {
		for (const p of parseLineMulti(line)) {
			if (!DROPPED_PARAMS.has(p.param.name)) all.push(p);
		}
	}

	// Deduplicate: when the same parameter appears multiple times and has a
	// preferredUnit, keep only the entry with the preferred unit.
	const byName = new Map<string, Intermediate[]>();
	for (const entry of all) {
		const group = byName.get(entry.param.name) ?? [];
		group.push(entry);
		byName.set(entry.param.name, group);
	}

	const deduped: Intermediate[] = [];
	for (const [, group] of byName) {
		if (group.length === 1) {
			deduped.push(group[0]);
			continue;
		}
		const pref = group[0].param.preferredUnit;
		if (pref) {
			// Keep the entry matching the preferred unit
			const preferred = group.find(
				(e) => e.unit.toLowerCase() === pref.toLowerCase(),
			);
			deduped.push(preferred ?? group[0]);
		} else {
			// No preferred unit: keep the entry whose unit is accepted by the param
			const accepted = group.filter((e) =>
				e.param.units.some(
					(u) => u.unit.toLowerCase() === e.unit.toLowerCase(),
				),
			);
			deduped.push(accepted.length > 0 ? accepted[0] : group[0]);
		}
	}

	return deduped.map((e) => ({
		name: e.param.name,
		value: e.value,
		unit: e.unit,
		flagged: isValueFlagged(e.param, e.value, e.unit),
		...(e.qualifier ? { qualifier: e.qualifier } : {}),
	}));
}
