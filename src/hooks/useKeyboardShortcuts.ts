import { useLayoutStore } from "@/store/layout-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { useCallback, useEffect } from "react";

/**
 * Global keyboard shortcuts for the application.
 * D -> draw mode, V -> pan mode, Delete -> remove selected zone, Escape -> deselect.
 * All shortcuts are disabled when an input, select, or textarea has focus.
 * When deleting an auto zone with a regionKey, the key is tracked in layoutStore
 * so layout detection can skip it on re-run.
 */
export function useKeyboardShortcuts(): void {
	const setMode = useZoneStore((s) => s.setMode);
	const removeZone = useZoneStore((s) => s.removeZone);
	const selectZone = useZoneStore((s) => s.selectZone);
	const addDeletedRegionKey = useLayoutStore((s) => s.addDeletedRegionKey);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "SELECT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			switch (e.key) {
				case "d":
				case "D":
					setMode("draw");
					break;
				case "v":
				case "V":
					setMode("pan");
					break;
				case "Delete":
				case "Backspace": {
					e.preventDefault();
					const { selectedZoneId, zones } = useZoneStore.getState();
					if (selectedZoneId !== null) {
						const zone = zones.find((z) => z.id === selectedZoneId);
						if (zone?.source === "auto" && zone.regionKey) {
							addDeletedRegionKey(zone.regionKey);
						}
						removeZone(selectedZoneId);
					}
					break;
				}
				case "Escape":
					selectZone(null);
					break;
			}
		},
		[setMode, removeZone, selectZone, addDeletedRegionKey],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);
}
