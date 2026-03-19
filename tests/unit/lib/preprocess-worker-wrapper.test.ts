import type { ImageBuffer } from "@/types/index.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Helper: creates a small RGBA ImageBuffer.
 */
function makeImageBuffer(
	width: number,
	height: number,
	value: number,
): ImageBuffer {
	const data = new Uint8ClampedArray(width * height * 4);
	data.fill(value);
	return { data, width, height };
}

/**
 * Flush the microtask queue so that the promise chain inside
 * preprocessInWorker advances to the callWorker stage.
 */
async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("preprocessInWorker", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("when Worker API is available", () => {
		it("returns a preprocessed ImageBuffer via the worker", async () => {
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

			const { preprocessInWorker } = await import(
				"@/lib/preprocessing/worker-wrapper.ts"
			);

			const input = makeImageBuffer(1, 1, 10);
			const promise = preprocessInWorker(input);

			// Let the chain advance so callWorker registers its handlers
			await flushMicrotasks();

			// Simulate worker response
			const processed = makeImageBuffer(1, 1, 50);
			messageHandler?.({
				data: { image: processed, warnings: [] },
			} as MessageEvent);

			const result = await promise;
			expect(result).toEqual(processed);
		});

		it("passes estimatedDPI in the message to the worker", async () => {
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

			const { preprocessInWorker } = await import(
				"@/lib/preprocessing/worker-wrapper.ts"
			);

			const input = makeImageBuffer(1, 1, 10);
			const promise = preprocessInWorker(input, { estimatedDPI: 300 });

			// Let the chain advance
			await flushMicrotasks();

			// Verify the postMessage was called with the correct payload
			expect(mockPostMessage).toHaveBeenCalledOnce();
			const [payload] = mockPostMessage.mock.calls[0];
			expect(payload).toEqual({
				image: input,
				options: { estimatedDPI: 300 },
			});

			// Resolve the promise so it doesn't hang
			const processed = makeImageBuffer(1, 1, 50);
			messageHandler?.({
				data: { image: processed, warnings: [] },
			} as MessageEvent);
			await promise;
		});

		it("throws if worker responds with error (so coordinator onWarning fires)", async () => {
			let messageHandler: ((e: MessageEvent) => void) | null = null;

			vi.stubGlobal(
				"Worker",
				class MockWorker {
					postMessage = vi.fn();
					addEventListener(event: string, handler: () => void) {
						if (event === "message") messageHandler = handler;
					}
					removeEventListener() {}
					terminate() {}
				},
			);

			const { preprocessInWorker } = await import(
				"@/lib/preprocessing/worker-wrapper.ts"
			);

			const input = makeImageBuffer(1, 1, 10);
			const promise = preprocessInWorker(input);

			await flushMicrotasks();

			// Simulate worker error response
			messageHandler?.({
				data: { error: "Something went wrong" },
			} as MessageEvent);

			await expect(promise).rejects.toThrow("Something went wrong");
		});

		it("reuses the same Worker instance across calls (singleton)", async () => {
			let messageHandler: ((e: MessageEvent) => void) | null = null;
			let constructorCallCount = 0;

			vi.stubGlobal(
				"Worker",
				class MockWorker {
					postMessage = vi.fn();
					constructor() {
						constructorCallCount++;
					}
					addEventListener(event: string, handler: () => void) {
						if (event === "message") messageHandler = handler;
					}
					removeEventListener() {}
					terminate() {}
				},
			);

			const { preprocessInWorker } = await import(
				"@/lib/preprocessing/worker-wrapper.ts"
			);

			// First call
			const input1 = makeImageBuffer(1, 1, 10);
			const promise1 = preprocessInWorker(input1);
			await flushMicrotasks();
			messageHandler?.({
				data: { image: input1, warnings: [] },
			} as MessageEvent);
			await promise1;

			// Second call
			const input2 = makeImageBuffer(1, 1, 20);
			const promise2 = preprocessInWorker(input2);
			await flushMicrotasks();
			messageHandler?.({
				data: { image: input2, warnings: [] },
			} as MessageEvent);
			await promise2;

			// Worker constructor should only have been called once
			expect(constructorCallCount).toBe(1);
		});

		it("throws if worker fires error event (so coordinator onWarning fires)", async () => {
			let errorHandler: ((e: ErrorEvent) => void) | null = null;

			vi.stubGlobal(
				"Worker",
				class MockWorker {
					postMessage = vi.fn();
					addEventListener(event: string, handler: () => void) {
						if (event === "error") errorHandler = handler;
					}
					removeEventListener() {}
					terminate() {}
				},
			);

			const { preprocessInWorker } = await import(
				"@/lib/preprocessing/worker-wrapper.ts"
			);

			const input = makeImageBuffer(1, 1, 10);
			const promise = preprocessInWorker(input);

			await flushMicrotasks();

			// Simulate ErrorEvent
			errorHandler?.({ message: "Worker crashed" } as ErrorEvent);

			await expect(promise).rejects.toThrow("Worker crashed");
		});

		it("throws on worker timeout (so coordinator onWarning fires)", async () => {
			vi.useFakeTimers();

			vi.stubGlobal(
				"Worker",
				class MockWorker {
					postMessage = vi.fn();
					addEventListener() {}
					removeEventListener() {}
					terminate() {}
				},
			);

			const { preprocessInWorker } = await import(
				"@/lib/preprocessing/worker-wrapper.ts"
			);

			const input = makeImageBuffer(2, 2, 42);

			// Start the call and immediately attach a catch to prevent unhandled rejection
			const promise = preprocessInWorker(input);
			// Capture the error without letting it become unhandled
			let caught: Error | undefined;
			const handled = promise.catch((e) => {
				caught = e as Error;
			});

			// Advance past the 30s timeout
			await vi.advanceTimersByTimeAsync(30_000);
			await handled;

			expect(caught).toBeDefined();
			expect(caught?.message).toBe("Worker preprocessing timeout");

			vi.useRealTimers();
		});
	});

	describe("when Worker API is absent", () => {
		it("falls back to main-thread preprocessing", async () => {
			vi.stubGlobal("Worker", undefined);

			const mockPipeline = vi.fn().mockReturnValue({
				image: makeImageBuffer(1, 1, 99),
				warnings: [],
			});

			vi.doMock("@/lib/preprocessing/pipeline.ts", () => ({
				preprocessingPipeline: mockPipeline,
			}));

			const { preprocessInWorker } = await import(
				"@/lib/preprocessing/worker-wrapper.ts"
			);

			const input = makeImageBuffer(1, 1, 10);
			const result = await preprocessInWorker(input, {
				estimatedDPI: 200,
			});

			expect(mockPipeline).toHaveBeenCalledWith(input, {
				estimatedDPI: 200,
			});
			expect(result).toEqual(makeImageBuffer(1, 1, 99));
		});
	});
});

