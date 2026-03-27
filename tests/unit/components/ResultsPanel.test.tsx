import { ResultsPanel } from "@/components/ResultsPanel.tsx";
import type { OcrZoneResult } from "@/types/ocr.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCopy = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/hooks/useClipboard.ts", () => ({
	useClipboard: () => ({ copy: mockCopy }),
}));

describe("ResultsPanel", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	const defaultProps = {
		results: [] as OcrZoneResult[],
		isGlobalOcr: false,
	};

	it("is hidden when there are no results", () => {
		const { container } = render(<ResultsPanel {...defaultProps} />);
		expect(container.querySelector('[data-testid="results-panel"]')).toBeNull();
	});

	it("shows all zone texts combined in a single view", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Texte zone 1", confidence: 85 },
			{ zoneId: 3, text: "Texte zone 3", confidence: 92 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		// Both texts visible at once, no tabs
		expect(screen.getByText(/Texte zone 1/)).toBeInTheDocument();
		expect(screen.getByText(/Texte zone 3/)).toBeInTheDocument();
		expect(screen.queryByRole("tab")).not.toBeInTheDocument();
	});

	it("displays OCR text in a selectable <pre> with monospace font", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Résultat OCR", confidence: 85 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const pre = screen.getByText("Résultat OCR");
		expect(pre.tagName).toBe("PRE");
		expect(pre.className).toContain("font-mono");
	});

	it("shows confidence badge when any zone has confidence < 40%", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Low confidence", confidence: 30 },
			{ zoneId: 2, text: "High confidence", confidence: 90 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		expect(screen.getByText(/Fiabilité faible/)).toBeInTheDocument();
	});

	it("does not show confidence badge when all zones have confidence >= 40%", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Good confidence", confidence: 75 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		expect(screen.queryByText(/Fiabilité faible/)).not.toBeInTheDocument();
	});

	it('"Copier" button copies all combined text', async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 3, text: "Texte 3", confidence: 80 },
			{ zoneId: 1, text: "Texte 1", confidence: 80 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const copyButton = screen.getByRole("button", { name: "Copier" });
		await act(async () => {
			fireEvent.click(copyButton);
		});

		// Sorted by zoneId, joined with blank line
		expect(mockCopy).toHaveBeenCalledWith("Texte 1\n\nTexte 3");
	});

	it('"Copier" button shows "Copié !" for 2 seconds then reverts', async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Copy me", confidence: 85 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const copyButton = screen.getByRole("button", { name: "Copier" });
		await act(async () => {
			fireEvent.click(copyButton);
		});

		expect(screen.getByText("Copié !")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(2000);
		});

		expect(screen.queryByText("Copié !")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Copier" })).toBeInTheDocument();
	});

	it("copies single result without extra blank lines", async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 5, text: "Seule zone", confidence: 85 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const copyButton = screen.getByRole("button", { name: "Copier" });
		await act(async () => {
			fireEvent.click(copyButton);
		});

		expect(mockCopy).toHaveBeenCalledWith("Seule zone");
	});

	it("shows help message when result text is empty", () => {
		const results: OcrZoneResult[] = [{ zoneId: 1, text: "", confidence: 0 }];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		expect(screen.getByText(/Aucun texte détecté/)).toBeInTheDocument();
	});

	it('"Copié !" feedback is in an aria-live="polite" container', async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Copy me", confidence: 85 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const copyButton = screen.getByRole("button", { name: "Copier" });
		await act(async () => {
			fireEvent.click(copyButton);
		});

		const liveRegion = screen.getByText("Copié !");
		const ariaContainer = liveRegion.closest('[aria-live="polite"]');
		expect(ariaContainer).not.toBeNull();
	});

	it("panel has data-testid and correct default width style", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "test", confidence: 80 },
		];
		const { container } = render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const panel = container.querySelector('[data-testid="results-panel"]');
		expect(panel).not.toBeNull();
	});

	it("works the same way for global OCR results", async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 0, text: "Full document text", confidence: 90 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={true} />,
		);

		expect(screen.getByText("Full document text")).toBeInTheDocument();

		const copyButton = screen.getByRole("button", { name: "Copier" });
		await act(async () => {
			fireEvent.click(copyButton);
		});

		expect(mockCopy).toHaveBeenCalledWith("Full document text");
	});
});
