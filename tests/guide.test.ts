import { describe, it, expect } from 'vitest';
import { byName } from '../src/data';
import { readIntrinsic } from '../src/guide';
import type { Intrinsic } from '../src/types';
function card(i: Intrinsic): Element {
  const e = document.createElement('div');
  e.innerHTML = `<div class="signature"><span class="rettype"></span><span class="name"></span></div><div class="details"><div class="synopsis"></div></div>`;
  e.querySelector('.rettype')!.textContent = i.returns; e.querySelector('.name')!.textContent = i.name;
  for (const type of i.params) { const span = document.createElement('span'); span.className = 'param_type'; span.textContent = type; e.querySelector('.signature')!.append(span); }
  const synopsis = e.querySelector('.synopsis')!;
  synopsis.append(document.createTextNode('Instruction: '));
  for (const instruction of i.instructions) synopsis.append(document.createTextNode(instruction.mnemonic.toLowerCase() + ' ' + instruction.form), document.createElement('br'));
  if (i.sequence) synopsis.append(document.createTextNode('Sequence'), document.createElement('br'));
  synopsis.append(document.createTextNode('CPUID Flags: '));
  for (const cpu of i.cpuid) { const span = document.createElement('span'); span.className = 'cpuid'; span.textContent = cpu; synopsis.append(span); }
  return e;
}
describe('Guide identity adapter', () => {
  it('retrieves XED metadata only for the matching signature, CPUID and form', () => {
    const original = byName.get('_mm512_cvtepi64_pd')![0];
    expect(readIntrinsic(card(original))).toBe(original);
    const changed = card({ ...original, instructions: original.instructions.map(i => ({ ...i, form: 'xmm, xmm' })) });
    expect(readIntrinsic(changed)?.snapshot).toBe(false);
    expect(readIntrinsic(changed)?.instructions[0].xed).toBe('');
  });
  it('handles every duplicate intrinsic name without picking the first arbitrarily', () => {
    for (const entries of byName.values()) {
      if (entries.length < 2) continue;
      for (const i of entries) {
        const result = readIntrinsic(card(i))!;
        if (result.snapshot) expect(result.cpuid).toEqual(i.cpuid);
        else expect(result.instructions.every(x => !x.xed)).toBe(true);
      }
    }
  });
  it('preserves sequence with no concrete instruction and handles incomplete DOM', () => {
    expect(readIntrinsic(card(byName.get('_mm512_reduce_add_pd')![0]))).toMatchObject({ sequence: true, instructions: [] });
    expect(readIntrinsic(document.createElement('div'))).toBeUndefined();
  });
});
