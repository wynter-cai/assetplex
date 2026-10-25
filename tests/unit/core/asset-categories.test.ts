/**
 * 资产类别声明源测试
 *
 * spec: asset-center-consistency（Scenario 1 新增类别只改一处）
 * 关联: fix-trust-and-consistency proposal D5
 *
 * 声明源是资产中心类别的唯一真相：侧栏、首页快照、类别筛选、
 * 类别页页头都从这里派生，禁止前端再维护第二份独立清单。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ASSET_CATEGORIES,
  getAssetCategory,
  getAssetCategoryCodes,
  isAssetCategory,
} from '../../../src/core/asset-categories.js';

/** 前端 fallback 常量文件（首屏渲染用，接口返回后覆盖） */
const WEB_FALLBACK_FILE = resolve(process.cwd(), 'web/src/config/asset-categories.ts');

interface WebFallbackEntry {
  code: string;
  label: string;
  description: string;
  order: number;
  external: boolean;
}

/** 解析前端 fallback 清单（仅取同名字段，图标由 code 映射不参与比对） */
function parseWebFallback(): WebFallbackEntry[] {
  const source = readFileSync(WEB_FALLBACK_FILE, 'utf-8');
  const pattern = /\{\s*code:\s*'([^']+)',\s*label:\s*'([^']+)',\s*description:\s*'([^']+)'[\s\S]*?order:\s*(\d+)([\s\S]*?)\}/g;
  const entries: WebFallbackEntry[] = [];
  for (const match of source.matchAll(pattern)) {
    entries.push({
      code: match[1],
      label: match[2],
      description: match[3],
      order: Number(match[4]),
      external: match[5].includes('external: true'),
    });
  }
  return entries;
}

describe('资产类别声明源', () => {
  it('覆盖资产中心可见的 6 类且 code 唯一', () => {
    expect(ASSET_CATEGORIES).toHaveLength(6);
    const codes = ASSET_CATEGORIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(6);
    expect(codes).toEqual(['identity', 'skill', 'rule', 'mcp', 'agent', 'criteria']);
  });

  it('每类八个字段齐全且取值合法', () => {
    for (const category of ASSET_CATEGORIES) {
      expect(category.label.trim(), `${category.code}.label`).not.toBe('');
      expect(category.description.trim(), `${category.code}.description`).not.toBe('');
      expect(category.hubDir.trim(), `${category.code}.hubDir`).not.toBe('');
      expect(Number.isInteger(category.order), `${category.code}.order`).toBe(true);
      expect(category.order).toBeGreaterThan(0);
      expect(typeof category.external, `${category.code}.external`).toBe('boolean');
      expect(typeof category.syncable, `${category.code}.syncable`).toBe('boolean');
      expect(typeof category.doctorSupported, `${category.code}.doctorSupported`).toBe('boolean');
      // 不得把 code 直接当显示名（漏翻检查）；MCP 这类专有名词允许全大写
      expect(category.label).not.toBe(category.code);
      expect(category.description).toMatch(/[\u4e00-\u9fa5]/);
    }
  });

  it('按 order 升序且 order 不重复', () => {
    const orders = ASSET_CATEGORIES.map((c) => c.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('与前端 fallback 清单逐字段一致（防两份清单继续漂移）', () => {
    const fallback = parseWebFallback();
    expect(fallback).toHaveLength(ASSET_CATEGORIES.length);
    for (const category of ASSET_CATEGORIES) {
      const own = fallback.find((entry) => entry.code === category.code);
      expect(own, `前端 fallback 缺少 ${category.code}`).toBeDefined();
      expect(own?.label).toBe(category.label);
      expect(own?.description).toBe(category.description);
      expect(own?.order).toBe(category.order);
      expect(own?.external).toBe(category.external);
    }
  });

  it('供数方式与能力位贴合现状', () => {
    // 技能 / 智能体 / 准则由专用接口供数，不走 /api/assets
    expect(getAssetCategory('skill')?.external).toBe(true);
    expect(getAssetCategory('agent')?.external).toBe(true);
    expect(getAssetCategory('criteria')?.external).toBe(true);
    // 其余三类是 Hub 目录直读
    expect(getAssetCategory('identity')?.external).toBe(false);
    expect(getAssetCategory('rule')?.external).toBe(false);
    expect(getAssetCategory('mcp')?.external).toBe(false);
    // 准则不参与分发（只用于仲裁与诊断），也不在资产医生范围
    expect(getAssetCategory('criteria')?.syncable).toBe(false);
    expect(getAssetCategory('criteria')?.doctorSupported).toBe(false);
  });

  it('查询函数与类型守卫行为明确', () => {
    expect(getAssetCategoryCodes()).toEqual(['identity', 'skill', 'rule', 'mcp', 'agent', 'criteria']);
    expect(getAssetCategory('skill')?.hubDir).toBe('skills');
    expect(getAssetCategory('memory')).toBeUndefined();
    expect(getAssetCategory('nope')).toBeUndefined();
    expect(isAssetCategory('identity')).toBe(true);
    expect(isAssetCategory('memory')).toBe(false);
  });

  it('声明源不可被运行时改写', () => {
    expect(Object.isFrozen(ASSET_CATEGORIES)).toBe(true);
    for (const category of ASSET_CATEGORIES) {
      expect(Object.isFrozen(category)).toBe(true);
    }
  });
});
