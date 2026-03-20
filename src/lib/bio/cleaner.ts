/**
 * Cleans raw OCR text before bio parameter extraction.
 *
 * Steps:
 * 1. Strip leading/trailing whitespace per line
 * 2. Remove empty lines
 * 3. Remove common OCR artifacts (|, ~, repeated dashes, stray underscores)
 */
export function cleanOcrText(text: string): string {
	return text
		.split("\n")
		.map((line) => cleanLine(line))
		.filter((line) => line.length > 0)
		.join("\n");
}

function cleanLine(line: string): string {
	// Remove BOM, zero-width characters, and non-breaking spaces
	let result = line.replace(/\uFEFF|\u200B|\u200C|\u200D|\u00A0/g, " ").trim();
	// Normalize Greek mu (U+03BC) to micro sign (U+00B5) for unit matching
	result = result.replace(/\u03BC/g, "\u00B5");

	// Remove common OCR artifacts
	// Remove stray pipe characters (table borders)
	result = result.replace(/\|/g, " ");
	// Remove stray tildes
	result = result.replace(/~/g, " ");
	// Remove lines that are only dashes/underscores (separators)
	if (/^[-_=.]{3,}$/.test(result)) return "";
	// Remove stray underscores surrounded by spaces
	result = result.replace(/\s_\s/g, " ");
	// Collapse multiple spaces into one
	result = result.replace(/\s{2,}/g, " ");

	return result.trim();
}
