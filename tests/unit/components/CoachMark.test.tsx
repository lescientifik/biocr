import { CoachMark, _resetCoachMark } from "@/components/CoachMark.tsx";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
	toast: {
		info: vi.fn(),
	},
}));

import { toast } from "sonner";

describe("CoachMark", () => {
	beforeEach(() => {
		_resetCoachMark();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows info toast on first render", () => {
		render(<CoachMark />);

		expect(toast.info).toHaveBeenCalledOnce();
		expect(toast.info).toHaveBeenCalledWith(
			expect.stringContaining("Draw"),
			expect.any(Object),
		);
	});

	it("toast message mentions OCR button", () => {
		render(<CoachMark />);

		const message = vi.mocked(toast.info).mock.calls[0][0] as string;
		expect(message).toContain("OCR");
	});

	it("does NOT show toast on second render (per-session flag)", () => {
		const { unmount } = render(<CoachMark />);
		expect(toast.info).toHaveBeenCalledOnce();

		unmount();
		vi.clearAllMocks();

		render(<CoachMark />);
		expect(toast.info).not.toHaveBeenCalled();
	});
});
