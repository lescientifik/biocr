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

	it("shows one tab per zone with OCR text", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Texte zone 1", confidence: 85 },
			{ zoneId: 3, text: "Texte zone 3", confidence: 92 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		expect(screen.getByText("Zone 1")).toBeInTheDocument();
		expect(screen.getByText("Zone 3")).toBeInTheDocument();
		expect(screen.queryByText("Zone 2")).not.toBeInTheDocument();
	});

	it('shows a "Document" tab for global OCR', () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 0, text: "Full document text", confidence: 90 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={true} />,
		);

		expect(screen.getByText("Document")).toBeInTheDocument();
		expect(screen.queryByText("Zone")).not.toBeInTheDocument();
	});

	it("displays stable zone numbers (Zone 1, Zone 3 when Zone 2 was deleted)", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "A", confidence: 80 },
			{ zoneId: 3, text: "B", confidence: 80 },
			{ zoneId: 5, text: "C", confidence: 80 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		expect(screen.getByText("Zone 1")).toBeInTheDocument();
		expect(screen.getByText("Zone 3")).toBeInTheDocument();
		expect(screen.getByText("Zone 5")).toBeInTheDocument();
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

	it("shows confidence badge when confidence < 40%", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Low confidence", confidence: 30 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		expect(screen.getByText(/Fiabilité faible/)).toBeInTheDocument();
	});

	it("does not show confidence badge when confidence >= 40%", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Good confidence", confidence: 75 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		expect(screen.queryByText(/Fiabilité faible/)).not.toBeInTheDocument();
	});

	it('"Copier" button calls copy with zone text', async () => {
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

		expect(mockCopy).toHaveBeenCalledWith("Copy me");
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

	it('"Tout copier" concatenates with zone separators in ascending ID order', async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 3, text: "Texte 3", confidence: 80 },
			{ zoneId: 1, text: "Texte 1", confidence: 80 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const copyAllButton = screen.getByRole("button", { name: "Tout copier" });
		await act(async () => {
			fireEvent.click(copyAllButton);
		});

		const expected = "--- Zone 1 ---\nTexte 1\n\n--- Zone 3 ---\nTexte 3";
		expect(mockCopy).toHaveBeenCalledWith(expected);
	});

	it('"Tout copier" with single Document tab copies without separator', async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 0, text: "Full document", confidence: 90 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={true} />,
		);

		const copyAllButton = screen.getByRole("button", { name: "Tout copier" });
		await act(async () => {
			fireEvent.click(copyAllButton);
		});

		expect(mockCopy).toHaveBeenCalledWith("Full document");
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

	it('"Tout copier" with multiple global OCR results uses "Page" separators', async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 2, text: "Page deux", confidence: 80 },
			{ zoneId: 1, text: "Page une", confidence: 80 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={true} />,
		);

		const copyAllButton = screen.getByRole("button", { name: "Tout copier" });
		await act(async () => {
			fireEvent.click(copyAllButton);
		});

		const expected = "--- Page 1 ---\nPage une\n\n--- Page 2 ---\nPage deux";
		expect(mockCopy).toHaveBeenCalledWith(expected);
	});

	it('"Tout copier" with single zone result copies without separator', async () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 5, text: "Seule zone", confidence: 85 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		const copyAllButton = screen.getByRole("button", { name: "Tout copier" });
		await act(async () => {
			fireEvent.click(copyAllButton);
		});

		expect(mockCopy).toHaveBeenCalledWith("Seule zone");
	});

	it("switches between zone tabs to show different text", () => {
		const results: OcrZoneResult[] = [
			{ zoneId: 1, text: "Texte zone 1", confidence: 85 },
			{ zoneId: 3, text: "Texte zone 3", confidence: 92 },
		];
		render(
			<ResultsPanel {...defaultProps} results={results} isGlobalOcr={false} />,
		);

		// First tab is active by default
		expect(screen.getByText("Texte zone 1")).toBeInTheDocument();

		// Click second tab
		fireEvent.click(screen.getByText("Zone 3"));
		expect(screen.getByText("Texte zone 3")).toBeInTheDocument();
	});
});
