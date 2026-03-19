import { useAppStore } from "@/store/app-store.ts";
import { afterEach, describe, expect, it } from "vitest";

describe("OcrState extended type via store", () => {
	afterEach(() => {
		useAppStore.getState().reset();
	});

	it("running variant contains step, itemLabel, partialResults, currentItem, totalItems", () => {
		useAppStore.getState().setOcrState({
			status: "running",
			currentItem: 1,
			totalItems: 5,
			progress: 0,
			step: "preprocessing",
			itemLabel: "Page",
			partialResults: [],
		});

		const ocr = useAppStore.getState().ocr;
		expect(ocr.status).toBe("running");
		if (ocr.status !== "running") throw new Error("unreachable");
		expect(ocr.currentItem).toBe(1);
		expect(ocr.totalItems).toBe(5);
		expect(ocr.step).toBe("preprocessing");
		expect(ocr.itemLabel).toBe("Page");
		expect(ocr.partialResults).toEqual([]);
	});

	it("idle variant is unchanged", () => {
		useAppStore.getState().setOcrState({ status: "idle" });
		const ocr = useAppStore.getState().ocr;
		expect(ocr.status).toBe("idle");
	});

	it("done variant contains results (unchanged)", () => {
		const results = [{ zoneId: 1, text: "hello", confidence: 90 }];
		useAppStore.getState().setOcrState({ status: "done", results });
		const ocr = useAppStore.getState().ocr;
		expect(ocr.status).toBe("done");
		if (ocr.status !== "done") throw new Error("unreachable");
		expect(ocr.results).toEqual(results);
	});

	it("setOcrState with running updates all new fields", () => {
		useAppStore.getState().setOcrState({
			status: "running",
			currentItem: 2,
			totalItems: 10,
			progress: 45,
			step: "recognizing",
			itemLabel: "Zone",
			partialResults: [{ zoneId: 1, text: "partial", confidence: 80 }],
		});

		const ocr = useAppStore.getState().ocr;
		if (ocr.status !== "running") throw new Error("unreachable");
		expect(ocr.currentItem).toBe(2);
		expect(ocr.totalItems).toBe(10);
		expect(ocr.progress).toBe(45);
		expect(ocr.step).toBe("recognizing");
		expect(ocr.itemLabel).toBe("Zone");
		expect(ocr.partialResults).toHaveLength(1);
	});

	it("partialResults accumulates via successive setOcrState calls", () => {
		useAppStore.getState().setOcrState({
			status: "running",
			currentItem: 1,
			totalItems: 3,
			progress: 33,
			step: "recognizing",
			itemLabel: "Page",
			partialResults: [{ zoneId: 1, text: "page 1", confidence: 90 }],
		});

		const current = useAppStore.getState().ocr;
		if (current.status !== "running") throw new Error("unreachable");

		useAppStore.getState().setOcrState({
			...current,
			currentItem: 2,
			progress: 66,
			partialResults: [
				...current.partialResults,
				{ zoneId: 2, text: "page 2", confidence: 85 },
			],
		});

		const updated = useAppStore.getState().ocr;
		if (updated.status !== "running") throw new Error("unreachable");
		expect(updated.partialResults).toHaveLength(2);
		expect(updated.partialResults[1].text).toBe("page 2");
	});
});
