/**
 * 环境变量插值器
 *
 * 把字符串中的 ${VAR} 替换为 process.env.VAR 的实际值。
 *
 * 主要场景：WorkBuddy 的 .mcp.json 支持 ${VAR} 语法引用环境变量，
 * Hub 单源不能硬编码 secret，必须在同步时插值。
 *
 * 反向导入时用 desinterpolateEnv 把实际值替换回 ${VAR}，
 * 但需要 envMap 提供 actual_value → VAR_NAME 的映射。
 */

const ENV_VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export interface InterpolateOptions {
  /** 自定义环境变量来源（默认 process.env） */
  env?: Record<string, string | undefined>;
  /** 严格模式：缺失变量时抛错（默认 false，缺失变量保留原样） */
  strict?: boolean;
}

export interface InterpolateResult {
  /** 插值后的字符串 */
  output: string;
  /** 缺失的环境变量名列表 */
  missing: string[];
  /** 替换的变量名列表 */
  replaced: string[];
}

/**
 * 把字符串中的 ${VAR} 替换为 process.env.VAR
 *
 * 找不到的环境变量默认保留原样，并加入 missing 列表
 */
export function interpolateEnv(
  input: string,
  options: InterpolateOptions = {},
): InterpolateResult {
  const env = options.env ?? process.env;
  const strict = options.strict ?? false;

  const missing = new Set<string>();
  const replaced = new Set<string>();

  const output = input.replace(ENV_VAR_PATTERN, (match, varName: string) => {
    const value = env[varName];
    if (value === undefined || value === '') {
      if (strict) {
        throw new Error(`环境变量缺失: ${varName}`);
      }
      missing.add(varName);
      return match; // 保留原样
    }
    replaced.add(varName);
    return value;
  });

  return {
    output,
    missing: Array.from(missing),
    replaced: Array.from(replaced),
  };
}

/**
 * 反向：把实际值替换回 ${VAR}
 *
 * 通过 envMap: { "actual_value": "VAR_NAME" } 反查
 *
 * 例：envMap = { "/Users/caiwe": "HOME" }
 *   输入 "/Users/caiwe/.mcp" → "${HOME}/.mcp"
 */
export function desinterpolateEnv(
  input: string,
  envMap: Record<string, string>,
): string {
  let result = input;
  // 按值长度倒序排序，避免短前缀先匹配
  const sortedValues = Object.keys(envMap).sort((a, b) => b.length - a.length);
  for (const value of sortedValues) {
    if (!value) continue;
    const varName = envMap[value];
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), `\${${varName}}`);
  }
  return result;
}

/**
 * 从字符串中提取所有 ${VAR} 引用的变量名
 */
export function extractEnvVars(input: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(ENV_VAR_PATTERN.source, 'g');
  while ((match = pattern.exec(input)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}

/**
 * 构建 desinterpolateEnv 所需的 envMap
 *
 * @param varNames 需要反查的环境变量名列表
 * @param env 环境变量来源（默认 process.env）
 * @returns { actualValue: varName } 映射
 */
export function buildEnvMap(
  varNames: string[],
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const name of varNames) {
    const value = env[name];
    if (value) {
      map[value] = name;
    }
  }
  return map;
}
