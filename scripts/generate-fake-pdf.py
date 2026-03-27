"""Generate a fake French biological test results PDF for testing purposes."""

from fpdf import FPDF

OUTPUT_PATH = "tests/fixtures/fake-bio-report.pdf"

# --- Colour palette ---
HEADER_BG = (41, 65, 122)
HEADER_FG = (255, 255, 255)
SECTION_BG = (220, 230, 245)
SECTION_FG = (30, 30, 30)
ROW_ALT = (245, 247, 252)
ROW_NORMAL = (255, 255, 255)
ABNORMAL_FG = (180, 30, 30)
NORMAL_FG = (30, 30, 30)


class BioReportPDF(FPDF):
    """Custom PDF for a French lab report."""

    def header(self) -> None:
        """Draw lab header on every page."""
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(41, 65, 122)
        self.cell(0, 7, "Laboratoire BioAnalyse Paris-Sud", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(80, 80, 80)
        self.cell(0, 5, "12, rue de la Sante - 75013 Paris", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 5, "Tel : 01 45 67 89 00 - Fax : 01 45 67 89 01", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 5, "FINESS : 750 012 345 - Accreditation COFRAC 8-1234", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def footer(self) -> None:
        """Draw page number footer."""
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(140, 140, 140)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    # ---- helpers ----

    def patient_block(self) -> None:
        """Print the patient identification block."""
        self.set_fill_color(245, 245, 245)
        self.set_draw_color(180, 180, 180)
        x0 = self.get_x()
        y0 = self.get_y()
        self.rect(x0, y0, self.epw, 32, style="FD")

        self.set_font("Helvetica", "B", 10)
        self.set_text_color(30, 30, 30)
        self.set_xy(x0 + 3, y0 + 2)
        self.cell(0, 5, "Patient : DUPONT Jean-Pierre", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_x(x0 + 3)
        self.cell(0, 5, "Date de naissance : 15/03/1962  (64 ans)   Sexe : M", new_x="LMARGIN", new_y="NEXT")
        self.set_x(x0 + 3)
        self.cell(0, 5, "N° dossier : 2026-031542", new_x="LMARGIN", new_y="NEXT")
        self.set_x(x0 + 3)
        self.cell(0, 5, "Médecin prescripteur : Dr. MARTIN Sophie", new_x="LMARGIN", new_y="NEXT")
        self.set_x(x0 + 3)
        self.cell(
            0,
            5,
            "Date de prelevement : 25/03/2026 a 08h15  -  Date de validation : 25/03/2026 a 14h30",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        self.set_xy(x0, y0 + 34)

    def section_title(self, title: str) -> None:
        """Print a coloured section title bar."""
        self.ln(3)
        self.set_fill_color(*SECTION_BG)
        self.set_text_color(*SECTION_FG)
        self.set_font("Helvetica", "B", 11)
        self.cell(0, 8, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def results_table(self, rows: list[tuple[str, str, str, str, bool]]) -> None:
        """Draw a results table.

        Each row is (analyse, resultat, unite, ref_range, is_abnormal).
        """
        col_w = [72, 30, 25, 63]  # widths in mm
        row_h = 6.5

        # Table header
        self.set_fill_color(*HEADER_BG)
        self.set_text_color(*HEADER_FG)
        self.set_font("Helvetica", "B", 9)
        headers = ["Analyse", "Résultat", "Unité", "Valeurs de référence"]
        for i, h in enumerate(headers):
            self.cell(col_w[i], row_h, f" {h}", fill=True, border=1)
        self.ln(row_h)

        # Data rows
        self.set_font("Helvetica", "", 9)
        for idx, (analyse, resultat, unite, ref, abnormal) in enumerate(rows):
            bg = ROW_ALT if idx % 2 else ROW_NORMAL
            self.set_fill_color(*bg)

            # Analyse name
            self.set_text_color(*NORMAL_FG)
            self.cell(col_w[0], row_h, f" {analyse}", fill=True, border=1)

            # Result — red if abnormal
            fg = ABNORMAL_FG if abnormal else NORMAL_FG
            self.set_text_color(*fg)
            self.set_font("Helvetica", "B" if abnormal else "", 9)
            self.cell(col_w[1], row_h, f" {resultat}", fill=True, border=1)

            # Unit + reference
            self.set_text_color(*NORMAL_FG)
            self.set_font("Helvetica", "", 9)
            self.cell(col_w[2], row_h, f" {unite}", fill=True, border=1)
            self.cell(col_w[3], row_h, f" {ref}", fill=True, border=1)
            self.ln(row_h)


def build_pdf() -> None:
    """Build the full fake lab report PDF."""
    pdf = BioReportPDF(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # =====================  PAGE 1  =====================
    pdf.add_page()
    pdf.patient_block()

    # -- NFS --
    pdf.section_title("NUMÉRATION FORMULE SANGUINE (NFS)")
    nfs_rows: list[tuple[str, str, str, str, bool]] = [
        ("Hémoglobine", "12.1", "g/dL", "13.0 - 17.0", True),       # low
        ("Hématocrite", "37.2", "%", "40.0 - 54.0", True),           # low
        ("Globules rouges", "4.18", "T/L", "4.50 - 5.50", True),     # low
        ("VGM", "89.0", "fL", "80.0 - 100.0", False),
        ("TCMH", "29.0", "pg", "27.0 - 33.0", False),
        ("CCMH", "32.5", "g/dL", "32.0 - 36.0", False),
        ("IDR", "13.8", "%", "11.5 - 14.5", False),
        ("Globules blancs", "7.85", "G/L", "4.00 - 10.00", False),
        ("Polynucléaires neutrophiles", "4.52", "G/L", "1.80 - 7.50", False),
        ("Polynucléaires éosinophiles", "0.18", "G/L", "0.05 - 0.50", False),
        ("Polynucléaires basophiles", "0.03", "G/L", "0.00 - 0.10", False),
        ("Lymphocytes", "2.45", "G/L", "1.00 - 4.00", False),
        ("Monocytes", "0.67", "G/L", "0.20 - 1.00", False),
        ("Plaquettes", "158", "G/L", "150 - 400", False),
        ("VPM", "10.2", "fL", "7.0 - 12.0", False),
    ]
    pdf.results_table(nfs_rows)

    # -- Bilan hépatique --
    pdf.section_title("BILAN HÉPATIQUE")
    hepat_rows: list[tuple[str, str, str, str, bool]] = [
        ("ASAT (TGO)", "52", "UI/L", "< 40", True),                  # high
        ("ALAT (TGP)", "68", "UI/L", "< 41", True),                  # high
        ("Gamma GT (GGT)", "85", "UI/L", "< 60", True),              # high
        ("Phosphatases alcalines (PAL)", "78", "UI/L", "40 - 130", False),
        ("Bilirubine totale", "9", "µmol/L", "< 17", False),
        ("Bilirubine conjuguée", "3", "µmol/L", "< 5", False),
    ]
    pdf.results_table(hepat_rows)

    # =====================  PAGE 2  =====================
    pdf.add_page()

    # -- Ionogramme --
    pdf.section_title("IONOGRAMME SANGUIN")
    iono_rows: list[tuple[str, str, str, str, bool]] = [
        ("Sodium (Na+)", "141", "mmol/L", "136 - 145", False),
        ("Potassium (K+)", "5.3", "mmol/L", "3.5 - 5.1", True),     # high
        ("Chlore (Cl-)", "103", "mmol/L", "98 - 106", False),
        ("Bicarbonates (CO2 total)", "24", "mmol/L", "22 - 29", False),
        ("Calcium", "2.35", "mmol/L", "2.20 - 2.60", False),
        ("Phosphore", "1.05", "mmol/L", "0.80 - 1.45", False),
        ("Magnésium", "0.82", "mmol/L", "0.70 - 1.05", False),
    ]
    pdf.results_table(iono_rows)

    # -- Fonction rénale --
    pdf.section_title("FONCTION RÉNALE")
    renal_rows: list[tuple[str, str, str, str, bool]] = [
        ("Créatinine", "118", "µmol/L", "62 - 106", True),           # high
        ("DFG (CKD-EPI)", "58", "mL/min/1.73m²", "> 90", True),     # low
        ("Urée", "8.9", "mmol/L", "2.5 - 7.5", True),               # high
        ("Acide urique", "380", "µmol/L", "200 - 420", False),
    ]
    pdf.results_table(renal_rows)

    # -- Glycémie --
    pdf.section_title("GLYCÉMIE")
    glyc_rows: list[tuple[str, str, str, str, bool]] = [
        ("Glycémie à jeun", "5.8", "mmol/L", "3.9 - 5.5", True),    # slightly high
        ("HbA1c", "6.1", "%", "< 6.0", True),                       # slightly high
    ]
    pdf.results_table(glyc_rows)

    # -- Bilan lipidique --
    pdf.section_title("BILAN LIPIDIQUE")
    lipid_rows: list[tuple[str, str, str, str, bool]] = [
        ("Cholestérol total", "5.82", "mmol/L", "< 5.20", True),     # high
        ("HDL-Cholestérol", "1.12", "mmol/L", "> 1.04", False),
        ("LDL-Cholestérol (calculé)", "3.95", "mmol/L", "< 3.40", True),  # high
        ("Triglycérides", "1.65", "mmol/L", "< 1.70", False),
    ]
    pdf.results_table(lipid_rows)

    # =====================  PAGE 3  =====================
    pdf.add_page()

    # -- PSA --
    pdf.section_title("MARQUEUR PROSTATIQUE")
    psa_rows: list[tuple[str, str, str, str, bool]] = [
        ("PSA total", "3.8", "ng/mL", "< 4.0", False),
        ("PSA libre", "0.95", "ng/mL", "", False),
        ("Rapport PSA libre / total", "25", "%", "> 15", False),
    ]
    pdf.results_table(psa_rows)

    # -- Testostérone --
    pdf.section_title("BILAN HORMONAL")
    hormone_rows: list[tuple[str, str, str, str, bool]] = [
        ("Testostérone totale", "3.8", "ng/mL", "2.5 - 8.4", False),
        ("Testostérone biodisponible", "1.2", "ng/mL", "0.7 - 3.2", False),
        ("SHBG", "42", "nmol/L", "18 - 54", False),
    ]
    pdf.results_table(hormone_rows)

    # -- CRP / VS --
    pdf.section_title("INFLAMMATION")
    inflam_rows: list[tuple[str, str, str, str, bool]] = [
        ("CRP (Protéine C réactive)", "8.5", "mg/L", "< 5.0", True),  # high
        ("VS (1ère heure)", "22", "mm", "< 15", True),                 # high
    ]
    pdf.results_table(inflam_rows)

    # -- Signature block --
    pdf.ln(15)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5, "Biologiste responsable : Dr. LEFÈVRE Antoine", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, "Signature électronique validée le 25/03/2026 à 14h30", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(140, 140, 140)
    pdf.multi_cell(
        0,
        4,
        "Ce compte rendu de résultats ne constitue pas un diagnostic médical. "
        "Les résultats doivent être interprétés par le médecin prescripteur "
        "en fonction du contexte clinique du patient.",
    )

    pdf.output(OUTPUT_PATH)
    print(f"PDF generated: {OUTPUT_PATH}")


if __name__ == "__main__":
    build_pdf()
