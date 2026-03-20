/** A single unit configuration for a biological parameter. */
export type UnitConfig = {
	unit: string;
	/** Physiologically plausible range (wider than normal range, for OCR error detection). */
	min: number;
	max: number;
};

/** A biological parameter entry in the dictionary. */
export type BioParameter = {
	/** Canonical French name (display name). */
	name: string;
	/** Known abbreviations (e.g., "Hb", "GR", "GB"). */
	abbreviations: string[];
	/** Spelling variants, synonyms, OCR-common misspellings. */
	aliases: string[];
	/** Accepted units with plausible value ranges. */
	units: UnitConfig[];
	/** Category for grouping. */
	category: string;
};

/** Result of extracting a single biological parameter from OCR text. */
export type BioResult = {
	/** Canonical parameter name from the dictionary. */
	name: string;
	/** Extracted numeric value. */
	value: number;
	/** Extracted unit string. */
	unit: string;
	/** True if the value is outside the plausible range (likely OCR error). */
	flagged: boolean;
};
