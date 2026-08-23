/**
 * assetplex ui 命令实现
 *
 * 启动 Web UI HTTP 服务，并自动打开浏览器。
 */

import { startServer } from '../../server/index.js';
import { log } from '../../utils/logger.js';

export interface UiOptions {
  /** 端口号 */
  port?: number;
  /** 监听地址 */
  host?: string;
  /** 不自动打开浏览器 */
  noOpen?: boolean;
}

export async function uiCommand(opts: UiOptions): Promise<void> {
  log.info('启动 AssetPlex Web UI...');
  await startServer({
    port: opts.port ?? 17521,
    host: opts.host ?? '127.0.0.1',
    openBrowser: !opts.noOpen,
  });
}
