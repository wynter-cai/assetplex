import { loadHubConfig, saveHubConfig, type HubConfig } from '../../core/config.js';
import { SyncEngine } from '../../core/sync-engine.js';
import {
  registerBuiltinAdapters,
  getAllAdapters,
  getAdapter,
} from '../../core/adapters/registry.js';
import type { ToolAdapter } from '../../core/adapters/base.js';

/**
 * Hub 应用上下文（单例）
 *
 * 缓存 HubConfig 与 SyncEngine 实例，避免每次请求都重新加载；
 * 配置变更时调用 saveConfig / reloadConfig 让缓存失效。
 */
class HubContext {
  private config: HubConfig | null = null;
  private engine: SyncEngine | null = null;
  private adaptersRegistered = false;

  /** 获取当前 Hub 配置（懒加载） */
  getConfig(): HubConfig {
    if (!this.config) {
      this.config = loadHubConfig();
    }
    this.ensureAdaptersRegistered();
    return this.config;
  }

  /** 确保内置适配器已注册（幂等） */
  private ensureAdaptersRegistered(): void {
    if (!this.adaptersRegistered) {
      registerBuiltinAdapters();
      this.adaptersRegistered = true;
    }
  }

  /** 获取 SyncEngine 实例（懒加载） */
  getEngine(): SyncEngine {
    if (!this.engine) {
      this.engine = new SyncEngine(this.getConfig(), this.getAllAdapters());
    }
    return this.engine;
  }

  /** 获取所有已注册的适配器 */
  getAllAdapters(): ToolAdapter[] {
    this.ensureAdaptersRegistered();
    return getAllAdapters();
  }

  /** 按 name 查找适配器 */
  getAdapter(name: string): ToolAdapter | undefined {
    return getAdapter(name);
  }

  /** 让配置/引擎缓存失效，下次访问时重新加载 */
  reloadConfig(): void {
    this.config = null;
    this.engine = null;
  }

  /** 保存新配置并刷新缓存 */
  saveConfig(config: HubConfig): void {
    saveHubConfig(config);
    this.config = config;
    this.engine = null; // 引擎依赖配置，需重建
  }
}

export const hubContext = new HubContext();
