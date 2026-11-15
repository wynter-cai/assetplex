/* 分发工具矩阵 / 回滚端点冒烟辅助:调用 /api 端点并打印摘要(只读或显式回滚) */
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
  const r = await req('GET', '/distributions/tools');
  console.log('GET /distributions/tools ->', r.status);
  for (const t of r.json.tools) {
    const sup = Object.entries(t.supportMatrix)
      .map(([k, v]) => `${k}=${v.supported ? 'Y' : 'N'}`)
      .join(' ');
    console.log(`  ${t.name} [${t.displayName}] installed=${t.installed} ${sup}`);
  }
} else if (step === 'rollback') {
  const writeId = process.argv[3] || (await import('node:fs')).readFileSync(process.env.TEMP + '/t10-writeid.txt', 'utf-8').trim();
  const r = await req('POST', '/remediations/rollback', { swapId: writeId });
  console.log('POST /remediations/rollback', writeId, '->', r.status, JSON.stringify(r.json));
}
