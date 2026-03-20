/** Region types detectable by layout analysis. */
export type LayoutRegionType =
	| "table"
	| "text"
	| "header"
	| "footer"
	| "figure"
	| "title";

/** A detected region in a page image. */
export type LayoutRegion = {
	type: LayoutRegionType;
	bbox: { x: number; y: number; width: number; height: number };
	confidence: number;
};

/** State of the layout detection process. */
export type DetectionState =
	| { status: "idle" }
	| {
			status: "running";
			currentPage: number;
			totalPages: number;
	  }
	| { status: "done" };

/** Cached detection results keyed by file identity. */
export type DetectionCacheData = {
	fileId: string;
	regionsByPage: LayoutRegion[][];
	sourceImageSizes: { width: number; height: number }[];
	/** Region types that were requested during this detection run. */
	detectedTypes: LayoutRegionType[];
};

/** Message sent to the layout detection worker. */
export type DetectionRequest = {
	image: { data: Uint8ClampedArray; width: number; height: number };
	pageIndex: number;
	nonce: number;
};

/** Message received from the layout detection worker. */
export type DetectionResponse = {
	regions: LayoutRegion[];
	pageIndex: number;
	nonce: number;
	error?: string;
};
