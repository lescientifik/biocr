/** Fraction of page height considered the header zone (top 15%). */
export const HEADER_ZONE_RATIO = 0.15;

/** Fraction of page height considered the footer zone (bottom 8%). */
export const FOOTER_ZONE_RATIO = 0.08;

/** Minimum region area as a fraction of total page area (0.5%). */
export const MIN_REGION_AREA_RATIO = 0.005;

/** Pixel density below which a region is classified as "figure" (5%). */
export const FIGURE_DENSITY_THRESHOLD = 0.05;

/** Kernel width for horizontal line detection (morphological opening). */
export const H_LINE_KERNEL_WIDTH = 40;

/** Kernel height for vertical line detection (morphological opening). */
export const V_LINE_KERNEL_HEIGHT = 40;

/**
 * Dilation kernel width for text grouping.
 * Merges characters on the same line into a single blob.
 * At 150 DPI, normal text inter-character gaps are ~8-12px;
 * 30px bridges these gaps and merges words on the same line.
 */
export const TEXT_DILATE_KERNEL_WIDTH = 30;

/**
 * Dilation kernel height for text grouping.
 * Merges adjacent text lines that are close together.
 * At 150 DPI, line spacing is ~18-25px; 10px bridges
 * tightly-spaced lines (e.g. table rows) into blocks.
 */
export const TEXT_DILATE_KERNEL_HEIGHT = 10;
