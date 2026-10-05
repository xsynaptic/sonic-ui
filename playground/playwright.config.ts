import { defineConfig, devices } from '@playwright/test';

const port = 4331;

export default defineConfig({
	forbidOnly: true,
	fullyParallel: true,
	outputDir: './temp/playwright-results',
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
		{ name: 'mobile-webkit', use: { ...devices['iPhone 17'] } },
	],
	reporter: [['list'], ['html', { open: 'never', outputFolder: './temp/playwright-report' }]],
	retries: 0,
	testDir: './e2e',
	use: {
		baseURL: `http://localhost:${String(port)}`,
		trace: 'off',
	},
	// Astro 7 daemonizes preview when it detects an agent; `--ignore-lock` leaves a running preview alone
	// Never reused: a preview from another checkout on this port would serve its own build
	webServer: {
		command: `astro preview --port ${String(port)} --ignore-lock`,
		env: { ASTRO_PREVIEW_BACKGROUND: '0' },
		reuseExistingServer: false,
		url: `http://localhost:${String(port)}/fixtures/`,
	},
	workers: 4,
});
