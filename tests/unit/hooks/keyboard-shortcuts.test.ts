import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Dispatches a keydown event on window.
 */
function pressKey(key: string): void {
	window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("useKeyboardShortcuts", () => {
	afterEach(() => {
		useZoneStore.getState().reset();
	});

	it("D key switches to draw mode", () => {
		renderHook(() => useKeyboardShortcuts());
		expect(useZoneStore.getState().mode).toBe("pan");

		pressKey("d");
		expect(useZoneStore.getState().mode).toBe("draw");
	});

	it("V key switches to pan mode", () => {
		renderHook(() => useKeyboardShortcuts());

		// Start in draw mode
		useZoneStore.getState().setMode("draw");
		expect(useZoneStore.getState().mode).toBe("draw");

		pressKey("v");
		expect(useZoneStore.getState().mode).toBe("pan");
	});

	it("Delete key removes the selected zone", () => {
		renderHook(() => useKeyboardShortcuts());

		// Add a zone and select it
		const zone = useZoneStore.getState().addZone({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
		});
		useZoneStore.getState().selectZone(zone.id);
		expect(useZoneStore.getState().zones).toHaveLength(1);

		pressKey("Delete");
		expect(useZoneStore.getState().zones).toHaveLength(0);
		expect(useZoneStore.getState().selectedZoneId).toBeNull();
	});

	it("Escape key deselects the active zone", () => {
		renderHook(() => useKeyboardShortcuts());

		const zone = useZoneStore.getState().addZone({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
		});
		useZoneStore.getState().selectZone(zone.id);
		expect(useZoneStore.getState().selectedZoneId).toBe(zone.id);

		pressKey("Escape");
		expect(useZoneStore.getState().selectedZoneId).toBeNull();
	});

	it("Backspace key removes the selected zone", () => {
		renderHook(() => useKeyboardShortcuts());

		const zone = useZoneStore.getState().addZone({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
		});
		useZoneStore.getState().selectZone(zone.id);
		expect(useZoneStore.getState().zones).toHaveLength(1);

		pressKey("Backspace");
		expect(useZoneStore.getState().zones).toHaveLength(0);
		expect(useZoneStore.getState().selectedZoneId).toBeNull();
	});

	it("shortcuts are ignored when an input element is focused", () => {
		renderHook(() => useKeyboardShortcuts());

		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();

		// Dispatch from the input — should be ignored
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "d", bubbles: true }),
		);
		expect(useZoneStore.getState().mode).toBe("pan");

		document.body.removeChild(input);
	});
});
