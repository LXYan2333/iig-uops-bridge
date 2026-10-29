import { t, getLanguage, type MessageKey } from './i18n';
import { archName, architectures, tableUrl, variantUrl, versions } from './data';
import { matchInstruction } from './match';
import { latencySummary } from './parser';
import { PerformanceService } from './service';
import { assessSupport, isaLabel, supportVersions, type SupportAssessment } from './support';
import { architectureFamily, techFamilies } from './architecture-families';
import { readTechFamilyColors } from './guide';
import { attachTooltip } from './tooltip';
import type { Intrinsic, MatchResult, PageResult, Settings, Variant } from './types';
import css from './style.css';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(text: string, handler: () => void, className?: string) {
  const b = el('button', text, className); b.type = 'button'; b.addEventListener('click', handler); return b;
}
export function link(text: string, href: string) {
  const a = el('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
export function makeHost(kind: string): { host: HTMLElement; root: ShadowRoot } {
  const host = el('div'); host.dataset.iigUops = kind;
  host.lang = getLanguage();
  const root = host.attachShadow({ mode: 'open' }); root.append(el('style', css));
  return { host, root };
}

const confidenceText = { confirmed: '已确认匹配', inferred: '推断匹配', ambiguous: '多个候选', none: '未确认匹配' } as const;
const supportText = { supported: '架构模型支持', unsupported: '不支持所需指令集', conditional: '支持情况取决于具体型号', unknown: '支持情况未知' } as const;
const missingText = { ...supportText, supported: '架构支持，暂无测量数据', unknown: '暂无测量数据，支持情况未知' } as const;
const reasonText = {
  unmapped: '尚未核验该架构与来源模型的对应关系。',
  incomplete: '该 ISA 的资料或特性映射不完整，无法可靠判断。',
  conflict: 'XED 与 LLVM 的模型结论不同，暂不判断是否支持。',
  alderLakeAvx512: 'Alder Lake-P 的部分早期桌面型号未禁用 AVX-512；后续型号通常已禁用，不能由架构名称判断。',
} as const;

function supportNotice(support: SupportAssessment, missing: boolean) {
  const details = el('details', undefined, 'support-details'); details.dataset.support = support.status;
  details.append(el('summary', t((missing ? missingText : supportText)[support.status])));
  details.append(el('p', `ISA: ${support.isa}`));
  if (support.reason !== 'model') details.append(el('p', t(reasonText[support.reason])));
  else if (support.status === 'unsupported') details.append(el('p', t('架构模型未包含该变体所需的 ISA。')));
  if (support.requirements.length) {
    details.append(el('p', t('CPUID 条件（满足任一组，组内全部满足）')));
    const conditions = el('ul');
    for (const group of support.requirements) {
      const item = el('li'); item.append(el('code', group.join(' & '))); conditions.append(item);
    }
    details.append(conditions);
  }
  if (support.sources.length) {
    details.append(el('p', t('来源与模型')));
    const sources = el('ul');
    for (const source of support.sources) {
      const item = el('li'); item.append(link(source.name, source.url)); sources.append(item);
    }
    details.append(sources);
  }
  details.append(el('p', t('这是架构级资料，不是当前电脑的能力检测；具体型号、固件和操作系统配置仍可能影响可用性。'), 'muted'));
  return details;
}

let nextArchitectureNote = 0;

function architectureChoices(ids: string[], selected: string[], picker: HTMLDetailsElement, legend: string, change: (id: string, checked: boolean) => void) {
  const element = el('fieldset', undefined, 'architecture-choices architecture-vendors');
  element.append(el('legend', legend, 'sr-only'));
  const cleanups: (() => void)[] = [];
  const known = new Map(architectures.map(a => [a.id, a]));
  const wanted = new Set(ids);
  const items = [...architectures.filter(a => wanted.has(a.id)), ...ids.filter(id => !known.has(id)).map(id => ({ id, name: archName(id) }))];
  const vendorOf = (id: string) => !known.has(id) ? 'unknown' : known.get(id)!.name.startsWith('AMD ') ? 'AMD' : 'Intel';
  const colors = readTechFamilyColors();
  const familyOf = new Map(items.map(a => [a.id, architectureFamily(a.id)]));
  for (const vendor of ['Intel', 'AMD', 'unknown']) {
    if (!items.some(a => vendorOf(a.id) === vendor)) continue;
    const group = el('fieldset', undefined, `architecture-vendor ${vendor.toLowerCase()}`);
    group.append(el('legend', vendor === 'unknown' ? t('未分类') : vendor));
    group.dataset.vendor = vendor;
    const choices = el('div', undefined, 'vendor-choices');
    for (const family of techFamilies) {
      const members = items.filter(a => vendorOf(a.id) === vendor && familyOf.get(a.id) === family.id);
      if (!members.length) continue;
      const row = el('div', undefined, 'architecture-family'); row.dataset.family = family.id;
      row.setAttribute('role', 'group'); row.setAttribute('aria-label', family.id === 'unknown' ? t('未分类') : family.label);
      row.style.setProperty('--family-color', colors[family.id]);
      for (const a of members) {
        const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.value = a.id; checkbox.checked = selected.includes(a.id);
        const label = el('label'); label.title = family.id === 'unknown' ? t('未分类') : family.label;
        label.append(checkbox, document.createTextNode(a.name)); row.append(label);
        if (a.id === 'ADL-P') {
          const marker = el('sup', '*'); marker.setAttribute('aria-hidden', 'true'); label.append(marker);
          label.removeAttribute('title');
          const note = el('div', t('* Alder Lake-P 消费级产品大多已屏蔽 AVX-512；部分早期桌面型号需关闭 E 核并使用兼容的 BIOS／微码才可能启用。'), 'architecture-tooltip');
          note.id = `alder-lake-avx512-note-${++nextArchitectureNote}`; note.setAttribute('role', 'tooltip'); note.hidden = true;
          group.append(note);
          checkbox.setAttribute('aria-describedby', note.id);
          cleanups.push(attachTooltip(label, note, picker));
        }
        checkbox.addEventListener('change', () => change(a.id, checkbox.checked));
      }
      choices.append(row);
    }
    group.append(choices);
    element.append(group);
  }

  const refreshColors = () => {
    if (!picker.open) return;
    const colors = readTechFamilyColors();
    for (const family of techFamilies) {
      for (const row of element.querySelectorAll<HTMLElement>(`[data-family="${family.id}"]`)) row.style.setProperty('--family-color', colors[family.id]);
    }
  };
  picker.addEventListener('toggle', refreshColors);
  return { element, dispose() {
    cleanups.forEach(cleanup => cleanup());
    picker.removeEventListener('toggle', refreshColors);
  } };
}

let nextVariantGroup = 0;

class GroupView {
  readonly element = el('section', undefined, 'group');
  private readonly radioName = `iig-uops-variant-${++nextVariantGroup}`;
  private chosen?: Variant;
  private referenceArches: string[] = [];
  private referencesOpen = false;
  private referenceScroll = new Map<string, number>();
  private cleanupReferences?: () => void;
  private referenceFocus?: string;
  private requestVersion = 0;
  private alternativesOpen = false;
  private detailsOpen = new Set<string>();
  private supportOpen = new Set<string>();
  private currentArches: string[];
  constructor(private match: MatchResult, arches: string[], private service: PerformanceService) {
    this.currentArches = [...arches];
    if (match.best.length === 1) this.chosen = match.best[0].variant;
    this.render();
  }
  setArches(arches: string[]) { this.currentArches = [...arches]; this.referenceArches = this.referenceArches.filter(a => !arches.includes(a)); this.render(); }
  setLanguage(match: MatchResult) { this.match = match; this.render(); }
  dispose() { this.requestVersion++; this.cleanupReferences?.(); this.cleanupReferences = undefined; }
  private supportNotice(support: SupportAssessment, arch: string, missing: boolean) {
    const details = supportNotice(support, missing);
    details.open = this.supportOpen.has(arch);
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      if (details.open) this.supportOpen.add(arch); else this.supportOpen.delete(arch);
    });
    return details;
  }
  private supportCell(support: SupportAssessment, arch: string, missing: boolean) {
    const cell = el('td');
    cell.append(this.supportNotice(support, arch, missing));
    if (support.status === 'unsupported') cell.append(el('small', t('所需指令集：{isa}', { isa: isaLabel(support.isa) }), 'muted'));
    return cell;
  }
  private render(force = false) {
    for (const panel of this.element.querySelectorAll<HTMLElement>('.reference-picker [data-vendor]')) {
      this.referenceScroll.set(panel.dataset.vendor!, panel.querySelector('.vendor-choices')!.scrollTop);
    }
    this.cleanupReferences?.(); this.cleanupReferences = undefined;
    const version = ++this.requestVersion;
    const displayedArches = [...this.currentArches, ...this.referenceArches];
    this.element.replaceChildren();
    const title = el('div', undefined, 'group-title');
    const chosenCandidate = this.match.best.find(c => c.variant.id === this.chosen?.id);
    const badge = this.chosen && !chosenCandidate ? t('手动参考变体') : this.chosen && this.match.best.length > 1 ? t('已选择候选 · 请核对参数') : t(confidenceText[this.match.confidence]);
    title.append(el('code', `${this.match.instruction.mnemonic} ${this.match.instruction.form}`), el('span', badge, `badge ${this.chosen && !chosenCandidate ? 'none' : this.match.confidence}`));
    this.element.append(title);
    for (const note of this.match.notes) this.element.append(el('p', note, 'notice'));
    if (!this.match.best.length) this.element.append(el('p', t('当前索引未找到可以确认的对应条目。'), 'muted'));
    if (this.match.best.length > 1) {
      for (const c of this.match.best) {
        const row = el('div', undefined, 'candidate');
        row.append(button(c.variant.name, () => { this.chosen = c.variant; this.referenceArches = []; this.render(); }), el('p', c.reasons.join(t('；')), 'muted'));
        this.element.append(row);
      }
    }
    const alternatives = [...this.match.best.map(c => c.variant), ...this.match.related];
    if (alternatives.length > 1 || this.match.related.length) {
      const details = el('details'); details.open = this.alternativesOpen;
      details.addEventListener('toggle', () => { this.alternativesOpen = details.open; });
      details.append(el('summary', t('其他变体 / 手动选择（{count}）', { count: alternatives.length })));
      const choices = el('fieldset', undefined, 'variant-choices'); choices.setAttribute('role', 'radiogroup');
      choices.append(el('legend', t('指令变体'), 'sr-only'));
      for (const v of alternatives) {
        const radio = el('input'); radio.type = 'radio'; radio.name = this.radioName; radio.value = v.id;
        radio.checked = this.chosen?.id === v.id;
        const label = el('label', undefined, `variant-option${radio.checked ? ' selected' : ''}`);
        label.append(radio, el('code', v.name));
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          this.alternativesOpen = details.open;
          const scrollTop = choices.scrollTop;
          this.chosen = v; this.referenceArches = []; this.render();
          const nextChoices = this.element.querySelector<HTMLElement>('.variant-choices');
          if (nextChoices) nextChoices.scrollTop = scrollTop;
          // Keep native arrow-key navigation working after replacing the controls.
          this.element.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus({ preventScroll: true });
        });
        choices.append(label);
      }
      details.append(choices, el('p', t('其他变体仅供参考；编译器可能根据上下文选用内存、广播或不同编码。'), 'muted'));
      this.element.append(details);
    }
    const actions = el('div', undefined, 'actions');
    actions.append(link(t('搜索 uops.info 表格'), tableUrl(this.match.instruction.mnemonic, displayedArches)));
    this.element.append(actions);
    const v = this.chosen;
    if (!v) return;
    const candidate = this.match.best.find(c => c.variant.id === v.id);
    this.element.append(el('h4', v.name));
    this.element.append(el('p', candidate ? candidate.reasons.join(t('；')) : t('手动选择的相关变体，未确认为此 intrinsic 的直接对应。'), candidate ? 'muted' : 'notice'));
    if (!displayedArches.length) {
      this.element.append(el('p', t('请选择至少一个架构以查看测量数据。'), 'notice')); return;
    }
    const content = el('div'); content.setAttribute('aria-live', 'polite');
    const sourceLinks = () => {
      const table = el('table', undefined, 'source-links');
      for (const arch of displayedArches) {
        const row = el('tr'); const cell = el('th'); cell.scope = 'row';
        cell.append(link(archName(arch), variantUrl(v, arch)));
        row.append(cell, this.supportCell(assessSupport(v, arch), arch, false)); table.append(row);
      }
      return table;
    };
    content.append(el('p', t('正在读取 uops.info…'), 'loading'), sourceLinks());
    this.element.append(content);
    void this.service.load(v, force).then(result => {
      if (version === this.requestVersion) this.renderData(content, result, displayedArches, v);
    }).catch(error => {
      if (version !== this.requestVersion) return;
      content.replaceChildren(el('p', error instanceof Error ? error.message : String(error), 'error'), sourceLinks(), button(t('重试'), () => this.render(true)));
    });
  }
  private renderData(content: HTMLElement, result: PageResult, displayedArches: string[], variant: Variant) {
    content.replaceChildren();
    const page = result.record.page;
    const table = el('table', undefined, 'metric-table comparison-table');
    const head = el('tr');
    for (const label of [t('架构'), t('延迟 · cycles'), t('实测吞吐 · cycles/insn'), t('执行 μops'), t('端口')]) {
      const th = el('th', label); th.scope = 'col'; head.append(th);
    }
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody'); table.append(thead, tbody);
    const wrap = el('div', undefined, 'comparison-scroll'); wrap.append(table); content.append(wrap);
    content.append(el('small', t('架构名称可跳转到 uops.info 对应章节。'), 'muted'));
    const detailSections = el('div');
    for (const arch of displayedArches) {
      const m = page.measurements[arch];
      const support = assessSupport(variant, arch);
      const reference = this.referenceArches.includes(arch);
      const row = el('tr'); row.dataset.arch = arch;
      const heading = el('th'); heading.scope = 'row';
      heading.append(link(archName(arch), variantUrl(variant, arch)));
      if (reference) heading.append(el('small', t('参考架构'), 'reference-tag'));
      row.append(heading);
      if (!m) {
        const cell = this.supportCell(support, arch, true); cell.colSpan = 4; row.append(cell);
      } else {
        const throughput = m.unrolled ? `${m.unrolled} (unrolled)` : m.loop ? `${m.loop} (loop)` : '—';
        for (const value of [latencySummary(m.latencies), throughput, m.uops || '—', m.ports || '—']) row.append(el('td', value));
        const details = el('details', undefined, 'architecture-details'); details.dataset.arch = arch; details.open = this.detailsOpen.has(arch);
        details.addEventListener('toggle', () => { if (details.open) this.detailsOpen.add(arch); else this.detailsOpen.delete(arch); });
        details.append(el('summary', `${archName(arch)} · ${t('测量细节：操作数延迟、吞吐与 μops')}`));
        if (m.latencies.length > 1) details.append(el('p', t('延迟按依赖路径不同；多个数值不代表整个 intrinsic 的统一延迟。'), 'muted'));
        const dt = el('table', undefined, 'details-table');
        for (const d of [...m.latencies, ...m.details]) {
          const detailRow = el('tr'); const th = el('th'); th.scope = 'row';
          const label = d.label === 'Notes' || d.label === '说明' ? t('说明') : d.label;
          th.append(d.url ? link(label, d.url) : document.createTextNode(label));
          detailRow.append(th, el('td', d.value)); dt.append(detailRow);
        }
        details.append(dt);
        if (support.status === 'unsupported' || support.reason === 'conflict') {
          // Actual measurements take precedence over static architecture models.
          const warning = el('small', t('测试配置与架构资料存在差异；保留实测值。'), 'notice');
          row.lastElementChild?.append(warning);
          details.append(this.supportNotice(support, arch, false));
        } else if (support.status === 'conditional') {
          row.lastElementChild?.append(el('small', t('实测值来自 uops.info 的测试配置，不能保证所有同架构型号都支持。'), 'muted'));
          details.append(this.supportNotice(support, arch, false));
        }
        detailSections.append(details);
      }
      tbody.append(row);
    }
    content.append(detailSections);
    const available = Object.keys(page.measurements).filter(a => !this.currentArches.includes(a));
    if (available.length) {
      const references = el('details', undefined, 'reference-picker'); references.open = this.referencesOpen;
      references.addEventListener('toggle', () => { this.referencesOpen = references.open; });
      references.append(el('summary', t('参考架构（多选）')));
      const selection = architectureChoices(available, this.referenceArches, references, t('参考架构（多选）'), (arch, checked) => {
        this.referencesOpen = references.open;
        this.referenceArches = checked ? [...this.referenceArches, arch] : this.referenceArches.filter(a => a !== arch);
        this.referenceFocus = arch; this.render();
      });
      const choices = selection.element; this.cleanupReferences = selection.dispose;
      references.append(choices, el('p', t('不改变感兴趣架构；参考数据会作为额外行显示。'), 'muted')); content.append(references);
      for (const panel of choices.querySelectorAll<HTMLElement>('[data-vendor]')) {
        panel.querySelector('.vendor-choices')!.scrollTop = this.referenceScroll.get(panel.dataset.vendor!) ?? 0;
      }
      if (this.referenceFocus) {
        [...choices.querySelectorAll<HTMLInputElement>('input')].find(input => input.value === this.referenceFocus)?.focus({ preventScroll: true });
        this.referenceFocus = undefined;
      }
    }
    const footer = el('div', undefined, 'footer');
    footer.append(el('small', t('{label}：{value}', { label: result.stale ? t('旧缓存') : t('读取时间'), value: new Date(result.record.fetchedAt).toLocaleString(getLanguage()) })), button(t('刷新数据'), () => this.render(true)));
    content.append(footer);
    if (result.error) content.append(el('p', `${result.error}${result.stale ? t(' 当前显示上次成功读取的数据。') : ''}`, 'notice'));
  }
}

