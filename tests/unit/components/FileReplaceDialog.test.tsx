import { FileReplaceDialog } from "@/components/FileReplaceDialog.tsx";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("FileReplaceDialog", () => {
	afterEach(cleanup);

	const defaultProps = {
		open: true,
		hasZonesOrResults: true,
		onConfirm: vi.fn(),
		onCancel: vi.fn(),
	};

	it("is shown when open and hasZonesOrResults is true", () => {
		render(<FileReplaceDialog {...defaultProps} />);
		expect(
			screen.getByText(/zones ou résultats existants/),
		).toBeInTheDocument();
	});

	it('"Continuer" calls onConfirm', () => {
		const onConfirm = vi.fn();
		render(<FileReplaceDialog {...defaultProps} onConfirm={onConfirm} />);

		fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it('"Annuler" calls onCancel', () => {
		const onCancel = vi.fn();
		render(<FileReplaceDialog {...defaultProps} onCancel={onCancel} />);

		fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
		expect(onCancel).toHaveBeenCalledOnce();
	});

	it("is not shown when hasZonesOrResults is false", () => {
		render(<FileReplaceDialog {...defaultProps} hasZonesOrResults={false} />);
		expect(
			screen.queryByText(/zones ou résultats existants/),
		).not.toBeInTheDocument();
	});

	it("is not shown when open is false", () => {
		render(<FileReplaceDialog {...defaultProps} open={false} />);
		expect(
			screen.queryByText(/zones ou résultats existants/),
		).not.toBeInTheDocument();
	});
});
