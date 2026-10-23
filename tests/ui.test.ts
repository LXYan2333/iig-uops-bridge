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
    expect(view.element.querySelector('tr[data-arch="ADL-E"]')?.textContent).toContain('不支持所需指令集');
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
    expect(view.element.textContent).toContain('不支持所需指令集');
    expect(view.element.querySelector('.metric-table')?.textContent).toContain('不支持所需指令集');
    const reference = view.element.querySelector<HTMLInputElement>('.reference-picker input[value="TGL"]')!;
    reference.checked = true; reference.dispatchEvent(new Event('change')); await tick();
    expect(view.element.querySelector('tr[data-arch="TGL"]')?.textContent).toContain('参考架构');
    expect(view.element.querySelector('tr[data-arch="TGL"]')?.textContent).toContain('1*p0');
    expect(view.element.querySelector('tr[data-arch="ADL-E"]')?.textContent).toContain('不支持所需指令集');
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

describe('support information beside measurements', () => {
  const noMeasurements = { ...result, record: { ...result.record, page: { ...page, measurements: {} } } };
  const makeView = (arches: string[], load: (...args: any[]) => any = async () => noMeasurements, entry = intrinsic) =>
    new IntrinsicView(entry, { version: 1, arches, mode: 'inline' }, { load } as unknown as PerformanceService);

  it('distinguishes unsupported, supported without measurements, conditional and unknown in the same table', async () => {
    const view = makeView(['HSW', 'TGL', 'ADL-P', 'KBL']);
    await tick();
    for (const [arch, text] of [['HSW', '不支持所需指令集'], ['TGL', '架构支持，暂无测量数据'], ['ADL-P', '支持情况取决于具体型号'], ['KBL', '暂无测量数据，支持情况未知']]) {
      expect(view.element.querySelector(`tr[data-arch="${arch}"] summary`)?.textContent).toBe(text);
    }
    expect(view.element.querySelector('tr[data-arch="HSW"] small')?.textContent).toContain('AVX-512 DQ');
    expect(view.element.querySelector('tr[data-arch="TGL"] .support-details a')?.getAttribute('href')).toContain('github.com');
  });

  it('keeps measured metrics even when a static model says unsupported, including a temporary reference row', async () => {
    const contradictory = { ...result, record: { ...result.record, page: { ...page, measurements: { ...page.measurements, HSW: { ...page.measurements.TGL, arch: 'HSW' } } } } };
    const view = makeView(['TGL'], async () => contradictory);
    await tick();
    const reference = view.element.querySelector<HTMLInputElement>('.reference-picker input[value="HSW"]')!;
    reference.checked = true; reference.dispatchEvent(new Event('change')); await tick();
    const row = view.element.querySelector('tr[data-arch="HSW"]')!;
    expect(row.textContent).toContain('1.00 (unrolled)');
    expect(row.textContent).toContain('测试配置与架构资料存在差异');
    expect(row.textContent).toContain('参考架构');
  });

  it('shows independent support information during loading and after failure, without claiming measurements are absent', async () => {
    let reject!: (reason: Error) => void;
    const view = makeView(['HSW', 'TGL'], () => new Promise((_, fail) => { reject = fail; }));
    expect(view.element.textContent).toContain('正在读取');
    expect(view.element.textContent).toContain('不支持所需指令集');
    expect(view.element.textContent).not.toContain('暂无测量数据');
    reject(new Error('Network unavailable')); await tick();
    expect(view.element.querySelector('.error')?.textContent).toBe('Network unavailable');
    expect(view.element.textContent).toContain('架构模型支持');
    expect(view.element.textContent).not.toContain('暂无测量数据');
    expect(view.element.querySelector('.metric-table')).toBeNull();
    expect(view.element.querySelector('button')?.textContent).toBe('重试');
  });

  it('reassesses a manually selected VEX form instead of reusing the EVEX intrinsic requirements', async () => {
    const view = makeView(['HSW'], async () => noMeasurements, byName.get('_mm256_mask_xor_ps')![0]);
    await tick();
    expect(view.element.querySelector<HTMLElement>('.support-details')?.dataset.support).toBe('unsupported');
    const radio = view.element.querySelector<HTMLInputElement>('input[value="VXORPS_YMM_YMM_YMM"]')!;
    expect(radio).not.toBeNull();
    radio.checked = true; radio.dispatchEvent(new Event('change')); await tick();
    expect(view.element.querySelector<HTMLElement>('.support-details')?.dataset.support).toBe('supported');
    expect(view.element.querySelector('.support-details')?.textContent).toContain('ISA: AVX');
  });
});
