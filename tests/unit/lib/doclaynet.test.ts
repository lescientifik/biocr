import { DOCLAYNET_CLASS_MAP } from "@/lib/layout-detection/doclaynet.ts";
import { describe, expect, it } from "vitest";

describe("DOCLAYNET_CLASS_MAP", () => {
	it("has exactly 11 entries", () => {
		expect(DOCLAYNET_CLASS_MAP).toHaveLength(11);
	});

	it("maps all 11 DocLayNet classes to the correct LayoutRegionType", () => {
		const expected = [
			"text", // 0  Caption
			"footer", // 1  Footnote
			"text", // 2  Formula
			"text", // 3  List-item
			"footer", // 4  Page-footer
			"header", // 5  Page-header
			"figure", // 6  Picture
			"title", // 7  Section-header
			"table", // 8  Table
			"text", // 9  Text
			"title", // 10 Title
		];
		expect(DOCLAYNET_CLASS_MAP).toEqual(expected);
	});

	it("returns undefined for an out-of-range index", () => {
		expect(DOCLAYNET_CLASS_MAP[99]).toBeUndefined();
	});
});
