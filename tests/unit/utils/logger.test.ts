import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { log, setLogLevel, getLogLevel } from '../../../src/utils/logger.js';
import type { LogLevel } from '../../../src/utils/logger.js';

describe('logger', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalLevel: LogLevel;

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalLevel = getLogLevel();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    setLogLevel(originalLevel);
  });

  describe('setLogLevel / getLogLevel', () => {
    it('设置并返回当前日志级别', () => {
      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');

      setLogLevel('error');
      expect(getLogLevel()).toBe('error');
    });
  });

  describe('log levels', () => {
    it('debug 级别时输出所有日志', () => {
      setLogLevel('debug');
      const logSpy = vi.fn();
      const warnSpy = vi.fn();
      const errSpy = vi.fn();
      console.log = logSpy;
      console.warn = warnSpy;
      console.error = errSpy;

      log.debug('debug msg');
      log.info('info msg');
      log.success('success msg');
      log.warn('warn msg');
      log.error('error msg');

      expect(errSpy).toHaveBeenCalled(); // debug 用 console.error
      expect(logSpy).toHaveBeenCalledTimes(2); // info + success
      expect(warnSpy).toHaveBeenCalled(); // warn
      // debug + error 都用 console.error
      expect(errSpy).toHaveBeenCalledTimes(2);
    });

    it('error 级别时只输出 error 日志', () => {
      setLogLevel('error');
      const logSpy = vi.fn();
      const warnSpy = vi.fn();
      const errSpy = vi.fn();
      console.log = logSpy;
      console.warn = warnSpy;
      console.error = errSpy;

      log.debug('debug msg');
      log.info('info msg');
      log.success('success msg');
      log.warn('warn msg');
      log.error('error msg');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledTimes(1);
    });

    it('info 级别时不输出 debug', () => {
      setLogLevel('info');
      const errSpy = vi.fn();
      console.error = errSpy;

      log.debug('debug msg');

      expect(errSpy).not.toHaveBeenCalled();
    });

    it('success 级别在 info 之上输出', () => {
      setLogLevel('info');
      const logSpy = vi.fn();
      console.log = logSpy;

      log.success('done');

      expect(logSpy).toHaveBeenCalledTimes(1);
    });

    it('warn 级别在 info 之上输出', () => {
      setLogLevel('info');
      const warnSpy = vi.fn();
      console.warn = warnSpy;

      log.warn('warning');

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('log.raw', () => {
    it('直接输出（不受 level 控制）', () => {
      setLogLevel('error');
      const logSpy = vi.fn();
      console.log = logSpy;

      log.raw('raw message');

      expect(logSpy).toHaveBeenCalledTimes(1);
    });
  });
});
