import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import type { RenderHookResult } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Dispatches a keydown event on window.
 */
function pressKey(key: string): void {
	window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("useKeyboardShortcuts", () => {
	let hook: RenderHookResult<void, unknown>;

	afterEach(() => {
		hook?.unmount();
		useZoneStore.getState().reset();
	});

	it("D key switches to draw mode", () => {
		hook = renderHook(() => useKeyboardShortcuts());
		expect(useZoneStore.getState().mode).toBe("pan");

		pressKey("d");
		expect(useZoneStore.getState().mode).toBe("draw");
	});

	it("D key toggles back to pan mode when already in draw mode", () => {
		hook = renderHook(() => useKeyboardShortcuts());

		// Start in draw mode
		useZoneStore.getState().setMode("draw");
		expect(useZoneStore.getState().mode).toBe("draw");

		pressKey("d");
		expect(useZoneStore.getState().mode).toBe("pan");
	});

	it("Delete key removes the selected zone", () => {
		hook = renderHook(() => useKeyboardShortcuts());

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
		hook = renderHook(() => useKeyboardShortcuts());

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
		hook = renderHook(() => useKeyboardShortcuts());

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
		hook = renderHook(() => useKeyboardShortcuts());

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
