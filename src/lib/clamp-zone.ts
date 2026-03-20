export function clampZoneToCanvas(
	rect: { left: number; top: number; width: number; height: number },
	canvasSize: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
	const width = Math.max(20, rect.width);
	const height = Math.max(20, rect.height);

	const left = Math.max(0, Math.min(rect.left, canvasSize.width - width));
	const top = Math.max(0, Math.min(rect.top, canvasSize.height - height));

	return { left, top, width, height };
}
