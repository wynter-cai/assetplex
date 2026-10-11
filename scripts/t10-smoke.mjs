/* T10 冒烟辅助:调用 /api/swap 端点并打印摘要(只读步骤) */
const BASE = 'http://127.0.0.1:17521/api';

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const step = process.argv[2] || 'tools';

if (step === 'tools') {
  const r = await req('GET', '/swap/tools');
  console.log('GET /swap/tools ->', r.status);
  for (const t of r.json.tools) {
    const sup = Object.entries(t.supportMatrix)
      .map(([k, v]) => `${k}=${v.supported ? 'Y' : 'N'}`)
      .join(' ');
    console.log(`  ${t.name} [${t.displayName}] installed=${t.installed} ${sup}`);
  }
} else if (step === 'preview') {
  const tool = process.argv[3] || 'workbuddy';
  const r = await req('POST', '/swap/preview', { tool });
  console.log(`POST /swap/preview ${tool} ->`, r.status);
  const p = r.json;
  console.log('generatedAt =', p.generatedAt, 'toolInstalled =', p.toolInstalled);
  for (const g of p.groups) {
    const conflicts = g.items.reduce((m, i) => ((m[i.conflict] = (m[i.conflict] || 0) + 1), m), {});
    console.log(
      `  ${g.category} supported=${g.support.supported} total=${g.counts.total} skipped=${g.counts.skipped} conflicts=${JSON.stringify(conflicts)}`,
    );
    if (!g.support.supported) console.log('    reason:', g.support.reason);
    for (const i of g.items.filter((x) => x.conflict === 'differs')) {
      console.log('    DIFFERS:', i.hubRelativePath, '->', i.targetPath);
    }
  }
} else if (step === 'history') {
  const r = await req('GET', '/swap/history');
  console.log('GET /swap/history ->', r.status, JSON.stringify(r.json.history, null, 1));
} else if (step === 'execute') {
  const { writeFileSync } = await import('node:fs');
  const tool = process.argv[3] || 'workbuddy';
  const p = (await req('POST', '/swap/preview', { tool })).json;
  const r = await req('POST', '/swap/execute', { tool, previewGeneratedAt: p.generatedAt, overwriteDecisions: [] });
  console.log('POST /swap/execute ->', r.status);
  const res = r.json;
  console.log('swapId =', res.swapId, 'success =', res.success, 'counts =', JSON.stringify(res.counts), 'rollbackAvailable =', res.rollbackAvailable);
  writeFileSync(process.env.TEMP + '/t10-swapid.txt', String(res.swapId ?? ''), 'utf-8');
  const items = res.items || [];
  const written = items.filter((i) => i.action === 'written');
  const passed = written.filter((i) => i.verify && i.verify.passed);
  console.log(`written=${written.length} verifyPassed=${passed.length}`);
  const failed = items.filter((i) => i.action === 'failed');
  console.log('failed=', failed.length);
  for (const f of failed.slice(0, 8)) console.log('  FAILED:', f.hubRelativePath, f.reason);
  const skipped = items.filter((i) => i.action === 'skipped');
  console.log('skipped=', skipped.length);
  for (const s of skipped.filter((x) => x.hubRelativePath.includes('profile') || x.hubRelativePath.includes('_icon'))) {
    console.log('  SKIP(冲突未确认):', s.hubRelativePath, '/', s.reason);
  }
} else if (step === 'overwrite-e2e') {
  // 端到端: 显式覆盖一个 differs 项 → 目标被替换 → 撤销 → 内容恢复原样
  const { readFileSync, existsSync } = await import('node:fs');
  const tool = process.argv[3] || 'workbuddy';
  const p = (await req('POST', '/swap/preview', { tool })).json;
  const differs = p.groups.flatMap((g) => g.items).filter((i) => i.conflict === 'differs');
  if (differs.length === 0) { console.log('NO DIFFERS ITEMS, skip'); process.exit(0); }
  const pick = differs.find((i) => i.hubRelativePath.startsWith('identity/')) || differs[0];
  console.log('PICK:', pick.hubRelativePath, '->', pick.targetPath);
  const before = existsSync(pick.targetPath) ? readFileSync(pick.targetPath) : null;
  const r = await req('POST', '/swap/execute', {
    tool,
    previewGeneratedAt: p.generatedAt,
    overwriteDecisions: [{ hubRelativePath: pick.hubRelativePath, overwrite: true }],
  });
  const res = r.json;
  const hit = (res.items || []).find((i) => i.hubRelativePath === pick.hubRelativePath);
  console.log('execute ->', r.status, 'swapId =', res.swapId, 'item =', JSON.stringify(hit));
  const afterOverwrite = existsSync(pick.targetPath) ? readFileSync(pick.targetPath) : null;
  console.log('target changed after overwrite:', String(before) !== String(afterOverwrite));
  const rb = await req('POST', '/swap/rollback', { swapId: res.swapId });
  console.log('rollback ->', rb.status, JSON.stringify(rb.json));
  const afterRollback = existsSync(pick.targetPath) ? readFileSync(pick.targetPath) : null;
  console.log('target restored to original:', String(before) === String(afterRollback));
} else if (step === 'rollback') {
  const swapId = process.argv[3] || (await import('node:fs')).readFileSync(process.env.TEMP + '/t10-swapid.txt', 'utf-8').trim();
  const r = await req('POST', '/swap/rollback', { swapId });
  console.log('POST /swap/rollback', swapId, '->', r.status, JSON.stringify(r.json));
}
