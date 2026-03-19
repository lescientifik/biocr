import { validateFile } from "@/lib/file-validation.ts";
import { describe, expect, it } from "vitest";

function fakeFile(name: string, size = 1024): File {
	const content = new Uint8Array(size);
	return new File([content], name, { type: "application/octet-stream" });
}

describe("validateFile", () => {
	it.each(["test.png", "test.jpg", "test.jpeg", "test.webp", "test.bmp"])(
		"accepts image file %s → { type: 'image' }",
		(name) => {
			const result = validateFile(fakeFile(name));
			expect(result).toEqual({ ok: true, type: "image" });
		},
	);

	it("accepts PDF files → { type: 'pdf' }", () => {
		const result = validateFile(fakeFile("scan.pdf"));
		expect(result).toEqual({ ok: true, type: "pdf" });
	});

	it.each(["scan.tiff", "scan.tif"])(
		"rejects TIFF files (%s) with appropriate message",
		(name) => {
			const result = validateFile(fakeFile(name));
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("TIFF");
			}
		},
	);

	it.each(["doc.docx", "note.txt", "data.csv"])(
		"rejects unsupported format %s with message",
		(name) => {
			const result = validateFile(fakeFile(name));
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("Format non supporté");
			}
		},
	);

	it("rejects empty files (0 bytes)", () => {
		const result = validateFile(fakeFile("empty.png", 0));
		expect(result).toEqual({ ok: false, error: "Le fichier est vide." });
	});

	it("is case-insensitive on extensions", () => {
		expect(validateFile(fakeFile("PHOTO.PNG"))).toEqual({
			ok: true,
			type: "image",
		});
		expect(validateFile(fakeFile("DOC.PDF"))).toEqual({
			ok: true,
			type: "pdf",
		});
	});
});
