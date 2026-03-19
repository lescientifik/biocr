import {
	TOAST_CONFIG,
	showError,
	showInfo,
	showSuccess,
	showWarning,
} from "@/lib/toast-config.ts";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));

import { toast } from "sonner";

describe("Toast system config", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("TOAST_CONFIG constants", () => {
		it("has max 3 visible toasts", () => {
			expect(TOAST_CONFIG.maxVisible).toBe(3);
		});

		it("has 5s auto-dismiss for non-error toasts", () => {
			expect(TOAST_CONFIG.defaultDuration).toBe(5000);
		});

		it("has Infinity duration for error toasts", () => {
			expect(TOAST_CONFIG.errorDuration).toBe(Number.POSITIVE_INFINITY);
		});
	});

	describe("showError", () => {
		it("calls toast.error with no auto-dismiss (stays until manual close)", () => {
			showError("Something broke");

			expect(toast.error).toHaveBeenCalledWith("Something broke", {
				duration: Number.POSITIVE_INFINITY,
			});
		});
	});

	describe("showInfo", () => {
		it("calls toast.info with 5s auto-dismiss", () => {
			showInfo("Info message");

			expect(toast.info).toHaveBeenCalledWith("Info message", {
				duration: 5000,
			});
		});
	});

	describe("showSuccess", () => {
		it("calls toast.success with 5s auto-dismiss", () => {
			showSuccess("Done");

			expect(toast.success).toHaveBeenCalledWith("Done", {
				duration: 5000,
			});
		});
	});

	describe("showWarning", () => {
		it("calls toast.warning with 5s auto-dismiss", () => {
			showWarning("Careful");

			expect(toast.warning).toHaveBeenCalledWith("Careful", {
				duration: 5000,
			});
		});
	});
});
