import { t } from './i18n';
import { byMnemonic } from './data';
import type { Candidate, Instruction, Intrinsic, MatchResult, Variant } from './types';

// Verified against Intel 3.6.9 and uops.info 2026-03-29. Never globally strip XED types.
export function correctedXed(instruction: Instruction): string {
  if (instruction.mnemonic === 'VCVTQQ2PD') {
    return instruction.xed.replace(/^(VCVTQQ2PD_(XMM|YMM|ZMM))i64_MASKmskw_\2f64_AVX512$/, '$1f64_MASKmskw_$2i64_AVX512');
  }
  return instruction.xed;
}

function shape(token: string): string {
  const s = token.replace(/\{[^}]*\}/g, '').trim().toUpperCase();
  if (/^(XMM|YMM|ZMM|TMM|MM|K|ST)\d*$/.test(s)) return s.replace(/\d+$/, '');
  if (/^IMM/.test(s)) return 'I' + (s.match(/\d+/)?.[0] ?? '?');
  if (/^R(?:8|16|32|64)$/.test(s)) return s;
  if (/^(EAX|EBX|ECX|EDX|ESI|EDI|ESP|EBP)$/.test(s)) return 'R32';
  if (/^(RAX|RBX|RCX|RDX|RSI|RDI|RSP|RBP)$/.test(s)) return 'R64';
  if (/^[ABCD][HL]$/.test(s)) return 'R8';
  if (/^(AX|BX|CX|DX|SI|DI|SP|BP)$/.test(s)) return 'R16';
  if (/^MEM/.test(s)) return 'M' + (s.match(/\d+/)?.[0] ?? '?');
  if (s === 'SIBMEM') return 'M?';
  if (/^M\d+(?:BYTE)?$/.test(s)) return s.replace('BYTE', '');
  if (/^VM(?:32|64)[XYZ]$/.test(s)) return 'VSIB_' + ({ X: 'XMM', Y: 'YMM', Z: 'ZMM' }[s.slice(-1)] ?? '?');
  return s || '?';
}

export function formOperands(form: string): string[] {
  return form ? form.split(',').map(shape) : [];
}

function compatible(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((e, i) => {
    const a = actual[i];
    if (e === a) return true;
    if (/^I\?$/.test(e)) return /^I\d+$/.test(a);
    if (e === 'M?') return /^M\d+$/.test(a);
    // r/m notation lists permitted alternatives explicitly; don't invent a memory operand.
    return e.includes('/') && e.split('/').some(t => shape(t) === a);
  });
}

function encodingFor(i: Intrinsic, ins: Instruction): string | undefined {
  if (/AVX512|AVX10/.test(ins.xed) || i.cpuid.some(x => /AVX512|AVX10/.test(x))) return 'EVEX';
  if (/^V[A-Z]/.test(ins.mnemonic) && i.cpuid.some(x => /^(AVX|FMA|F16C)/.test(x))) return 'VEX';
  if (i.cpuid.some(x => /^(SSE|MMX)/.test(x)) && !ins.mnemonic.startsWith('V')) return 'legacy';
  return undefined;
}
function vectorWidth(ops: string[]): number {
  return Math.max(0, ...ops.map(op => op.includes('ZMM') ? 512 : op.includes('YMM') ? 256 : op.includes('XMM') ? 128 : 0));
}

export function matchInstruction(intrinsic: Intrinsic, instruction: Instruction): MatchResult {
  const all = byMnemonic.get(instruction.mnemonic.toUpperCase()) ?? [];
  const form = instruction.form.toLowerCase();
  const ops = formOperands(form);
  const width = vectorWidth(ops);
  const encoding = encodingFor(intrinsic, instruction);
  const xed = correctedXed(instruction);
  const gatherScatter = /^V(?:P?GATHER|P?SCATTER)/.test(instruction.mnemonic);
  const isGatherScatter = gatherScatter && /AVX512/.test(xed);
  const notes: string[] = [];
  // AVX2 gather's vector-mask input is not an EVEX k-register opmask.
  const mask = /\{[kz]/.test(form) || (encoding === 'EVEX' && /_(?:mask\d*|maskz|mmask)_/.test(intrinsic.name)) || isGatherScatter;
  const zero = /\{z/.test(form) || /_maskz_/.test(intrinsic.name);
  // A rounding parameter can select MXCSR or embedded rounding. Preserve both possibilities.
  const variableRounding = /\{er\}|\{sae\}/.test(form);
  const sourceExact = all.filter(v => !!xed && v.iform === xed);
  let candidates: Candidate[] = [];
  for (const v of all) {
    if (encoding && v.encoding !== encoding) continue;
    if (v.mask !== mask || v.zero !== zero) continue;
    if (!variableRounding && (v.rounding || v.sae)) continue;
    // Broadcast is only a primary match when explicitly described, never merely a memory alternative.
    if (v.broadcast !== /bcst|1to\d|broadcast/.test(form)) continue;
    const exact = sourceExact.includes(v);
    const structural = compatible(ops, v.operands);
    // Gather's Intel vm32z text has a known index-width inconsistency. Its XED and VSIB register agree.
    const gatherExact = gatherScatter && exact && ops.length === v.operands.length && ops.every((o, index) =>
      o === v.operands[index] || (o.startsWith('VSIB_') && v.operands[index].startsWith('VSIB_')));
    if (!structural && !gatherExact) continue;
    const reasons = [exact ? (xed === instruction.xed ? t('XED 指令形式一致') : t('使用已核验的 VCVTQQ2PD XED 别名')) : t('助记符及操作数结构一致；XED 未确认'),
      `${v.encoding} · ${v.mask ? v.zero ? t('零掩码') : t('合并/必需掩码') : t('无掩码')} · ${v.rounding ? t('嵌入舍入') : v.sae ? 'SAE' : t('普通形式')}`];
    candidates.push({ variant: v, confidence: exact ? 'confirmed' : 'inferred', reasons });
  }
  if (candidates.some(c => c.confidence === 'confirmed')) candidates = candidates.filter(c => c.confidence === 'confirmed');
  candidates.sort((a, b) => a.variant.name.localeCompare(b.variant.name));
  if (isGatherScatter) notes.push(t('Gather/scatter 的机器指令需要掩码，intrinsic 名称没有 mask 也不代表无掩码编码。'));
  if (instruction.mnemonic === 'VGATHERQPD' && /vm32z/.test(form) && sourceExact.length) {
    notes.push(t('Guide 原文 vm32z 与其 XED/64 位索引参数存在差异；这里依据已核验的 XED 对应到 VSIB_ZMM。'));
  }
  if (gatherScatter && candidates.some(c => !compatible(ops, c.variant.operands))) {
    notes.push(t('Guide 的 VSIB 索引寄存器写法与 uops.info 不同；其余操作数和 XED 一致，此处按结构化 XED 匹配。'));
  }
  if (variableRounding) notes.push(t('具体 rounding/SAE 参数未知，请按实际参数选择普通或舍入变体。'));
  if (candidates.length > 1) notes.push(t('现有描述不能唯一确定变体；请选择要查看的候选。'));
  if (!candidates.length && all.length) notes.push(t('找到了同助记符条目，但没有足够依据确认操作数、编码或掩码一致。可手动查看相关变体。'));
  const selected = new Set(candidates.map(c => c.variant.id));
  const related = all.filter(v => !selected.has(v.id) && (!width || vectorWidth(v.operands) === width))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { instruction, best: candidates, related, notes,
    confidence: candidates.length > 1 ? 'ambiguous' : candidates[0]?.confidence ?? 'none' };
}
