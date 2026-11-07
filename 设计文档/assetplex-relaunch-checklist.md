# AssetPlex 重新发布核对单（仓库重建 + 首发动作）

> 背景：本地 `main` 是隐私脱敏重写后的干净谱系（169 个提交），与远端 `origin/main` **没有共同祖先**（远端还挂着 8 个重写前提交 + 15 个 dependabot PR + 10 余个 dependabot 分支）。
> 决策：**改名保命 + 同名重建**，不用 `push --force`。原因见文末「为什么不 force push」。
> 本文件不含任何隐私值，可入库。执行者：维护者（Agent 不入库、不 push、不碰 GitHub 后台）。
>
> **执行状态（2026-11-07）**：阶段 0～3 已完成，阶段 4 只剩 #1（`NPM_TOKEN`）与 #6（Social preview）需在后台手动填；验证结果与偏差见文末「执行记录」。

---

## 阶段 0：删库前本地自检（Agent 可代劳）

- [ ] `git log --oneline | wc -l` = 169，`git status --short` 为空
- [ ] `node scripts/privacy-check.mjs` 退出码 0
- [ ] 后端 `vitest run` 全绿、`tsc --noEmit` 0 错、`tsup` 构建成功
- [ ] 前端 `vitest run` 全绿、`tsc -b` 干净、`vite build` 成功
- [ ] e2e 9/9 通过（含自带夹具的冲突用例）
- [ ] `git tag` 含 `v0.1.0`（重建后要重新推）
- [ ] 回滚分支存在：`backup-before-anon-v4` / `v5` / `backup-before-content-anonymize` / `backup-before-privacy-clean`
- [ ] 确认 npm `assetplex@0.1.0` 已发布（registry 与 git 仓库完全独立，删库不影响）

## 阶段 1：旧库改名并转私有（保护步骤，不删）

- [ ] GitHub → 仓库 `Settings` → 最下方 `Danger Zone` → `Rename` → 改成 `assetplex-legacy`
- [ ] 同页 `Change repository visibility` → `Private`
- [ ] 确认 `https://github.com/wynter-cai/assetplex-legacy` 匿名访问返回 404
- 说明：改名后 GitHub 会把旧地址 `assetplex` 重定向到 `assetplex-legacy`；一旦新建同名仓库，重定向让位给新仓库 —— 外部旧链接自动落到新库，不会凭空断链

> 若决定彻底不留痕：跳过阶段 1，直接 `Danger Zone` → `Delete this repository`。旧对象库由 GitHub 侧销毁，这是 force push 做不到的。

## 阶段 2：新建空仓库

- [ ] `github.com/new` → 名称 `assetplex` → `Public`
- [ ] **不要**勾选 `Add a README file` / `.gitignore` / `license`（否则首推要处理无关历史）
- [ ] `Create repository`

## 阶段 3：本地推送（维护者执行，Agent 禁 push）

```bash
cd <仓库根目录>
git remote set-url origin https://github.com/wynter-cai/assetplex.git
git push -u origin main          # 空库首次推送，无需 --force
git push origin --tags           # 恢复 v0.1.0
```

- [ ] 推送后 `git status -sb` 显示 `main...origin/main`（无 ahead/behind）

## 阶段 4：重建后后台开关（最容易漏的一节）

| # | 位置 | 要做什么 | 漏了会怎样 |
|---|---|---|---|
| 1 | Settings → Secrets and variables → Actions | 重新添加 `NPM_TOKEN` | 打 tag 时 release workflow 发布 npm 失败 |
| 2 | Settings → Pages | Source 选 **GitHub Actions** | docs 站点 404 |
| 3 | Actions → Deploy Docs → Run workflow | 手动跑一次（或改一次 `docs/**` 触发） | Pages 上还是空站 |
| 4 | Settings → Features | 勾上 **Discussions** | README 里的 Discussions 链接 404 |
| 5 | 仓库首页 About 齿轮 | 填 description + homepage + **15 个 topics** | 搜不到；topics 见下 |
| 6 | Settings → Social preview | 上传 1280×640 分享卡 | 微信/X/飞书分享是白板链接 |
| 7 | Releases | tag 推送后由 workflow 自动建，或手动 `gh release create v0.1.0 --generate-notes` | 没有 release 页可被搜索引擎收录 |
| 8 | Dependabot | 确认 `dependabot.yml` 生效，旧 PR 无价值不必恢复 | 无（重建后会自动重开新 PR） |

