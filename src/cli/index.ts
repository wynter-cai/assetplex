/**
 * AssetPlex CLI 入口
 *
 * 使用 Commander.js 注册所有子命令
 */

import { Command } from 'commander';
import { log, setLogLevel } from '../utils/logger.js';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { syncCommand } from './commands/sync.js';

const program = new Command();

program
  .name('assetplex')
  .description('One identity, every AI agent — built for the China stack and beyond.')
  .version('0.1.0')
  .option('-v, --verbose', '启用详细日志输出', () => setLogLevel('debug'))
  .option('-q, --quiet', '静默模式（仅输出错误）', () => setLogLevel('error'));

// init 命令
program
  .command('init')
  .description('初始化 ~/.assetplex/ 目录与模板文件')
  .option('-f, --force', '强制覆盖已存在文件')
  .option('--import-existing', '从现有各工具反向导入配置')
  .option('-y, --yes', '跳过交互提示，使用默认值')
  .action(async (opts) => {
    try {
      await initCommand(opts);
    } catch (err) {
      log.error('初始化失败:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// doctor 命令
program
  .command('doctor')
  .description('体检：检测各 AI 工具安装状态、Hub 完整性')
  .option('--fix', '自动修复检测到的问题')
  .option('--json', 'JSON 输出（脚本友好）')
  .option('--tool <name>', '仅检查指定工具')
  .action(async (opts) => {
    try {
      await doctorCommand(opts);
    } catch (err) {
      log.error('体检失败:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// sync 命令
program
  .command('sync')
  .description('同步 Hub 内容到所有启用的工具')
  .option('--tool <name>', '仅同步到指定工具')
  .option('--watch', '监听文件变化自动同步（Stage 2.5 实现）')
  .option('--dry-run', '预览变更不写入')
  .option('--json', 'JSON 输出')
  .action(async (opts) => {
    try {
      await syncCommand(opts);
    } catch (err) {
      log.error('同步失败:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ui 命令（Web UI 可视化管理）
program
  .command('ui')
  .description('启动 Web UI 可视化管理界面')
  .option('-p, --port <port>', '端口号', '17521')
  .option('-H, --host <host>', '监听地址', '127.0.0.1')
  .option('--no-open', '不自动打开浏览器')
  .action(async (opts) => {
    try {
      const { uiCommand } = await import('./commands/ui.js');
      await uiCommand({
        port: parseInt(opts.port, 10),
        host: opts.host,
        noOpen: !opts.open,
      });
    } catch (err) {
      log.error('启动 UI 失败:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// 解析参数
program.parseAsync(process.argv).catch((err) => {
  log.error('执行失败:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
