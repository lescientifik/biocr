import { lookupExact } from "@/lib/bio/lookup";
import { isValueFlagged } from "@/lib/bio/validator";
import { describe, expect, it } from "vitest";

function getParam(name: string) {
	const param = lookupExact(name);
	expect(param).not.toBeNull();
	// biome-safe: checked above
	return param as NonNullable<typeof param>;
}

describe("Value plausibility validator", () => {
	it("does not flag value within plausible range", () => {
		const param = getParam("Glycémie");
		expect(isValueFlagged(param, 0.95, "g/L")).toBe(false);
	});

	it("flags value outside plausible range", () => {
		const param = getParam("Glycémie");
		expect(isValueFlagged(param, 150, "g/L")).toBe(true);
	});

	it("does not flag value at boundary of plausible range", () => {
		const param = getParam("Glycémie");
		// max for g/L is 8, so 5.0 is within range
		expect(isValueFlagged(param, 5.0, "g/L")).toBe(false);
	});

	it("flags negative values", () => {
		const param = getParam("Créatinine");
		expect(isValueFlagged(param, -78, "µmol/L")).toBe(true);
	});

	it("does not flag when unit is unknown (benefit of the doubt)", () => {
		const param = getParam("Glycémie");
		expect(isValueFlagged(param, 5.2, "unknown_unit")).toBe(false);
	});

	it("flags extremely low values", () => {
		const param = getParam("Glycémie");
		// min for g/L is 0.1
		expect(isValueFlagged(param, 0.01, "g/L")).toBe(true);
	});
});
