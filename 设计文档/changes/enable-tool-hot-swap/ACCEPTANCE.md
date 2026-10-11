# enable-tool-hot-swap 验收记录（T10）

> 验收日期：2026-10-11　方式：全量测试/构建 + 真实端到端回环（workbuddy，可逆）+ Invoke-WebRequest 五端点核实 + spec 场景逐条回环 + grep 外发自查
> 结论：**T10 六条全部通过，变更 enable-tool-hot-swap（T1-T10）施工完成；暂未 git commit（待维护者发话）**

## 1. 测试与构建基线

| 项 | 结果 | 基线对比 |
|---|---|---|
| 后端 vitest | 568 全绿 | 基线 520 → 只增不减（+48，含本轮空目录残留回归 1 项） |
| 前端 vitest | 156 全绿 | 基线 148 → 只增不减（+8，Swap 页） |
| 后端 tsc -b | 0 错误 | ✓ |
| 前端 tsc -b | 0 错误 | ✓ |
| tsup build | 通过（dist/index.js ≈257KB） | ✓ |
| vite build | 通过（仅既有 chunk 大小告警） | ✓ |

## 2. 端到端回环（真实 `~/.workbuddy`，全程可逆）

**回环 A（默认不覆盖）**：预览 186 项（六类分组齐全）→ 执行 `written=149 / skipped=37 / failed=0`，149 项回读验证 149/149 全绿；2 个 differs 项（identity/profile.md、skills/demo-assistant/_icon.png）未确认覆盖、保持原样 → 撤销 `removed=149` → 目录快照（89 条目，含内容 sha1）与执行前 **逐条目一致**。

**回环 B（显式覆盖→备份→恢复）**：勾选 differs 项 `identity/profile.md → ~/.workbuddy/IDENTITY.md` 执行 → 目标确被替换（verify: exists/parseable/matchesSource 全过）→ 撤销 `restored=1, removed=149` → 目标文件内容与覆盖前**逐字节一致**。

**备份保留策略**：共发生 4 次切换，`~/.assetplex/.swap-backup/` 实测仅保留最近 3 份（最早一份已被自动清理），历史 4 条全部 `rolledBack: true`。

**发现并修复的缺陷（本轮 TDD 回环）**：逐文件写入时新建的中间目录未记入备份清单，回滚后留下空目录（如 skills/arkcli-* 56 项残留）。修复：`swap-exec.ts` 将新建祖先目录以 `kind:'dir', previousExisted:false` 记入清单，回滚倒序先删文件后删空目录；先写失败测试（`swap.test.ts`「执行新建的中间目录记入清单，回滚一并清除」）再实现，全量 568 绿后重建、重启服务复测通过。

## 3. API 二次核实（Invoke-WebRequest，独立于 Node 冒烟脚本）

| 请求 | 期望 | 实测 |
|---|---|---|
| GET /api/swap/tools | 200 + installed/supportMatrix | 200 ✓（五工具矩阵与适配器回归测试一致） |
| POST /api/swap/preview（缺 tool） | 400 | 400 ✓ |
| POST /api/swap/preview（未注册工具） | 400"未注册" | 400 ✓ |
| POST /api/swap/preview（workbuddy） | 200 + 六类 groups | 200 ✓ |
| POST /api/swap/execute（过期快照） | 409"重新预览" | 409 ✓ |
| POST /api/swap/rollback（缺 swapId） | 400 | 400 ✓ |
| POST /api/swap/rollback（未知 swapId） | 200 + success:false | 200 ✓（错误在 body，诚实返回） |
| GET /api/swap/history | 200 最新在前 | 200 ✓ |

中文 error 文案在 PowerShell 控制台显示为乱码属代码页问题，UTF8 读文件与单测断言均确认本体正确。

## 4. Spec 场景回环（3 份 spec / 14 Scenario）

