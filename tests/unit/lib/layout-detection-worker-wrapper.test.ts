import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Flush the microtask queue so that the promise chain inside
 * detectInWorker advances to the callWorker stage.
 */
async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("detectInWorker", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns a DetectionResponse with regions and pageIndex", async () => {
		let messageHandler: ((e: MessageEvent) => void) | null = null;
		const mockPostMessage = vi.fn();

		vi.stubGlobal(
			"Worker",
			class MockWorker {
				postMessage = mockPostMessage;
				addEventListener(event: string, handler: () => void) {
					if (event === "message") messageHandler = handler;
				}
				removeEventListener() {}
				terminate() {}
			},
		);

		const { detectInWorker } = await import(
			"@/lib/layout-detection/worker-wrapper.ts"
		);

		const image = {
			data: new Uint8ClampedArray(4),
			width: 1,
			height: 1,
		};
		const promise = detectInWorker(image, 0);

		await flushMicrotasks();

		// Extract the nonce from the posted message
		const postedMessage = mockPostMessage.mock.calls[0][0];
		const nonce = postedMessage.nonce;

		const mockRegions = [
			{
				type: "text" as const,
				bbox: { x: 10, y: 20, width: 100, height: 50 },
				confidence: 1.0,
			},
		];
		messageHandler?.({
			data: { regions: mockRegions, pageIndex: 0, nonce },
		} as MessageEvent);

		const result = await promise;
		expect(result.regions).toEqual(mockRegions);
		expect(result.pageIndex).toBe(0);
	});

	it("serializes calls — second call waits for the first", async () => {
		let messageHandler: ((e: MessageEvent) => void) | null = null;
		const callOrder: number[] = [];
		const mockPostMessage = vi.fn();

		vi.stubGlobal(
			"Worker",
			class MockWorker {
				postMessage = mockPostMessage;
				addEventListener(event: string, handler: () => void) {
					if (event === "message") messageHandler = handler;
				}
				removeEventListener() {}
				terminate() {}
			},
		);

		const { detectInWorker } = await import(
			"@/lib/layout-detection/worker-wrapper.ts"
		);

		const image1 = {
			data: new Uint8ClampedArray(4),
			width: 1,
			height: 1,
		};
		const image2 = {
			data: new Uint8ClampedArray(4),
			width: 1,
			height: 1,
		};

		const promise1 = detectInWorker(image1, 0).then((r) => {
			callOrder.push(1);
			return r;
		});
		const promise2 = detectInWorker(image2, 1).then((r) => {
			callOrder.push(2);
			return r;
		});

		// Resolve first call
		await flushMicrotasks();
		const nonce1 = mockPostMessage.mock.calls[0][0].nonce;
		messageHandler?.({
			data: { regions: [], pageIndex: 0, nonce: nonce1 },
		} as MessageEvent);
		await flushMicrotasks();

		// Resolve second call
		const nonce2 = mockPostMessage.mock.calls[1][0].nonce;
		messageHandler?.({
			data: { regions: [], pageIndex: 1, nonce: nonce2 },
		} as MessageEvent);

		await Promise.all([promise1, promise2]);
		expect(callOrder).toEqual([1, 2]);
	});
});

describe("terminateDetectionWorker", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("terminates and clears the singleton worker", async () => {
		let messageHandler: ((e: MessageEvent) => void) | null = null;
		const mockTerminate = vi.fn();
		const mockPostMessage = vi.fn();

		vi.stubGlobal(
			"Worker",
			class MockWorker {
				postMessage = mockPostMessage;
				terminate = mockTerminate;
				addEventListener(event: string, handler: () => void) {
					if (event === "message") messageHandler = handler;
				}
				removeEventListener() {}
			},
		);

		const { detectInWorker, terminateDetectionWorker } = await import(
			"@/lib/layout-detection/worker-wrapper.ts"
		);

		// Create the worker by calling detectInWorker
		const image = {
			data: new Uint8ClampedArray(4),
			width: 1,
			height: 1,
		};
		const promise = detectInWorker(image, 0);
		await flushMicrotasks();
		const nonce = mockPostMessage.mock.calls[0][0].nonce;
		messageHandler?.({
			data: { regions: [], pageIndex: 0, nonce },
		} as MessageEvent);
		await promise;

		// Now terminate
		terminateDetectionWorker();
		expect(mockTerminate).toHaveBeenCalledOnce();
	});

	it("resolves pending promise when terminated during in-flight request", async () => {
		const mockPostMessage = vi.fn();

		vi.stubGlobal(
			"Worker",
			class MockWorker {
				postMessage = mockPostMessage;
				terminate = vi.fn();
				addEventListener() {}
				removeEventListener() {}
			},
		);

		const { detectInWorker, terminateDetectionWorker } = await import(
			"@/lib/layout-detection/worker-wrapper.ts"
		);

		const image = {
			data: new Uint8ClampedArray(4),
			width: 1,
			height: 1,
		};

		// Start a detection — don't resolve it via message handler
		const promise = detectInWorker(image, 0);
		await flushMicrotasks();

		// Terminate while in-flight
		terminateDetectionWorker();

		// The pending promise should resolve (not hang)
		const result = await promise;
		expect(result.error).toBe("Worker terminated");
		expect(result.regions).toEqual([]);
	});

	it("allows a new worker to be created after terminate", async () => {
		let messageHandler: ((e: MessageEvent) => void) | null = null;
		let constructorCallCount = 0;
		const mockPostMessage = vi.fn();

		vi.stubGlobal(
			"Worker",
			class MockWorker {
				postMessage = mockPostMessage;
				terminate = vi.fn();
				constructor() {
					constructorCallCount++;
				}
				addEventListener(event: string, handler: () => void) {
					if (event === "message") messageHandler = handler;
				}
				removeEventListener() {}
			},
		);

		const { detectInWorker, terminateDetectionWorker } = await import(
			"@/lib/layout-detection/worker-wrapper.ts"
		);

		// First call creates worker #1
		const image1 = {
			data: new Uint8ClampedArray(4),
			width: 1,
			height: 1,
		};
		const promise1 = detectInWorker(image1, 0);
		await flushMicrotasks();
		const nonce1 = mockPostMessage.mock.calls[0][0].nonce;
		messageHandler?.({
			data: { regions: [], pageIndex: 0, nonce: nonce1 },
		} as MessageEvent);
		await promise1;

		expect(constructorCallCount).toBe(1);

		// Terminate
		terminateDetectionWorker();

		// Second call creates worker #2
		const image2 = {
			data: new Uint8ClampedArray(4),
			width: 1,
			height: 1,
		};
		const promise2 = detectInWorker(image2, 1);
		await flushMicrotasks();
		const nonce2 = mockPostMessage.mock.calls[1][0].nonce;
		messageHandler?.({
			data: { regions: [], pageIndex: 1, nonce: nonce2 },
		} as MessageEvent);
		await promise2;

		expect(constructorCallCount).toBe(2);
	});
});
