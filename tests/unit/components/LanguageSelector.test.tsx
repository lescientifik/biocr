import { LanguageSelector } from "@/components/LanguageSelector.tsx";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("LanguageSelector", () => {
	afterEach(cleanup);

	const defaultProps = {
		value: "fra" as const,
		isOnline: true,
		onLanguageChange: vi.fn(),
	};

	it("shows Français selected by default", () => {
		render(<LanguageSelector {...defaultProps} />);
		const select = screen.getByRole("combobox") as HTMLSelectElement;
		expect(select.value).toBe("fra");
		const selectedOption = select.options[select.selectedIndex];
		expect(selectedOption.textContent).toContain("Fran");
	});

	it("calls onLanguageChange when English is selected", () => {
		const onLanguageChange = vi.fn();
		render(
			<LanguageSelector
				{...defaultProps}
				onLanguageChange={onLanguageChange}
			/>,
		);
		const select = screen.getByRole("combobox");
		fireEvent.change(select, { target: { value: "eng" } });
		expect(onLanguageChange).toHaveBeenCalledWith("eng");
	});

	it("only Français and English in the selector", () => {
		render(<LanguageSelector {...defaultProps} />);
		const select = screen.getByRole("combobox") as HTMLSelectElement;
		const values = Array.from(select.options).map((o) => o.value);
		expect(values).toEqual(["fra", "eng"]);
		expect(values).toHaveLength(2);
	});

	it("deu/spa/ita options do not exist in the DOM", () => {
		render(<LanguageSelector {...defaultProps} />);
		const select = screen.getByRole("combobox") as HTMLSelectElement;
		const values = Array.from(select.options).map((o) => o.value);
		expect(values).not.toContain("deu");
		expect(values).not.toContain("spa");
		expect(values).not.toContain("ita");
	});

	it("both languages are always enabled (bundled)", () => {
		render(<LanguageSelector {...defaultProps} isOnline={false} />);
		const select = screen.getByRole("combobox") as HTMLSelectElement;
		for (const option of select.options) {
			expect(option.disabled).toBe(false);
		}
	});
});
