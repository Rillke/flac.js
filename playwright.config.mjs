import { defineConfig, devices } from '@playwright/test';

const PORT = Number( process.env.PORT || 8089 );

// Allows using a pre-installed browser, e.g.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:browser
const chromiumLaunchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?
	{ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } :
	{};

export default defineConfig( {
	testDir: 'test/browser',
	testMatch: '*.spec.mjs',
	timeout: 60000,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? [ [ 'list' ], [ 'github' ] ] : 'list',
	use: {
		baseURL: `http://127.0.0.1:${ PORT }`
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices[ 'Desktop Chrome' ], launchOptions: chromiumLaunchOptions }
		},
		{
			name: 'firefox',
			use: { ...devices[ 'Desktop Firefox' ] }
		},
		{
			name: 'webkit',
			use: { ...devices[ 'Desktop Safari' ] }
		}
	],
	webServer: {
		command: `node test/server.mjs ${ PORT }`,
		url: `http://127.0.0.1:${ PORT }/iframe.html`,
		reuseExistingServer: !process.env.CI
	}
} );
