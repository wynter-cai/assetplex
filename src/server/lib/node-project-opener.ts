/**
 * 项目快捷打开执行器（本机操作）
 *
 * 调用方（路由）必须先用 validateOpenRequest 做路径白名单校验，
 * 本文件只负责在本机以 explorer / terminal / ide 三种方式启动进程。
 * 子进程 detached 后立即 unref，不阻塞 HTTP 服务。
 */

import { spawn } from 'node:child_process';
import type { OpenTarget } from '../../core/projects.js';

export type ProjectOpener = (absolutePath: string, target: OpenTarget) => void;

function launch(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

/** PowerShell 单引号转义（路径已在扫描白名单内，仍做防御性处理） */
function psQuote(path: string): string {
  return `'${path.replace(/'/g, "''")}'`;
}

export const nodeProjectOpener: ProjectOpener = (absolutePath, target) => {
  if (process.platform === 'win32') {
    if (target === 'explorer') {
      // explorer 的返回码非 0 属正常现象，无需 await
      launch('explorer.exe', [absolutePath]);
      return;
    }
    if (target === 'terminal') {
      launch('powershell.exe', ['-NoExit', '-Command', `Set-Location -LiteralPath ${psQuote(absolutePath)}`]);
      return;
    }
    // ide：本机无 TRAE CLI（PATH 上不存在 trae/trae-cn），统一走 VS Code CLI
    launch('cmd.exe', ['/c', 'start', '', 'code', absolutePath]);
    return;
  }

  if (target === 'explorer') {
    launch(process.platform === 'darwin' ? 'open' : 'xdg-open', [absolutePath]);
  } else if (target === 'terminal') {
    launch('x-terminal-emulator', [absolutePath]);
  } else {
    launch('code', [absolutePath]);
  }
};
