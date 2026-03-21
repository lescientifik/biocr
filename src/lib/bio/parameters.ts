import type { BioParameter } from "@/types/bio.ts";

/**
 * Comprehensive dictionary of French biological parameters.
 *
 * Plausible ranges are intentionally wide — they represent physiologically
 * possible values, NOT normal reference ranges. Values outside these ranges
 * are almost certainly OCR errors.
 */
export const BIO_PARAMETERS: BioParameter[] = [
	// ═══════════════════════════════════════════════════════════════════
	// HÉMATOLOGIE — NFS
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Leucocytes",
		abbreviations: ["GB", "WBC"],
		aliases: [
			"Globules blancs",
			"Leucocytes totaux",
			"White blood cells",
			"Numération leucocytaire",
		],
		units: [{ unit: "G/L", min: 0.1, max: 200 }],
		category: "Hématologie",
	},
	{
		name: "Hématies",
		abbreviations: ["GR", "RBC"],
		aliases: [
			"Globules rouges",
			"Érythrocytes",
			"Red blood cells",
			"Numération érythrocytaire",
		],
		units: [{ unit: "T/L", min: 0.5, max: 10 }],
		category: "Hématologie",
	},
	{
		name: "Hémoglobine",
		abbreviations: ["Hb", "Hgb", "HGB"],
		aliases: ["Hemoglobine"],
		units: [
			{ unit: "g/dL", min: 2, max: 25 },
			{ unit: "g/L", min: 20, max: 250 },
		],
		category: "Hématologie",
	},
	{
		name: "Hématocrite",
		abbreviations: ["Ht", "Hte", "HCT"],
		aliases: ["Hematocrite"],
		units: [
			{ unit: "%", min: 5, max: 75 },
			{ unit: "L/L", min: 0.05, max: 0.75 },
		],
		category: "Hématologie",
	},
	{
		name: "VGM",
		abbreviations: ["MCV"],
		aliases: [
			"Volume globulaire moyen",
			"Volume Globulaire Moyen",
			"Mean corpuscular volume",
		],
		units: [{ unit: "fL", min: 40, max: 150 }],
		category: "Hématologie",
	},
	{
		name: "TCMH",
		abbreviations: ["MCH"],
		aliases: [
			"Teneur corpusculaire moyenne en hémoglobine",
			"Mean corpuscular hemoglobin",
		],
		units: [{ unit: "pg", min: 10, max: 50 }],
		category: "Hématologie",
	},
	{
		name: "CCMH",
		abbreviations: ["MCHC"],
		aliases: [
			"Concentration corpusculaire moyenne en hémoglobine",
			"Mean corpuscular hemoglobin concentration",
		],
		units: [
			{ unit: "g/dL", min: 20, max: 45 },
			{ unit: "g/L", min: 200, max: 450 },
		],
		category: "Hématologie",
	},
	{
		name: "Plaquettes",
		abbreviations: ["PLT", "Plq"],
		aliases: ["Thrombocytes", "Numération plaquettaire"],
		units: [{ unit: "G/L", min: 5, max: 1500 }],
		category: "Hématologie",
	},
	{
		name: "Réticulocytes",
		abbreviations: ["Rétic", "Retic"],
		aliases: ["Reticulocytes"],
		units: [
			{ unit: "G/L", min: 0, max: 500 },
			{ unit: "%", min: 0, max: 30 },
		],
		category: "Hématologie",
	},
	{
		name: "IDR",
		abbreviations: ["RDW"],
		aliases: [
			"Indice de distribution des rouges",
			"Red cell distribution width",
		],
		units: [{ unit: "%", min: 5, max: 35 }],
		category: "Hématologie",
	},
	{
		name: "VMP",
		abbreviations: ["MPV"],
		aliases: ["Volume moyen plaquettaire", "Mean platelet volume"],
		units: [{ unit: "fL", min: 3, max: 20 }],
		category: "Hématologie",
	},

	// ═══════════════════════════════════════════════════════════════════
	// FORMULE LEUCOCYTAIRE
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Polynucléaires neutrophiles",
		abbreviations: ["PNN", "PN", "Neutro"],
		aliases: [
			"Neutrophiles",
			"Granulocytes neutrophiles",
			"Polynucleaires neutrophiles",
		],
		units: [
			{ unit: "G/L", min: 0, max: 100 },
			{ unit: "%", min: 0, max: 100 },
		],
		category: "Formule leucocytaire",
		preferredUnit: "G/L",
	},
	{
		name: "Polynucléaires éosinophiles",
		abbreviations: ["PNE", "Éosino", "Eosino"],
		aliases: [
			"Éosinophiles",
			"Eosinophiles",
			"Granulocytes éosinophiles",
			"Polynucleaires eosinophiles",
		],
		units: [
			{ unit: "G/L", min: 0, max: 30 },
			{ unit: "%", min: 0, max: 100 },
		],
		category: "Formule leucocytaire",
		preferredUnit: "G/L",
	},
	{
		name: "Polynucléaires basophiles",
		abbreviations: ["PNB", "Baso"],
		aliases: [
			"Basophiles",
			"Granulocytes basophiles",
			"Polynucleaires basophiles",
		],
		units: [
			{ unit: "G/L", min: 0, max: 10 },
			{ unit: "%", min: 0, max: 100 },
		],
		category: "Formule leucocytaire",
		preferredUnit: "G/L",
	},
	{
		name: "Lymphocytes",
		abbreviations: ["Lympho", "LY"],
		aliases: [],
		units: [
			{ unit: "G/L", min: 0, max: 100 },
			{ unit: "%", min: 0, max: 100 },
		],
		category: "Formule leucocytaire",
		preferredUnit: "G/L",
	},
	{
		name: "Monocytes",
		abbreviations: ["Mono", "MO"],
		aliases: [],
		units: [
			{ unit: "G/L", min: 0, max: 30 },
			{ unit: "%", min: 0, max: 100 },
		],
		category: "Formule leucocytaire",
		preferredUnit: "G/L",
	},

	// ═══════════════════════════════════════════════════════════════════
	// BIOCHIMIE — MÉTABOLISME
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Glycémie",
		abbreviations: ["Gly", "Glc"],
		aliases: ["Glucose", "Glycemie", "Glycémie à jeun"],
		units: [
			{ unit: "g/L", min: 0.1, max: 8 },
			{ unit: "mmol/L", min: 0.5, max: 45 },
			{ unit: "mg/dL", min: 10, max: 800 },
		],
		category: "Biochimie",
	},
	{
		name: "Créatinine",
		abbreviations: ["Créat", "Creat"],
		aliases: ["Creatinine", "Créatininémie"],
		units: [
			{ unit: "µmol/L", min: 5, max: 2500 },
			{ unit: "mg/L", min: 1, max: 300 },
			{ unit: "mg/dL", min: 0.1, max: 30 },
		],
		category: "Biochimie",
		preferredUnit: "µmol/L",
	},
	{
		name: "Urée",
		abbreviations: ["BUN"],
		aliases: ["Uree", "Azotémie", "Urémie"],
		units: [
			{ unit: "mmol/L", min: 0.5, max: 80 },
			{ unit: "g/L", min: 0.05, max: 5 },
		],
		category: "Biochimie",
	},
	{
		name: "Acide urique",
		abbreviations: ["AU"],
		aliases: ["Uricémie", "Uricemie"],
		units: [
			{ unit: "µmol/L", min: 50, max: 1500 },
			{ unit: "mg/L", min: 10, max: 250 },
			{ unit: "mg/dL", min: 1, max: 25 },
		],
		category: "Biochimie",
	},

	// ═══════════════════════════════════════════════════════════════════
	// IONOGRAMME
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Sodium",
		abbreviations: ["Na", "Na+"],
		aliases: ["Natrémie", "Natremie"],
		units: [{ unit: "mmol/L", min: 100, max: 180 }],
		category: "Ionogramme",
	},
	{
		name: "Potassium",
		abbreviations: ["K", "K+"],
		aliases: ["Kaliémie", "Kaliemie"],
		units: [{ unit: "mmol/L", min: 1.5, max: 10 }],
		category: "Ionogramme",
	},
	{
		name: "Chlore",
		abbreviations: ["Cl", "Cl-"],
		aliases: ["Chlorémie", "Chloremie", "Chlorures"],
		units: [{ unit: "mmol/L", min: 70, max: 130 }],
		category: "Ionogramme",
	},
	{
		name: "Calcium",
		abbreviations: ["Ca", "Ca++", "Ca2+"],
		aliases: ["Calcémie", "Calcemie", "Calcium total"],
		units: [
			{ unit: "mmol/L", min: 1, max: 5 },
			{ unit: "mg/L", min: 40, max: 200 },
			{ unit: "mg/dL", min: 4, max: 20 },
		],
		category: "Ionogramme",
		preferredUnit: "mmol/L",
	},
	{
		name: "Calcium corrigé",
		abbreviations: ["Ca corr"],
		aliases: [
			"Calcium corrige",
			"Calcium corrigé Albumine",
			"Calcium corrige Albumine",
			"Calcémie corrigée",
		],
		units: [{ unit: "mmol/L", min: 1, max: 5 }],
		category: "Ionogramme",
	},
	{
		name: "Phosphore",
		abbreviations: ["P", "PO4"],
		aliases: ["Phosphorémie", "Phosphoremie", "Phosphates"],
		units: [
			{ unit: "mmol/L", min: 0.3, max: 5 },
			{ unit: "mg/L", min: 10, max: 150 },
		],
		category: "Ionogramme",
		preferredUnit: "mmol/L",
	},
	{
		name: "Magnésium",
		abbreviations: ["Mg", "Mg++", "Mg2+"],
		aliases: ["Magnesium", "Magnésémie", "Magnesemie"],
		units: [
			{ unit: "mmol/L", min: 0.2, max: 3 },
			{ unit: "mg/L", min: 5, max: 70 },
		],
		category: "Ionogramme",
		preferredUnit: "mmol/L",
	},
	{
		name: "Bicarbonates",
		abbreviations: ["HCO3", "CO2T"],
		aliases: ["CO2 total", "Réserve alcaline", "Reserve alcaline"],
		units: [{ unit: "mmol/L", min: 5, max: 50 }],
		category: "Ionogramme",
	},

	// ═══════════════════════════════════════════════════════════════════
	// BILAN HÉPATIQUE
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "ASAT",
		abbreviations: ["TGO", "AST"],
		aliases: [
			"Aspartate aminotransférase",
			"Aspartate aminotransferase",
			"Transaminase oxaloacétique",
			"SGOT",
		],
		units: [{ unit: "UI/L", min: 1, max: 5000 }],
		category: "Bilan hépatique",
	},
	{
		name: "ALAT",
		abbreviations: ["TGP", "ALT"],
		aliases: [
			"Alanine aminotransférase",
			"Alanine aminotransferase",
			"Transaminase pyruvique",
			"SGPT",
		],
		units: [{ unit: "UI/L", min: 1, max: 5000 }],
		category: "Bilan hépatique",
	},
	{
		name: "GGT",
		abbreviations: ["γGT", "Gamma GT"],
		aliases: [
			"Gamma-glutamyl-transférase",
			"Gamma-glutamyl-transferase",
			"Gamma glutamyl transpeptidase",
			"Gamma GT",
			"γ-GT",
		],
		units: [{ unit: "UI/L", min: 1, max: 5000 }],
		category: "Bilan hépatique",
	},
	{
		name: "PAL",
		abbreviations: ["ALP"],
		aliases: [
			"Phosphatases alcalines",
			"Phosphatase alcaline",
			"Alkaline phosphatase",
		],
		units: [{ unit: "UI/L", min: 5, max: 3000 }],
		category: "Bilan hépatique",
	},
	{
		name: "Bilirubine totale",
		abbreviations: ["Bili T", "BT"],
		aliases: ["Bilirubine", "Bilirubinémie"],
		units: [
			{ unit: "µmol/L", min: 0, max: 600 },
			{ unit: "mg/L", min: 0, max: 350 },
		],
		category: "Bilan hépatique",
		preferredUnit: "mg/L",
	},
	{
		name: "Bilirubine conjuguée",
		abbreviations: ["Bili D", "BD"],
		aliases: ["Bilirubine directe"],
		units: [
			{ unit: "µmol/L", min: 0, max: 400 },
			{ unit: "mg/L", min: 0, max: 250 },
		],
		category: "Bilan hépatique",
	},
	{
		name: "Bilirubine libre",
		abbreviations: ["Bili I", "BI"],
		aliases: ["Bilirubine indirecte", "Bilirubine non conjuguée"],
		units: [
			{ unit: "µmol/L", min: 0, max: 400 },
			{ unit: "mg/L", min: 0, max: 250 },
		],
		category: "Bilan hépatique",
	},
	{
		name: "Albumine",
		abbreviations: ["Alb"],
		aliases: ["Albuminémie", "Albuminemie"],
		units: [{ unit: "g/L", min: 5, max: 70 }],
		category: "Bilan hépatique",
	},
	{
		name: "Protéines totales",
		abbreviations: ["Prot"],
		aliases: ["Protidémie", "Protides totaux", "Proteines totales"],
		units: [{ unit: "g/L", min: 20, max: 120 }],
		category: "Bilan hépatique",
	},

	// ═══════════════════════════════════════════════════════════════════
	// BILAN LIPIDIQUE
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Cholestérol total",
		abbreviations: ["CT", "Chol"],
		aliases: [
			"Cholesterol total",
			"Cholestérol",
			"Cholesterol",
			"Cholestérolémie",
		],
		units: [
			{ unit: "g/L", min: 0.5, max: 6 },
			{ unit: "mmol/L", min: 1, max: 15 },
		],
		category: "Bilan lipidique",
	},
	{
		name: "HDL-Cholestérol",
		abbreviations: ["HDL", "HDL-C"],
		aliases: ["HDL Cholesterol", "HDL-Cholesterol", "Cholestérol HDL"],
		units: [
			{ unit: "g/L", min: 0.1, max: 3 },
			{ unit: "mmol/L", min: 0.2, max: 5 },
		],
		category: "Bilan lipidique",
	},
	{
		name: "LDL-Cholestérol",
		abbreviations: ["LDL", "LDL-C"],
		aliases: ["LDL Cholesterol", "LDL-Cholesterol", "Cholestérol LDL"],
		units: [
			{ unit: "g/L", min: 0.1, max: 5 },
			{ unit: "mmol/L", min: 0.2, max: 12 },
		],
		category: "Bilan lipidique",
	},
	{
		name: "Triglycérides",
		abbreviations: ["TG", "Trig"],
		aliases: ["Triglycerides", "Triglycéridémie"],
		units: [
			{ unit: "g/L", min: 0.1, max: 15 },
			{ unit: "mmol/L", min: 0.1, max: 17 },
		],
		category: "Bilan lipidique",
	},

	// ═══════════════════════════════════════════════════════════════════
	// HÉMOSTASE
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "TP",
		abbreviations: ["PT"],
		aliases: ["Taux de prothrombine", "Temps de prothrombine"],
		units: [{ unit: "%", min: 5, max: 150 }],
		category: "Hémostase",
	},
	{
		name: "TCA",
		abbreviations: ["aPTT", "TCK"],
		aliases: [
			"Temps de céphaline activée",
			"Temps de cephaline activee",
			"TCA ratio",
		],
		units: [
			{ unit: "s", min: 15, max: 200 },
			{ unit: "ratio", min: 0.5, max: 10 },
		],
		category: "Hémostase",
	},
	{
		name: "INR",
		abbreviations: [],
		aliases: ["International Normalized Ratio"],
		units: [
			{ unit: "", min: 0.5, max: 15 },
			{ unit: "ratio", min: 0.5, max: 15 },
		],
		category: "Hémostase",
	},
	{
		name: "Fibrinogène",
		abbreviations: ["Fib"],
		aliases: ["Fibrinogene", "Facteur I"],
		units: [{ unit: "g/L", min: 0.3, max: 12 }],
		category: "Hémostase",
	},
	{
		name: "D-dimères",
		abbreviations: ["D-Di", "DDi"],
		aliases: ["D-dimeres", "D dimères", "D dimeres", "DDimères"],
		units: [
			{ unit: "ng/mL", min: 0, max: 50000 },
			{ unit: "µg/L", min: 0, max: 50000 },
			{ unit: "mg/L", min: 0, max: 50 },
		],
		category: "Hémostase",
	},

	// ═══════════════════════════════════════════════════════════════════
	// MARQUEURS TUMORAUX
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "PSA total",
		abbreviations: ["PSA", "PSA-T"],
		aliases: [
			"Antigène prostatique spécifique",
			"Antigene prostatique specifique",
			"PSA Total",
		],
		units: [{ unit: "ng/mL", min: 0, max: 1000 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "PSA libre",
		abbreviations: ["PSA-L", "PSAL"],
		aliases: ["PSA Libre", "Free PSA"],
		units: [{ unit: "ng/mL", min: 0, max: 500 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "Rapport PSA libre/total",
		abbreviations: ["PSA L/T"],
		aliases: ["Rapport PSA", "PSA ratio", "PSA libre/PSA total"],
		units: [{ unit: "%", min: 0, max: 100 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "CA 125",
		abbreviations: ["CA125"],
		aliases: ["Cancer Antigen 125"],
		units: [{ unit: "UI/mL", min: 0, max: 10000 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "CA 19-9",
		abbreviations: ["CA19-9", "CA199"],
		aliases: ["Cancer Antigen 19-9"],
		units: [{ unit: "UI/mL", min: 0, max: 50000 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "CA 15-3",
		abbreviations: ["CA15-3", "CA153"],
		aliases: ["Cancer Antigen 15-3"],
		units: [{ unit: "UI/mL", min: 0, max: 5000 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "ACE",
		abbreviations: ["CEA"],
		aliases: [
			"Antigène carcino-embryonnaire",
			"Antigene carcino-embryonnaire",
			"Carcinoembryonic antigen",
		],
		units: [{ unit: "ng/mL", min: 0, max: 1000 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "AFP",
		abbreviations: ["αFP"],
		aliases: ["Alpha-fœtoprotéine", "Alpha-foetoproteine", "Alpha FP"],
		units: [{ unit: "ng/mL", min: 0, max: 50000 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "β-HCG",
		abbreviations: ["HCG", "βHCG", "bHCG"],
		aliases: [
			"Béta-HCG",
			"Beta-HCG",
			"Gonadotrophine chorionique",
			"hCG",
			"β HCG",
		],
		units: [
			{ unit: "UI/L", min: 0, max: 300000 },
			{ unit: "mUI/mL", min: 0, max: 300000 },
		],
		category: "Marqueurs tumoraux",
	},
	{
		name: "NSE",
		abbreviations: [],
		aliases: ["Neuron-specific enolase", "Enolase neuronale spécifique"],
		units: [{ unit: "ng/mL", min: 0, max: 500 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "SCC",
		abbreviations: [],
		aliases: [
			"Squamous cell carcinoma antigen",
			"Antigène SCC",
			"Antigene SCC",
		],
		units: [{ unit: "ng/mL", min: 0, max: 200 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "Cyfra 21-1",
		abbreviations: ["CYFRA"],
		aliases: ["Cyfra21-1", "Cyfra 21.1", "Cytokeratine 19"],
		units: [{ unit: "ng/mL", min: 0, max: 500 }],
		category: "Marqueurs tumoraux",
	},
	{
		name: "Phosphatases acides",
		abbreviations: ["PAc"],
		aliases: [
			"Phosphatase acide totale",
			"Phosphatase acide prostatique",
			"PAP",
		],
		units: [{ unit: "UI/L", min: 0, max: 100 }],
		category: "Marqueurs tumoraux",
	},

	// ═══════════════════════════════════════════════════════════════════
	// ENDOCRINOLOGIE
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "TSH",
		abbreviations: ["TSHus"],
		aliases: [
			"Thyréostimuline",
			"Thyreostimuline",
			"Thyroid stimulating hormone",
			"TSH ultrasensible",
		],
		units: [
			{ unit: "mUI/L", min: 0, max: 150 },
			{ unit: "µUI/mL", min: 0, max: 150 },
		],
		category: "Endocrinologie",
	},
	{
		name: "T3 libre",
		abbreviations: ["FT3", "T3L"],
		aliases: ["T3", "Triiodothyronine libre", "Free T3"],
		units: [
			{ unit: "pmol/L", min: 0.5, max: 30 },
			{ unit: "pg/mL", min: 0.3, max: 20 },
		],
		category: "Endocrinologie",
	},
	{
		name: "T4 libre",
		abbreviations: ["FT4", "T4L"],
		aliases: ["T4", "Thyroxine libre", "Free T4"],
		units: [
			{ unit: "pmol/L", min: 2, max: 80 },
			{ unit: "ng/dL", min: 0.2, max: 6 },
		],
		category: "Endocrinologie",
	},
	{
		name: "Cortisol",
		abbreviations: [],
		aliases: ["Cortisolémie", "Cortisolemie", "Cortisol sérique"],
		units: [
			{ unit: "nmol/L", min: 10, max: 1500 },
			{ unit: "µg/dL", min: 0.5, max: 50 },
		],
		category: "Endocrinologie",
	},

	// ═══════════════════════════════════════════════════════════════════
	// INFLAMMATION
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "CRP",
		abbreviations: ["CRPus"],
		aliases: [
			"Protéine C-réactive",
			"Proteine C-reactive",
			"C-reactive protein",
			"CRP ultrasensible",
		],
		units: [
			{ unit: "mg/L", min: 0, max: 500 },
			{ unit: "mg/dL", min: 0, max: 50 },
		],
		category: "Inflammation",
	},
	{
		name: "VS",
		abbreviations: ["ESR"],
		aliases: [
			"Vitesse de sédimentation",
			"Vitesse de sedimentation",
			"Erythrocyte sedimentation rate",
		],
		units: [{ unit: "mm/h", min: 0, max: 150 }],
		category: "Inflammation",
	},
	{
		name: "Procalcitonine",
		abbreviations: ["PCT"],
		aliases: ["Procalcitonin"],
		units: [{ unit: "ng/mL", min: 0, max: 200 }],
		category: "Inflammation",
	},

	// ═══════════════════════════════════════════════════════════════════
	// VITAMINES & FER
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Vitamine B9",
		abbreviations: ["B9"],
		aliases: ["Folates", "Acide folique", "Folate sérique"],
		units: [
			{ unit: "ng/mL", min: 0.5, max: 50 },
			{ unit: "nmol/L", min: 1, max: 120 },
		],
		category: "Vitamines",
	},
	{
		name: "Vitamine B12",
		abbreviations: ["B12"],
		aliases: ["Cobalamine", "Cyanocobalamine"],
		units: [
			{ unit: "pg/mL", min: 50, max: 2000 },
			{ unit: "pmol/L", min: 30, max: 1500 },
		],
		category: "Vitamines",
	},
	{
		name: "Vitamine D",
		abbreviations: ["Vit D", "25-OH-D"],
		aliases: [
			"25-OH Vitamine D",
			"25-hydroxyvitamine D",
			"Calcidiol",
			"25(OH)D",
		],
		units: [
			{ unit: "ng/mL", min: 2, max: 200 },
			{ unit: "nmol/L", min: 5, max: 500 },
		],
		category: "Vitamines",
	},
	{
		name: "Fer sérique",
		abbreviations: ["Fe"],
		aliases: ["Fer serique", "Sidérémie", "Sideremie", "Fer"],
		units: [
			{ unit: "µmol/L", min: 1, max: 80 },
			{ unit: "µg/dL", min: 5, max: 450 },
		],
		category: "Vitamines",
	},
	{
		name: "Ferritine",
		abbreviations: ["Ferr"],
		aliases: ["Ferritinémie", "Ferritinemie"],
		units: [
			{ unit: "ng/mL", min: 1, max: 10000 },
			{ unit: "µg/L", min: 1, max: 10000 },
		],
		category: "Vitamines",
	},
	{
		name: "Transferrine",
		abbreviations: ["Tf"],
		aliases: ["Sidérophiline", "Siderophiline"],
		units: [{ unit: "g/L", min: 0.5, max: 6 }],
		category: "Vitamines",
	},
	{
		name: "CST",
		abbreviations: ["TSAT"],
		aliases: [
			"Coefficient de saturation de la transferrine",
			"Saturation transferrine",
		],
		units: [{ unit: "%", min: 0, max: 100 }],
		category: "Vitamines",
	},

	// ═══════════════════════════════════════════════════════════════════
	// HORMONES
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Testostérone",
		abbreviations: ["Testo"],
		aliases: ["Testosterone", "Testostérone totale", "Testosterone totale"],
		units: [
			{ unit: "ng/mL", min: 0, max: 15 },
			{ unit: "nmol/L", min: 0, max: 50 },
		],
		category: "Hormones",
	},

	// ═══════════════════════════════════════════════════════════════════
	// ENZYMES & AUTRES
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "LDH",
		abbreviations: [],
		aliases: [
			"Lactate déshydrogénase",
			"Lactate deshydrogenase",
			"Lacticodéshydrogénase",
		],
		units: [{ unit: "UI/L", min: 50, max: 5000 }],
		category: "Enzymes",
	},
	{
		name: "CPK",
		abbreviations: ["CK"],
		aliases: [
			"Créatine phosphokinase",
			"Creatine phosphokinase",
			"Créatine kinase",
			"Creatine kinase",
		],
		units: [{ unit: "UI/L", min: 5, max: 50000 }],
		category: "Enzymes",
	},
	{
		name: "Lipase",
		abbreviations: [],
		aliases: ["Lipasémie"],
		units: [{ unit: "UI/L", min: 0, max: 5000 }],
		category: "Enzymes",
	},
	{
		name: "Amylase",
		abbreviations: [],
		aliases: ["Amylasémie"],
		units: [{ unit: "UI/L", min: 0, max: 5000 }],
		category: "Enzymes",
	},
	{
		name: "HbA1c",
		abbreviations: ["A1c"],
		aliases: [
			"Hémoglobine glyquée",
			"Hemoglobine glyquee",
			"Hémoglobine glycosylée",
		],
		units: [
			{ unit: "%", min: 3, max: 20 },
			{ unit: "mmol/mol", min: 10, max: 200 },
		],
		category: "Biochimie",
	},

	// ═══════════════════════════════════════════════════════════════════
	// SÉROLOGIE / IMMUNOLOGIE
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "IgG",
		abbreviations: [],
		aliases: ["Immunoglobulines G"],
		units: [{ unit: "g/L", min: 1, max: 50 }],
		category: "Immunologie",
	},
	{
		name: "IgA",
		abbreviations: [],
		aliases: ["Immunoglobulines A"],
		units: [{ unit: "g/L", min: 0.1, max: 15 }],
		category: "Immunologie",
	},
	{
		name: "IgM",
		abbreviations: [],
		aliases: ["Immunoglobulines M"],
		units: [{ unit: "g/L", min: 0.1, max: 10 }],
		category: "Immunologie",
	},
	{
		name: "Complément C3",
		abbreviations: ["C3"],
		aliases: ["Complement C3", "Fraction C3"],
		units: [{ unit: "g/L", min: 0.2, max: 3 }],
		category: "Immunologie",
	},
	{
		name: "Complément C4",
		abbreviations: ["C4"],
		aliases: ["Complement C4", "Fraction C4"],
		units: [{ unit: "g/L", min: 0.05, max: 1 }],
		category: "Immunologie",
	},

	// ═══════════════════════════════════════════════════════════════════
	// URINES
	// ═══════════════════════════════════════════════════════════════════
	{
		name: "Microalbuminurie",
		abbreviations: ["µAlb"],
		aliases: ["Albuminurie", "Microalbumine urinaire"],
		units: [
			{ unit: "mg/L", min: 0, max: 5000 },
			{ unit: "mg/24h", min: 0, max: 5000 },
		],
		category: "Urines",
	},
	{
		name: "Protéinurie",
		abbreviations: [],
		aliases: ["Proteinurie", "Protéines urinaires"],
		units: [
			{ unit: "g/L", min: 0, max: 20 },
			{ unit: "g/24h", min: 0, max: 20 },
		],
		category: "Urines",
	},
	{
		name: "DFG",
		abbreviations: ["eGFR", "GFR"],
		aliases: [
			"Débit de filtration glomérulaire",
			"Debit de filtration glomerulaire",
			"Clairance créatinine",
			"CKD-EPI",
			"MDRD",
		],
		units: [{ unit: "mL/min/1.73m²", min: 2, max: 200 }],
		category: "Biochimie",
	},
];
