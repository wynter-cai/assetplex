/**
 * API Contract: refactor-design-system（P1 设计系统立骨）
 *
 * 本变更为纯前端展示层改版（设计令牌/字体/页头/导航/术语/卡片减负），
 * 不新增、不修改、不删除任何后端 API。
 *
 * 后端契约基线以 P0（fix-ui-trust-gaps）交付为准：
 *   - GET /api/hub/overview（hubInitialized 判定放宽 + assetStats 5 类）
 *   - POST /api/tools/:name/toggle | /detect
 *   - 其余既有路由不变
 *
 * 术语统一仅改前端展示文案，不改后端返回的字段值
 * （如 provenance 字段值仍为原始枚举，前端映射为统一术语展示）。
 *
 * 若实施过程中发现必须动后端（预期为零），须先回滚本文件声明、
 * 补齐该契约的类型定义并重新评审。
 */
export {};