Topics 建议（复制即用）：
```
agents, ai, ai-agent, claude-code, cli, codex, developer-tools, mcp,
qoder, skills, sync, trae, typescript, windows, workbuddy,
ai-tools, config-management, prompt-management, agent-skills, dotfiles-for-ai
```

## 阶段 5：重建后验证（Agent 可代劳，除需登录的操作）

- [ ] `https://api.github.com/repos/wynter-cai/assetplex` 返回 `"private": false`、`"default_branch": "main"`
- [ ] `git ls-remote --heads origin` 只剩 `main`
- [ ] `git ls-remote --tags origin` 含 `v0.1.0`
- [ ] Actions：CI / CodeQL / Deploy Docs 三条绿
- [ ] `https://wynter-cai.github.io/assetplex/` 返回 200 且标题正确
- [ ] `https://registry.npmjs.org/assetplex` 仍是 `latest: 0.1.0`
- [ ] `node scripts/privacy-check.mjs` 复扫退出码 0
- [ ] 旧库 `assetplex-legacy` 匿名访问 404

## 回滚

任何一步失败：把 `assetplex-legacy` 改回 `assetplex` 并转 Public，旧库原样复活；新库若已建，先改名成别的。**整个过程不涉及不可逆删除**（除非主动选 Delete）。

---

## 为什么不 `push --force`

| 维度 | force push | 改名 + 重建 |
|---|---|---|
| 旧提交可达性 | 不可达对象仍可凭 SHA 访问，GC 时间 GitHub 不承诺 | 对象库随旧库转私有，公开侧彻底消失 |
| `refs/pull/*/head` | 15 个 dependabot PR 的 diff 仍指向旧树 | 随仓库消失 |
| 遗留分支 | 10+ 个 dependabot 分支仍指旧树，需逐个删 | 天然不存在 |
| 外部旧链接 | 断链或指向重写后的内容 | 自动落到新库 |
| 可回滚性 | 无（本身就是重写） | 旧库改名保留，随时改回 |
| 成本 | 低 | 低（1 star / 0 fork / 0 真人 PR） |

---

## 执行记录（2026-11-07）

重建后实测：

| 项 | 结果 |
|---|---|
| 远端分支 | 16 个：`main` + 15 个 dependabot 分支（重建后自动重开，属预期） |
| 远端 tag | 无（**未推 `v0.1.0`**，理由见下） |
| `main` 提交数 | 172 |
| 仓库元数据 | public、default=main、description/homepage/20 topics/Pages/Discussions 全部恢复 |
| Actions | CI 绿（922 passed）、CodeQL 绿、Deploy Docs 绿；Pages 站点 200 |
| npm | `assetplex@0.1.0` 未受影响（git 与 registry 独立） |

偏差与新发现：

1. **CI 首跑即红**（本地 Windows 全绿）：`tests/unit/core/swap.test.ts` 两条用例在 Linux 失败。根因是夹具 `identity` 用 symlink 策略——symlink 真生效时目标就是 Hub 文件本身，改库后内容自动跟随，预览恒判 `exists`、不写不备份；Windows 无开发者模式时降级为副本才恰好符合用例假设。已改为该组用例显式用 `copy`，另补一条用例钉住 symlink 语义（平台不支持时跳过）。教训：**新谱系第一次进 CI 前，先本地跑一遍 Linux 语义的假设审查**，这类"靠平台降级才通过"的用例只能靠 CI 暴露。
2. **推送通道**：本机直连 `github.com` 会被重置（`schannel` 握手失败），走 Clash 代理方可，用 `git -c http.proxy=http://127.0.0.1:7890 push` 临时指定，**不写进任何 git 配置**。
3. **未推 `v0.1.0`**：tag 会触发 `release.yml` 的 `npm publish --provenance`，而 0.1.0 早已在 npm 上，重发必失败；且新库还没补 `NPM_TOKEN`。留到真正发 `0.1.1` 时一并打 tag + 补 secret。
4. **仍待维护者手动完成**：阶段 4 #1 补 `NPM_TOKEN`；#6 上传 1280×640 Social preview（GitHub 无对应 API）。
