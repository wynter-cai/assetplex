import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn 合并（字号档位与颜色不互相覆盖）', () => {
  it('数字字号不会挤掉主按钮的白色前景色', () => {
    const merged = cn('bg-primary text-primary-foreground', 'text-14 font-semibold');
    expect(merged).toContain('text-primary-foreground');
    expect(merged).toContain('text-14');
  });

  it('数字字号仍能覆盖默认 text-sm', () => {
    expect(cn('text-sm', 'text-13')).toBe('text-13');
  });

  it('颜色类之间仍按后者覆盖', () => {
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground');
  });
});
