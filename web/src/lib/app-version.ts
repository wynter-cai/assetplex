/**
 * 应用版本号——唯一来源是 web/package.json，通过 vite define 注入。
 * 界面（侧栏、设置页）一律从此处取，不再散落硬编码。
 */
export const APP_VERSION: string = __APP_VERSION__;
