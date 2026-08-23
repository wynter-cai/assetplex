/**
 * 终端日志工具（chalk 跨平台彩色输出）
 */

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  success: 25,
  warn: 30,
  error: 40,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[currentLevel];
}

export const log = {
  debug(msg: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.error(chalk.gray(`[debug] ${msg}`), ...args);
    }
  },
  info(msg: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(chalk.cyan(msg), ...args);
    }
  },
  success(msg: string, ...args: unknown[]): void {
    if (shouldLog('success')) {
      console.log(chalk.green(`✓ ${msg}`), ...args);
    }
  },
  warn(msg: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(chalk.yellow(`! ${msg}`), ...args);
    }
  },
  error(msg: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(chalk.red(`✗ ${msg}`), ...args);
    }
  },
  raw(msg: string, ...args: unknown[]): void {
    console.log(msg, ...args);
  },
};
