/**
 * Verifies that all required static assets exist in public/.
 * Run with: bun run scripts/verify-assets.ts
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PUBLIC = resolve(import.meta.dirname, "../public");

const requiredFiles = [
	// Tesseract
	"tesseract/tesseract-core-simd-lstm.wasm",
	"tesseract/tesseract-core-simd-lstm.wasm.js",
	"tesseract/worker.min.js",
	"tesseract/lang/fra.traineddata.gz",
	"tesseract/lang/eng.traineddata.gz",
	// pdf.js
	"pdfjs/pdf.worker.min.mjs",
	"pdfjs/cmaps/78-H.bcmap",
	"pdfjs/standard_fonts/FoxitFixed.pfb",
];

let ok = true;

for (const file of requiredFiles) {
	const full = resolve(PUBLIC, file);
	if (!existsSync(full)) {
		console.error(`MISSING: ${file}`);
		ok = false;
	}
}

if (ok) {
	console.log("All required assets present.");
} else {
	process.exit(1);
}
