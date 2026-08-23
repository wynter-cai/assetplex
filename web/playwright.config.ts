import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright E2E 配置。
 *
 * 测试依赖一个运行中的 AssetPlex 服务（提供后端 API 与前端静态产物）。
 * 通过 webServer 自动启动 `npm run e2e:server`（见根 package.json），
 * 服务就绪后再跑测试；若端口已被占用（例如你已经在本地启动了服务），
 * Playwright 会直接复用该实例（reuseExistingServer）。
 */
const PORT = process.env.E2E_PORT ?? '17521';
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // 不使用持久化缓存，避免前端改了 JS hash 后仍命中旧缓存
    bypassCSP: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'node ../dist/index.js ui',
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