export class IntrinsicView {
  readonly element = el('div', undefined, 'view');
  arches: string[];
  language = getLanguage();
  private groups: GroupView[] = [];
  private notices: { node: HTMLElement; key: MessageKey }[] = [];
  private notice(key: MessageKey, className: string) {
    const node = el('p', t(key), className); this.notices.push({ node, key }); this.element.append(node);
  }
  constructor(private intrinsic: Intrinsic, settings: Settings, service: PerformanceService) {
    this.arches = [...settings.arches]; this.element.lang = getLanguage();
    const header = el('div', undefined, 'view-head');
    header.append(el('h3', intrinsic.name), el('span', 'uops.info', 'brand'));
    this.element.append(header);
    if (!intrinsic.snapshot) this.notice('当前条目与内置 Intel 索引不完全一致；已退回页面描述匹配。', 'notice');
    if (intrinsic.sequence) this.notice('此 intrinsic 生成指令序列。下列单条指令数据不能代表整个 intrinsic 的成本，也不直接相加。', 'notice');
    else if (intrinsic.instructions.length > 1) this.notice('Guide 列出了多种可能指令，具体选择取决于编译器和上下文。', 'notice');
    if (!intrinsic.instructions.length) this.notice('Guide 未提供可直接对应的机器指令。请检查实际生成的汇编。', 'muted');
    for (const instruction of intrinsic.instructions) {
      const group = new GroupView(matchInstruction(intrinsic, instruction), settings.arches, service);
      this.groups.push(group); this.element.append(group.element);
    }
  }
  setLanguage() {
    this.language = getLanguage(); this.element.lang = this.language;
    for (const { node, key } of this.notices) node.textContent = t(key);
    this.groups.forEach((group, index) => group.setLanguage(matchInstruction(this.intrinsic, this.intrinsic.instructions[index])));
  }
  setArches(arches: string[]) { this.arches = [...arches]; for (const group of this.groups) group.setArches(arches); }
  dispose() { for (const group of this.groups) group.dispose(); }
}

