export interface Instruction { mnemonic: string; form: string; xed: string }
export interface Intrinsic {
  name: string; returns: string; params: string[]; cpuid: string[];
  instructions: Instruction[]; sequence: boolean; snapshot?: boolean;
}
export interface Variant {
  id: string; name: string; mnemonic: string; iform: string; isa: string;
  encoding: string; operands: string[]; mask: boolean; zero: boolean;
  broadcast: boolean; rounding: boolean; sae: boolean;
}
export type Confidence = 'confirmed' | 'inferred' | 'ambiguous' | 'none';
export interface Candidate { variant: Variant; reasons: string[]; confidence: 'confirmed' | 'inferred' }
export interface MatchResult { instruction: Instruction; confidence: Confidence; best: Candidate[]; related: Variant[]; notes: string[] }
export interface Detail { label: string; value: string; url?: string }
export interface Measurement {
  arch: string; name: string; latencies: Detail[]; details: Detail[];
  loop?: string; unrolled?: string; computed?: string; uops?: string; ports?: string;
}
export interface PerformancePage { id: string; name: string; iform: string; measurements: Record<string, Measurement>; architectures: string[] }
export interface CachedPage { version: 1; fetchedAt: number; page: PerformancePage }
export interface PageResult { record: CachedPage; stale: boolean; error?: string }
export type DisplayMode = 'inline' | 'click' | 'sidebar';
export interface Settings { version: 1; arches: string[]; mode: DisplayMode; language?: import('./i18n').Language; hideNativePerformance?: boolean }
export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}
