import { ProxyDestroyedError } from "@/lib/errors.ts";
import type { ImageBuffer } from "@/types/index.ts";
import type { OcrProgress, OcrZoneResult } from "@/types/ocr.ts";

export type OcrEngine = {
	recognize(
		image: ImageBuffer,
		onProgress?: (progress: number) => void,
	): Promise<{ text: string; confidence: number }>;
};

export type PreprocessFn = (image: ImageBuffer) => Promise<ImageBuffer>;

export type ZoneInput = {
	id: number;
	image: ImageBuffer;
};

export type ZoneProvider = {
	count: number;
	getZone: (index: number) => Promise<ZoneInput>;
};

export type CoordinatorOptions = {
	engine: OcrEngine;
	preprocess?: PreprocessFn;
	onProgress?: (progress: OcrProgress) => void;
	onWarning?: (message: string) => void;
	signal?: AbortSignal;
	onItemComplete?: (result: OcrZoneResult) => void;
	onStepChange?: (step: "preprocessing" | "recognizing") => void;
};

/**
 * Processes zones sequentially through the OCR pipeline:
 * preprocess (optional) → recognize → collect results.
 *
 * Accepts either a ZoneInput[] (sorted by ID) or a ZoneProvider (lazy, no sort).
 * Per-zone errors are caught: the zone gets empty text and continues.
 * ProxyDestroyedError from a ZoneProvider breaks the loop immediately.
 */
export async function processZones(
	zones: ZoneInput[] | ZoneProvider,
	options: CoordinatorOptions,
): Promise<OcrZoneResult[]> {
	const {
		engine,
		preprocess,
		onProgress,
		onWarning,
		signal,
		onItemComplete,
		onStepChange,
	} = options;
	const results: OcrZoneResult[] = [];

	const isArray = Array.isArray(zones);
	const count = isArray ? zones.length : zones.count;
	const sorted = isArray ? [...zones].sort((a, b) => a.id - b.id) : null;

	for (let i = 0; i < count; i++) {
		if (signal?.aborted) break;

		// Update progress at the start of each item so currentItem is always fresh
		onProgress?.({
			currentItem: i + 1,
			totalItems: count,
			itemProgress: 0,
			globalProgress: i / count,
		});

		// Get zone (eager from sorted array, or lazy from provider)
		let zone: ZoneInput;
		if (sorted) {
			zone = sorted[i];
		} else {
			try {
				zone = await (zones as ZoneProvider).getZone(i);
			} catch (err) {
				if (err instanceof ProxyDestroyedError) break;
				onWarning?.(`Impossible de charger l'item ${i + 1}`);
				results.push({ zoneId: i + 1, text: "", confidence: 0 });
				continue;
			}
		}

		// Preprocess (with fallback on error)
		let processedImage = zone.image;
		let usedRawImage = false;
		if (preprocess) {
			onStepChange?.("preprocessing");
			try {
				processedImage = await preprocess(zone.image);
			} catch {
				usedRawImage = true;
				onWarning?.(
					`Le prétraitement de la zone ${zone.id} a échoué. Image brute utilisée.`,
				);
			}
		}

		if (signal?.aborted) break;

		// OCR (with per-zone error handling)
		onStepChange?.("recognizing");
		try {
			const result = await engine.recognize(processedImage, (zoneProgress) => {
				onProgress?.({
					currentItem: i + 1,
					totalItems: count,
					itemProgress: zoneProgress,
					globalProgress: (i + zoneProgress) / count,
				});
			});

			const zoneResult: OcrZoneResult = {
				zoneId: zone.id,
				text: result.text,
				confidence: result.confidence,
			};
			results.push(zoneResult);
			onItemComplete?.(zoneResult);
		} catch {
			results.push({
				zoneId: zone.id,
				text: "",
				confidence: 0,
			});
			onWarning?.(
				`L'OCR de la zone ${zone.id} a échoué.${usedRawImage ? " (image brute)" : ""}`,
			);
		}
	}

	return results;
}
