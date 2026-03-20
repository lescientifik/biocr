import type { BioParameter } from "@/types/bio.ts";
import { getPlausibleRange } from "./lookup.ts";

/**
 * Validates whether a value is plausible for the given parameter and unit.
 * Returns true if the value is flagged as implausible (likely OCR error).
 *
 * Rules:
 * - Negative values are always flagged
 * - Values outside the plausible range are flagged
 * - If the unit is unknown (no range data), the value is NOT flagged (benefit of the doubt)
 */
export function isValueFlagged(
	param: BioParameter,
	value: number,
	unit: string,
): boolean {
	// Negative values are always suspicious for bio parameters
	if (value < 0) return true;

	const range = getPlausibleRange(param.name, unit);
	if (!range) return false; // Unknown unit → don't flag

	return value < range.min || value > range.max;
}
