import { DropZone } from "@/components/DropZone.tsx";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function fakeFile(name: string, size = 1024): File {
	return new File([new Uint8Array(size)], name, {
		type: "application/octet-stream",
	});
}

function createDropEvent(files: File[]): Partial<React.DragEvent> {
	return {
		preventDefault: vi.fn(),
		dataTransfer: { files: files as unknown as FileList } as DataTransfer,
	};
}

describe("DropZone", () => {
	afterEach(cleanup);

	const defaultProps = {
		onFileAccepted: vi.fn(),
		onFileRejected: vi.fn(),
		onMultipleFilesWarning: vi.fn(),
	};

	it("renders the drop text", () => {
		render(<DropZone {...defaultProps} />);
		expect(
			screen.getByText("Déposez un PDF ou une image ici"),
		).toBeInTheDocument();
	});

	it("renders the browse link", () => {
		render(<DropZone {...defaultProps} />);
		expect(screen.getByText("ou cliquez pour parcourir")).toBeInTheDocument();
	});

	it("applies drag-over style on dragOver", () => {
		render(<DropZone {...defaultProps} />);
		const zone = screen.getByTestId("dropzone");

		fireEvent.dragOver(zone);
		expect(zone.className).toContain("border-blue-500");
	});

	it("removes drag-over style on dragLeave", () => {
		render(<DropZone {...defaultProps} />);
		const zone = screen.getByTestId("dropzone");

		fireEvent.dragOver(zone);
		fireEvent.dragLeave(zone);
		expect(zone.className).not.toContain("border-blue-500");
	});

	it("calls onFileAccepted when a valid file is dropped", () => {
		const onFileAccepted = vi.fn();
		render(<DropZone {...defaultProps} onFileAccepted={onFileAccepted} />);
		const zone = screen.getByTestId("dropzone");

		const file = fakeFile("scan.png");
		fireEvent.drop(zone, createDropEvent([file]));

		expect(onFileAccepted).toHaveBeenCalledWith(file, "image");
	});

	it("calls onFileRejected when an invalid file is dropped", () => {
		const onFileRejected = vi.fn();
		render(<DropZone {...defaultProps} onFileRejected={onFileRejected} />);
		const zone = screen.getByTestId("dropzone");

		fireEvent.drop(zone, createDropEvent([fakeFile("doc.docx")]));

		expect(onFileRejected).toHaveBeenCalledWith(
			expect.stringContaining("Format non supporté"),
		);
	});

	it("takes only the first file and warns on multiple files", () => {
		const onFileAccepted = vi.fn();
		const onMultipleFilesWarning = vi.fn();
		render(
			<DropZone
				{...defaultProps}
				onFileAccepted={onFileAccepted}
				onMultipleFilesWarning={onMultipleFilesWarning}
			/>,
		);
		const zone = screen.getByTestId("dropzone");

		fireEvent.drop(
			zone,
			createDropEvent([fakeFile("a.png"), fakeFile("b.jpg")]),
		);

		expect(onMultipleFilesWarning).toHaveBeenCalled();
		expect(onFileAccepted).toHaveBeenCalledTimes(1);
	});

	it("opens the file picker on click via hidden input", () => {
		render(<DropZone {...defaultProps} />);
		const input = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		expect(input).toBeTruthy();
		expect(input.accept).toBe(".png,.jpg,.jpeg,.webp,.bmp,.pdf");
	});
});
