import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = 'https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html';
const fixtures = resolve('tests/fixtures');
const files: Record<string, string> = {
  VPSHRDQ_ZMM_ZMM_ZMM_I8: 'uops-shrdi.html',
  VCVTQQ2PD_ZMM_ZMM: 'uops-convert.html', VCVTQQ2PD_Z_ZMM_K_ZMM: 'uops-convert-maskz.html',
  VCVTQQ2PD_ZMM_M64_1to8: 'uops-convert-broadcast.html', VGATHERQPD_ZMM_K_VSIB_ZMM: 'uops-gather.html',
};
async function setup(page: Page, mode = 'inline', language = 'zh-CN') {
  const calls: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'uops.info') {
      const id = url.pathname.split('/').at(-1)!.replace('.html', ''); calls.push(id);
      const name = files[id];
      return route.fulfill({ status: name ? 200 : 404, contentType: 'text/html', body: name ? readFileSync(resolve(fixtures, name)) : 'No fixture' });
    }
    if (url.pathname.endsWith('/index.html')) return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(fixtures, 'guide.html')) });
    if (url.pathname.endsWith('.xml')) return route.fulfill({ contentType: 'text/xml', body: readFileSync(resolve(fixtures, 'intel-small.xml')) });
    if (url.pathname.startsWith('/tests/fixtures/')) {
      const name = url.pathname.split('/').at(-1)!;
      return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: readFileSync(resolve(fixtures, name)) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  // Browser integration with a faithful GM boundary; actual extension installation is a separate smoke test.
  await page.addInitScript(({ mode, language }) => {
    const w = window as any;
    const prefix = 'test-gm:';
    w.GM_getValue = (key: string) => { const value = localStorage.getItem(prefix + key); return value ? JSON.parse(value) : undefined; };
    w.GM_setValue = (key: string, value: unknown) => localStorage.setItem(prefix + key, JSON.stringify(value));
    w.GM_deleteValue = (key: string) => localStorage.removeItem(prefix + key);
    w.GM_listValues = () => Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
    w.GM_registerMenuCommand = () => {};
    w.GM_xmlhttpRequest = (options: any) => {
      fetch(options.url).then(async r => options.onload({ status: r.status, responseText: await r.text(), finalUrl: r.url })).catch(options.onerror);
      return { abort() {} };
    };
    if (!w.GM_getValue('iig-uops:settings:1')) w.GM_setValue('iig-uops:settings:1', { version: 1, arch: 'TGL', mode, language });
  }, { mode, language });
  // fetch is same-origin constrained unlike GM; the test route supplies the appropriate CORS header.
  await page.route('https://uops.info/**', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!.replace('.html', ''); calls.push(id);
    const name = files[id];
    await route.fulfill({ status: name ? 200 : 404, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: name ? readFileSync(resolve(fixtures, name)) : 'No fixture' });
  });
  await page.goto(base);
  await expect(page.locator('.intrinsic')).toHaveCount(10);
  await page.addScriptTag({ path: 'dist/iig-uops-bridge.user.js' });
  await expect(page.locator('.architecture-picker summary')).toBeVisible();
  return calls;
}
const card = (page: Page, name: string) => page.locator('.intrinsic').filter({ has: page.locator('.signature .name').filter({ hasText: new RegExp(`^${name}$`) }) });

test('finds VPSHRDQ despite a missing XML URL and displays its Tiger Lake measurements', async ({ page }) => {
  const calls = await setup(page);
  const c = card(page, '_mm512_shrdi_epi64');
  await c.locator('.signature').click();
  await expect(c.locator('.metric-table')).toContainText('1*p0');
  await expect(c.locator('.metric-table').getByRole('link', { name: 'Tiger Lake', exact: true }))
    .toHaveAttribute('href', 'https://uops.info/html-instr/VPSHRDQ_ZMM_ZMM_ZMM_I8.html#TGL');
  expect(calls).toEqual(['VPSHRDQ_ZMM_ZMM_ZMM_I8']);
});

