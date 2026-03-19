export type OcrZoneResult = {
	zoneId: number;
	text: string;
	confidence: number;
};

export type OcrProgress = {
	currentItem: number;
	totalItems: number;
	itemProgress: number;
	globalProgress: number;
};
