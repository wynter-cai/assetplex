/* T10: 对比切换前基线快照与回滚后快照，输出差异清单 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const load = (f) => JSON.parse(readFileSync(join(process.env.TEMP, f), 'utf8').replace(/^\uFEFF/, ''));
const A = load('t10-baseline.json');
const B = load('t10-after-rollback.json');

const ma = new Map(A.entries.map((e) => [e.path, e]));
const mb = new Map(B.entries.map((e) => [e.path, e]));

const onlyBaseline = [...ma.keys()].filter((k) => !mb.has(k));
const onlyAfter = [...mb.keys()].filter((k) => !ma.has(k));
const changed = [...ma.keys()].filter((k) => mb.has(k)).filter((k) => JSON.stringify(ma.get(k)) !== JSON.stringify(mb.get(k)));

console.log(`baseline=${A.total} after=${B.total}`);
console.log(`onlyInBaseline(${onlyBaseline.length}):`);
onlyBaseline.slice(0, 30).forEach((p) => console.log('  -', p, ma.get(p).type));
console.log(`onlyInAfter(${onlyAfter.length}):`);
onlyAfter.slice(0, 30).forEach((p) => console.log('  +', p, mb.get(p).type));
console.log(`changed(${changed.length}):`);
changed.slice(0, 15).forEach((p) => console.log('  ~', p, JSON.stringify(ma.get(p)), '->', JSON.stringify(mb.get(p))));
if (onlyBaseline.length === 0 && onlyAfter.length === 0 && changed.length === 0) console.log('RESULT: IDENTICAL ✓');
