import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { variants } from '../src/data';
import { CACHE_PREFIX, PerformanceService, TTL } from '../src/service';
import type { Storage, Variant } from '../src/types';
const v = variants.find(v => v.name === 'VCVTQQ2PD (ZMM, ZMM)')!;
const html = readFileSync('tests/fixtures/uops-convert.html', 'utf8');
function store(): Storage {
  const data = new Map<string, unknown>();
  return { async get<T>(key: string) { return data.get(key) as T | undefined; }, async set(key, value) { data.set(key, value); }, async remove(key) { data.delete(key); }, async keys() { return [...data.keys()]; } };
}
describe('network and cache behavior', () => {
  it('deduplicates requests and reuses an entire architecture page', async () => {
    const fetcher = vi.fn(async () => html);
    const s = new PerformanceService(store(), fetcher);
    const [one, two] = await Promise.all([s.load(v), s.load(v)]);
    expect(one).toBe(two); expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await s.load(v)).record.page.measurements.ICL).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps stale data on failure but never fabricates a record without cache', async () => {
    let now = 100;
    const fetcher = vi.fn().mockResolvedValueOnce(html).mockRejectedValue(new Error('offline'));
    const s = new PerformanceService(store(), fetcher, () => now);
    await s.load(v); now += TTL + 1;
    expect(await s.load(v)).toMatchObject({ stale: true, error: 'offline' });
    const empty = new PerformanceService(store(), fetcher);
    await expect(empty.load(v)).rejects.toThrow('offline');
  });
  it('limits concurrent remote requests to three', async () => {
    let active = 0, max = 0;
    const releases: (() => void)[] = [];
    const s = new PerformanceService(store(), async () => {
      active++; max = Math.max(max, active);
      await new Promise<void>(r => releases.push(r)); active--; return html;
    });
    const tasks = Array.from({ length: 7 }, (_, i) => s.load({ ...v, id: v.id + i } as Variant));
    for (let i = 0; i < 7; i++) { await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0)); releases.shift()!(); }
    await Promise.all(tasks); expect(max).toBe(3);
  });
  it('clears only its own cache and prevents in-flight requests from repopulating it', async () => {
    const storage = store(); await storage.set('settings', { arch: 'TGL' });
    let release!: (s: string) => void;
    const s = new PerformanceService(storage, () => new Promise<string>(r => { release = r; }));
    const task = s.load(v); await vi.waitFor(() => expect(release).toBeDefined());
    await s.clear(); release(html); await task;
    expect(await storage.get(CACHE_PREFIX + v.id)).toBeUndefined();
    expect(await storage.get('settings')).toEqual({ arch: 'TGL' });
  });
});
