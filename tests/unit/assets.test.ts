import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC = resolve(import.meta.dirname, "../../public");
const LANG_DIR = resolve(PUBLIC, "tesseract/lang");

/**
 * Recursively computes total size in bytes for all files under `dir`.
 * Optionally excludes files matching glob-like patterns (e.g. "*.onnx").
 */
function dirSize(dir: string, excludePatterns: string[] = []): number {
	let total = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			total += dirSize(full, excludePatterns);
		} else {
			const excluded = excludePatterns.some((p) => {
				if (p.startsWith("*")) return entry.name.endsWith(p.slice(1));
				return entry.name === p;
			});
			if (!excluded) total += statSync(full).size;
		}
	}
	return total;
}

describe("tessdata_best assets", () => {
	it("fra.traineddata.gz is tessdata_best_int (~707 KB)", () => {
		const stat = statSync(resolve(LANG_DIR, "fra.traineddata.gz"));
		// tessdata_best_int fra is ~707 KB; tessdata default is ~6 MB
		// Ensure it's at least 500 KB (not a corrupt/empty file)
		expect(stat.size).toBeGreaterThan(500 * 1024);
	});

	it("eng.traineddata.gz is tessdata_best_int (~2.9 MB)", () => {
		const stat = statSync(resolve(LANG_DIR, "eng.traineddata.gz"));
		// tessdata_best_int eng is ~2.9 MB
		expect(stat.size).toBeGreaterThan(2 * 1024 * 1024);
	});

	it("total public/ assets < 25 MB (excluding ONNX models)", () => {
		const totalBytes = dirSize(PUBLIC, ["*.onnx"]);
		expect(totalBytes).toBeLessThan(25 * 1024 * 1024);
	});
});
