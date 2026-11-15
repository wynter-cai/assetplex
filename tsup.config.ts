import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

/** 规则集唯一定义位置（设计文档/changes/add-diagnosis-rules）：构建时复制进 dist 随包分发 */
const RULES_SOURCE = '设计文档/changes/add-diagnosis-rules/diagnosis-rules.yaml';
const RULES_TARGET = 'dist/diagnosis-rules.yaml';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  onSuccess: async () => {
    mkdirSync(resolve('dist'), { recursive: true });
    copyFileSync(resolve(RULES_SOURCE), resolve(RULES_TARGET));
  },
});
