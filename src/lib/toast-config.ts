import { toast } from "sonner";

/** Configuration constants for the Sonner toast system. */
export const TOAST_CONFIG = {
	/** Maximum number of toasts visible simultaneously. */
	maxVisible: 3,
	/** Auto-dismiss duration for info/success/warning toasts (ms). */
	defaultDuration: 5000,
	/** Error toasts stay until manual close. */
	errorDuration: Number.POSITIVE_INFINITY,
	/** Toast stack position on screen. */
	position: "bottom-right" as const,
} as const;

/** Show an error toast that stays until manually dismissed. */
export function showError(message: string): void {
	toast.error(message, { duration: TOAST_CONFIG.errorDuration });
}

/** Show an info toast that auto-dismisses after 5 seconds. */
export function showInfo(message: string): void {
	toast.info(message, { duration: TOAST_CONFIG.defaultDuration });
}

/** Show a success toast that auto-dismisses after 5 seconds. */
export function showSuccess(message: string): void {
	toast.success(message, { duration: TOAST_CONFIG.defaultDuration });
}

/** Show a warning toast that auto-dismisses after 5 seconds. */
export function showWarning(message: string): void {
	toast.warning(message, { duration: TOAST_CONFIG.defaultDuration });
}
