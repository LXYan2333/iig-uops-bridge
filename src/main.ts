import { t, detectLanguage, getLanguage, setLanguage } from './i18n';
import { selectedArchitectures } from './data';
import { markNativePerformance, readIntrinsic } from './guide';
import { gmStorage, PerformanceService } from './service';
import { button, el, IntrinsicView, makeHost, toolbar } from './ui';
import type { Intrinsic, Settings } from './types';

const SETTINGS_KEY = 'iig-uops:settings:1';
const defaults: Settings = { version: 1, arches: ['TGL'], mode: 'inline', language: detectLanguage(), hideNativePerformance: false };
interface Card { node: HTMLElement; details: HTMLElement; intrinsic: Intrinsic; host: HTMLElement; root: ShadowRoot; view?: IntrinsicView; opened: boolean; near: boolean; }

async function start() {
  if (document.querySelector('[data-iig-uops="toolbar"]')) return true;
  const list = document.querySelector<HTMLElement>('#intrinsics_list');
  const search = document.querySelector('#ig_search_wrapper');
  if (!list || !search) return false;
  let saved: (Partial<Settings> & { arch?: unknown }) | undefined;
  try { saved = await gmStorage.get<Partial<Settings> & { arch?: unknown }>(SETTINGS_KEY); } catch { /* Defaults work without storage. */ }
  if (document.querySelector('[data-iig-uops="toolbar"]')) return true;
  let settings: Settings = { ...defaults };
  if (saved?.version === 1) {
    settings.arches = selectedArchitectures(saved);
    if (saved.language === 'en' || saved.language === 'zh-CN') settings.language = saved.language;
    if (typeof saved.hideNativePerformance === 'boolean') settings.hideNativePerformance = saved.hideNativePerformance;
    if (saved.mode && ['inline', 'click', 'sidebar'].includes(saved.mode)) settings.mode = saved.mode;
  }
  setLanguage(settings.language ?? detectLanguage());
  const service = new PerformanceService();
  const cards = new Map<HTMLElement, Card>();
  let active: Card | undefined;
  let sidebarHidden = false;
  const sidebar = makeHost('sidebar');
  sidebar.host.style.cssText = 'position:fixed;right:16px;top:100px;width:min(420px,calc(100vw - 32px));z-index:10000;display:none';
  const side = el('aside', undefined, 'sidebar'); side.setAttribute('aria-label', t('uops.info 侧栏'));
  const collapse = button(t('收起'), () => { sidebarHidden = true; sync(); });
  const sideHeader = el('header'); sideHeader.append(el('span', 'uops.info', 'brand'), collapse);
  const sideBody = el('div'); side.append(sideHeader, sideBody); sidebar.root.append(side); document.body.append(sidebar.host);
  const room = el('style', '@media(min-width:1200px){html[data-iig-uops-sidebar] #ig_main{margin-right:450px!important}}');
  document.head.append(room);
  document.head.append(el('style', `
    html[data-iig-uops-hide-native-performance] #intrinsics_list .intrinsic .details table.performance,
    html[data-iig-uops-hide-native-performance] #intrinsics_list [data-iig-uops-native-performance] { display:none!important }
  `));
  const bar = toolbar(settings, next => {
    const archChanged = settings.arches.join(',') !== next.arches.join(',');
    const languageChanged = getLanguage() !== next.language;
    settings = next; setLanguage(settings.language ?? detectLanguage());
    if (languageChanged) {
      sidebar.host.lang = getLanguage();
      side.setAttribute('aria-label', t('uops.info 侧栏')); collapse.textContent = t('收起');
      sideBody.querySelector('.compact-message')?.remove();
      for (const card of cards.values()) { card.host.lang = getLanguage(); if (card.view?.element.isConnected) card.view.setLanguage(); }
    }
    sidebarHidden = false; bar.refresh(settings);
    if (languageChanged) registerMenu();
    void gmStorage.set(SETTINGS_KEY, settings).catch(() => { /* Current-session settings still apply. */ });
    if (archChanged) for (const card of cards.values()) if (card.view?.element.isConnected) card.view.setArches(settings.arches);
    sync();
  }, service);
  search.insertAdjacentElement('afterend', bar.host);
  function show(card: Card) {
    card.view ??= new IntrinsicView(card.intrinsic, settings, service);
    if (card.view.arches.join(',') !== settings.arches.join(',')) card.view.setArches(settings.arches);
    if (card.view.language !== getLanguage()) card.view.setLanguage();
    return card.view.element;
  }
  function open(card: Card) {
    active = card; card.opened = true; sidebarHidden = false; sync();
  }
  function expanded(card: Card) { return getComputedStyle(card.details).display !== 'none'; }
  function sync() {
    document.documentElement.toggleAttribute('data-iig-uops-hide-native-performance', !!settings.hideNativePerformance);
    for (const [node, card] of cards) {
      if (!node.isConnected) { card.view?.dispose(); intersection?.unobserve(node); cards.delete(node); if (active === card) active = undefined; }
    }
    const useSide = settings.mode === 'sidebar' && !sidebarHidden;
    sidebar.host.style.display = useSide ? 'block' : 'none';
    document.documentElement.toggleAttribute('data-iig-uops-sidebar', useSide);
    for (const card of cards.values()) {
      const wanted = settings.mode === 'inline' ? expanded(card) && card.near : settings.mode === 'click' && card.opened && expanded(card);
      const current = card.root.querySelector('.view');
      if (wanted) {
        const view = show(card);
        if (current !== view) {
          card.root.querySelector('.open-button')?.remove(); card.root.append(view);
        }
      } else {
        current?.remove();
        if (!card.root.querySelector('.open-button')) card.root.append(button(settings.mode === 'sidebar' ? t('在侧栏查看 uops.info') : t('查看 uops.info'), () => open(card), 'open-button'));
        const b = card.root.querySelector('.open-button') as HTMLButtonElement;
        b.textContent = settings.mode === 'sidebar' ? t('在侧栏查看 uops.info') : t('查看 uops.info');
      }
    }
    if (useSide) {
      if (!active) active = [...cards.values()].find(c => expanded(c) && c.near);
      if (active) {
        const view = show(active);
        if (sideBody.firstChild !== view) sideBody.replaceChildren(view);
      } else if (!sideBody.querySelector('.compact-message')) sideBody.replaceChildren(el('p', t('展开一个 intrinsic，或点击其“在侧栏查看”按钮。'), 'compact-message'));
    } else sideBody.replaceChildren();
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); sync(); });
  }
  const intersection = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    for (const e of entries) { const card = cards.get(e.target as HTMLElement); if (card) card.near = e.isIntersecting; }
    schedule();
  }, { rootMargin: '150px' }) : undefined;
  function scan() {
    markNativePerformance(list!);
    for (const node of list!.querySelectorAll<HTMLElement>('.intrinsic')) {
      if (cards.has(node)) continue;
      const intrinsic = readIntrinsic(node);
      const details = node.querySelector<HTMLElement>('.details');
      if (!intrinsic || !details) continue;
      const { host, root } = makeHost('card');
      const card: Card = { node, details, intrinsic, host, root, opened: false, near: !intersection };
      cards.set(node, card);
      const synopsis = details.querySelector('.synopsis');
      if (synopsis) synopsis.insertAdjacentElement('afterend', host); else details.prepend(host);
      intersection?.observe(node);
    }
  }
  // Observe Guide nodes only; injected shadow trees are not observed.
  const observer = new MutationObserver(schedule);
  observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  list.addEventListener('click', e => {
    const target = e.target as Element;
    if (!target.closest('.signature')) return;
    const node = target.closest<HTMLElement>('.intrinsic');
    const card = node && cards.get(node);
    if (card && expanded(card)) { active = card; sidebarHidden = false; }
    schedule();
  });
  let menuId: string | number | undefined;
  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== undefined && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    menuId = GM_registerMenuCommand(t('uops.info 设置'), () => {
      bar.host.scrollIntoView({ block: 'center' }); bar.host.shadowRoot!.querySelector<HTMLDetailsElement>('.settings-panel')!.open = true;
    });
  }
  registerMenu();
  scan(); sync();
  return true;
}

// Intel may insert its app after document-idle. Stop observing once the adapter mounts.
void (async () => {
  if (await start()) return;
  let mounting = false;
  const observer = new MutationObserver(async () => {
    if (mounting) return;
    mounting = true;
    try { if (await start()) observer.disconnect(); } finally { mounting = false; }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
