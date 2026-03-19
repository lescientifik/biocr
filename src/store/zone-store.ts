import {
	type Zone,
	clearAllZones,
	createZone,
	deleteZone,
	snapshotZones,
} from "@/lib/zone-manager.ts";
import type { InteractionMode } from "@/types/index.ts";
import { create } from "zustand";

type ZoneStore = {
	zones: Zone[];
	mode: InteractionMode;
	selectedZoneId: number | null;

	addZone: (rect: {
		left: number;
		top: number;
		width: number;
		height: number;
	}) => Zone;
	removeZone: (id: number) => void;
	clearZones: () => void;
	setMode: (mode: InteractionMode) => void;
	selectZone: (id: number | null) => void;
	snapshotCurrentZones: () => Zone[];
	updateZone: (
		id: number,
		rect: { left: number; top: number; width: number; height: number },
	) => void;
	addAutoZones: (defs: Omit<Zone, "id">[]) => void;
	clearAutoZones: () => void;
	clearAutoZonesByType: (label: string) => void;
	reset: () => void;
};

export const useZoneStore = create<ZoneStore>((set, get) => ({
	zones: [],
	mode: "pan",
	selectedZoneId: null,

	addZone: (rect) => {
		const zone = createZone(rect);
		set((state) => ({ zones: [...state.zones, zone] }));
		return zone;
	},

	removeZone: (id) =>
		set((state) => ({
			zones: deleteZone(state.zones, id),
			selectedZoneId: state.selectedZoneId === id ? null : state.selectedZoneId,
		})),

	clearZones: () =>
		set({
			zones: clearAllZones(),
			selectedZoneId: null,
		}),

	setMode: (mode) => set({ mode }),

	selectZone: (id) => set({ selectedZoneId: id }),

	snapshotCurrentZones: () => snapshotZones(get().zones),

	updateZone: (id, rect) =>
		set((state) => ({
			zones: state.zones.map((z) => (z.id === id ? { ...z, ...rect } : z)),
		})),

	addAutoZones: (defs) =>
		set((state) => {
			const newZones = defs.map((d) =>
				createZone(
					{ left: d.left, top: d.top, width: d.width, height: d.height },
					{ source: d.source, label: d.label, regionKey: d.regionKey },
				),
			);
			return { zones: [...state.zones, ...newZones] };
		}),

	clearAutoZones: () =>
		set((state) => ({
			zones: state.zones.filter((z) => z.source !== "auto"),
			selectedZoneId:
				state.selectedZoneId !== null &&
				state.zones.find((z) => z.id === state.selectedZoneId)?.source ===
					"auto"
					? null
					: state.selectedZoneId,
		})),

	clearAutoZonesByType: (label) =>
		set((state) => ({
			zones: state.zones.filter(
				(z) => !(z.source === "auto" && z.label === label),
			),
			selectedZoneId:
				state.selectedZoneId !== null &&
				state.zones.find(
					(z) =>
						z.id === state.selectedZoneId &&
						z.source === "auto" &&
						z.label === label,
				)
					? null
					: state.selectedZoneId,
		})),

	reset: () =>
		set({
			zones: [],
			mode: "pan",
			selectedZoneId: null,
		}),
}));
