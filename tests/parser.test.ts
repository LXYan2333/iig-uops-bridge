import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { variants } from '../src/data';
import { latencySummary, parsePerformance, safeUopsUrl } from '../src/parser';
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');
const variant = (name: string) => variants.find(v => v.name === name)!;
describe('official uops.info HTML', () => {
  it('reads TGL measurements and retains all source architecture records', () => {
    const page = parsePerformance(fixture('uops-convert.html'), variant('VCVTQQ2PD (ZMM, ZMM)'));
    expect(page.measurements.TGL).toMatchObject({ loop: '1.00', unrolled: '1.00', uops: '1', ports: '1*p0' });
    expect(latencySummary(page.measurements.TGL.latencies)).toBe('4');
    expect(page.measurements['SKX'].uops).toBe('1');
    expect(page.measurements['ADL-E']).toBeUndefined();
  });
  it('separates retire slots from executed uops, preserving bounds and addressing details', () => {
    const m = parsePerformance(fixture('uops-convert-broadcast.html'), variant('VCVTQQ2PD (ZMM, M64_1to8)')).measurements.TGL;
    expect(m.uops).toBe('2');
    expect(m.details.find(d => d.label === 'Retire slots')?.value).toContain('1');
    expect(m.latencies.map(d => d.value)).toEqual(['≤12', '≤12', '≤9']);
    expect(latencySummary(m.latencies)).toBe('≤12 / ≤9');
  });
  it('separates measured throughput from port-computed throughput for gather', () => {
    const parsed = parsePerformance(fixture('uops-gather.html'), variant('VGATHERQPD (ZMM, K, VSIB_ZMM)'));
    const m = parsed.measurements.TGL;
    expect(m).toMatchObject({ computed: '4.00', loop: '5.00', unrolled: '5.00', uops: '4' });
    expect(m.latencies).toHaveLength(7);
    expect(m.latencies.find(d => d.label.includes('memory'))?.value).toBe('≤13');
    expect(m.details.every(d => !d.label.includes('IACA'))).toBe(true);
    expect(parsed.measurements.SKX.uops).toBe('4'); // IACA on the same page reports 5.
  });
  it('rejects an error document, changed identity and changed markup instead of reporting no data', () => {
    const v = variant('VCVTQQ2PD (ZMM, ZMM)');
    expect(() => parsePerformance('<h1>Access denied</h1>', v)).toThrow('身份');
    expect(() => parsePerformance(fixture('uops-convert.html'), { ...v, iform: 'wrong' })).toThrow('形式');
    expect(() => parsePerformance(fixture('uops-convert.html').replaceAll('<h2 id=', '<h3 id='), v)).toThrow('性能数据区');
  });
  it('never returns unsafe links or drops latency upper bounds', () => {
    expect(safeUopsUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUopsUrl('https://uops.info.evil.test/')).toBeUndefined();
    expect(safeUopsUrl('../html-lat/TGL/test.html#x', 'https://uops.info/html-instr/x.html')).toBe('https://uops.info/html-lat/TGL/test.html#x');
    expect(latencySummary([{ label: 'a', value: '≤3' }])).toBe('≤3');
  });
});
