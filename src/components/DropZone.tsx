import { validateFile } from "@/lib/file-validation.ts";
import type { FileType } from "@/types/index.ts";
import { useCallback, useRef, useState } from "react";

interface DropZoneProps {
	onFileAccepted: (file: File, type: FileType) => void;
	onFileRejected: (message: string) => void;
	onMultipleFilesWarning?: () => void;
}

export function DropZone({
	onFileAccepted,
	onFileRejected,
	onMultipleFilesWarning,
}: DropZoneProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFile = useCallback(
		(file: File) => {
			const result = validateFile(file);
			if (result.ok) {
				onFileAccepted(file, result.type);
			} else {
				onFileRejected(result.error);
			}
		},
		[onFileAccepted, onFileRejected],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);

			const files = e.dataTransfer.files;
			if (files.length === 0) return;

			if (files.length > 1) {
				onMultipleFilesWarning?.();
			}

			handleFile(files[0]);
		},
		[handleFile, onMultipleFilesWarning],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
	}, []);

	const handleClick = useCallback(() => {
		inputRef.current?.click();
	}, []);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				handleFile(file);
			}
			// Reset input so the same file can be selected again
			e.target.value = "";
		},
		[handleFile],
	);

	return (
		<div
			data-testid="dropzone"
			className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 transition-colors ${
				isDragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
			}`}
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			<p className="text-lg text-gray-600">Déposez un PDF ou une image ici</p>
			<button
				type="button"
				className="text-blue-600 underline hover:text-blue-800"
				onClick={handleClick}
			>
				ou cliquez pour parcourir
			</button>
			<input
				ref={inputRef}
				type="file"
				className="hidden"
				accept=".png,.jpg,.jpeg,.webp,.bmp,.pdf"
				onChange={handleInputChange}
			/>
		</div>
	);
}
