import { afterEach, describe, expect, it } from 'vitest';
import { architectureFamily, techFamilies } from '../src/architecture-families';
import { architectures } from '../src/data';
import { readTechFamilyColors } from '../src/guide';
import { assessSupport } from '../src/support';

afterEach(() => { document.body.replaceChildren(); document.head.querySelectorAll('[data-palette-test]').forEach(node => node.remove()); });

describe('Intel Guide family grouping', () => {
  it('groups SSE/AVX generations by family rather than by individual extension', () => {
    for (const arch of ['CON', 'WOL', 'NHM', 'WSM', 'BNL', 'AMT', 'GLM', 'GLP', 'TRM']) expect(architectureFamily(arch)).toBe('sse');
    for (const arch of ['SNB', 'IVB', 'HSW', 'BDW', 'SKL', 'KBL', 'CFL', 'ADL-E', 'MTL-P', 'MTL-E', 'ARL-P', 'ARL-E', 'ZEN+', 'ZEN2', 'ZEN3']) expect(architectureFamily(arch)).toBe('avx');
    for (const arch of ['SKX', 'CNL', 'CLX', 'ICL', 'TGL', 'RKL', 'ADL-P', 'ZEN4', 'ZEN5']) expect(architectureFamily(arch)).toBe('avx512');
    expect(architectureFamily('EMR')).toBe('amx');
    for (const arch of architectures) expect(architectureFamily(arch.id)).not.toBe('unknown');
  });
  it('groups Alder Lake-P with AVX-512 without changing conditional instruction support', () => {
    expect(assessSupport({ isa: 'AVX512F_512' }, 'ADL-P').status).toBe('conditional');
    expect(architectureFamily('ADL-P')).toBe('avx512');
    expect(architectureFamily('ADL-E')).toBe('avx');
    expect(architectureFamily('KBL')).toBe('avx');
    expect(assessSupport({ isa: 'AVX' }, 'KBL').status).toBe('unknown');
    expect(architectureFamily('FUTURE_CPU')).toBe('unknown');
    expect(architectureFamily('constructor')).toBe('unknown');
  });
  it('reads the actual family border colors instead of the black filter text color', () => {
    const techs = document.createElement('div'); techs.id = 'techs'; document.body.append(techs);
    const node = document.createElement('div'); node.className = 'AVX_ALL'; node.style.cssText = 'color: black; border-left: 10px solid rgb(12, 34, 56)'; techs.append(node);
    expect(readTechFamilyColors().avx).toBe('rgb(12, 34, 56)');
    node.style.borderLeftColor = 'rgb(87, 65, 43)';
    expect(readTechFamilyColors().avx).toBe('rgb(87, 65, 43)');
    node.style.borderLeftColor = 'transparent';
    expect(readTechFamilyColors().avx).toBe('#4eb265');
  });
  it('uses the attributed Guide palette when filters or their styles are unavailable', () => {
    const empty = document.createElement('div'); empty.id = 'techs';
    const unstyled = document.createElement('div'); unstyled.className = 'AVX_512'; empty.append(unstyled); document.body.append(empty);
    const colors = readTechFamilyColors();
    for (const family of techFamilies) expect(colors[family.id]).toBe(family.color);
  });
});
