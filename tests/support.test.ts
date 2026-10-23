import { describe, expect, it } from 'vitest';
import { variants } from '../src/data';
import { assessSupport, isaLabel, supportData, type SupportData } from '../src/support';

const shrdi = variants.find(v => v.id === 'VPSHRDQ_ZMM_ZMM_ZMM_I8')!;
describe('architecture instruction support', () => {
  it.each(['HSW', 'SKL', 'ZEN3', 'ADL-E'])('marks %s as lacking VPSHRDQ without relying on missing measurements', arch => {
    expect(assessSupport(shrdi, arch)).toMatchObject({ status: 'unsupported', isa: 'AVX512_VBMI2_512' });
  });
  it.each(['TGL', 'ZEN4', 'ZEN5', 'RKL'])('recognizes the required ISA on %s', arch => {
    expect(assessSupport(shrdi, arch).status).toBe('supported');
  });
  it('keeps Alder Lake-P AVX-512 conditional without granting it to E cores or unknown ISA sets', () => {
    const assessment = assessSupport(shrdi, 'ADL-P');
    expect(assessment).toMatchObject({ status: 'conditional', reason: 'alderLakeAvx512' });
    expect(assessment.sources.at(-1)?.url).toContain('000089918');
    expect(assessSupport(shrdi, 'ADL-E').status).toBe('unsupported');
    expect(assessSupport({ isa: 'AVX512_UNKNOWN_FUTURE' }, 'ADL-P').status).toBe('unknown');
    expect(assessSupport({ isa: 'AVX2' }, 'ADL-P').status).toBe('supported');
  });
  it('keeps unknown architectures, unmapped models and incomplete ISA requirements unknown', () => {
    expect(assessSupport(shrdi, 'NEW').reason).toBe('unmapped');
    expect(assessSupport(shrdi, 'KBL').reason).toBe('unmapped');
    expect(assessSupport({ isa: 'NEW_ISA' }, 'TGL').reason).toBe('incomplete');
    expect(assessSupport({ isa: 'constructor' }, 'constructor').status).toBe('unknown');
  });
  it('does not resolve source conflicts by choosing a preferred source', () => {
    expect(assessSupport({ isa: 'AES' }, 'WSM')).toMatchObject({ status: 'unknown', reason: 'conflict' });
    const data: SupportData = { ...supportData, architectures: { TEST: { xed: 'X', llvm: 'Y', supported: [], unsupported: [], conflicts: [shrdi.isa] } } };
    expect(assessSupport(shrdi, 'TEST', data).reason).toBe('conflict');
  });
  it('reports the selected variant ISA and preserves CPUID alternatives and pinned provenance', () => {
    const result = assessSupport(shrdi, 'TGL');
    expect(result.requirements).toContainEqual(['avx512_vbmi2.7.0.ecx.6']);
    expect(result.requirements.some(group => group.some(term => term.startsWith('avx10_enabled.')))).toBe(true);
    expect(result.sources).toHaveLength(2);
    for (const source of result.sources) expect(source.url).toMatch(/[a-f0-9]{40}/);
    expect(isaLabel(shrdi.isa)).toBe('AVX-512 VBMI2');
    expect(assessSupport({ isa: 'AVX2' }, 'HSW').status).toBe('supported');
  });
});
