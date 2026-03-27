import type Tesseract from "tesseract.js";
import type { PSM } from "tesseract.js";

/** OCR engine configuration for local Tesseract.js paths. */
const base = import.meta.env.BASE_URL;
const TESSERACT_CONFIG = {
	workerPath: `${base}tesseract/worker.min.js`,
	corePath: `${base}tesseract/tesseract-core-simd-lstm.wasm.js`,
	langPath: `${base}tesseract/lang`,
	cacheMethod: "none" as const,
};

const DEFAULT_LANG = "fra+eng";

type LanguageCode = "fra" | "eng";

/** Returns the combined language string with the primary language first. */
function langCombo(lang: LanguageCode): string {
	return lang === "fra" ? "fra+eng" : "eng+fra";
}

let instance: Tesseract.Worker | null = null;
let initPromise: Promise<Tesseract.Worker> | null = null;
let pendingLang: LanguageCode | null = null;
let currentLang: string = DEFAULT_LANG;

/** Progress callback signature matching Tesseract.js LoggerMessage. */
export type ProgressCallback = (msg: {
	progress: number;
	status: string;
}) => void;

/** Result of an OCR recognition pass. */
export type RecognizeResult = {
	text: string;
	confidence: number;
};

/**
 * Mutable progress callback — updated before each recognize() call via
 * setProgressCallback(). The Tesseract worker holds a stable logger that
 * delegates here, so progress is always routed to the current caller.
 */
let _currentProgressCallback: ProgressCallback | null = null;

const stableLogger: ProgressCallback = (msg) => {
	_currentProgressCallback?.(msg);
};

/**
 * Sets the progress callback that the Tesseract worker's stable logger
 * delegates to. Call with `null` to clear.
 */
export function setProgressCallback(callback: ProgressCallback | null): void {
	_currentProgressCallback = callback;
}

/**
 * Returns the singleton Tesseract.js worker, creating it on first call.
 * Concurrent calls share the same in-flight promise to avoid race conditions.
 * After `terminate()`, the next call to `getEngine()` creates a fresh worker.
 *
 * Progress is routed through the stable logger — use setProgressCallback()
 * before each recognize() call to receive per-item progress events.
 */
export async function getEngine(): Promise<Tesseract.Worker> {
	if (instance) return instance;
	if (initPromise) return initPromise;

	const lang = pendingLang ? langCombo(pendingLang) : currentLang;
	pendingLang = null;

	initPromise = (async () => {
		const { createWorker } = await import("tesseract.js");
		return createWorker(lang, undefined, {
			...TESSERACT_CONFIG,
			logger: stableLogger,
		});
	})();

	try {
		instance = await initPromise;
		currentLang = lang;
	} catch (err) {
		initPromise = null;
		throw err;
	}
	initPromise = null;
	return instance;
}

/**
 * Runs OCR on a canvas element or image URL and returns extracted text with
 * confidence. When `isGlobalOcr` is true, PSM 3 (fully automatic) is used;
 * otherwise PSM 6 (assume uniform block of text) is used for zone recognition.
 *
 * On failure, returns an empty result instead of throwing.
 */
export async function recognize(
	input: HTMLCanvasElement | string,
	isGlobalOcr = false,
): Promise<RecognizeResult> {
	try {
		const worker = await getEngine();
		await worker.setParameters({
			tessedit_pageseg_mode: (isGlobalOcr ? "3" : "6") as PSM,
			preserve_interword_spaces: "1",
			user_defined_dpi: "300",
		});
		const result = await worker.recognize(input);
		return {
			text: result.data.text,
			confidence: result.data.confidence,
		};
	} catch {
		return { text: "", confidence: 0 };
	}
}

/**
 * Changes the language of the current worker without recreating it.
 * If no worker exists yet, stores the language so the next `getEngine()` call
 * uses it when creating the worker.
 */
export async function setLanguage(lang: LanguageCode): Promise<void> {
	if (!instance) {
		pendingLang = lang;
		return;
	}
	const combo = langCombo(lang);
	await instance.reinitialize(combo);
	currentLang = combo;
}

/**
 * Terminates the current worker. The next call to `getEngine()` or `recognize()`
 * will create a new worker automatically.
 */
export async function terminate(): Promise<void> {
	if (instance) {
		const w = instance;
		instance = null;
		initPromise = null;
		await w.terminate();
	}
}