| Spec | Scenario | 判定依据 | 结果 |
|---|---|---|---|
| bundle | 切换页六类分组+支持标注 | 回环 A 预览输出六组齐全；前端 Swap.test 分组断言 | ✅ |
| bundle | 身份与记忆纳入投放 | identity 1 项端到端投放+校验；memory 支持=Y（当前库 0 项，分发路径由 support-matrix 回归锁定） | ✅ |
| bundle | 不支持类别显式跳过 | agent supported=false + reason；trae-cn memory/agent=N（GET /tools 实测） | ✅ |
| bundle | 不支持不导致整体失败 | 回环 A failed=0（workbuddy 不支持 agent 仍整体成功） | ✅ |
| bundle | 记忆进导航、类别动态 | 类别集合来自 SWAP_CATEGORIES 常量+适配器推导，无写死 | ✅ |
| bundle 锚点 | 六类计数之和==库六类总数 | 预览 1+3+181+1+0+0=186 == 执行 149+37+0 | ✅ |
| workflow | 未安装工具置灰 | claude-code/codex installed=false（实测）；前端 ToolCard disabled 测试 | ✅ |
| workflow | differs 默认不覆盖 | 前端 checkbox 默认未勾测试；回环 A differs 保持原样 | ✅ |
| workflow | 显式覆盖后才计入 | 回环 B 携带决策后该项 written | ✅ |
| workflow | 冲突项列「已跳过(冲突)」 | 回环 A skipped 含 2 项冲突未确认 | ✅ |
| workflow | 成功反馈+撤销入口 | 前端 toast/结果面板/撤销按钮测试 | ✅ |
| workflow | 单项失败不谎称整体 | swap-routes roundtrip 非 JSON 种子如实 failed | ✅ |
| verify-rollback | 「已写入并校验」文案边界 | 结果面板措辞不含"已生效/已加载" | ✅ |
| verify-rollback | 结构化文件按格式校验 | 回环 B profile.md parseable=true；非 JSON mcp 被拦 | ✅ |
| verify-rollback | 覆盖前备份/新增不备份 | 回环 B restored=1（有备份）+ removed=149（新增直删） | ✅ |
| verify-rollback | 撤销回切换前+历史记录 | 快照 identical=true + rolledBack:true | ✅ |
| verify-rollback | 保留最近 3 次备份 | 实测 4 次切换仅存 3 份 | ✅ |

浏览器未使用（API 级 + 组件测试覆盖，无标签页需关闭）。

## 5. 零数据上传自查

- `src/**/*swap*` grep `fetch|axios|http(s).|XMLHttpRequest|net.|dns.`：**0 命中**；
- `web/src` swap 页面/组件同口径 **0 命中**（前端仅经本机 `/api`）；
- 历史/备份全部落 `~/.assetplex/.swap-backup`、`history.json`，只存本机。

## 6. 测试数据回基线

- 我的库 skill 目录 **31**（与基线口径一致，本轮无增删）；
- `~/.workbuddy` 快照与验收开始前逐条目一致（含内容哈希），未往工具自管目录留测试数据；
- Hub 侧仅新增功能自身产物：`.swap-backup/` 3 份（保留策略内）+ 历史 4 条（均 rolledBack），属正常数据非污染。

## 7. 三 pass 自审

- **Bugs**：568+156 全绿；端到端唯一真实缺陷（空目录残留）已 TDD 修复并复测；回滚预检+倒序恢复保证原子性。已知边界（可接受、如实记录）：① 执行新增的整个技能目录以目录为单位记录，撤销时整体移除——若用户在切换后手动往该新目录放文件，撤销会连带删除；② memory 端到端投放未走真实数据（当前库该类 0 项），由支持矩阵回归测试兜底。
- **Security**：swap 全流程纯本机文件操作，零外发（§5）；覆盖目标仅限预览快照内路径，overwriteDecisions 只匹配已预览的 hubRelativePath，不能注入新目标；符号链接写入前先移除链接，防穿透改写；备份缺失预检拒绝半恢复。
- **Compliance**：诚实边界文案贯穿（"已写入并通过回读检查，不代表工具已加载"）；spec 决策（六类默认/默认不覆盖）与宪法①一致；文档落位 `设计文档/changes/enable-tool-hot-swap/`；验收脚本存 `scripts/t10-*.mjs|ps1` 可复跑。

## 8. 提交建议（待维护者发话）

沿用任务书分任务提交：T1-T6 引擎核心、T7 `feat: 切换API路由与工具支持矩阵`、T8/T9 切换页两笔、T10 空目录回滚修复（本轮新增，宜独立一笔 `fix: 切换回滚清除执行时新建的空目录`）+ 本验收记录。注意 git user.name/user.email 尚未配置。
