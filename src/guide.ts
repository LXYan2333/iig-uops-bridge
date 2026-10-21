import { byName } from './data';
import { clean } from './parser';
import type { Instruction, Intrinsic } from './types';

const normalizeType = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);
// Mark only the Guide's native section; CSS controls visibility without deleting its data.
export function markNativePerformance(list: Element) {
  for (const heading of list.querySelectorAll('.intrinsic .details > h1')) {
    if (clean(heading.textContent) !== 'Latency and Throughput') continue;
    heading.setAttribute('data-iig-uops-native-performance', '');
    const spacer = heading.previousElementSibling;
    if (spacer?.tagName === 'BR') spacer.setAttribute('data-iig-uops-native-performance', '');
  }
}

export function readIntrinsic(card: Element): Intrinsic | undefined {
  const signature = card.querySelector('.signature');
  const synopsis = card.querySelector('.synopsis');
  const name = clean(signature?.querySelector('.name')?.textContent);
  if (!name || !synopsis) return;
  const returns = clean(signature?.querySelector('.rettype')?.textContent);
  const params = [...(signature?.querySelectorAll('.param_type') ?? [])].map(e => clean(e.textContent));
  const cpuid = [...synopsis.querySelectorAll('.cpuid')].map(e => clean(e.textContent)).sort();
  const clone = synopsis.cloneNode(true) as Element;
  for (const br of clone.querySelectorAll('br')) br.replaceWith('\n');
  const text = clone.textContent ?? '';
  const sequence = /\bSequence\b/.test(text) || !!card.querySelector('[note-type="sequence"]');
  const instructions: Instruction[] = [];
  const instructionText = text.split('Instruction:')[1]?.split('CPUID Flags:')[0] ?? '';
  for (const line of instructionText.split('\n')) {
    const m = clean(line).match(/^([A-Za-z][A-Za-z0-9_.]*)\b\s*(.*)$/);
    if (m && m[1].toLowerCase() !== 'sequence') instructions.push({ mnemonic: m[1].toUpperCase(), form: m[2], xed: '' });
  }
  const matches = (byName.get(name) ?? []).filter(i =>
    normalizeType(i.returns) === normalizeType(returns) && sameList(i.params.map(normalizeType), params.map(normalizeType)) &&
    sameList([...i.cpuid].sort(), cpuid) && i.sequence === sequence &&
    sameList(i.instructions.map(x => `${x.mnemonic} ${clean(x.form).toLowerCase()}`), instructions.map(x => `${x.mnemonic} ${clean(x.form).toLowerCase()}`)),
  );
  if (matches.length === 1) return matches[0];
  return { name, returns, params, cpuid, instructions, sequence, snapshot: false };
}
