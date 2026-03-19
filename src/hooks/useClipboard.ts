import { useCallback } from "react";

type CopyResult = {
	success: boolean;
	fallbackToManualCopy?: boolean;
};

/**
 * Hook providing clipboard copy with automatic fallback chain:
 * 1. navigator.clipboard.writeText (modern API)
 * 2. document.execCommand('copy') (legacy fallback)
 * 3. Returns fallbackToManualCopy flag if both fail
 */
export function useClipboard() {
	const copy = useCallback(async (text: string): Promise<CopyResult> => {
		// Try modern clipboard API first
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return { success: true };
			} catch {
				// Fall through to legacy approach
			}
		}

		// Try legacy execCommand approach
		try {
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			const result = document.execCommand("copy");
			document.body.removeChild(textarea);
			if (result) {
				return { success: true };
			}
		} catch {
			// Both methods failed
		}

		return { success: false, fallbackToManualCopy: true };
	}, []);

	return { copy };
}
