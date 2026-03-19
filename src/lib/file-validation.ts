import type { FileValidationResult } from "@/types/index.ts";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);
const PDF_EXTENSION = "pdf";
const REJECTED_EXTENSIONS = new Set(["tiff", "tif"]);

function getExtension(filename: string): string {
	return filename.split(".").pop()?.toLowerCase() ?? "";
}

/** Validates an input file and returns its type or an error message. */
export function validateFile(file: File): FileValidationResult {
	if (file.size === 0) {
		return { ok: false, error: "Le fichier est vide." };
	}

	const ext = getExtension(file.name);

	if (IMAGE_EXTENSIONS.has(ext)) {
		return { ok: true, type: "image" };
	}

	if (ext === PDF_EXTENSION) {
		return { ok: true, type: "pdf" };
	}

	if (REJECTED_EXTENSIONS.has(ext)) {
		return {
			ok: false,
			error:
				"Le format TIFF n'est pas supporté. Utilisez PNG, JPG, WEBP, BMP ou PDF.",
		};
	}

	return {
		ok: false,
		error: `Format non supporté (.${ext}). Utilisez PNG, JPG, WEBP, BMP ou PDF.`,
	};
}
