/** Validated file type after input */
export type FileType = "image" | "pdf";

/**
 * Browser-agnostic image buffer.
 * Used instead of ImageData so preprocessing logic can run in happy-dom tests.
 */
export type ImageBuffer = {
	data: Uint8ClampedArray;
	width: number;
	height: number;
};

/** Result of file validation */
export type FileValidationResult =
	| { ok: true; type: FileType }
	| { ok: false; error: string };

/** Viewport state — single source of truth for zoom & pan */
export type ViewportState = {
	zoom: number;
	panX: number;
	panY: number;
};

/** Layout of a single page in document space */
export type PageLayout = {
	pageIndex: number;
	top: number;
	height: number;
	width: number;
};

/** Interaction mode */
export type InteractionMode = "pan" | "draw";