test('inline is lazy, displays correct TGL data, changes variants and persists settings', async ({ page }) => {
  const calls = await setup(page);
  expect(calls).toHaveLength(0);
  const c = card(page, '_mm512_cvtepi64_pd'); await c.locator('.signature').click();
  await expect(c.locator('.metric-table')).toContainText('1*p0');
  expect(calls).toEqual(['VCVTQQ2PD_ZMM_ZMM']);
  await expect(c.locator('.metric-table').getByRole('link', { name: 'Tiger Lake', exact: true })).toHaveAttribute('href', /VCVTQQ2PD_ZMM_ZMM.html#TGL$/);
  await c.getByText(/其他变体 \/ 手动选择/).click();
  await c.getByRole('radio', { name: 'VCVTQQ2PD (ZMM, M64_1to8)', exact: true }).check();
  await expect(c.getByRole('radio', { name: 'VCVTQQ2PD (ZMM, M64_1to8)', exact: true })).toBeChecked();
  await expect(c.locator('input[type="radio"]:checked')).toHaveCount(1);
  await expect(c.locator('.metric-table')).toContainText('1*p0+1*p23');
  const broadcast = c.getByRole('radio', { name: 'VCVTQQ2PD (ZMM, M64_1to8)', exact: true });
  await expect(broadcast).toBeFocused();
  await broadcast.press('ArrowLeft');
  await expect(broadcast).not.toBeChecked();
  await c.locator('input[type="radio"]:checked').press('ArrowRight');
  await expect(broadcast).toBeChecked();
  await expect(c.locator('.metric-table')).toContainText('1*p0+1*p23');
  await page.locator('.architecture-picker summary').click();
  await page.locator('.architecture-picker').getByRole('checkbox', { name: 'Alder Lake-E', exact: true }).check();
  await page.locator('.architecture-picker').getByRole('checkbox', { name: 'Tiger Lake', exact: true }).uncheck();
  await expect(c.getByText(/不支持所需指令集/)).toBeVisible();
  await expect(c.locator('.metric-table')).toContainText('不支持所需指令集');
  await page.reload(); await page.addScriptTag({ path: 'dist/iig-uops-bridge.user.js' });
  await expect(page.locator('.architecture-picker input[value="ADL-E"]')).toBeChecked();
  await expect(page.locator('.architecture-picker input[value="TGL"]')).not.toBeChecked();
});

test('click mode waits for explicit lookup; switching modes moves one shared view', async ({ page }) => {
  const calls = await setup(page, 'click');
  const c = card(page, '_mm512_cvtepi64_pd'); await c.locator('.signature').click();
  await expect(c.getByRole('button', { name: '查看 uops.info', exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
  await c.getByRole('button', { name: '查看 uops.info', exact: true }).click();
  await expect(c.locator('.metric-table')).toBeVisible();
  await page.getByLabel('展示方式', { exact: true }).selectOption('sidebar');
  const side = page.locator('[data-iig-uops="sidebar"]');
  await expect(side.locator('.metric-table')).toBeVisible();
  await expect(c.locator('.metric-table')).toHaveCount(0);
  await page.getByLabel('展示方式', { exact: true }).selectOption('inline');
  await expect(c.locator('.metric-table')).toBeVisible();
  expect(calls).toHaveLength(1);
});

test('gather uses its real VSIB page; filtering/re-rendering never duplicates panels', async ({ page }) => {
  await setup(page);
  const c = card(page, '_mm512_i64gather_pd'); await c.locator('.signature').click();
  await expect(c.getByText(/vm32z 与其 XED/)).toBeVisible();
  await expect(c.locator('.metric-table')).toContainText('5.00');
  await c.getByText(/Tiger Lake · 测量细节：操作数延迟、吞吐与 μops/).click();
  await expect(c.locator('.details-table')).toContainText('≤13');
  await page.locator('#ig_search').fill('_mm512_cvtepi64_pd'); await page.locator('#ig_search').press('Enter');
  await expect(card(page, '_mm512_cvtepi64_pd')).toBeVisible();
  await page.locator('#ig_search').fill(''); await page.locator('#ig_search').press('Enter');
  await expect(page.locator('.intrinsic')).toHaveCount(10);
  for (const c of await page.locator('.intrinsic').all()) await expect(c.locator('[data-iig-uops="card"]')).toHaveCount(1);
});


test('English UI switches live, persists language on reload, and translates the sidebar', async ({ page }) => {
  const calls = await setup(page, 'inline', 'en');
  const c = card(page, '_mm512_cvtepi64_pd'); await c.locator('.signature').click();
  await expect(c.getByText('Confirmed match', { exact: true })).toBeVisible();
  await expect(c.locator('.metric-table')).toContainText('Executed μops');
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await expect(c.getByText('已确认匹配', { exact: true })).toBeVisible();
  await page.getByLabel('展示方式', { exact: true }).selectOption('sidebar');
  const side = page.locator('[data-iig-uops="sidebar"]');
  await expect(side.getByRole('button', { name: '收起', exact: true })).toBeVisible();
  await page.getByLabel('语言', { exact: true }).selectOption('en');
  await expect(side.getByRole('button', { name: 'Collapse', exact: true })).toBeVisible();
  await expect(side.locator('.metric-table')).toContainText('Executed μops');
  await expect(side.getByText('Confirmed match', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  await page.reload(); await page.addScriptTag({ path: 'dist/iig-uops-bridge.user.js' });
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
  await expect(page.getByLabel('Display mode', { exact: true })).toHaveValue('sidebar');
});

test('native performance setting hides only Intel data and survives rerendering and reload', async ({ page }) => {
  await setup(page, 'inline', 'en');
  const renderNativePerformance = () => page.evaluate(() => {
    const w = window as any;
    w.perf2_js = {};
    for (const intrinsic of w.intrinsics) {
      for (const instruction of intrinsic.instructions) {
        w.perf2_js[instruction.xed] = [{ 'Fixture CPU': { l: '4', t: '1' } }];
      }
    }
    w.renderPass();
  });
  await renderNativePerformance();
  const c = card(page, '_mm512_cvtepi64_pd'); await c.locator('.signature').click();
  const title = c.getByRole('heading', { name: 'Latency and Throughput', exact: true });
  await expect(title).toBeVisible();
  await expect(c.locator('table.performance')).toBeVisible();
  await page.getByText('Settings / data', { exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: "Hide Intel Guide's built-in latency and throughput table" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(title).toBeHidden();
  await expect(c.locator('table.performance')).toBeHidden();
  await expect(c.locator('table.performance')).toHaveCount(1);
  await expect(c.locator('.metric-table')).toBeVisible();
  await expect(c.getByRole('heading', { name: 'Description', exact: true })).toBeVisible();
  await renderNativePerformance();
  await c.locator('.signature').click();
  await expect(c.locator('.metric-table')).toBeVisible();
  await expect(title).toBeHidden();
  await expect(c.locator('table.performance')).toBeHidden();
  await page.reload(); await page.addScriptTag({ path: 'dist/iig-uops-bridge.user.js' });
  await page.getByText('Settings / data', { exact: true }).click();
  await expect(toggle).toBeChecked();
  await renderNativePerformance();
  // Guide restores expanded state from its URL hash after a reload.
  if (!(await c.locator('.details').isVisible())) await c.locator('.signature').click();
  await expect(title).toBeHidden();
  await expect(c.locator('table.performance')).toBeHidden();
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  const translatedToggle = page.getByRole('checkbox', { name: '隐藏 Intel Guide 自带的延迟和吞吐表格' });
  await expect(translatedToggle).toBeChecked();
  await translatedToggle.uncheck();
  await expect(title).toBeVisible();
  await expect(c.locator('table.performance')).toBeVisible();
  await expect(c.locator('.metric-table')).toBeVisible();
});

test('multiple architectures persist and architecture cells link directly to their uops sections', async ({ page }) => {
  const calls = await setup(page, 'inline', 'en');
  const picker = page.locator('.architecture-picker');
  await picker.locator('summary').click();
  await expect(picker.getByRole('checkbox', { name: 'Tiger Lake', exact: true })).toBeChecked();
  await picker.getByRole('checkbox', { name: 'Ice Lake', exact: true }).check();
  await picker.getByRole('checkbox', { name: 'Alder Lake-E', exact: true }).check();
  await picker.locator('summary').click();
  const c = card(page, '_mm512_cvtepi64_pd'); await c.locator('.signature').click();
  await expect(c.locator('.metric-table tbody tr')).toHaveCount(3);
  for (const [id, name] of [['TGL', 'Tiger Lake'], ['ICL', 'Ice Lake'], ['ADL-E', 'Alder Lake-E']]) {
    await expect(c.locator(`tr[data-arch="${id}"]`).getByRole('link', { name, exact: true })).toHaveAttribute('href', `https://uops.info/html-instr/VCVTQQ2PD_ZMM_ZMM.html#${id}`);
  }
  await expect(c.locator('tr[data-arch="ADL-E"]')).toContainText('Required instruction set not supported');
  expect(calls).toHaveLength(1);
  await page.getByLabel('Display mode', { exact: true }).selectOption('sidebar');
  await expect(page.locator('[data-iig-uops="sidebar"] .metric-table tbody tr')).toHaveCount(3);
  await page.reload(); await page.addScriptTag({ path: 'dist/iig-uops-bridge.user.js' });
  for (const id of ['TGL', 'ICL', 'ADL-E']) await expect(picker.locator(`input[value="${id}"]`)).toBeChecked();
  await page.getByLabel('Display mode', { exact: true }).selectOption('inline');
  if (!(await c.locator('.details').isVisible())) await c.locator('.signature').click();
  await expect(c.locator('.metric-table tbody tr')).toHaveCount(3);
  await picker.locator('summary').click();
  for (const name of ['Tiger Lake', 'Ice Lake', 'Alder Lake-E']) await picker.getByRole('checkbox', { name, exact: true }).uncheck();
  await expect(c.getByText('Select at least one architecture to view measurements.', { exact: true })).toBeVisible();
  await expect(c.locator('.metric-table')).toHaveCount(0);
});

for (const mode of ['inline', 'click', 'sidebar']) {
  test(`ISA support messages survive language changes in ${mode} mode`, async ({ page }) => {
    const calls = await setup(page, mode, 'en');
    // Keep authentic instruction identity and other measurements, omit TGL/ADL-P
    // to exercise missing measurements independently from architecture support.
    await page.route('https://uops.info/html-instr/VPSHRDQ_ZMM_ZMM_ZMM_I8.html', route => {
      calls.push('VPSHRDQ_ZMM_ZMM_ZMM_I8');
      const body = readFileSync(resolve(fixtures, 'uops-shrdi.html'), 'utf8')
        .replace(/<h2 id="(?:TGL|ADL-P)">[\s\S]*?(?=<h2 id="|<\/body>)/g, '');
      return route.fulfill({ contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    });
    const picker = page.locator('.architecture-picker');
    await picker.locator('summary').click();
    for (const id of ['HSW', 'ADL-P', 'KBL']) await picker.locator(`input[value="${id}"]`).check();
    await picker.locator('summary').click();
    const c = card(page, '_mm512_shrdi_epi64'); await c.locator('.signature').click();
    if (mode === 'click') await c.getByRole('button', { name: 'View uops.info', exact: true }).click();
    const view = mode === 'sidebar' ? page.locator('[data-iig-uops="sidebar"]') : c;
    await expect(view.locator('.metric-table')).toBeVisible();
    for (const [id, status] of [['HSW', 'Required instruction set not supported'], ['TGL', 'Architecture supports it; no measurements'], ['ADL-P', 'Support depends on the specific model'], ['KBL', 'No measurements; instruction support unknown']]) {
      await expect(view.locator(`tr[data-arch="${id}"] summary`)).toHaveText(status);
    }
    await view.locator('tr[data-arch="HSW"] summary').click();
    await expect(view.locator('tr[data-arch="HSW"] .support-details').getByRole('link', { name: /Intel XED/ })).toBeVisible();
    await expect(view.locator('tr[data-arch="HSW"] small')).toHaveText('Required instruction set: AVX-512 VBMI2');
    await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
    await expect(view.locator('tr[data-arch="TGL"] summary')).toHaveText('架构支持，暂无测量数据');
    await expect(view.locator('tr[data-arch="ADL-P"] summary')).toHaveText('支持情况取决于具体型号');
    expect(calls).toEqual(['VPSHRDQ_ZMM_ZMM_ZMM_I8']);
    if (mode === 'inline') {
      await page.screenshot({ path: 'test-results/support-statuses.png', fullPage: true });
    }
  });
}

test('a failed request preserves static support information and a retry control', async ({ page }) => {
  await setup(page, 'inline', 'en');
  await page.route('https://uops.info/html-instr/VPSHRDQ_ZMM_ZMM_ZMM_I8.html', route => route.abort());
  const c = card(page, '_mm512_shrdi_epi64'); await c.locator('.signature').click();
  await expect(c.locator('.error')).toContainText('Could not connect');
  await expect(c.locator('.support-details summary')).toHaveText('Supported by the architecture model');
  await expect(c.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(c.locator('.metric-table')).toHaveCount(0);
  await expect(c).not.toContainText('no measurements');
});
