import { useFabricCanvas } from "@/hooks/useFabricCanvas.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { useEffect, useRef } from "react";

interface FabricOverlayProps {
	width: number;
	height: number;
}

export function FabricOverlay({ width, height }: FabricOverlayProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { resize } = useFabricCanvas(canvasRef);
	const mode = useZoneStore((s) => s.mode);

	// Resize canvas to match document container
	useEffect(() => {
		resize(width, height);
	}, [width, height, resize]);

	// role="application" is the WAI-ARIA pattern for interactive canvases (spec 06)
	return (
		// biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: WAI-ARIA pattern for interactive canvas
		<canvas
			ref={canvasRef}
			id="fabric-overlay"
			role="application"
			aria-label="Zone de sélection OCR"
			className={`absolute left-0 top-0 ${mode === "draw" ? "ring-2 ring-blue-400" : ""}`}
		/>
	);
}
