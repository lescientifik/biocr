export type Zone = {
	id: number;
	left: number;
	top: number;
	width: number;
	height: number;
	source?: "manual" | "auto";
	label?: string;
	regionKey?: string;
};

/** Encapsulated ID counter — survives HMR by living on the class, not module scope. */
class IdCounter {
	private value = 1;
	next(): number {
		return this.value++;
	}
	reset(): void {
		this.value = 1;
	}
}

const counter = new IdCounter();

/** Creates a new zone with an auto-incremented stable ID. */
export function createZone(
	rect: {
		left: number;
		top: number;
		width: number;
		height: number;
	},
	options?: {
		source?: "manual" | "auto";
		label?: string;
		regionKey?: string;
	},
): Zone {
	const zone: Zone = { id: counter.next(), ...rect };
	if (options?.source) zone.source = options.source;
	if (options?.label) zone.label = options.label;
	if (options?.regionKey) zone.regionKey = options.regionKey;
	return zone;
}

/** Removes a zone by ID. */
export function deleteZone(zones: Zone[], id: number): Zone[] {
	return zones.filter((z) => z.id !== id);
}

/** Clears all zones (counter is NOT reset). */
export function clearAllZones(): Zone[] {
	return [];
}

/** Deep copy of zones array for snapshotting at OCR time. */
export function snapshotZones(zones: Zone[]): Zone[] {
	return zones.map((z) => ({ ...z }));
}

/** Resets the ID counter — only for testing. */
export function _resetIdCounter(): void {
	counter.reset();
}
