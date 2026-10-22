import raw from './generated/index.json';
import type { Intrinsic, Variant } from './types';

// Tuples keep the distributable small. Public application code uses named fields.
type IntrinsicRow = [string, string, string[], string[], [string, string, string][], boolean];
type VariantRow = [string, string, string, string, string, string, string[], number];
const source = raw as unknown as {
  intelVersion: string; uopsDate: string; architectures: [string, string, string][];
  intrinsics: IntrinsicRow[]; variants: VariantRow[];
};
export const versions = { intel: source.intelVersion, uops: source.uopsDate };
export const architectures = source.architectures.map(([id, name, checkbox]) => ({ id, name, checkbox }));
export const archName = (id: string) => architectures.find(a => a.id === id)?.name ?? id;
export const intrinsics: Intrinsic[] = source.intrinsics.map(([name, returns, params, cpuid, instructions, sequence]) => ({
  name, returns, params, cpuid, sequence, snapshot: true,
  instructions: instructions.map(([mnemonic, form, xed]) => ({ mnemonic, form, xed })),
}));
export const variants: Variant[] = source.variants.map(([id, name, mnemonic, iform, isa, encoding, operands, flags]) => ({
  id, name, mnemonic, iform, isa, encoding, operands,
  mask: !!(flags & 1), zero: !!(flags & 2), broadcast: !!(flags & 4), rounding: !!(flags & 8), sae: !!(flags & 16),
}));
export const byName = new Map<string, Intrinsic[]>();
export const byMnemonic = new Map<string, Variant[]>();
for (const i of intrinsics) byName.set(i.name, [...(byName.get(i.name) ?? []), i]);
for (const v of variants) byMnemonic.set(v.mnemonic, [...(byMnemonic.get(v.mnemonic) ?? []), v]);

export function variantUrl(v: Pick<Variant, 'id'>, arch?: string): string {
  // id comes from the official XML URL or a full-name/extension match in its table catalog.
  return `https://uops.info/html-instr/${encodeURIComponent(v.id)}.html${arch ? `#${encodeURIComponent(arch)}` : ''}`;
}
// The old single-architecture field is read only for migration; runtime settings use arrays.
export function selectedArchitectures(saved: { arches?: unknown; arch?: unknown }): string[] {
  const valid = (id: unknown): id is string => typeof id === 'string' && architectures.some(a => a.id === id);
  if (Array.isArray(saved.arches)) return [...new Set(saved.arches.filter(valid))];
  return valid(saved.arch) ? [saved.arch] : ['TGL'];
}
export function tableUrl(mnemonic: string, selected: string | string[]): string {
  const p = new URLSearchParams({ search: mnemonic, cb_measurements: 'on' });
  for (const arch of typeof selected === 'string' ? [selected] : selected) {
    const checkbox = architectures.find(a => a.id === arch)?.checkbox;
    if (checkbox) p.set(`cb_${checkbox}`, 'on');
  }
  for (const cb of ['lat', 'tp', 'uops', 'ports', 'base', 'aes', 'avx', 'avx2', 'avx512', 'bmi', 'fma', 'mmx', 'sse', 'x87', 'others']) p.set(`cb_${cb}`, 'on');
  return `https://uops.info/table.html?${p}`;
}
