/**
 * AssetPlex Web UI HTTP 服务入口
 *
 * 使用 Hono 框架承载 API 与静态前端资源。
 * 用户运行 `assetplex ui` 后启动此服务，浏览器访问即可。
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { log as appLog } from '../utils/logger.js';
import { hubRoutes } from './routes/hub.js';
import { toolsRoutes } from './routes/tools.js';
import { syncRoutes } from './routes/sync.js';
import { filesRoutes } from './routes/files.js';
import { assetsRoutes } from './routes/assets.js';
import { errorHandler } from './middleware/error.js';

export interface ServerOptions {
  /** 端口号，默认 17521 */
  port?: number;
  /** 监听地址，默认 127.0.0.1（仅本机） */
  host?: string;
  /** 是否自动打开浏览器，默认 true */
  openBrowser?: boolean;
}

/**
 * 启动 Web UI HTTP 服务
 *
 * - /api/* 由 Hono 路由处理
 * - 其他路径由静态文件服务处理（生产环境，前端产物位于 ./web/dist）
 */
export async function startServer(options: ServerOptions = {}): Promise<void> {
  const { port = 17521, host = '127.0.0.1', openBrowser = true } = options;

  const app = new Hono();

  // 中间件
  app.use('*', logger());
  app.use('*', cors({ origin: [`http://localhost:${port}`, `http://${host}:${port}`] }));
  app.use('*', errorHandler);

  // 健康检查
  app.get('/api/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

  // API 路由
  app.route('/api/hub', hubRoutes);
  app.route('/api/tools', toolsRoutes);
  app.route('/api/sync', syncRoutes);
  app.route('/api/files', filesRoutes);
  app.route('/api/assets', assetsRoutes);

  // 静态文件服务（前端构建产物）
  // 开发模式下前端跑在 5173 端口，这里只服务 API；
  // 生产模式下前端产物位于 ./web/dist
  app.use(
    '/*',
    serveStatic({
      root: './web/dist',
      // SPA 回退：非静态资源路径（无文件扩展名）回退到 index.html
      rewriteRequestPath: (path) => {
        // 有文件扩展名的是静态资源（.js, .css, .svg, .ico 等），正常查找
        if (path.includes('.') && !path.endsWith('.html')) {
          return path;
        }
        // 无扩展名的是 SPA 路由，回退到 index.html
        return '/index.html';
      },
    }),
  );

  await serve({ fetch: app.fetch, port, hostname: host });

  appLog.success(`AssetPlex Web UI 运行中: http://${host}:${port}`);
  appLog.info('按 Ctrl+C 停止服务');

  if (openBrowser) {
    try {
      const { default: open } = await import('open');
      await open(`http://${host}:${port}`);
    } catch {
      appLog.warn('自动打开浏览器失败，请手动访问上述地址');
    }
  }

  // 保持进程运行
  return new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      appLog.info('Web UI 已停止');
      resolve();
    });
    process.on('SIGTERM', () => {
      appLog.info('Web UI 已停止');
      resolve();
    });
  });
}
