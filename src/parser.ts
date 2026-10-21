import { t } from './i18n';
import type { Detail, Measurement, PerformancePage, Variant } from './types';

export const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
export function safeUopsUrl(raw: string, base = 'https://uops.info/'): string | undefined {
  try {
    const u = new URL(raw, base);
    return u.protocol === 'https:' && u.hostname === 'uops.info' && !u.username && !u.password ? u.href : undefined;
  } catch { return undefined; }
}
function ownText(node: Element): string {
  return clean([...node.childNodes].filter(n => !(n instanceof Element && /^(UL|OL)$/.test(n.tagName))).map(n => n.textContent).join(' '));
}

export function parsePerformance(html: string, variant: Variant, parse = (s: string) => new DOMParser().parseFromString(s, 'text/html')): PerformancePage {
  const doc = parse(html);
  if (clean(doc.querySelector('h1')?.textContent) !== variant.name) throw new Error(t('uops.info 页面指令身份不一致，已停止读取。'));
  const iformRow = [...doc.querySelectorAll('tr')].find(r => clean(r.cells[0]?.textContent) === 'iform:');
  if (!iformRow || clean(iformRow.cells[1]?.textContent) !== variant.iform) throw new Error(t('uops.info 指令形式已变化，请更新脚本索引。'));
  const measurements: Record<string, Measurement> = {};
  const architectures: string[] = [];
  let recognized = false;
  for (const heading of doc.querySelectorAll<HTMLHeadingElement>('h2[id]')) {
    const arch = heading.id;
    if (!/^[A-Za-z0-9+_-]+$/.test(arch)) continue;
    architectures.push(arch);
    let section: Element | null = heading.nextElementSibling;
    while (section && section.tagName !== 'UL' && section.tagName !== 'H2') section = section.nextElementSibling;
    if (!section || section.tagName !== 'UL') continue;
    // The source uses sibling <li>Measurements</li><ul>...</ul>, plus IACA / Doc siblings.
    const marker = [...section.children].find(e => e.tagName === 'LI' && ownText(e) === 'Measurements');
    if (!marker) { recognized = true; continue; }
    const data = marker.querySelector(':scope > ul') ?? (marker.nextElementSibling?.tagName === 'UL' ? marker.nextElementSibling : null);
    if (!data) throw new Error(t('uops.info 测量区结构无法识别。'));
    const m: Measurement = { arch, name: clean(heading.textContent), latencies: [], details: [] };
    const details: Detail[] = [];
    for (const li of data.querySelectorAll('li')) {
      if (li.querySelector(':scope > ul')) continue;
      const text = ownText(li);
      const split = text.indexOf(':');
      if (split < 0) {
        if (text) details.push({ label: 'Notes', value: text });
        continue;
      }
      const detail: Detail = { label: text.slice(0, split), value: text.slice(split + 1).trim() };
      const href = li.querySelector('a')?.getAttribute('href');
      if (href) detail.url = safeUopsUrl(href, `https://uops.info/html-instr/${variant.id}.html`);
      if (detail.label.startsWith('Latency operand')) m.latencies.push(detail);
      else details.push(detail);
      const key = ({ 'Measured (loop)': 'loop', 'Measured (unrolled)': 'unrolled', 'Computed from the port usage': 'computed', Executed: 'uops', 'Port usage': 'ports' } as const)[detail.label as 'Executed'];
      if (key) m[key] = detail.value;
    }
    m.details = details;
    if (!m.latencies.length && !details.length) throw new Error(t('测量区为空或格式已变化。'));
    measurements[arch] = m;
    recognized = true;
  }
  if (!recognized) throw new Error(t('没有识别到性能数据区，请直接打开原页核对。'));
  return { id: variant.id, name: variant.name, iform: variant.iform, measurements, architectures };
}

export function latencySummary(latencies: Detail[]): string {
  if (!latencies.length) return '—';
  const values = [...new Set(latencies.map(l => l.value))];
  if (values.length === 1) return values[0];
  // Show distinct measured values, retaining upper bounds; don't invent an aggregate latency.
  if (values.length <= 4) return values.join(' / ');
  return t('多种依赖（{count} 项）', { count: latencies.length });
}
