import { describe, expect, it } from 'vitest';
import { byName, variants, variantUrl, tableUrl, selectedArchitectures } from '../src/data';
import { matchInstruction } from '../src/match';
import type { Intrinsic } from '../src/types';

const descriptor = (name: string) => byName.get(name)![0];
const match = (name: string) => { const i = descriptor(name); return matchInstruction(i, i.instructions[0]); };
describe('semantic matching', () => {
  it.each([
    ['_mm_add_ps', 'ADDPS (XMM, XMM)'],
    ['_mm_load_sd', 'MOVSD_XMM (XMM, M64)'],
    ['_mm_store_sd', 'MOVSD_XMM (M64, XMM)'],
    ['_mm_move_sd', 'MOVSD_XMM_0F10 (XMM, XMM)'],
    ['_mm_cmpeq_sd', 'CMPSD_XMM (XMM, XMM, I8)'],
    ['_mm256_add_ps', 'VADDPS (YMM, YMM, YMM)'],
    ['_mm512_cvtepi64_pd', 'VCVTQQ2PD (ZMM, ZMM)'],
    ['_mm512_mask_cvtepi64_pd', 'VCVTQQ2PD (ZMM, K, ZMM)'],
    ['_mm512_maskz_cvtepi64_pd', 'VCVTQQ2PD_Z (ZMM, K, ZMM)'],
    ['_mm256_cvtepi32_pd', 'VCVTDQ2PD (YMM, XMM)'],
    ['_mm512_i64gather_pd', 'VGATHERQPD (ZMM, K, VSIB_ZMM)'],
    ['_mm512_mask_i64gather_pd', 'VGATHERQPD (ZMM, K, VSIB_ZMM)'],
    ['_mm256_zeroupper', 'VZEROUPPER'],
    ['_mm256_mask_i64gather_pd', 'VGATHERQPD (YMM, VSIB_YMM, YMM)'],
    ['_mm512_i64gather_epi64', 'VPGATHERQQ (ZMM, K, VSIB_ZMM)'],
    ['_mm512_shrdi_epi64', 'VPSHRDQ (ZMM, ZMM, ZMM, I8)'],
    ['_mm512_mask_shrdi_epi64', 'VPSHRDQ (ZMM, K, ZMM, ZMM, I8)'],
    ['_mm512_maskz_shrdi_epi64', 'VPSHRDQ_Z (ZMM, K, ZMM, ZMM, I8)'],
    ['_mm256_shrdi_epi64', 'VPSHRDQ (YMM, YMM, YMM, I8)'],
    ['_mm256_mask_shrdi_epi64', 'VPSHRDQ (YMM, K, YMM, YMM, I8)'],
    ['_mm256_maskz_shrdi_epi64', 'VPSHRDQ_Z (YMM, K, YMM, YMM, I8)'],
    ['_mm_shrdi_epi64', 'VPSHRDQ (XMM, XMM, XMM, I8)'],
    ['_mm_mask_shrdi_epi64', 'VPSHRDQ (XMM, K, XMM, XMM, I8)'],
    ['_mm_maskz_shrdi_epi64', 'VPSHRDQ_Z (XMM, K, XMM, XMM, I8)'],
  ])('%s selects %s', (name, expected) => {
    const result = match(name);
    expect(result.confidence).toBe('confirmed');
    expect(result.best.map(c => c.variant.name)).toEqual([expected]);
  });
  it('retains memory/broadcast as alternatives, not primary measurements', () => {
    const result = match('_mm512_cvtepi64_pd');
    expect(result.related.some(v => v.name === 'VCVTQQ2PD (ZMM, M64_1to8)')).toBe(true);
    expect(result.best.every(c => !c.variant.broadcast && !c.variant.operands.some(o => o.startsWith('M')))).toBe(true);
    expect(result.related.every(v => !v.name.includes('XMM') && !v.name.includes('YMM'))).toBe(true);
  });
  it('keeps scalar SSE2 aliases separate from string instructions and VEX encodings', () => {
    const load = match('_mm_load_sd');
    expect(variantUrl(load.best[0].variant, 'TGL')).toBe('https://uops.info/html-instr/MOVSD_XMM_XMM_M64.html#TGL');
    expect(load.best[0].variant.iform).toBe(descriptor('_mm_load_sd').instructions[0].xed);
    expect([...load.best.map(c => c.variant), ...load.related].every(v => v.mnemonic === 'MOVSD_XMM' && v.encoding === 'legacy')).toBe(true);
    for (const mnemonic of ['MOVSD', 'CMPSD']) {
      const scalar = descriptor(mnemonic === 'MOVSD' ? '_mm_load_sd' : '_mm_cmpeq_sd');
      const string = matchInstruction(scalar, { mnemonic, form: '', xed: mnemonic });
      expect(string.confidence).toBe('confirmed');
      expect(string.best.map(c => c.variant.id)).toEqual([mnemonic]);
      expect(string.related).toHaveLength(0);
      expect(matchInstruction(scalar, { ...scalar.instructions[0], xed: '' }).confidence).toBe('inferred');
      expect(matchInstruction(scalar, { ...scalar.instructions[0], form: scalar.instructions[0].form.replace('xmm', 'ymm') }).best).toHaveLength(0);
    }
  });
  it('links recovered shifts to the official page and keeps memory forms as alternatives', () => {
    const result = match('_mm512_shrdi_epi64');
    expect(variantUrl(result.best[0].variant, 'TGL')).toBe('https://uops.info/html-instr/VPSHRDQ_ZMM_ZMM_ZMM_I8.html#TGL');
    expect(result.related.some(v => v.name === 'VPSHRDQ (ZMM, ZMM, M64_1to8, I8)')).toBe(true);
    expect(result.related.every(v => !v.name.includes('XMM') && !v.name.includes('YMM'))).toBe(true);
  });
  it('does not silently select rounding without an argument value', () => {
    const result = match('_mm512_cvt_roundepi64_pd');
    expect(result.confidence).toBe('ambiguous');
    expect(new Set(result.best.map(c => c.variant.rounding))).toEqual(new Set([true, false]));
  });
  it('rejects conflicting operand widths despite an identical XED identifier', () => {
    const i = descriptor('_mm512_cvtepi64_pd');
    const result = matchInstruction(i, { ...i.instructions[0], form: 'zmm, xmm' });
    expect(result.best).toHaveLength(0);
  });
  it('falls back conservatively when XED is unknown', () => {
    const i = descriptor('_mm_add_ps');
    const result = matchInstruction(i, { ...i.instructions[0], xed: 'UNKNOWN' });
    expect(result.confidence).toBe('inferred');
    expect(result.best[0].variant.mnemonic).toBe('ADDPS');
  });
  it('does not treat missing instructions as matching a similar mnemonic', () => {
    const i: Intrinsic = { ...descriptor('_mm_add_ps'), instructions: [] };
    expect(matchInstruction(i, { mnemonic: 'NOT_ADDPS', form: 'xmm, xmm', xed: '' }).confidence).toBe('none');
  });
  it('retains sequences and alternative FMA instructions', () => {
    expect(descriptor('_mm512_reduce_add_pd').sequence).toBe(true);
    expect(descriptor('_mm256_fmadd_pd').instructions).toHaveLength(3);
  });
  it('uses an official URL and enables table filters with their actual checkbox names', () => {
    expect(variantUrl(variants.find(v => v.name === 'VCVTQQ2PD (ZMM, ZMM)')!, 'TGL')).toBe('https://uops.info/html-instr/VCVTQQ2PD_ZMM_ZMM.html#TGL');
    const url = new URL(tableUrl('VADDPS', 'ADL-P'));
    expect(url.searchParams.get('cb_ADLP')).toBe('on');
    expect(url.searchParams.get('cb_avx512')).toBe('on');
    expect(url.searchParams.get('cb_measurements')).toBe('on');
  });
});


describe('architecture selections', () => {
  it('migrates old settings, deduplicates lists, and preserves an intentionally empty selection', () => {
    expect(selectedArchitectures({ arch: 'ICL' })).toEqual(['ICL']);
    expect(selectedArchitectures({ arches: ['TGL', 'ICL', 'TGL', 'invalid', 42], arch: 'SKX' })).toEqual(['TGL', 'ICL']);
    expect(selectedArchitectures({ arches: [], arch: 'TGL' })).toEqual([]);
    expect(selectedArchitectures({ arch: 'invalid' })).toEqual(['TGL']);
    expect(selectedArchitectures({ arches: 'ICL' })).toEqual(['TGL']);
  });
  it('enables all selected architectures in the table search without choosing a primary', () => {
    const url = new URL(tableUrl('VCVTQQ2PD', ['TGL', 'ADL-P']));
    expect(url.searchParams.get('cb_TGL')).toBe('on');
    expect(url.searchParams.get('cb_ADLP')).toBe('on');
    expect(url.searchParams.has('cb_ICL')).toBe(false);
    expect(new URL(tableUrl('VCVTQQ2PD', [])).searchParams.has('cb_TGL')).toBe(false);
  });
});
