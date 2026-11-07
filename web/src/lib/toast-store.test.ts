/**
 * toast store 测试（fix-ui-trust-gaps T4）
 *
 * spec: feedback-toast.spec.md
 * 成功 3s / 错误 6s 长驻、同内容去重、队列上限、手动移除。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore, toast, DEFAULT_DURATION, ACTION_MIN_DURATION } from './toast-store';

beforeEach(() => {
  useToastStore.getState().reset();
});

describe('toast store', () => {
  it('success/info/error 三态入队，错误态停留更久（6s > 成功 3s）', () => {
    toast.success('已保存');
    toast.info('提示');
    toast.error('失败了');

    const items = useToastStore.getState().toasts;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ variant: 'success', title: '已保存', duration: DEFAULT_DURATION.success });
    expect(items[2]).toMatchObject({ variant: 'error', title: '失败了', duration: 6000 });
    expect(DEFAULT_DURATION.error).toBeGreaterThan(DEFAULT_DURATION.success);
  });

  it('错误原因与批量明细可携带', () => {
    toast.error('批量收藏失败', { description: '2 个项目未成功', details: ['a：冲突', 'b：404'] });
    const item = useToastStore.getState().toasts[0];
    expect(item.description).toBe('2 个项目未成功');
    expect(item.details).toEqual(['a：冲突', 'b：404']);
  });

  it('同变体同标题同描述的 toast 去重（刷新而非堆叠）', () => {
    toast.success('已保存');
    toast.success('已保存');
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('描述不同时不被误去重', () => {
    toast.error('操作失败', { description: '超时' });
    toast.error('操作失败', { description: '404' });
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it('dismiss 按 id 移除单条', () => {
    const id = toast.info('x');
    toast.success('y');
    useToastStore.getState().dismiss(id);
    const titles = useToastStore.getState().toasts.map((t) => t.title);
    expect(titles).toEqual(['y']);
  });

  it('队列最多保留 5 条，最新的留下', () => {
    for (let i = 0; i < 8; i++) toast.info(`msg-${i}`);
    const items = useToastStore.getState().toasts;
    expect(items).toHaveLength(5);
    expect(items[items.length - 1].title).toBe('msg-7');
    expect(items[0].title).toBe('msg-3');
  });

  it('每条 toast 有唯一 id', () => {
    const a = toast.success('a');
    const b = toast.success('b');
    expect(a).not.toBe(b);
  });
});

/** spec inline-function-confirm「契约」：带 action 的 toast 至少存活 30 秒 */
describe('toast 动作按钮（撤销）', () => {
  it('带 action 且未传 duration → 至少 30 秒，不受默认 3 秒影响', () => {
    toast.success('已改为 数据处理', { action: { label: '撤销', onClick: () => {} } });
    const item = useToastStore.getState().toasts[0];
    expect(item.duration).toBe(ACTION_MIN_DURATION);
    expect(ACTION_MIN_DURATION).toBeGreaterThanOrEqual(30000);
  });

  it('带 action 但传了更短的 duration → 仍取 30 秒下限', () => {
    toast.success('已改为 数据处理', { duration: 1000, action: { label: '撤销', onClick: () => {} } });
    expect(useToastStore.getState().toasts[0].duration).toBe(ACTION_MIN_DURATION);
  });

  it('带 action 且传了更长的 duration → 尊重更长时间', () => {
    toast.success('已改为 数据处理', { duration: 60000, action: { label: '撤销', onClick: () => {} } });
    expect(useToastStore.getState().toasts[0].duration).toBe(60000);
  });

  it('action 随 toast 携带，点击回调可执行', () => {
    const onClick = vi.fn();
    toast.success('已改为 数据处理', { action: { label: '撤销', onClick } });
    const item = useToastStore.getState().toasts[0];
    expect(item.action?.label).toBe('撤销');
    item.action?.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('无 action 仍走默认时长（成功 3 秒）', () => {
    toast.success('已保存');
    expect(useToastStore.getState().toasts[0].duration).toBe(DEFAULT_DURATION.success);
  });
});
