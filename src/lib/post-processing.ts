import { findClosestTerm } from "./post-processing/medical-dictionary";

/**
 * Post-processes OCR text with contextual corrections for medical documents.
 * Always active, no toggle.
 *
 * Pipeline per line:
 * 1. Contextual character substitutions (O->0, l->1, S->5 in numeric context)
 * 2. Remove parasitic spaces between digits
 * 3. Unit normalization
 * 4. Medical dictionary correction (Levenshtein)
 */
export function postProcess(text: string): string {
	if (text.trim() === "") return text;

	return text
		.split("\n")
		.map((line) => processLine(line))
		.join("\n");
}

/** Checks whether a character is a digit or decimal separator (. or ,). */
function isNumericContext(ch: string | undefined): boolean {
	if (ch === undefined) return false;
	return /[\d.,]/.test(ch);
}

/**
 * Step 1: Contextual character substitutions.
 * Process right-to-left so that substitutions near decimal separators propagate
 * outward (e.g. "lO,S" -> the comma triggers O->0 and S->5, then 0 triggers l->1).
 */
function contextualSubstitutions(line: string): string {
	const chars = [...line];
	const result = new Array<string>(chars.length);

	for (let i = chars.length - 1; i >= 0; i--) {
		const ch = chars[i];
		const left = chars[i - 1]; // unprocessed left neighbor
		const right = result[i + 1]; // already-processed right neighbor

		const inNumCtx = isNumericContext(left) || isNumericContext(right);

		if (inNumCtx && ch === "O") {
			result[i] = "0";
		} else if (inNumCtx && ch === "l") {
			result[i] = "1";
		} else if (inNumCtx && ch === "S") {
			result[i] = "5";
		} else {
			result[i] = ch;
		}
	}

	return result.join("");
}

/** Step 2: Remove parasitic spaces between digits. */
function removeParasiticSpaces(line: string): string {
	return line.replace(/(\d) (\d)/g, "$1$2");
}

/** Step 3: Normalize medical units. */
function normalizeUnits(line: string): string {
	// Order matters: more specific patterns first
	// Note: \b doesn't work before non-ASCII chars like µ, so we use
	// lookbehind for word boundary or start-of-string where needed.
	return (
		line
			// u prefix -> micro sign (ASCII u before mol or l)
			.replace(/\bumol\/L\b/g, "\u00B5mol/L")
			.replace(/\bul\/mL\b/g, "\u00B5L/mL")
			// case-insensitive unit corrections
			.replace(/\bg\/l\b/gi, "g/L")
			.replace(/\bG\/L\b/g, "g/L")
			.replace(/\bmg\/dl\b/gi, "mg/dL")
			.replace(/\bmmol\/l\b/gi, "mmol/L")
			// µmol/l: µ is non-word char, so use lookbehind for boundary
			.replace(/(?<=^|\s)\u00B5mol\/l(?=\s|$)/gi, "\u00B5mol/L")
			.replace(/\bmUI\/l\b/gi, "mUI/L")
	);
}

/** Step 4: Medical dictionary correction via fuzzy matching. */
function dictionaryCorrection(line: string): string {
	return line.replace(/\S+/g, (word) => {
		const match = findClosestTerm(word);
		return match ?? word;
	});
}

/** Full pipeline for a single line. */
function processLine(line: string): string {
	let result = line;
	result = contextualSubstitutions(result);
	result = removeParasiticSpaces(result);
	result = normalizeUnits(result);
	result = dictionaryCorrection(result);
	return result;
}
