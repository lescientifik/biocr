export class ProxyDestroyedError extends Error {
	constructor() {
		super("PDF proxy destroyed during OCR");
		this.name = "ProxyDestroyedError";
	}
}
