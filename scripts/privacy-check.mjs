// 隐私终检自查脚本 —— 提交/推送任何内容进公开仓库前必须跑一次。
// 设计原则：本脚本本体可公开（不含任何真实隐私值），真实关键词清单放在被
// .gitignore 排除的本机文件（默认 .privacy-keywords.local），二者分离。
//
// 用法：
//   node scripts/privacy-check.mjs                      # 扫工作区文件+全历史(默认ref=HEAD)
//   node scripts/privacy-check.mjs <关键词文件> <ref>   # 自定义；ref 可为分支/HEAD
//
// 退出码：0=干净；1=发现隐私(FAIL 自定义关键词 或 WARN 通用结构形态)；2=关键词文件缺失。
// 实现要点：git grep 通过 execFileSync 直传 UTF-8 参数，规避 Windows PowerShell
// 命令行中文传参编码导致的“假阴性”（明明还在却报 0 命中）。
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const kwFile = process.argv[2] || '.privacy-keywords.local';
const ref = process.argv[3] || 'HEAD';

// 已知中性占位（脱敏后合法存在，通用形态命中这些不算泄露）
const PLACEHOLDER = /^(?:demo|testuser|tester|samplesubject|sample|test|example|public|admin|wynter)$/i;

function run(args) {
  try { return execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 512 * 1024 * 1024 }); }
  catch (e) { return e.stdout ? e.stdout.toString('utf-8') : ''; } // git grep 无命中返回非0
}
function revList() {
  return run(['rev-list', ref]).trim().split('\n').filter(Boolean);
}

const REVS = revList();
const fails = [];   // 命中自定义真实隐私词
const warns = [];   // 命中通用机械标识结构，需人工确认

// —— 1. 自定义关键词（真实隐私值，来自本机 gitignore 文件）——
if (!existsSync(kwFile)) {
  console.log(`[提示] 未找到关键词文件 ${kwFile}，仅执行通用结构扫描。`);
  console.log('[提示] 请把真实隐私词清单写入该文件（每行一个，被 .gitignore 排除，勿入库）。');
} else {
  const kws = readFileSync(kwFile, 'utf-8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  for (const kw of kws) {
    const files = new Set();
    // a) 已提交的全历史（逐 commit 逐 blob）
    for (const l of run(['grep', '-l', '-I', '-F', '-e', kw, ...REVS]).split('\n')) {
      const p = l.split(':').slice(1).join(':');
      if (p) files.add(p);
    }
    // b) 工作区（含未提交改动，--exclude-standard 尊重 .gitignore，关键词文件自身自动被排除）
    for (const l of run(['grep', '-l', '-I', '-F', '--no-index', '--exclude-standard', '-e', kw, '--']).split('\n')) {
      if (l) files.add(l.replace(/^\.\//, ''));
    }
    if (files.size) fails.push({ kw, files: [...files] });
  }
}

// —— 2. 通用机械标识结构扫描（本体 ASCII 正则，可公开）——
function collect(refRegex, extractor, excludeRe) {
  const out = run(['grep', '-h', '-I', '-E', '-e', refRegex, ...REVS]);
  const set = new Set();
  for (const line of out.split('\n')) {
    for (const m of line.matchAll(extractor)) {
      const token = m[0];
      if (excludeRe && excludeRe.test(token)) continue;
      const cap = m.slice(1).find((x) => x !== undefined) || '';
      if (!PLACEHOLDER.test(cap.replace(/[\\/"']/g, ''))) set.add(token);
    }
  }
  return [...set];
}
// 注：git grep -E 为 POSIX ERE，不支持 Perl 式 (?:...) 非捕获组，可选分支须用交替展开
// 只扫 Windows/mac 家目录 Users（避开前端组件目录/路由的 /home/ 大量误报）；Linux /home/<user> 可写入自定义关键词清单补捕
const pathHits = collect(
  '[A-Za-z]:[\\\\/]Users[\\/][A-Za-z0-9._-]+|[\\\\/]Users[\\/][A-Za-z0-9._-]+',
  /Users[\\\/]([A-Za-z0-9._-]+)/gi,
);
if (pathHits.length) warns.push({ name: '疑似真实用户主目录绝对路径', samples: pathHits.slice(0, 8) });

const emailHits = collect(
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\\.[A-Za-z0-9.-]+',
  /([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+)/g,
  // 排除合法非隐私形态：GitHub noreply 提交邮箱；以及包名@版本号形态
  // owner/repo@v1.2.3 与 npm 包名@0.1.0 都会被邮箱正则误判（首段当域名、
  // 后续当 TLD）——真实邮箱 TLD 恒为字母、绝不会以 semver 数字段结尾，
  // 故排除 @[v]数字.数字[.数字] 标签形态只消误报不伤真检测。
  /@(?:users\.noreply\.github\.com|v?\d+\.\d+(?:\.\d+)?)$/i,
);
if (emailHits.length) warns.push({ name: '疑似真实邮箱(非占位)', samples: emailHits.slice(0, 8) });

const phoneHits = collect('1[3-9][0-9]{9}', /(1[3-9][0-9]{9})/g);
if (phoneHits.length) warns.push({ name: '疑似11位手机号', samples: phoneHits.slice(0, 8) });

// —— 输出 ——
for (const f of fails) console.log(`FAIL 关键词「${f.kw}」出现在：\n      ${f.files.join('\n      ')}`);
for (const w of warns) console.log(`WARN ${w.name}：\n      ${w.samples.join('\n      ')}`);
const total = fails.length + warns.length;
console.log(total === 0
  ? `\n✅ 隐私终检通过（ref=${ref}，扫 ${REVS.length} 个 commit）：无命中。`
  : `\n❌ 发现 ${fails.length} 类致命命中、${warns.length} 类待确认命中，请处置后再提交/推送。`);
process.exit(total === 0 ? 0 : 1);
