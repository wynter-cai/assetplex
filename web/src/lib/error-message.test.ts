/**
 * errorMessage 工具测试（fix-ui-trust-gaps T8）
 */

import { describe, it, expect } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('Error 实例取 message', () => {
    expect(errorMessage(new Error('HTTP 500'))).toBe('HTTP 500');
  });

  it('字符串抛出原样返回', () => {
    expect(errorMessage('boom')).toBe('boom');
  });

  it('null / 普通对象 / 空消息走兜底文案', () => {
    expect(errorMessage(null)).toBe('操作失败，请稍后重试');
    expect(errorMessage({ code: 500 })).toBe('操作失败，请稍后重试');
    expect(errorMessage(new Error('   '))).toBe('操作失败，请稍后重试');
  });

  it('支持自定义兜底文案', () => {
    expect(errorMessage(undefined, '保存失败，请稍后重试')).toBe('保存失败，请稍后重试');
  });
});
