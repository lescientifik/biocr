/** Trivial echo worker for smoke testing WebWorker support. */
self.onmessage = (e: MessageEvent) => {
	self.postMessage(e.data);
};
