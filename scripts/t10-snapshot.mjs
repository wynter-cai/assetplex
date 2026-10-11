/* T10 端到端:目标工具目录快照(基线 vs 回滚后必须一致) */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  'C:/Users/demo/.workbuddy/IDENTITY.md',
  'C:/Users/demo/.workbuddy/.mcp.json',
  'C:/Users/demo/.workbuddy/mcp.json',
  'C:/Users/demo/.workbuddy/rules',
  'C:/Users/demo/.workbuddy/skills',
  'C:/Users/demo/.workbuddy/memory',
];

function sha1(buf) {
  return createHash('sha1').update(buf).digest('hex');
}

function walk(path, out, depth) {
  const st = lstatSync(path);
  if (st.isSymbolicLink()) {
    let real = 'dangling';
    try { real = realpathSync(path); } catch { /* keep dangling */ }
    out.push({ path, type: 'symlink', target: real });
    return;
  }
  if (st.isDirectory()) {
    out.push({ path, type: 'dir' });
    if (depth > 0) {
      for (const name of readdirSync(path).sort()) walk(join(path, name), out, depth - 1);
    }
    return;
  }
  out.push({ path, type: 'file', size: st.size, sha1: sha1(readFileSync(path)) });
}

const entries = [];
for (const root of ROOTS) {
  if (!existsSync(root)) {
    entries.push({ path: root, type: 'absent' });
    continue;
  }
  walk(root, entries, 2);
}
const json = JSON.stringify({ total: entries.length, entries });
if (process.argv[2]) {
  writeFileSync(process.argv[2], json, 'utf-8');
  console.log('snapshot ->', process.argv[2], 'entries=' + entries.length);
} else {
  console.log(json);
}
