# Architecture support data

`build_support.py` generates `src/generated/support.json`. It reads pinned XED
chip and CPUID tables and LLVM target-parser feature tables. It neither compiles
nor executes upstream code. Normal userscript builds use the committed JSON.

## Sources and review policy

- `support-sources.json` records exact upstream commits, download URLs and SHA-256
  hashes. Upstream upgrades require an explicit, reviewed lockfile change; the
  scheduled updater does not follow upstream branches.
- `support-policy.json` maps uops.info IDs to source models and records exceptions.
  XED's Intel chip membership is used directly. LLVM supplements it and supplies
  AMD models; opposing known answers become unknown. Missing CPUID mappings do
  not override an independently known XED answer.
- `support-cpuid.json` is a reviewed mapping of **complete CPUID records**, including
  leaf, subleaf, register and bit, to LLVM feature enumerators. Do not derive it
  from instruction mnemonic prefixes. Unknown records remain unknown. The
  `avx10_enabled` records map to LLVM's AVX10_1 capability (AVX10_2 implies it);
  version-field records remain unknown. No current mapped CPU has AVX10.
- XED `ALL_OF`, `NOT`, and `COMMON_SUBSET` are resolved before membership checks.
  An ISA absent from XED's known ISA universe is unknown, not unsupported.
- LLVM bitset expressions and the transitive `ImpliedFeatures` graph are both
  evaluated. Omitting this closure incorrectly loses AVX/AVX2 on newer models.
- CPUID groups retain OR between groups and AND within a group. Three-valued
  evaluation permits a known satisfied alternative, or a known false term in
  every alternative, to decide the result. Otherwise the result is unknown.
  `N/A` is never treated as a satisfied empty conjunction.

## Model mappings

Most mappings are directly named models in the pinned source tables. Specific
mappings and omissions requiring context:

- `SKX` and `ICL` use the Skylake AVX-512 and Ice Lake client ISA models,
  respectively; server and client models are not interchangeable.
- `ADL-P` uses `alderlake`; `ADL-E` uses `gracemont`. LLVM gives both the same
  default ISA features, but the exception applies **only to P cores**.
- `MTL-P` and `MTL-E` use the common `meteorlake` compiler target. `ARL-P` and
  `ARL-E` use `arrowlake-s`: the uops.info Arrow Lake machine is a desktop
  Core Ultra 7 265K, not the separate `arrowlake` mobile target.
- `ZEN+` uses `znver1`: XED explicitly defines `AMD_ZENPLUS` as `ALL_OF(AMD_ZEN)`.
  This is used only as evidence for the alias. XED's AMD feature memberships
  are not used because their source comments identify unverified assumptions.
  `ZEN2` through `ZEN5` use LLVM `znver2` through `znver5` directly.
- `CON`, `WOL`, `KBL`, `CFL`, and `AMT` currently remain unmapped. Add an alias
  only with evidence of the ISA model equivalence; similar names or release
  dates are not sufficient. Newly added architectures also remain unknown.

References: [uops.info test machines](https://uops.info/background.html),
[XED ISA membership semantics](https://intelxed.github.io/ref-manual/group__ISASET.html),
[XED AMD alias](https://github.com/intelxed/xed/blob/0bcb6237345c5066726dcc08b3d87928df3b5b26/datafiles/amd/xed-amd-chips.txt),
[LLVM targets and implications](https://github.com/llvm/llvm-project/blob/de1772a114e32eddb487588effa10310f1347541/llvm/lib/TargetParser/X86TargetParser.cpp).

## Exceptions and scope

[Intel article 000089918](https://www.intel.com/content/www/us/en/support/articles/000089918/processors.html)
documents that AVX-512 was not fused off in some early Alder Lake desktop parts
and is disabled in later parts. `ADL-P` AVX-512 is therefore conditional,
including when uops.info supplies measurements. The rule does not grant AVX-512
to E cores or assert that all AVX-512 extensions work on early parts.

These are architecture/compiler-model assessments, not CPUID detection or a
promise that an arbitrary SKU, firmware, OS or VM permits execution. Measured
values always remain visible, with a notice when they differ from static data.

## Updating and validation

Run `npm run data:update` to download and validate all sources and stage both
JSON outputs. `npm run data:build` reuses local research. Both builders must
succeed before either committed JSON is replaced. Download/checksum/parse
failures leave previous generated data intact. A support-only regeneration is
available as `python3 scripts/build_support.py` (add `--download` to fetch pins).

When upgrading pins, inspect grammar changes, source conflicts, model mappings,
CPUID bindings, and the resulting JSON diff. Update third-party notices/licenses
if necessary. Run `python3 -m unittest discover -s tests -p '*_test.py'`, `npm test`,
and both Playwright browser projects. Licenses are retained in `third_party/`
and included in the installable userscript.
