import { t } from './i18n';
import { variantUrl } from './data';
import { parsePerformance, safeUopsUrl } from './parser';
import type { CachedPage, PageResult, Storage, Variant } from './types';

export const CACHE_PREFIX = 'iig-uops:page:1:';
export const TTL = 7 * 24 * 60 * 60 * 1000;
export const gmStorage: Storage = {
  async get<T>(key: string) { return GM_getValue<T>(key); },
  async set(key, value) { GM_setValue(key, value); },
  async remove(key) { GM_deleteValue(key); },
  async keys() { return GM_listValues(); },
};
export function requestHtml(url: string): Promise<string> {
  if (!safeUopsUrl(url)) return Promise.reject(new Error(t('不允许的数据地址。')));
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({ method: 'GET', url, timeout: 25000, anonymous: true,
      onload: r => {
        if (r.status !== 200) reject(new Error(t('uops.info 返回 HTTP {status}', { status: r.status })));
        else if (r.finalUrl && !safeUopsUrl(r.finalUrl)) reject(new Error(t('uops.info 重定向到未知站点。')));
        else resolve(r.responseText);
      }, onerror: () => reject(new Error(t('无法连接 uops.info，请检查网络后重试。'))),
      ontimeout: () => reject(new Error(t('uops.info 请求超时，请重试。'))),
    });
  });
}

export class PerformanceService {
  private pending = new Map<string, Promise<PageResult>>();
  private active = 0;
  private queue: (() => void)[] = [];
  private generation = 0;
  constructor(private storage: Storage = gmStorage, private fetcher = requestHtml, private now = Date.now) {}
  private async limited<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= 3) await new Promise<void>(resolve => this.queue.push(resolve));
    else this.active++;
    try { return await work(); }
    finally { const next = this.queue.shift(); if (next) next(); else this.active--; }
  }
  async load(v: Variant, force = false): Promise<PageResult> {
    const existing = this.pending.get(v.id);
    if (existing) return existing;
    const gen = this.generation;
    const task = this.get(v, force, gen);
    this.pending.set(v.id, task);
    try { return await task; } finally { if (this.pending.get(v.id) === task) this.pending.delete(v.id); }
  }
  private async get(v: Variant, force: boolean, generation: number): Promise<PageResult> {
    const key = CACHE_PREFIX + v.id;
    let cached: CachedPage | undefined;
    try {
      const stored = await this.storage.get<CachedPage>(key);
      if (stored?.version === 1 && stored.page?.id === v.id && stored.page.name === v.name && stored.page.iform === v.iform && Number.isFinite(stored.fetchedAt) && stored.page.measurements) cached = stored;
    } catch { /* Storage failure must not disable live lookup. */ }
    if (cached && !force && this.now() - cached.fetchedAt < TTL && this.now() >= cached.fetchedAt) return { record: cached, stale: false };
    try {
      const html = await this.limited(() => this.fetcher(variantUrl(v)));
      const record: CachedPage = { version: 1, fetchedAt: this.now(), page: parsePerformance(html, v) };
      if (generation === this.generation) {
        try { await this.storage.set(key, record); } catch { return { record, stale: false, error: t('缓存写入失败；本次数据仍可查看。') }; }
      }
      return { record, stale: false };
    } catch (error) {
      if (cached) return { record: cached, stale: true, error: error instanceof Error ? error.message : String(error) };
      throw error;
    }
  }
  async clear(): Promise<void> {
    this.generation++;
    await Promise.all((await this.storage.keys()).filter(k => k.startsWith(CACHE_PREFIX)).map(k => this.storage.remove(k)));
  }
}
