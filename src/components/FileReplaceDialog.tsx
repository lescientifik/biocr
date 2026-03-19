import { Button } from "@/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog.tsx";

interface FileReplaceDialogProps {
	open: boolean;
	hasZonesOrResults: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Confirmation dialog shown when the user replaces a file or closes
 * while zones or results exist. Skipped when hasZonesOrResults is false.
 */
export function FileReplaceDialog({
	open,
	hasZonesOrResults,
	onConfirm,
	onCancel,
}: FileReplaceDialogProps) {
	if (!hasZonesOrResults || !open) {
		return null;
	}

	return (
		<Dialog open={true}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Remplacer le fichier ?</DialogTitle>
					<DialogDescription>
						Les zones ou résultats existants seront perdus.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						Annuler
					</Button>
					<Button onClick={onConfirm}>Continuer</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
