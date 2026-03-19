import {
	_resetIdCounter,
	clearAllZones,
	createZone,
	deleteZone,
	snapshotZones,
} from "@/lib/zone-manager.ts";
import { afterEach, describe, expect, it } from "vitest";

describe("Zone manager", () => {
	afterEach(() => _resetIdCounter());

	it("createZone returns a zone with auto-incremented ID", () => {
		const z1 = createZone({ left: 0, top: 0, width: 100, height: 100 });
		const z2 = createZone({ left: 50, top: 50, width: 200, height: 200 });

		expect(z1.id).toBe(1);
		expect(z2.id).toBe(2);
	});

	it("IDs are stable: deleting zone 2 doesn't affect next ID", () => {
		createZone({ left: 0, top: 0, width: 100, height: 100 }); // id=1
		createZone({ left: 0, top: 0, width: 100, height: 100 }); // id=2
		createZone({ left: 0, top: 0, width: 100, height: 100 }); // id=3
		// delete zone 2
		const z4 = createZone({ left: 0, top: 0, width: 100, height: 100 });
		expect(z4.id).toBe(4);
	});

	it("deleteZone removes the zone with given ID", () => {
		const z1 = createZone({ left: 0, top: 0, width: 100, height: 100 });
		const z2 = createZone({ left: 0, top: 0, width: 100, height: 100 });
		const z3 = createZone({ left: 0, top: 0, width: 100, height: 100 });

		const result = deleteZone([z1, z2, z3], 2);
		expect(result).toHaveLength(2);
		expect(result.map((z) => z.id)).toEqual([1, 3]);
	});

	it("clearAllZones returns empty array (counter not reset)", () => {
		createZone({ left: 0, top: 0, width: 100, height: 100 }); // id=1
		const cleared = clearAllZones();
		expect(cleared).toEqual([]);

		// Next zone should be id=2
		const next = createZone({ left: 0, top: 0, width: 100, height: 100 });
		expect(next.id).toBe(2);
	});

	it("snapshotZones returns a deep copy", () => {
		const z1 = createZone({ left: 10, top: 20, width: 100, height: 100 });
		const zones = [z1];
		const snapshot = snapshotZones(zones);

		// Mutate original
		zones[0].left = 999;

		// Snapshot should be unchanged
		expect(snapshot[0].left).toBe(10);
	});
});