describe("terminatePreprocessWorker", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("terminates and clears the singleton worker", async () => {
		let messageHandler: ((e: MessageEvent) => void) | null = null;
		const mockTerminate = vi.fn();

		vi.stubGlobal(
			"Worker",
			class MockWorker {
				postMessage = vi.fn();
				terminate = mockTerminate;
				addEventListener(event: string, handler: () => void) {
					if (event === "message") messageHandler = handler;
				}
				removeEventListener() {}
			},
		);

		const { preprocessInWorker, terminatePreprocessWorker } = await import(
			"@/lib/preprocessing/worker-wrapper.ts"
		);

		// Create the worker by calling preprocessInWorker
		const input = makeImageBuffer(1, 1, 10);
		const promise = preprocessInWorker(input);
		await Promise.resolve();
		await Promise.resolve();
		messageHandler?.({
			data: { image: input, warnings: [] },
		} as MessageEvent);
		await promise;

		// Now terminate
		terminatePreprocessWorker();
		expect(mockTerminate).toHaveBeenCalledOnce();
	});

	it("does nothing if no worker was created", async () => {
		vi.stubGlobal(
			"Worker",
			class MockWorker {
				postMessage = vi.fn();
				terminate = vi.fn();
				addEventListener() {}
				removeEventListener() {}
			},
		);

		const { terminatePreprocessWorker } = await import(
			"@/lib/preprocessing/worker-wrapper.ts"
		);

		// Should not throw
		expect(() => terminatePreprocessWorker()).not.toThrow();
	});
});
