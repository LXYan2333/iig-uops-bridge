import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { detectLanguage, english, setLanguage, t, type MessageKey } from '../src/i18n';
import { byName, variants } from '../src/data';
import { latencySummary, parsePerformance } from '../src/parser';
import { IntrinsicView } from '../src/ui';
import { requestHtml, type PerformanceService } from '../src/service';
const intrinsic = byName.get('_mm512_cvtepi64_pd')![0];
const variant = variants.find(v => v.name === 'VCVTQQ2PD (ZMM, ZMM)')!;
const html = readFileSync('tests/fixtures/uops-convert.html', 'utf8');
const tick = () => new Promise(r => setTimeout(r, 0));

describe('internationalization', () => {
  it('uses the preferred browser language with an English fallback', () => {
    expect(detectLanguage(['zh-CN', 'en'])).toBe('zh-CN');
    expect(detectLanguage(['zh-TW'])).toBe('zh-CN');
    expect(detectLanguage(['en-GB', 'zh-CN'])).toBe('en');
    expect(detectLanguage(['de-DE'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
  it('has complete English translations with identical interpolation parameters', () => {
    const params = (s: string) => [...s.matchAll(/\{\w+\}/g)].map(m => m[0]).sort();
    for (const [key, translated] of Object.entries(english)) {
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toMatch(/\p{Script=Han}/u);
      expect(params(translated)).toEqual(params(key));
      setLanguage('en'); expect(t(key as MessageKey)).toBe(translated);
      setLanguage('zh-CN'); expect(t(key as MessageKey)).toBe(key);
    }
    setLanguage('en');
    expect(t('其他变体 / 手动选择（{count}）', { count: 12 })).toBe('Other variants / manual selection (12)');
  });
  it('keeps cached measurement data independent of language', () => {
    setLanguage('en'); const en = parsePerformance(html, variant);
    setLanguage('zh-CN'); expect(parsePerformance(html, variant)).toEqual(en);
    const latencies = Array.from({ length: 5 }, (_, i) => ({ label: `operand ${i}`, value: `≤${i}` }));
    expect(latencySummary(latencies)).toBe('多种依赖（5 项）');
    setLanguage('en'); expect(latencySummary(latencies)).toBe('Multiple dependencies (5)');
  });
  it('switches an open result without losing variant, reference architecture, or expanded details', async () => {
    const page = parsePerformance(html, variant);
    const service = { load: async () => ({ record: { version: 1, fetchedAt: 100, page }, stale: false }) } as unknown as PerformanceService;
    const view = new IntrinsicView(intrinsic, { version: 1, arches: ['TGL'], mode: 'inline' }, service);
    await tick();
    const reference = view.element.querySelector<HTMLInputElement>('.reference-picker input[value="ICL"]')!;
    reference.checked = true; reference.dispatchEvent(new Event('change')); await tick();
    const details = [...view.element.querySelectorAll('details')];
    for (const d of details) d.open = true;
    await tick();
    setLanguage('en'); view.setLanguage(); await tick();
    expect(view.element.textContent).not.toMatch(/\p{Script=Han}/u);
    expect(view.element.querySelector('tr[data-arch="ICL"]')?.textContent).toContain('Reference architecture');
    expect(view.element.textContent).toContain('Using a verified VCVTQQ2PD XED alias');
    expect(view.element.querySelector<HTMLInputElement>('input[type="radio"]:checked')!.value).toBe(variant.id);
    expect([...view.element.querySelectorAll('details')].every(d => d.open)).toBe(true);
    expect(view.element.lang).toBe('en');
  });
  it('localizes parser errors and an in-flight network failure in the current language', async () => {
    setLanguage('en');
    expect(() => parsePerformance('<h1>Access denied</h1>', variant)).toThrow('different instruction');
    let fail: () => void = () => {};
    vi.stubGlobal('GM_xmlhttpRequest', (options: { onerror(): void }) => { fail = options.onerror; return { abort() {} }; });
    try {
      const pending = requestHtml('https://uops.info/html-instr/VCVTQQ2PD_ZMM_ZMM.html');
      setLanguage('zh-CN'); fail();
      await expect(pending).rejects.toThrow('无法连接');
    } finally { vi.unstubAllGlobals(); }
  });
});
