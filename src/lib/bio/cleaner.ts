/**
 * Cleans raw OCR text before bio parameter extraction.
 *
 * Steps:
 * 1. Strip leading/trailing whitespace per line
 * 2. Remove empty lines
 * 3. Remove common OCR artifacts (|, ~, repeated dashes, stray underscores)
 */
export function cleanOcrText(text: string): string {
	const cleaned = text
		.split("\n")
		.map((line) => cleanLine(line))
		.filter((line) => line.length > 0);

	// Merge continuation lines onto the previous line:
	// - Lines starting with "(" (method/technique annotations)
	// - Lines starting with "soit" (value in alternate unit)
	const merged: string[] = [];
	for (const line of cleaned) {
		const isContinuation =
			(line.startsWith("(") || /^soit\b/i.test(line)) &&
			merged.length > 0;
		if (isContinuation) {
			merged[merged.length - 1] += " " + line;
		} else {
			merged.push(line);
		}
	}

	return merged.join("\n");
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
	// 10⁹/L = G/L — normalize BEFORE stripping * (10*9/L uses *)
	result = result.replace(/10[°^*⁹]9?\d*\s*[/]?\s*[lL]?\b/g, "G/L");
	// Remove lab abnormality markers (*, H, L flags next to values)
	result = result.replace(/(\d)\*+/g, "$1");
	// Separate % stuck to a number (OCR artifact) so parser sees it as a token
	result = result.replace(/(\d)%/g, "$1 %");
	// Remove lines that are only dashes/underscores (separators)
	if (/^[-_=.]{3,}$/.test(result)) return "";
	// Remove sample/method info lines (no bio data)
	if (/^(Sang|Sérum|Serum|Plasma|Urine)\b/i.test(result)) return "";
	// Remove stray underscores surrounded by spaces
	result = result.replace(/\s_\s/g, " ");
	// Remove stray # characters (OCR noise from table formatting)
	result = result.replace(/#/g, " ");
	// OCR confuses S and 5: fix 5 surrounded by letters or dots (P5A → PSA, P.5.A. → P.S.A.)
	result = result.replace(/([A-Za-z.])5([A-Za-z.])/g, "$1S$2");
	// Collapse dotted abbreviations: D.F.G. → DFG, T.G.O. → TGO
	result = result.replace(/\b([A-Z])\.([A-Z])\.([A-Z])\.\s*/g, "$1$2$3 ");
	result = result.replace(/\b([A-Z])\.([A-Z])\.\s*/g, "$1$2 ");
	// Collapse spaced abbreviations with trailing dot: PS A. → PSA
	result = result.replace(/\b([A-Z]{1,3})\s+([A-Z])\.\s/g, "$1$2 ");
	// Fix truncated/mangled OCR units
	result = result.replace(/\bgiga(?!\/)\b/gi, "G/L");
	result = result.replace(/\bU[AN]\b/gi, "UI/L");
	// DFG unit: OCR mangles mL/min/1.73m² in many ways
	// Handles: mi/mn/1,73m2, _mlimn/1,73m2, miymn/1.73m?, ml/min/1.73m² etc.
	// Two-separator form (ml/min/ or miymn/) first, then single-separator fallback
	result = result.replace(
		/[_\s]*m[a-z]*[/y]m[a-z]*\/1[.,]73\s*m[2²?]/gi,
		" mL/min/1.73m²",
	);
	if (!result.includes("mL/min/1.73m²")) {
		result = result.replace(
			/[_\s]*m[a-z]*\/1[.,]73\s*m[2²?]/gi,
			" mL/min/1.73m²",
		);
	}
	// OCR often renders µ as p (visual similarity)
	result = result.replace(/\bpmol\/l\b/gi, "µmol/L");
	// OCR mangles g/100mL (= g/dL) as 9/100mL, g/100ml etc.
	result = result.replace(/\b[g9]\/100\s*m[lL]\b/g, "g/dL");
	// OCR drops decimal point: 04 → 0.4 (leading zero followed by non-zero digit)
	// Only when not part of a larger number (not preceded by digit or dot)
	result = result.replace(/(?<![.\d])0([1-9])(?!\d)/g, "0.$1");
	// Collapse multiple spaces into one
	result = result.replace(/\s{2,}/g, " ");

	return result.trim();
}
