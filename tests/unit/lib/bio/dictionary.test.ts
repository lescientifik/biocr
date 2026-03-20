import { getPlausibleRange, lookupExact, lookupFuzzy } from "@/lib/bio/lookup";
import { BIO_PARAMETERS } from "@/lib/bio/parameters";
import { describe, expect, it } from "vitest";

describe("Bio parameter dictionary coverage", () => {
	it("contains hematology parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of [
			"Leucocytes",
			"Hématies",
			"Hémoglobine",
			"Hématocrite",
			"VGM",
			"TCMH",
			"CCMH",
			"Plaquettes",
			"Réticulocytes",
		]) {
			expect(names).toContain(name);
		}
	});

	it("contains leukocyte formula parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of [
			"Polynucléaires neutrophiles",
			"Polynucléaires éosinophiles",
			"Polynucléaires basophiles",
			"Lymphocytes",
			"Monocytes",
		]) {
			expect(names).toContain(name);
		}
	});

	it("contains biochemistry parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of [
			"Glycémie",
			"Créatinine",
			"Urée",
			"Acide urique",
			"Sodium",
			"Potassium",
			"Chlore",
			"Calcium",
			"Phosphore",
			"Magnésium",
		]) {
			expect(names).toContain(name);
		}
	});

	it("contains hepatic panel parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of ["ASAT", "ALAT", "GGT", "PAL", "Bilirubine totale"]) {
			expect(names).toContain(name);
		}
	});

	it("contains lipid panel parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of [
			"Cholestérol total",
			"HDL-Cholestérol",
			"LDL-Cholestérol",
			"Triglycérides",
		]) {
			expect(names).toContain(name);
		}
	});

	it("contains hemostasis parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of ["TP", "TCA", "INR", "Fibrinogène", "D-dimères"]) {
			expect(names).toContain(name);
		}
	});

	it("contains tumor marker parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of [
			"PSA total",
			"CA 125",
			"CA 19-9",
			"CA 15-3",
			"ACE",
			"AFP",
		]) {
			expect(names).toContain(name);
		}
	});

	it("contains endocrinology and inflammation parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of [
			"TSH",
			"T3 libre",
			"T4 libre",
			"Cortisol",
			"CRP",
			"VS",
			"Procalcitonine",
		]) {
			expect(names).toContain(name);
		}
	});

	it("contains vitamin and iron parameters", () => {
		const names = BIO_PARAMETERS.map((p) => p.name);
		for (const name of [
			"Vitamine B9",
			"Vitamine B12",
			"Vitamine D",
			"Fer sérique",
			"Ferritine",
			"Transferrine",
			"CST",
		]) {
			expect(names).toContain(name);
		}
	});

	it("each parameter has required metadata", () => {
		for (const param of BIO_PARAMETERS) {
			expect(param.name).toBeTruthy();
			expect(Array.isArray(param.abbreviations)).toBe(true);
			expect(Array.isArray(param.aliases)).toBe(true);
			expect(param.units.length).toBeGreaterThan(0);
			for (const u of param.units) {
				expect(typeof u.min).toBe("number");
				expect(typeof u.max).toBe("number");
				expect(u.max).toBeGreaterThan(u.min);
			}
			expect(param.category).toBeTruthy();
		}
	});
});

describe("Exact lookup", () => {
	it("finds parameter by canonical name", () => {
		expect(lookupExact("Glycémie")?.name).toBe("Glycémie");
		expect(lookupExact("CRP")?.name).toBe("CRP");
	});

	it("is case-insensitive", () => {
		expect(lookupExact("glycémie")?.name).toBe("Glycémie");
		// "GLYCEMIE" matches alias "Glycemie" (case-insensitive)
		expect(lookupExact("GLYCEMIE")?.name).toBe("Glycémie");
		expect(lookupExact("crp")?.name).toBe("CRP");
	});

	it("finds parameter by abbreviation", () => {
		expect(lookupExact("Hb")?.name).toBe("Hémoglobine");
		expect(lookupExact("GR")?.name).toBe("Hématies");
		expect(lookupExact("GB")?.name).toBe("Leucocytes");
		expect(lookupExact("PNN")?.name).toBe("Polynucléaires neutrophiles");
	});

	it("finds parameter by alias", () => {
		expect(lookupExact("Globules rouges")?.name).toBe("Hématies");
		expect(lookupExact("Globules blancs")?.name).toBe("Leucocytes");
		expect(lookupExact("Glucose")?.name).toBe("Glycémie");
	});

	it("returns null for unknown term", () => {
		expect(lookupExact("UnknownParameter")).toBeNull();
	});
});

describe("Fuzzy lookup", () => {
	it("matches OCR errors on parameter names", () => {
		expect(lookupFuzzy("Glycérnie")?.name).toBe("Glycémie");
		expect(lookupFuzzy("Hérnatocrite")?.name).toBe("Hématocrite");
		expect(lookupFuzzy("Creatinine")?.name).toBe("Créatinine");
	});

	it("returns null for very short terms", () => {
		expect(lookupFuzzy("XY")).toBeNull();
	});

	it("returns null for terms too far from any parameter", () => {
		expect(lookupFuzzy("AbcdefghijklMnop")).toBeNull();
	});
});

describe("getPlausibleRange", () => {
	it("returns range for known parameter and unit", () => {
		const range = getPlausibleRange("Glycémie", "g/L");
		expect(range).not.toBeNull();
		expect(range?.min).toBeLessThan(1);
		expect(range?.max).toBeGreaterThan(1);
	});

	it("returns null for unknown unit", () => {
		expect(getPlausibleRange("Glycémie", "unknown_unit")).toBeNull();
	});

	it("returns null for unknown parameter", () => {
		expect(getPlausibleRange("UnknownParam", "g/L")).toBeNull();
	});
});
