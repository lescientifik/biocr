export type LanguageCode = "fra" | "eng";

interface Language {
	code: LanguageCode;
	label: string;
	bundled: boolean;
}

const LANGUAGES: Language[] = [
	{ code: "fra", label: "Français", bundled: true },
	{ code: "eng", label: "English", bundled: true },
];

interface LanguageSelectorProps {
	value: LanguageCode;
	isOnline: boolean;
	onLanguageChange: (lang: LanguageCode) => void;
}

/**
 * Dropdown selector for OCR language.
 *
 * Both Français and English are bundled and always available offline.
 */
export function LanguageSelector({
	value,
	onLanguageChange,
}: LanguageSelectorProps): React.JSX.Element {
	return (
		<select
			aria-label="Langue OCR"
			value={value}
			onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
			className="h-8 rounded-md border border-input bg-background px-2 text-sm"
		>
			{LANGUAGES.map((lang) => (
				<option key={lang.code} value={lang.code}>
					{lang.label}
				</option>
			))}
		</select>
	);
}
