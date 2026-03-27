import { extractBioResults } from "@/lib/bio/pipeline";
import { describe, expect, it } from "vitest";

describe("Bio extraction pipeline", () => {
	it("extracts multiple parameters from multi-line OCR text", () => {
		const input = `Glycémie 0.95 g/L
Créatinine 78 µmol/L
Hémoglobine 13.5 g/dL`;

		const results = extractBioResults(input);
		expect(results).toHaveLength(3);
		for (const r of results) {
			expect(r).toHaveProperty("name");
			expect(r).toHaveProperty("value");
			expect(r).toHaveProperty("unit");
			expect(r).toHaveProperty("flagged");
		}
		expect(results.every((r) => r.flagged === false)).toBe(true);
	});

	it("skips non-result lines", () => {
		const input = `Laboratoire XYZ
Glycémie 0.95 g/L
Date: 15/03/2024
Créatinine 78 µmol/L`;

		const results = extractBioResults(input);
		expect(results).toHaveLength(2);
		expect(results[0].name).toBe("Glycémie");
		expect(results[1].name).toBe("Créatinine");
	});

	it("flags implausible values", () => {
		const input = `Glycémie 150 g/L
Créatinine 78 µmol/L`;

		const results = extractBioResults(input);
		expect(results).toHaveLength(2);
		expect(results[0].name).toBe("Glycémie");
		expect(results[0].flagged).toBe(true);
		expect(results[1].name).toBe("Créatinine");
		expect(results[1].flagged).toBe(false);
	});

	it("handles empty input", () => {
		expect(extractBioResults("")).toHaveLength(0);
		expect(extractBioResults("  \n  ")).toHaveLength(0);
	});

	it("handles OCR artifacts in input", () => {
		const input = `| Glycémie | 0.95 | g/L |
-----------
| Créatinine | 78 | µmol/L |`;

		const results = extractBioResults(input);
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	it("output matches BioResult interface", () => {
		const results = extractBioResults("Glycémie 0.95 g/L");
		expect(results).toHaveLength(1);
		const r = results[0];
		expect(typeof r.name).toBe("string");
		expect(typeof r.value).toBe("number");
		expect(typeof r.unit).toBe("string");
		expect(typeof r.flagged).toBe("boolean");
	});

	it("handles comma decimal separator", () => {
		const results = extractBioResults("Glycémie 0,95 g/L");
		expect(results).toHaveLength(1);
		expect(results[0].value).toBeCloseTo(0.95);
	});

	it("handles reference ranges in input", () => {
		const input = "Glycémie 0.95 g/L [0.70 - 1.10]";
		const results = extractBioResults(input);
		expect(results).toHaveLength(1);
		expect(results[0].value).toBeCloseTo(0.95);
		expect(results[0].unit).toBe("g/L");
	});

	it("deduplicates same parameter across lines, keeping preferred unit (G/L over %)", () => {
		const input = [
			"Polynucléaires neutrophiles 70.9 %",
			"Polynucléaires neutrophiles 4.05 G/L",
		].join("\n");
		const results = extractBioResults(input);
		const pnn = results.filter(
			(r) => r.name === "Polynucléaires neutrophiles",
		);
		expect(pnn).toHaveLength(1);
		expect(pnn[0].value).toBeCloseTo(4.05);
		expect(pnn[0].unit).toBe("G/L");
	});

	it("recovers G/L from OCR-mangled unit 'ggal' for PNB", () => {
		const results = extractBioResults(
			"Polynucléaires basophiles       08%       0.04 ggal       (0.00-0.11)",
		);
		const pnb = results.find(
			(r) => r.name === "Polynucléaires basophiles",
		);
		expect(pnb).toBeDefined();
		expect(pnb?.value).toBeCloseTo(0.04);
		expect(pnb?.unit).toBe("G/L");
	});

	it("handles asterisk flag on value and still extracts G/L for Lymphocytes", () => {
		const results = extractBioResults(
			"Lymphocytes              16.0 %      0.96* giga/L       (1.00-480)",
		);
		const lympho = results.find((r) => r.name === "Lymphocytes");
		expect(lympho).toBeDefined();
		expect(lympho?.value).toBeCloseTo(0.96);
		expect(lympho?.unit).toBe("G/L");
	});

	it("drops excluded parameters (Hématocrite, VGM, TCMH, CCMH)", () => {
		const input = [
			"Hématocrite 0.42 ratio",
			"VGM 88 fL",
			"TCMH 29.5 pg",
			"CCMH 33.2 g/dL",
			"Glycémie 0.95 g/L",
		].join("\n");
		const results = extractBioResults(input);
		const names = results.map((r) => r.name);
		expect(names).not.toContain("Hématocrite");
		expect(names).not.toContain("VGM");
		expect(names).not.toContain("TCMH");
		expect(names).not.toContain("CCMH");
		expect(names).toContain("Glycémie");
	});

	it("ignores stray % before real unit for Hémoglobine", () => {
		const results = extractBioResults(
			"Hémoglobine                         12.3% g/dL",
		);
		const hb = results.find((r) => r.name === "Hémoglobine");
		expect(hb).toBeDefined();
		expect(hb?.value).toBeCloseTo(12.3);
		expect(hb?.unit).toBe("g/dL");
	});

	it("extracts ASAT from verbose liver panel line with OCR noise", () => {
		const results = extractBioResults(
			"Transaminases TGO - (ASAT) #                   17 UA            (10-50)",
		);
		const asat = results.find((r) => r.name === "ASAT");
		expect(asat).toBeDefined();
		expect(asat?.value).toBe(17);
		expect(asat?.unit).toBe("UI/L");
	});

	it("extracts ASAT with OCR-mangled unit 'UN' → UI/L", () => {
		const results = extractBioResults(
			"Transaminases TGO - (ASAT) #                12 UN         (10-50)",
		);
		const asat = results.find((r) => r.name === "ASAT");
		expect(asat).toBeDefined();
		expect(asat?.value).toBe(12);
		expect(asat?.unit).toBe("UI/L");
	});

	it("extracts ASAT with lowercase OCR-mangled unit 'ua' → UI/L", () => {
		const results = extractBioResults(
			"Transaminases TGO - (ASAT) #                13 ua          (10-50)",
		);
		const asat = results.find((r) => r.name === "ASAT");
		expect(asat).toBeDefined();
		expect(asat?.value).toBe(13);
		expect(asat?.unit).toBe("UI/L");
	});

	it("extracts DFG from CKD-EPI line with mangled unit", () => {
		const results = extractBioResults(
			"DFG SELON FORMULE CKD-EPI                                             83 _mlimn/1,73m2",
		);
		const dfg = results.find((r) => r.name === "DFG");
		expect(dfg).toBeDefined();
		expect(dfg?.value).toBe(83);
		expect(dfg?.unit).toBe("mL/min/1.73m²");
	});

	it("extracts Créatinine in µmol/L from multi-line OCR with pmol/l typo", () => {
		const results = extractBioResults(
			[
				"CREATININEMIE #                                          9.3 mg/l              (6.7-11.7)          12.0 - 0/01/2023",
				"(Tech enzymatique - ROCHE - Cobas)                            81 pmol/l          (59-104)",
			].join("\n"),
		);
		const creat = results.find((r) => r.name === "Créatinine");
		expect(creat).toBeDefined();
		expect(creat?.value).toBe(81);
		expect(creat?.unit).toBe("µmol/L");
	});

	it("extracts Albumine with OCR-mangled unit 'gn' → g/L", () => {
		const results = extractBioResults(
			"Albumine SERIQUE #                             42 gn            (35-52)",
		);
		const alb = results.find((r) => r.name === "Albumine");
		expect(alb).toBeDefined();
		expect(alb?.value).toBe(42);
		expect(alb?.unit).toBe("g/L");
	});

	it("extracts DFG from CKD-EPI line with another mangled unit variant", () => {
		const results = extractBioResults(
			"DFG SELON FORMULE CKD-EPI                 80 _mi/mn/1,73m2              83 - 9/01/2022",
		);
		const dfg = results.find((r) => r.name === "DFG");
		expect(dfg).toBeDefined();
		expect(dfg?.value).toBe(80);
		expect(dfg?.unit).toBe("mL/min/1.73m²");
	});

	it("extracts PSA total with pipe OCR artifact in unit", () => {
		const results = extractBioResults(
			"PSA TOTAL #                                34.90* ng/m|          (<540)",
		);
		const psa = results.find((r) => r.name === "PSA total");
		expect(psa).toBeDefined();
		expect(psa?.value).toBeCloseTo(34.9);
		expect(psa?.unit).toBe("ng/mL");
	});

	it("extracts Testostérone with lowercase unit", () => {
		const results = extractBioResults(
			"TESTOSTERONE #                           0.055* ng/ml        (1.980 - 7.400)",
		);
		const testo = results.find((r) => r.name === "Testostérone");
		expect(testo).toBeDefined();
		expect(testo?.value).toBeCloseTo(0.055);
		expect(testo?.unit).toBe("ng/mL");
	});

	it("extracts Calcium corrigé with dot-leaders and 'à' range format", () => {
		const results = extractBioResults(
			"Calcium corrigé Albumine ….….….…....…             2,35 mmol/L              2.20 à 2.50",
		);
		const ca = results.find((r) => r.name === "Calcium corrigé");
		expect(ca).toBeDefined();
		expect(ca?.value).toBeCloseTo(2.35);
		expect(ca?.unit).toBe("mmol/L");
	});

	it("extracts DFG from D.F.G. abbreviation with dot-leaders", () => {
		const results = extractBioResults(
			"D.F.G. selon la formule CKD-EPI ..........                46 mi/mn/1.73m2",
		);
		const dfg = results.find((r) => r.name === "DFG");
		expect(dfg).toBeDefined();
		expect(dfg?.value).toBe(46);
		expect(dfg?.unit).toBe("mL/min/1.73m²");
	});

	it("extracts DFG with heavily mangled unit 'miymn/1.73m?'", () => {
		const results = extractBioResults(
			"D.F.G. selon la formule CKD-EPI ..........                            46 miymn/1.73m?",
		);
		const dfg = results.find((r) => r.name === "DFG");
		expect(dfg).toBeDefined();
		expect(dfg?.value).toBe(46);
		expect(dfg?.unit).toBe("mL/min/1.73m²");
	});

	it("extracts PSA total from heavily mangled OCR line", () => {
		const results = extractBioResults(
			"PS A. ea         385,31 jo/t                 inf à 4\nSérum, Chimiluminescence,&",
		);
		const psa = results.find((r) => r.name === "PSA total");
		expect(psa).toBeDefined();
		expect(psa?.value).toBeCloseTo(385.31);
		expect(psa?.unit).toBe("ng/mL");
	});

	it("extracts PSA total from 'PSs' with OCR garbage name", () => {
		const results = extractBioResults(
			"PSs ranaoranconsonnoransansansassensssansannansess        192,41 qo",
		);
		const psa = results.find((r) => r.name === "PSA total");
		expect(psa).toBeDefined();
		expect(psa?.value).toBeCloseTo(192.41);
		expect(psa?.unit).toBe("ng/mL");
	});

	it("preserves < qualifier for values below detection threshold", () => {
		const results = extractBioResults(
			"ASAT                                                                             <8",
		);
		const asat = results.find((r) => r.name === "ASAT");
		expect(asat).toBeDefined();
		expect(asat?.value).toBe(8);
		expect(asat?.unit).toBe("UI/L");
		expect(asat?.qualifier).toBe("<");
	});

	it("extracts PNN G/L from multi-line with 'soit' continuation and 10°9 unit", () => {
		const results = extractBioResults(
			[
				"Polynucléaires Neutrophiles                        82.2                         %",
				"Sang EDTA -x",
				"soit                 5.4                                     10°91",
			].join("\n"),
		);
		const pnn = results.find(
			(r) => r.name === "Polynucléaires neutrophiles",
		);
		expect(pnn).toBeDefined();
		expect(pnn?.value).toBeCloseTo(5.4);
		expect(pnn?.unit).toBe("G/L");
	});

	it("extracts PNE G/L with < qualifier from 'soit' continuation and 10*9/L unit", () => {
		const results = extractBioResults(
			[
				"Polynucléaires Eosinophiles                      0.6                         %",
				"Sang EDTA -#",
				"",
				"soit                 <0.1                                   10*9/L",
			].join("\n"),
		);
		const pne = results.find(
			(r) => r.name === "Polynucléaires éosinophiles",
		);
		expect(pne).toBeDefined();
		expect(pne?.value).toBeCloseTo(0.1);
		expect(pne?.unit).toBe("G/L");
		expect(pne?.qualifier).toBe("<");
	});

	it("extracts Hémoglobine ignoring OCR noise 'v' before value", () => {
		const results = extractBioResults(
			"Hémoglobine                                                          v 11.5                                  9/100mL",
		);
		const hb = results.find((r) => r.name === "Hémoglobine");
		expect(hb).toBeDefined();
		expect(hb?.value).toBeCloseTo(11.5);
		expect(hb?.unit).toBe("g/dL");
	});

	it("extracts Monocytes with OCR-dropped decimal point (04 → 0.4)", () => {
		const results = extractBioResults(
			[
				"Monocytes                                                                           6.0                                         %",
				"Sang EDTA -#",
				"soit                 04                                     10*9/L",
			].join("\n"),
		);
		const mono = results.find((r) => r.name === "Monocytes");
		expect(mono).toBeDefined();
		expect(mono?.value).toBeCloseTo(0.4);
		expect(mono?.unit).toBe("G/L");
	});

	it("extracts PNB in G/L from OCR-mangled unit 'gga'", () => {
		const results = extractBioResults(
			"Polynucléaires basophiles       09%       0.05 gga       (0.00-0.11)       0.040901/2026",
		);
		const pnb = results.find(
			(r) => r.name === "Polynucléaires basophiles",
		);
		expect(pnb).toBeDefined();
		expect(pnb?.value).toBeCloseTo(0.05);
		expect(pnb?.unit).toBe("G/L");
	});

	it("extracts PNB in G/L from dot-leaders line with 'Giga.' OCR unit", () => {
		const results = extractBioResults(
			"Polynucléaires basophiles................0,6 %             0,05 Giga.                <0.2",
		);
		const pnb = results.find(
			(r) => r.name === "Polynucléaires basophiles",
		);
		expect(pnb).toBeDefined();
		expect(pnb?.value).toBeCloseTo(0.05);
		expect(pnb?.unit).toBe("G/L");
	});

	it("ignores formula explanation lines (no false positive for Albumine)", () => {
		const results = extractBioResults(
			[
				"Ca corrigé = Ca mesuré(mmol/L) + 1- Albumine (g/L) / 40),",
				"applicable uniquement avec albuminémie inférieure ou égale à 40 g/L.",
			].join("\n"),
		);
		const alb = results.find((r) => r.name === "Albumine");
		expect(alb).toBeUndefined();
	});
});
