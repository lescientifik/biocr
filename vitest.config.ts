import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	esbuild: {
		jsx: "automatic",
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					environment: "happy-dom",
					include: ["tests/unit/**/*.test.{ts,tsx}"],
					setupFiles: ["tests/unit/setup.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "browser",
					include: ["tests/browser/**/*.test.{ts,tsx}"],
					browser: {
						enabled: true,
						provider: "playwright",
						headless: true,
						instances: [{ browser: "chromium" }],
					},
					testTimeout: 30000,
				},
			},
		],
	},
});
