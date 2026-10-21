import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { byName, variants } from '../src/data';
import { parsePerformance } from '../src/parser';
import { IntrinsicView } from '../src/ui';
import type { PerformanceService } from '../src/service';
import type { PageResult } from '../src/types';
const intrinsic = byName.get('_mm512_cvtepi64_pd')![0];
const variant = variants.find(v => v.name === 'VCVTQQ2PD (ZMM, ZMM)')!;
const page = parsePerformance(readFileSync('tests/fixtures/uops-convert.html', 'utf8'), variant);
const result: PageResult = { record: { version: 1, fetchedAt: 100, page }, stale: false };
const tick = () => new Promise(r => setTimeout(r, 0));
describe('view behavior', () => {
  it('compares all selected architectures with separate links, throughput sources, and missing-data rows', async () => {
    const mixed = { ...result, record: { ...result.record, page: { ...page, measurements: { ...page.measurements, ICL: { ...page.measurements.ICL, unrolled: undefined, loop: '2.00' } } } } };
    const load = vi.fn(async () => mixed);
    const view = new IntrinsicView(intrinsic, { version: 1, arches: ['TGL', 'ICL', 'ADL-E'], mode: 'inline' }, { load } as unknown as PerformanceService);
    await tick();
    expect(load).toHaveBeenCalledTimes(1);
    expect(view.element.querySelectorAll('.metric-table tbody tr')).toHaveLength(3);
    expect(view.element.querySelector('tr[data-arch="TGL"]')?.textContent).toContain('1.00 (unrolled)');
    expect(view.element.querySelector('tr[data-arch="ICL"]')?.textContent).toContain('2.00 (loop)');
    expect(view.element.querySelector('tr[data-arch="ADL-E"]')?.textContent).toContain('暂无测量数据');
    for (const arch of ['TGL', 'ICL', 'ADL-E']) expect(view.element.querySelector(`tr[data-arch="${arch}"] a`)?.getAttribute('href')).toBe(`https://uops.info/html-instr/${variant.id}.html#${arch}`);
    expect(view.element.querySelectorAll('.architecture-details')).toHaveLength(2);
  });
  it('does not fetch data or silently pick an architecture when none are selected', () => {
    const load = vi.fn();
    const view = new IntrinsicView(intrinsic, { version: 1, arches: [], mode: 'inline' }, { load } as unknown as PerformanceService);
    expect(load).not.toHaveBeenCalled();
    expect(view.element.textContent).toContain('请选择至少一个架构');
    expect(view.element.querySelector('.metric-table')).toBeNull();
  });

  it('leaves the preferred architecture empty and only switches reference architecture explicitly', async () => {
    const service = { load: vi.fn(async () => result) } as unknown as PerformanceService;
    const view = new IntrinsicView(intrinsic, { version: 1, arches: ['ADL-E'], mode: 'inline' }, service);
    await tick();
    expect(view.element.textContent).toContain('暂无该变体的测量数据');
    expect(view.element.querySelector('.metric-table')?.textContent).toContain('暂无测量数据');
    const reference = view.element.querySelector<HTMLInputElement>('.reference-picker input[value="TGL"]')!;
    reference.checked = true; reference.dispatchEvent(new Event('change')); await tick();
    expect(view.element.querySelector('tr[data-arch="TGL"]')?.textContent).toContain('参考架构');
    expect(view.element.querySelector('tr[data-arch="TGL"]')?.textContent).toContain('1*p0');
    expect(view.element.querySelector('tr[data-arch="ADL-E"]')?.textContent).toContain('暂无测量数据');
  });
  it('ignores an old response after changing architecture', async () => {
    const pending: ((r: PageResult) => void)[] = [];
    const service = { load: vi.fn(() => new Promise<PageResult>(r => pending.push(r))) } as unknown as PerformanceService;
    const view = new IntrinsicView(intrinsic, { version: 1, arches: ['TGL'], mode: 'inline' }, service);
    view.setArches(['ICL']); pending[1](result); await tick(); pending[0](result); await tick();
    expect(view.element.querySelector('tr[data-arch="ICL"]')).not.toBeNull();
    expect(view.element.querySelector('tr[data-arch="TGL"]')).toBeNull();
  });
  it('requests no performance data for ambiguous candidates before a selection', () => {
    const load = vi.fn();
    const view = new IntrinsicView(byName.get('_mm512_cvt_roundepi64_pd')![0], { version: 1, arches: ['TGL'], mode: 'inline' }, { load } as unknown as PerformanceService);
    expect(view.element.textContent).toContain('多个候选');
    expect(load).not.toHaveBeenCalled();
  });
  it('shows stale cache provenance and keeps remote markup inert', async () => {
    const view = new IntrinsicView(intrinsic, { version: 1, arches: ['TGL'], mode: 'inline' }, { load: async () => ({ ...result, stale: true, error: '<img src=x onerror=alert(1)>' }) } as unknown as PerformanceService);
    await tick();
    expect(view.element.textContent).toContain('旧缓存');
    expect(view.element.querySelector('img')).toBeNull();
  });
});
