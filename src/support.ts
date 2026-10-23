import raw from './generated/support.json';
import type { Variant } from './types';

export type SupportStatus = 'supported' | 'unsupported' | 'conditional' | 'unknown';
export type SupportReason = 'model' | 'unmapped' | 'incomplete' | 'conflict' | 'alderLakeAvx512';
interface ArchitectureSupport {
  xed?: string; llvm?: string;
  supported: string[]; unsupported: string[]; conflicts: string[];
}
export interface SupportData {
  sources: { xed: string; llvm: string };
  architectures: Record<string, ArchitectureSupport>;
  requirements: Record<string, string[][]>;
  exceptions: { arch: string; isaPrefix: string; reason: 'alderLakeAvx512'; url: string }[];
}
export interface SupportAssessment {
  status: SupportStatus;
  reason: SupportReason;
  isa: string;
  requirements: string[][];
  sources: { name: string; url: string }[];
}
export const supportData = raw as SupportData;
export const supportVersions = raw.sources;

export function isaLabel(isa: string): string {
  // Preserve the original ISA identifier in the details; this label is for scanning.
  return isa.replace(/^AVX512_?/, 'AVX-512 ').replace(/_(128N?|256|512|SCALAR|KOP\w+)$/, '').replaceAll('_', ' ');
}

export function assessSupport(variant: Pick<Variant, 'isa'>, arch: string, data: SupportData = supportData): SupportAssessment {
  const isa = variant.isa;
  const model = Object.hasOwn(data.architectures, arch) ? data.architectures[arch] : undefined;
  const requirements = Object.hasOwn(data.requirements, isa) ? data.requirements[isa] : [];
  const sources: SupportAssessment['sources'] = [];
  if (model?.xed) sources.push({ name: `Intel XED · ${model.xed} · ${data.sources.xed.slice(0, 8)}`, url: `https://github.com/intelxed/xed/tree/${data.sources.xed}/datafiles` });
  if (model?.llvm) sources.push({ name: `LLVM · ${model.llvm} · ${data.sources.llvm.slice(0, 8)}`, url: `https://github.com/llvm/llvm-project/blob/${data.sources.llvm}/llvm/lib/TargetParser/X86TargetParser.cpp` });
  const result = (status: SupportStatus, reason: SupportReason): SupportAssessment => ({ status, reason, isa, requirements, sources });
  if (!model || (!model.xed && !model.llvm)) return result('unknown', 'unmapped');
  const exception = data.exceptions.find(rule => rule.arch === arch && isa.startsWith(rule.isaPrefix) && Object.hasOwn(data.requirements, isa));
  if (exception) {
    sources.push({ name: 'Intel · AVX-512 / Alder Lake', url: exception.url });
    return result('conditional', exception.reason);
  }
  if (model.conflicts.includes(isa)) return result('unknown', 'conflict');
  if (model.supported.includes(isa)) return result('supported', 'model');
  if (model.unsupported.includes(isa)) return result('unsupported', 'model');
  return result('unknown', 'incomplete');
}
