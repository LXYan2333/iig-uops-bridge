import { autoUpdate, computePosition, flip, hide, shift } from '@floating-ui/dom';

/** The tooltip must sit outside any scrolling list that would clip it. */
export function attachTooltip(anchor: HTMLElement, tooltip: HTMLElement, picker: HTMLDetailsElement) {
  let cleanupPosition: (() => void) | undefined;
  let revision = 0;
  const dismiss = () => {
    revision++;
    tooltip.hidden = true;
    cleanupPosition?.(); cleanupPosition = undefined;
    anchor.ownerDocument.removeEventListener('keydown', onKey);
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
  const update = async () => {
    const current = ++revision;
    if (!anchor.isConnected || !tooltip.isConnected) { dismiss(); return; }
    const { x, y, placement, middlewareData } = await computePosition(anchor, tooltip, {
      strategy: 'fixed', placement: 'top-start',
      middleware: [flip({ padding: 8 }), shift({ padding: 8 }), hide()],
    });
    if (current !== revision || tooltip.hidden) return;
    Object.assign(tooltip.style, {
      left: `${x}px`, top: `${y}px`,
      visibility: middlewareData.hide?.referenceHidden ? 'hidden' : 'visible',
    });
    tooltip.dataset.placement = placement;
  };
  const show = () => {
    if (!tooltip.hidden) return;
    tooltip.hidden = false;
    tooltip.style.visibility = 'hidden';
    cleanupPosition = autoUpdate(anchor, tooltip, () => { void update(); });
    anchor.ownerDocument.addEventListener('keydown', onKey);
  };
  const hideIfIdle = () => {
    if (!anchor.matches(':hover, :focus-within') && !tooltip.matches(':hover')) dismiss();
  };
  const onToggle = () => { if (!picker.open) dismiss(); };
  anchor.addEventListener('mouseenter', show);
  anchor.addEventListener('focusin', show);
  anchor.addEventListener('mouseleave', hideIfIdle);
  anchor.addEventListener('focusout', hideIfIdle);
  tooltip.addEventListener('mouseleave', hideIfIdle);
  picker.addEventListener('toggle', onToggle);
  return () => {
    dismiss();
    anchor.removeEventListener('mouseenter', show);
    anchor.removeEventListener('focusin', show);
    anchor.removeEventListener('mouseleave', hideIfIdle);
    anchor.removeEventListener('focusout', hideIfIdle);
    tooltip.removeEventListener('mouseleave', hideIfIdle);
    picker.removeEventListener('toggle', onToggle);
  };
}
