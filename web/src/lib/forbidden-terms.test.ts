import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_TERMS,
  findForbiddenInSource,
  isHubMisuse,
  stripLeadingComment,
} from './forbidden-terms';

describe('forbidden-terms 识别能力', () => {
  it('清单覆盖 D7 全部禁用词', () => {
    expect(FORBIDDEN_TERMS).toEqual(
      expect.arrayContaining(['保险箱', '沉淀', '分发', '投放', '入库']),
    );
  });

  it('用户可见文案里的禁词逐个命中', () => {
    expect(findForbiddenInSource('应用并分发').map((h) => h.term)).toContain('分发');
    expect(findForbiddenInSource('一键投放到目标工具').map((h) => h.term)).toContain('投放');
    expect(findForbiddenInSource('确认入库').map((h) => h.term)).toContain('入库');
    expect(findForbiddenInSource('沉淀你的资产').map((h) => h.term)).toContain('沉淀');
    expect(findForbiddenInSource('AI 资产保险箱').map((h) => h.term)).toContain('保险箱');
  });

  it('「分发」同时覆盖「分发同步」「未分发」', () => {
    expect(findForbiddenInSource('分发同步中').length).toBeGreaterThan(0);
    expect(findForbiddenInSource('未分发').map((h) => h.term)).toContain('分发');
  });

  it('放行合规文案', () => {
    expect(findForbiddenInSource('立即同步')).toEqual([]);
    expect(findForbiddenInSource('从工具收藏到我的库')).toEqual([]);
    expect(findForbiddenInSource('本工具按项目同步')).toEqual([]);
  });
});

describe('Hub 仅在同义表达时判禁', () => {
  it('中文同句出现 Hub 判为误用', () => {
    expect(isHubMisuse('导入到 Hub')).toBe(true);
    expect(isHubMisuse('Hub 中尚无资产')).toBe(true);
  });

  it('纯代码标识不判为误用', () => {
    expect(isHubMisuse('hubTargetPath')).toBe(false);
    expect(isHubMisuse('const x = myHub;')).toBe(false);
    expect(isHubMisuse('HubProvider')).toBe(false);
    expect(isHubMisuse('return the hub')).toBe(false);
  });
});

describe('注释豁免', () => {
  it('行首注释剥离后不参与扫描', () => {
    expect(stripLeadingComment('   // 分发索引')).toBe('');
    expect(stripLeadingComment('  /** 造分发索引条目 */')).toBe('');
    expect(stripLeadingComment(' * 分发管理弹窗')).toBe('');
    expect(findForbiddenInSource('  // 分发索引里该资产').length).toBe(0);
  });

  it('真实代码行不被误剥', () => {
    expect(stripLeadingComment('  分发管理:')).not.toBe('');
  });

  it('JSX 单行注释 {/* … *\/} 同属豁免', () => {
    expect(stripLeadingComment('  {/* 分发管理对话框 */}')).toBe('');
    expect(findForbiddenInSource('  {/* 右侧：Hub 文件 */}').length).toBe(0);
  });
});
