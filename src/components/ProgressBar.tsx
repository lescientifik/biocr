import { Button } from "@/components/ui/button.tsx";

interface ProgressBarProps {
	/** Whether the progress bar is visible. */
	visible: boolean;
	/** Current progress percentage (0-100). */
	percentage: number;
	/** Current processing step. */
	step: "preprocessing" | "detecting" | "recognizing";
	/** Label for the item being processed. */
	itemLabel: "Zone" | "Page";
	/** Current item index (1-based) for multi-item progress. */
	currentItem?: number;
	/** Total number of items for multi-item progress. */
	totalItems?: number;
	/** Called when the user clicks Cancel. */
	onCancel: () => void;
}

/** Thin progress bar shown during OCR processing. */
export function ProgressBar({
	visible,
	percentage,
	step,
	itemLabel,
	currentItem,
	totalItems,
	onCancel,
}: ProgressBarProps) {
	if (!visible) {
		return null;
	}

	const stepLabel =
		step === "preprocessing"
			? "Prétraitement…"
			: step === "detecting"
				? "Détection…"
				: "Reconnaissance…";
	const isMulti =
		currentItem !== undefined && totalItems !== undefined && totalItems > 1;
	const label = isMulti
		? `${itemLabel} ${currentItem}/${totalItems} — ${stepLabel}`
		: stepLabel;

	return (
		<div className="flex items-center gap-3 border-b bg-white px-4 py-2">
			<div className="flex-1">
				<div className="flex items-center justify-between text-xs">
					<span>{label}</span>
				</div>
				<div
					role="progressbar"
					aria-valuenow={percentage}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Progression OCR"
					tabIndex={0}
					className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
				>
					<div
						className="h-full rounded-full bg-primary transition-all"
						style={{ width: `${percentage}%` }}
					/>
				</div>
			</div>
			<Button variant="ghost" size="xs" onClick={onCancel} aria-label="Annuler">
				Annuler
			</Button>
		</div>
	);
}
