import { useEffect, useRef } from "react";
import { toast } from "sonner";

const COACH_MARK_MESSAGE =
	"Passez en mode Draw (D) pour sélectionner des zones, ou cliquez 'Lancer l'OCR' pour traiter tout le document.";

/** Module-level flag to track whether the coach mark has been shown this session. */
let hasShown = false;

/**
 * Displays a one-time informational toast on first file load.
 *
 * Uses a module-level flag so the toast appears only once per session,
 * even across component remounts.
 */
export function CoachMark(): null {
	const initialized = useRef(false);

	useEffect(() => {
		if (!hasShown && !initialized.current) {
			initialized.current = true;
			hasShown = true;
			toast.info(COACH_MARK_MESSAGE, { duration: 5000 });
		}
	}, []);

	return null;
}

/** Reset the coach mark flag (for testing purposes only). */
export function _resetCoachMark(): void {
	hasShown = false;
}
