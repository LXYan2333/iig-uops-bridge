import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Prefer an explicitly configured or installed system browser; otherwise use Playwright's download.
const chromiumPath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1,
  use: { viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { executablePath: chromiumPath, args: ['--no-sandbox'] } } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});