export function toolbar(settings: Settings, change: (s: Settings) => void, service: PerformanceService) {
  const { host, root } = makeHost('toolbar');
  let renderedLanguage = getLanguage();
  let mode: HTMLSelectElement;
  let archSummary: HTMLElement;
  let archChoices: HTMLFieldSetElement;
  function refreshArches() {
    archSummary.textContent = `${t('感兴趣架构（{count}）', { count: settings.arches.length })}: ${settings.arches.slice(0, 3).map(archName).join(', ')}${settings.arches.length > 3 ? ', …' : ''}`;
    for (const checkbox of archChoices.querySelectorAll<HTMLInputElement>('input')) checkbox.checked = settings.arches.includes(checkbox.value);
  }
  let hideNative: HTMLInputElement;
  let cleanupChoices: (() => void) | undefined;
  function render() {
    cleanupChoices?.();
    host.lang = getLanguage();
    const bar = el('div', undefined, 'toolbar');
    bar.append(el('span', t('uops.info 桥接'), 'brand'));
    const picker = el('details', undefined, 'architecture-picker');
    archSummary = el('summary'); picker.append(archSummary);
    const choices = architectureChoices(architectures.map(a => a.id), settings.arches, picker, t('感兴趣架构'), (id, checked) => {
      change({ ...settings, arches: checked ? [...settings.arches, id] : settings.arches.filter(arch => arch !== id) });
    });
    archChoices = choices.element; cleanupChoices = choices.dispose;
    refreshArches(); picker.append(archChoices);
    mode = el('select'); mode.setAttribute('aria-label', t('展示方式'));
    for (const [id, label] of [['inline', t('详情内自动显示')], ['click', t('点击后展开')], ['sidebar', t('固定右侧栏')]]) mode.append(new Option(label, id));
    mode.value = settings.mode;
    const modeLabel = el('label', t('展示')); modeLabel.append(mode);
    const language = el('select'); language.setAttribute('aria-label', t('语言'));
    language.append(new Option('English', 'en'), new Option('简体中文', 'zh-CN')); language.value = getLanguage();
    const languageLabel = el('label', t('语言')); languageLabel.append(language);
    language.addEventListener('change', () => change({ ...settings, language: language.value as Settings['language'] }));
    bar.append(picker, modeLabel, languageLabel);
    mode.addEventListener('change', () => change({ ...settings, mode: mode.value as Settings['mode'] }));
    const details = el('details', undefined, 'settings-panel'); details.append(el('summary', t('设置 / 数据')));
    const info = el('div', undefined, 'settings-content');
    hideNative = el('input'); hideNative.type = 'checkbox'; hideNative.checked = !!settings.hideNativePerformance;
    const hideNativeLabel = el('label');
    hideNativeLabel.append(hideNative, document.createTextNode(t('隐藏 Intel Guide 自带的延迟和吞吐表格')));
    hideNative.addEventListener('change', () => change({ ...settings, hideNativePerformance: hideNative.checked }));
    info.append(hideNativeLabel);
    info.append(el('small', t('Intel 索引 {intel} · uops.info 索引 {uops} · 缓存 7 天', { intel: versions.intel, uops: versions.uops })));
    info.append(el('small', t('支持资料：XED {xed} · LLVM {llvm}', { xed: supportVersions.xed.slice(0, 8), llvm: supportVersions.llvm.slice(0, 8) })));
    const status = el('small'); status.setAttribute('role', 'status');
    info.append(button(t('清理性能缓存'), () => {
      void service.clear().then(() => { status.textContent = t('缓存已清理，下次查看将重新读取。'); }).catch(() => { status.textContent = t('清理失败，请重试。'); });
    }), status);
    details.append(info); bar.append(details); root.append(bar);
  }
  render();
  return { host, refresh(s: Settings) {
    settings = s;
    if (renderedLanguage !== getLanguage()) {
      const open = root.querySelector<HTMLDetailsElement>('.settings-panel')?.open;
      const archesOpen = root.querySelector<HTMLDetailsElement>('.architecture-picker')?.open;
      root.querySelector('.toolbar')?.remove(); render();
      root.querySelector<HTMLDetailsElement>('.settings-panel')!.open = !!open;
      root.querySelector<HTMLDetailsElement>('.architecture-picker')!.open = !!archesOpen; renderedLanguage = getLanguage();
    } else { refreshArches(); mode.value = s.mode; hideNative.checked = !!s.hideNativePerformance; }
  } };
}
