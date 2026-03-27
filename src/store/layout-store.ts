import type {
	DetectionCacheData,
	DetectionState,
	LayoutRegionType,
} from "@/types/layout.ts";
import { create } from "zustand";

type LayoutStore = {
	detection: DetectionState;
	enabledTypes: LayoutRegionType[];
	detectionCache: DetectionCacheData | null;
	deletedRegionKeys: string[];

	setDetectionState: (state: DetectionState) => void;
	toggleType: (type: LayoutRegionType) => void;
	setEnabledTypes: (types: LayoutRegionType[]) => void;
	setDetectionCache: (cache: DetectionCacheData) => void;
	clearDetectionCache: () => void;
	addDeletedRegionKey: (key: string) => void;
	clearDeletedRegionKeys: () => void;
	reset: () => void;
};

const initialState = {
	detection: { status: "idle" } as DetectionState,
	enabledTypes: ["table"] as LayoutRegionType[],
	detectionCache: null as DetectionCacheData | null,
	deletedRegionKeys: [] as string[],
};

export const useLayoutStore = create<LayoutStore>((set) => ({
	...initialState,

	setDetectionState: (detection) => set({ detection }),

	toggleType: (type) =>
		set((state) => ({
			enabledTypes: state.enabledTypes.includes(type)
				? state.enabledTypes.filter((t) => t !== type)
				: [...state.enabledTypes, type],
		})),

	setEnabledTypes: (enabledTypes) => set({ enabledTypes }),

	setDetectionCache: (detectionCache) => set({ detectionCache }),

	clearDetectionCache: () =>
		set({ detectionCache: null, deletedRegionKeys: [] }),

	addDeletedRegionKey: (key) =>
		set((state) => ({
			deletedRegionKeys: state.deletedRegionKeys.includes(key)
				? state.deletedRegionKeys
				: [...state.deletedRegionKeys, key],
		})),

	clearDeletedRegionKeys: () => set({ deletedRegionKeys: [] }),

	reset: () => set(initialState),
}));
