import type { LanguageCode } from "@/components/LanguageSelector.tsx";
import type { FileType, PageLayout } from "@/types/index.ts";
import type { OcrZoneResult } from "@/types/ocr.ts";
import { create } from "zustand";

type OcrState =
	| { status: "idle" }
	| {
			status: "running";
			currentItem: number;
			totalItems: number;
			progress: number;
			step: "preprocessing" | "detecting" | "recognizing";
			itemLabel: "Zone" | "Page";
			partialResults: OcrZoneResult[];
	  }
	| { status: "done"; results: OcrZoneResult[] };

type AppStore = {
	// File state
	file: File | null;
	fileType: FileType | null;
	pages: PageLayout[];

	// OCR state
	ocr: OcrState;

	// Settings
	language: LanguageCode;
	previewPreprocessing: boolean;
	skipPreprocessing: boolean;

	// Actions
	setFile: (file: File, type: FileType) => void;
	clearFile: () => void;
	setPages: (pages: PageLayout[]) => void;
	setOcrState: (ocr: OcrState) => void;
	setLanguage: (lang: LanguageCode) => void;
	togglePreprocessingPreview: () => void;
	toggleSkipPreprocessing: () => void;
	reset: () => void;
};

const initialState = {
	file: null,
	fileType: null,
	pages: [],
	ocr: { status: "idle" } as OcrState,
	language: "fra" as LanguageCode,
	previewPreprocessing: false,
	skipPreprocessing: false,
};

export const useAppStore = create<AppStore>((set) => ({
	...initialState,

	setFile: (file, type) => set({ file, fileType: type }),

	clearFile: () =>
		set({
			file: null,
			fileType: null,
			pages: [],
			ocr: { status: "idle" },
			previewPreprocessing: false,
		skipPreprocessing: false,
		}),

	setPages: (pages) => set({ pages }),

	setOcrState: (ocr) => set({ ocr }),

	setLanguage: (language) => set({ language }),

	togglePreprocessingPreview: () =>
		set((state) => ({
			previewPreprocessing: !state.previewPreprocessing,
		})),

	toggleSkipPreprocessing: () =>
		set((state) => ({
			skipPreprocessing: !state.skipPreprocessing,
		})),

	reset: () => set(initialState),
}));
