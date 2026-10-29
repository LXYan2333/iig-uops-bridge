import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { JSDOM } = createRequire(process.cwd() + '/package.json')('jsdom');
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');
const windows: any[] = [];
afterEach(() => { for (const w of windows.splice(0)) w.close(); });
async function boot(mode = 'inline', language: string | undefined = 'zh-CN') {
  const dom = new JSDOM(fixture('guide.html'), {
    url: 'https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html',
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window; windows.push(w);
  await new Promise<void>(resolve => w.addEventListener('load', () => resolve(), { once: true }));
  Object.defineProperty(w.document.documentElement, 'clientHeight', { value: 1000 });
  const style = w.document.createElement('style'); style.textContent = fixture('guide-style.css'); w.document.head.append(style);
  const store = new Map<string, unknown>([['iig-uops:settings:1', { version: 1, arch: 'TGL', mode, language }]]);
  const calls: string[] = [];
  w.GM_getValue = (key: string) => store.get(key);
  w.GM_setValue = (key: string, value: unknown) => store.set(key, value);
  w.GM_deleteValue = (key: string) => store.delete(key);
  w.GM_listValues = () => [...store.keys()];
  w.GM_registerMenuCommand = () => {};
  w.GM_xmlhttpRequest = (options: any) => {
    calls.push(options.url);
    const id = options.url.split('/').at(-1);
    const files: Record<string, string> = {
      'VCVTQQ2PD_ZMM_ZMM.html': 'uops-convert.html',
      'VCVTQQ2PD_Z_ZMM_K_ZMM.html': 'uops-convert-maskz.html',
      'VCVTQQ2PD_ZMM_M64_1to8.html': 'uops-convert-broadcast.html',
      'VGATHERQPD_ZMM_K_VSIB_ZMM.html': 'uops-gather.html',
    };
    const body = files[id] && fixture(files[id]);
    queueMicrotask(() => options.onload({ status: body ? 200 : 404, responseText: body ?? '', finalUrl: options.url }));
    return { abort() {} };
  };
  w.eval(fixture('jquery.js'));
  w.$.ajax = (options: any) => {
    options.success(new w.DOMParser().parseFromString(fixture('intel-small.xml'), 'text/xml'));
    options.complete({}, 'success');
  };
  w.eval(fixture('intel-renderer.js')); w.perf2_js = {};
  w.dispatchEvent(new w.Event('load'));
  w.eval(readFileSync('dist/iig-uops-bridge.user.js', 'utf8'));
  await vi.waitFor(() => expect(w.document.querySelector('[data-iig-uops="toolbar"]')).not.toBeNull());
  await vi.waitFor(() => expect(w.document.querySelectorAll('[data-iig-uops="card"]').length).toBe(11));
  const bar = w.document.querySelector('[data-iig-uops="toolbar"]').shadowRoot;
  const getCard = (name: string): any => [...w.document.querySelectorAll('.intrinsic')].find((e: any) => e.querySelector('.signature .name').textContent === name);
  const change = (select: any, value: string) => { select.value = value; select.dispatchEvent(new w.Event('change')); };
  const open = (name: string) => {
    const c = getCard(name); c.querySelector('.signature').click();
    return c.querySelector('[data-iig-uops="card"]').shadowRoot;
  };
  return { w, bar, open, change, getCard, calls, store };
}
describe('complete bundle with the actual Intel renderer', () => {
  it('adds multiple reference architectures without replacing selected rows or making extra requests', async () => {
    const { bar, open, calls, store } = await boot();
    expect(bar.querySelector('.architecture-picker input[value="TGL"]').checked).toBe(true);
    const root = open('_mm512_cvtepi64_pd');
    await vi.waitFor(() => expect(root.querySelector('tr[data-arch="TGL"]')).not.toBeNull());
    bar.querySelector('.architecture-picker input[value="ADL-E"]').click();
    await vi.waitFor(() => expect(root.querySelector('tr[data-arch="ADL-E"]')?.textContent).toContain('不支持所需指令集'));
    root.querySelector('.reference-picker input[value="ICL"]').click();
    await vi.waitFor(() => expect(root.querySelector('tr[data-arch="ICL"]')).not.toBeNull());
    root.querySelector('.reference-picker input[value="SKX"]').click();
    await vi.waitFor(() => expect(root.querySelectorAll('.metric-table tbody tr')).toHaveLength(4));
    expect(store.get('iig-uops:settings:1')).toMatchObject({ arches: ['TGL', 'ADL-E'] });
    expect(store.get('iig-uops:settings:1')).not.toHaveProperty('arch');
    bar.querySelector('.architecture-picker input[value="ICL"]').click();
    await vi.waitFor(() => expect(root.querySelectorAll('tr[data-arch="ICL"]')).toHaveLength(1));
    await vi.waitFor(() => expect(root.querySelector('tr[data-arch="ICL"] .reference-tag')).toBeNull());
    expect(root.querySelectorAll('tr[data-arch="ICL"]')).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('switches languages immediately while preserving choices and saving the preference', async () => {
    const { bar, open, change, calls, store } = await boot();
    const root = open('_mm512_cvtepi64_pd');
    await vi.waitFor(() => expect(root.querySelector('.metric-table')).not.toBeNull());
    root.querySelector('input[type="radio"][value="VCVTQQ2PD_ZMM_M64_1to8"]').click();
    await vi.waitFor(() => expect(root.querySelector('.metric-table')?.textContent).toContain('1*p0+1*p23'));
    root.querySelector('.reference-picker input[value="ICL"]').click();
    await vi.waitFor(() => expect(root.querySelector('tr[data-arch="ICL"]')?.textContent).toContain('参考架构'));
    change(bar.querySelector('[aria-label="语言"]'), 'en');
    await vi.waitFor(() => expect(root.querySelector('tr[data-arch="ICL"]')?.textContent).toContain('Reference architecture'));
    expect(root.textContent).not.toMatch(/\p{Script=Han}/u);
    expect(root.querySelector('input[type="radio"]:checked').value).toBe('VCVTQQ2PD_ZMM_M64_1to8');
    expect(bar.querySelector('[aria-label="Language"]').value).toBe('en');
    expect(store.get('iig-uops:settings:1')).toMatchObject({ language: 'en', arches: ['TGL'], mode: 'inline' });
    expect(calls).toHaveLength(2);
    change(bar.querySelector('[aria-label="Language"]'), 'zh-CN');
    await vi.waitFor(() => expect(root.querySelector('tr[data-arch="ICL"]')?.textContent).toContain('参考架构'));
    expect(calls).toHaveLength(2);
  });
  it('falls back to the browser language for an unsupported saved language', async () => {
    const { bar } = await boot('click', 'unsupported');
    expect(bar.querySelector('[aria-label="Language"]').value).toBe('en');
    expect(bar.querySelector('[aria-label="Display mode"]').value).toBe('click');
  });

  it('injects once, fetches only opened intrinsics, and follows manual variant and architecture choices', async () => {
    const { w, bar, open, change, calls, store } = await boot();
    expect(calls).toHaveLength(0);
    const root = open('_mm512_cvtepi64_pd');
    await vi.waitFor(() => expect(root.querySelector('.metric-table')?.textContent).toContain('1*p0'));
    expect(calls).toHaveLength(1);
    root.querySelector('input[type="radio"][value="VCVTQQ2PD_ZMM_M64_1to8"]').click();
    await vi.waitFor(() => expect(root.querySelector('.metric-table')?.textContent).toContain('1*p0+1*p23'));
    bar.querySelector('.architecture-picker input[value="ADL-E"]').click();
    bar.querySelector('.architecture-picker input[value="TGL"]').click();
    await vi.waitFor(() => expect(root.querySelector('.metric-table')?.textContent).toContain('不支持所需指令集'));
    expect(root.querySelector('.metric-table')?.textContent).toContain('不支持所需指令集');
    expect(store.get('iig-uops:settings:1')).toMatchObject({ arches: ['ADL-E'] });
    w.eval(readFileSync('dist/iig-uops-bridge.user.js', 'utf8'));
    await new Promise(r => setTimeout(r, 30));
    expect(w.document.querySelectorAll('[data-iig-uops="toolbar"]').length).toBe(1);
  });
  it('supports click and sidebar modes without additional requests or duplicate views', async () => {
    const { w, bar, open, change, calls } = await boot('click');
    const root = open('_mm512_cvtepi64_pd');
    expect(calls).toHaveLength(0);
    root.querySelector('button').click();
    await vi.waitFor(() => expect(root.querySelector('.metric-table')).not.toBeNull());
    change(bar.querySelector('[aria-label="展示方式"]'), 'sidebar');
    const side = w.document.querySelector('[data-iig-uops="sidebar"]').shadowRoot;
    await vi.waitFor(() => expect(side.querySelector('.metric-table')).not.toBeNull());
    expect(root.querySelector('.view')).toBeNull();
    change(bar.querySelector('[aria-label="展示方式"]'), 'inline');
    await vi.waitFor(() => expect(root.querySelector('.metric-table')).not.toBeNull());
    expect(side.querySelector('.view')).toBeNull();
    expect(calls).toHaveLength(1);
  });
  it('matches gather and survives complete Guide re-rendering', async () => {
    const { w, open, calls } = await boot();
    const root = open('_mm512_i64gather_pd');
    await vi.waitFor(() => expect(root.querySelector('.metric-table')?.textContent).toContain('5.00'));
    expect(root.textContent).toContain('vm32z 与其 XED');
    expect(root.querySelector('.details-table')?.textContent).toContain('≤13');
    w.renderPass();
    await vi.waitFor(() => expect(w.document.querySelectorAll('[data-iig-uops="card"]').length).toBe(11));
    const again = open('_mm512_i64gather_pd');
    await vi.waitFor(() => expect(again.querySelector('.metric-table')?.textContent).toContain('5.00'));
    expect(calls).toHaveLength(1);
  });
});
