import { useClipboard } from "@/hooks/useClipboard.ts";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("useClipboard", () => {
	let originalClipboard: Clipboard;
	let originalExecCommand: typeof document.execCommand;

	beforeEach(() => {
		originalClipboard = navigator.clipboard;
		originalExecCommand = document.execCommand;
	});

	afterEach(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: originalClipboard,
			writable: true,
			configurable: true,
		});
		document.execCommand = originalExecCommand;
		vi.restoreAllMocks();
	});

	it("uses navigator.clipboard.writeText when available", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			writable: true,
			configurable: true,
		});

		const { result } = renderHook(() => useClipboard());

		const copyResult = await act(async () => {
			return result.current.copy("hello");
		});

		expect(writeText).toHaveBeenCalledWith("hello");
		expect(copyResult.success).toBe(true);
	});

	it("falls back to document.execCommand when navigator.clipboard is unavailable", async () => {
		Object.defineProperty(navigator, "clipboard", {
			value: undefined,
			writable: true,
			configurable: true,
		});
		document.execCommand = vi.fn().mockReturnValue(true);

		const { result } = renderHook(() => useClipboard());

		const copyResult = await act(async () => {
			return result.current.copy("hello");
		});

		expect(document.execCommand).toHaveBeenCalledWith("copy");
		expect(copyResult.success).toBe(true);
	});

	it("returns fallbackToManualCopy: true when both methods are unavailable", async () => {
		Object.defineProperty(navigator, "clipboard", {
			value: undefined,
			writable: true,
			configurable: true,
		});
		document.execCommand = vi.fn().mockImplementation(() => {
			throw new Error("not supported");
		});

		const { result } = renderHook(() => useClipboard());

		const copyResult = await act(async () => {
			return result.current.copy("hello");
		});

		expect(copyResult.success).toBe(false);
		expect(copyResult.fallbackToManualCopy).toBe(true);
	});
});
