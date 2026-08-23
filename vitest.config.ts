import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/cli/**',
        // 纯类型文件无运行时逻辑，不计入覆盖率
        'src/**/types.ts',
        // Stage 2 仅 trae-cn 完成端到端验证；其他 4 个适配器测试留到 Stage 2.5
        'src/core/adapters/claude-code.ts',
        'src/core/adapters/codex.ts',
        'src/core/adapters/qoder.ts',
        'src/core/adapters/workbuddy.ts',
        'src/core/adapters/registry.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
