import { assessSupport } from './support';

// Intel Guide family order and fallback border colors from the attributed CSS fixture.
// Live colors are read from #techs by readTechFamilyColors in guide.ts.
export const techFamilies = [
  { id: 'mmx', label: 'MMX', selector: '.MMX', color: '#f7f056', isa: 'MMX' },
  { id: 'sse', label: 'SSE family', selector: '.SSE_ALL', color: '#cae0ab', isa: 'SSE2' },
  { id: 'avx', label: 'AVX family', selector: '.AVX_ALL', color: '#4eb265', isa: 'AVX' },
  { id: 'avx512', label: 'AVX-512 family', selector: '.AVX_512', color: '#7bafde', isa: 'AVX512F_512' },
  { id: 'amx', label: 'AMX family', selector: '.AMX', color: '#882e72', isa: 'AMX_TILE' },
  { id: 'unknown', label: '未分类', selector: '.Other', color: '#777777', isa: '' },
] as const;
export type TechFamily = typeof techFamilies[number]['id'];

// Only broad UI families, not aliases for the instruction-level support evaluator.
// Legacy models lack exact mappings; ADL-P is an explicit conditional exception.
// See scripts/SUPPORT_DATA.md and the note in the picker.
const displayFamilies: Readonly<Record<string, TechFamily>> = {
  CON: 'sse', WOL: 'sse', AMT: 'sse', KBL: 'avx', CFL: 'avx',
  'ADL-P': 'avx512',
};
export function architectureFamily(arch: string): TechFamily {
  if (Object.hasOwn(displayFamilies, arch)) return displayFamilies[arch];
  for (const family of [...techFamilies].reverse()) {
    if (family.isa && assessSupport({ isa: family.isa }, arch).status === 'supported') return family.id;
  }
  return 'unknown';
}
