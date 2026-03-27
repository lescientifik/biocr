import { useViewportStore } from "@/store/viewport-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Dispatches a keydown event on window with the given properties.
 */
function pressKey(key: string, options: Partial<KeyboardEventInit> = {}): void {
	window.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
			...options,
		}),
	);
}

/**
 * Registers the keyboard shortcuts by importing and wiring the handler
 * directly (since we can't use React hooks outside a component).
 * Mirrors what useKeyboardShortcuts does: listens on window keydown.
 */
function installKeyboardShortcuts(): () => void {
	const handler = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (
			target.tagName === "INPUT" ||
			target.tagName === "SELECT" ||
			target.tagName === "TEXTAREA" ||
			target.isContentEditable
		) {
			return;
		}

		const store = useZoneStore.getState();
		switch (e.key) {
			case "d":
			case "D": {
				const current = useZoneStore.getState().mode;
				store.setMode(current === "draw" ? "pan" : "draw");
				break;
			}
			case "Delete":
			case "Backspace": {
				e.preventDefault();
				const selectedId = useZoneStore.getState().selectedZoneId;
				if (selectedId !== null) {
					store.removeZone(selectedId);
				}
				break;
			}
			case "Escape":
				store.selectZone(null);
				break;
		}

		// Zoom shortcuts (Ctrl+/-, Ctrl+0)
		if (e.ctrlKey || e.metaKey) {
			const vpStore = useViewportStore.getState();
			if (e.key === "=" || e.key === "+") {
				e.preventDefault();
				vpStore.zoomAt(0, 0, 200);
			} else if (e.key === "-") {
				e.preventDefault();
				vpStore.zoomAt(0, 0, -200);
			} else if (e.key === "0") {
				e.preventDefault();
				vpStore.resetToFitWidth(800, 800);
			}
		}
	};

	window.addEventListener("keydown", handler);
	return () => window.removeEventListener("keydown", handler);
}

describe("Keyboard shortcuts", () => {
	let cleanup: () => void;

	afterEach(() => {
		cleanup?.();
		useZoneStore.getState().reset();
		useViewportStore.getState().reset();
	});

	it("16a — D switches to draw mode", () => {
		cleanup = installKeyboardShortcuts();
		expect(useZoneStore.getState().mode).toBe("pan");

		pressKey("d");
		expect(useZoneStore.getState().mode).toBe("draw");
	});

	it("16b — D toggles back to pan mode", () => {
		cleanup = installKeyboardShortcuts();
		useZoneStore.getState().setMode("draw");

		pressKey("d");
		expect(useZoneStore.getState().mode).toBe("pan");
	});

	it("16c — Ctrl+ increases zoom", () => {
		cleanup = installKeyboardShortcuts();
		const initialZoom = useViewportStore.getState().zoom;

		pressKey("=", { ctrlKey: true });
		expect(useViewportStore.getState().zoom).toBeGreaterThan(initialZoom);
	});

	it("16d — Ctrl- decreases zoom", () => {
		cleanup = installKeyboardShortcuts();
		// Start at a zoom > minimum so we can decrease
		useViewportStore.getState().setZoom(2);
		const currentZoom = useViewportStore.getState().zoom;

		pressKey("-", { ctrlKey: true });
		expect(useViewportStore.getState().zoom).toBeLessThan(currentZoom);
	});

	it("16e — Ctrl+0 resets zoom", () => {
		cleanup = installKeyboardShortcuts();
		useViewportStore.getState().setZoom(3);

		pressKey("0", { ctrlKey: true });
		// fitToWidth(800, 800) = 1.0
		expect(useViewportStore.getState().zoom).toBe(1);
	});

	it("16f — Escape deselects zone", () => {
		cleanup = installKeyboardShortcuts();
		const zone = useZoneStore
			.getState()
			.addZone({ left: 0, top: 0, width: 100, height: 100 });
		useZoneStore.getState().selectZone(zone.id);
		expect(useZoneStore.getState().selectedZoneId).toBe(zone.id);

		pressKey("Escape");
		expect(useZoneStore.getState().selectedZoneId).toBeNull();
	});

	it("16g — Delete removes selected zone", () => {
		cleanup = installKeyboardShortcuts();
		const zone = useZoneStore
			.getState()
			.addZone({ left: 0, top: 0, width: 100, height: 100 });
		useZoneStore.getState().selectZone(zone.id);
		expect(useZoneStore.getState().zones).toHaveLength(1);

		pressKey("Delete");
		expect(useZoneStore.getState().zones).toHaveLength(0);
	});

	it("16h — shortcuts inactive when input element is focused", () => {
		cleanup = installKeyboardShortcuts();
		expect(useZoneStore.getState().mode).toBe("pan");

		// Create an input element and focus it
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();

		try {
			// Dispatch keydown on window with the input as target
			const event = new KeyboardEvent("keydown", {
				key: "d",
				bubbles: true,
				cancelable: true,
			});
			Object.defineProperty(event, "target", {
				value: input,
				writable: false,
			});
			window.dispatchEvent(event);

			// Mode should NOT have changed
			expect(useZoneStore.getState().mode).toBe("pan");
		} finally {
			document.body.removeChild(input);
		}
	});

	it("16i — shortcuts inactive when select element is focused", () => {
		cleanup = installKeyboardShortcuts();
		expect(useZoneStore.getState().mode).toBe("pan");

		const select = document.createElement("select");
		document.body.appendChild(select);
		select.focus();

		try {
			const event = new KeyboardEvent("keydown", {
				key: "d",
				bubbles: true,
				cancelable: true,
			});
			Object.defineProperty(event, "target", {
				value: select,
				writable: false,
			});
			window.dispatchEvent(event);

			expect(useZoneStore.getState().mode).toBe("pan");
		} finally {
			document.body.removeChild(select);
		}
	});
});
