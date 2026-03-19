import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProgressBar } from "@/components/ProgressBar.tsx";

type ProgressBarProps = Parameters<typeof ProgressBar>[0];

function createProps(
	overrides: Partial<ProgressBarProps> = {},
): ProgressBarProps {
	return {
		visible: true,
		percentage: 45,
		step: "recognizing",
		itemLabel: "Zone",
		currentItem: undefined,
		totalItems: undefined,
		onCancel: vi.fn(),
		...overrides,
	};
}

describe("ProgressBar", () => {
	afterEach(() => {
		cleanup();
	});

	it("is hidden when visible is false", () => {
		const { container } = render(
			<ProgressBar {...createProps({ visible: false })} />,
		);
		expect(container.innerHTML).toBe("");
	});

	it('affiche "Prétraitement…" quand step="preprocessing"', () => {
		render(<ProgressBar {...createProps({ step: "preprocessing" })} />);
		expect(screen.getByText("Prétraitement…")).toBeTruthy();
	});

	it('affiche "Détection…" quand step="detecting"', () => {
		render(<ProgressBar {...createProps({ step: "detecting" })} />);
		expect(screen.getByText("Détection…")).toBeTruthy();
	});

	it('affiche "Reconnaissance…" quand step="recognizing"', () => {
		render(<ProgressBar {...createProps({ step: "recognizing" })} />);
		expect(screen.getByText("Reconnaissance…")).toBeTruthy();
	});

	it('affiche "Page 3/10 — Prétraitement…" quand itemLabel="Page", totalItems > 1', () => {
		render(
			<ProgressBar
				{...createProps({
					step: "preprocessing",
					itemLabel: "Page",
					currentItem: 3,
					totalItems: 10,
				})}
			/>,
		);
		expect(screen.getByText("Page 3/10 — Prétraitement…")).toBeTruthy();
	});

	it('affiche "Zone 2/3 — Reconnaissance…" quand itemLabel="Zone", totalItems > 1', () => {
		render(
			<ProgressBar
				{...createProps({
					step: "recognizing",
					itemLabel: "Zone",
					currentItem: 2,
					totalItems: 3,
				})}
			/>,
		);
		expect(screen.getByText("Zone 2/3 — Reconnaissance…")).toBeTruthy();
	});

	it('affiche "Prétraitement…" sans compteur quand totalItems=1', () => {
		render(
			<ProgressBar
				{...createProps({
					step: "preprocessing",
					currentItem: 1,
					totalItems: 1,
				})}
			/>,
		);
		expect(screen.getByText("Prétraitement…")).toBeTruthy();
		expect(screen.queryByText(/1\/1/)).toBeNull();
	});

	it('affiche "Reconnaissance…" sans compteur quand totalItems=1', () => {
		render(
			<ProgressBar
				{...createProps({
					step: "recognizing",
					currentItem: 1,
					totalItems: 1,
				})}
			/>,
		);
		expect(screen.getByText("Reconnaissance…")).toBeTruthy();
		expect(screen.queryByText(/1\/1/)).toBeNull();
	});

	it("has a cancel button that calls the abort callback", async () => {
		const onCancel = vi.fn();
		render(<ProgressBar {...createProps({ onCancel })} />);
		await userEvent.click(screen.getByRole("button", { name: /annuler/i }));
		expect(onCancel).toHaveBeenCalledOnce();
	});

	it("le pourcentage est toujours visible dans l'aria-valuenow", () => {
		render(<ProgressBar {...createProps({ percentage: 72 })} />);
		const bar = screen.getByRole("progressbar");
		expect(bar).toHaveAttribute("aria-valuenow", "72");
	});

	it("has aria-valuemin and aria-valuemax", () => {
		render(<ProgressBar {...createProps({ percentage: 30 })} />);
		const bar = screen.getByRole("progressbar");
		expect(bar).toHaveAttribute("aria-valuemin", "0");
		expect(bar).toHaveAttribute("aria-valuemax", "100");
	});
});
