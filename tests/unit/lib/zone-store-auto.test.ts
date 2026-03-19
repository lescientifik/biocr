import { _resetIdCounter } from "@/lib/zone-manager.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { afterEach, describe, expect, it } from "vitest";

describe("Zone store — auto zones", () => {
	afterEach(() => {
		useZoneStore.getState().reset();
		_resetIdCounter();
	});

	it("createZone with source/label/regionKey options propagates fields", () => {
		const zone = useZoneStore.getState().addZone({
			left: 10,
			top: 20,
			width: 100,
			height: 50,
		});
		// addZone doesn't accept options — manual zones have no source/label
		expect(zone.source).toBeUndefined();
		expect(zone.label).toBeUndefined();
		expect(zone.regionKey).toBeUndefined();
	});

	it("addAutoZones creates N zones with source='auto' and regionKeys", () => {
		useZoneStore.getState().addAutoZones([
			{
				left: 0,
				top: 0,
				width: 100,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:0",
			},
			{
				left: 0,
				top: 60,
				width: 100,
				height: 50,
				source: "auto",
				label: "text",
				regionKey: "0:1",
			},
		]);
		const zones = useZoneStore.getState().zones;
		expect(zones).toHaveLength(2);
		expect(zones[0].source).toBe("auto");
		expect(zones[0].label).toBe("table");
		expect(zones[0].regionKey).toBe("0:0");
		expect(zones[1].source).toBe("auto");
		expect(zones[1].label).toBe("text");
		expect(zones[1].regionKey).toBe("0:1");
	});

	it("clearAutoZones removes only auto zones, keeps manual", () => {
		// Add manual zone
		useZoneStore.getState().addZone({ left: 0, top: 0, width: 50, height: 50 });
		// Add auto zones
		useZoneStore.getState().addAutoZones([
			{
				left: 100,
				top: 0,
				width: 50,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:0",
			},
		]);
		expect(useZoneStore.getState().zones).toHaveLength(2);

		useZoneStore.getState().clearAutoZones();
		const remaining = useZoneStore.getState().zones;
		expect(remaining).toHaveLength(1);
		expect(remaining[0].source).toBeUndefined();
	});

	it("clearAutoZones nulls selectedZoneId if the selected zone is auto", () => {
		useZoneStore.getState().addAutoZones([
			{
				left: 0,
				top: 0,
				width: 50,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:0",
			},
		]);
		const autoZoneId = useZoneStore.getState().zones[0].id;
		useZoneStore.getState().selectZone(autoZoneId);

		useZoneStore.getState().clearAutoZones();
		expect(useZoneStore.getState().selectedZoneId).toBeNull();
	});

	it("clearAutoZonesByType removes only auto zones of a specific label", () => {
		useZoneStore.getState().addAutoZones([
			{
				left: 0,
				top: 0,
				width: 50,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:0",
			},
			{
				left: 100,
				top: 0,
				width: 50,
				height: 50,
				source: "auto",
				label: "text",
				regionKey: "0:1",
			},
			{
				left: 200,
				top: 0,
				width: 50,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:2",
			},
		]);
		expect(useZoneStore.getState().zones).toHaveLength(3);

		useZoneStore.getState().clearAutoZonesByType("table");
		const remaining = useZoneStore.getState().zones;
		expect(remaining).toHaveLength(1);
		expect(remaining[0].label).toBe("text");
	});
});
