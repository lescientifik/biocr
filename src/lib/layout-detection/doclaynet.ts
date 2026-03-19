import type { LayoutRegionType } from "@/types/layout.ts";

/**
 * Maps DocLayNet class indices to LayoutRegionType.
 *
 *  0: Caption       → "text"
 *  1: Footnote      → "footer"
 *  2: Formula       → "text"
 *  3: List-item     → "text"
 *  4: Page-footer   → "footer"
 *  5: Page-header   → "header"
 *  6: Picture       → "figure"
 *  7: Section-header→ "title"
 *  8: Table         → "table"
 *  9: Text          → "text"
 * 10: Title         → "title"
 */
export const DOCLAYNET_CLASS_MAP: LayoutRegionType[] = [
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
