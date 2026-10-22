# Intel Guide → uops.info

English | [Chinese](README_CN.md)

A Tampermonkey userscript that brings uops.info measurements into the Intel Intrinsics Guide. Choose multiple microarchitectures, inspect instruction variants, and open the corresponding uops.info page directly from an intrinsic.

<img alt="image" src="https://github.com/user-attachments/assets/05d28eeb-face-4f68-9111-a7b86419bca6" />

## Installation

1. Install Tampermonkey for your browser: [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) or [Chrome / Chromium](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo).
2. **Chrome / Chromium:** open `chrome://extensions`, find **Tampermonkey → Details**, and enable **Allow User Scripts**. This is a browser extension permission, separate from enabling a script in the Tampermonkey dashboard. Without permission to run user scripts, installation can succeed while nothing appears on the Guide page. If the toggle is unavailable in your browser version, follow the [official Tampermonkey setup instructions](https://www.tampermonkey.net/faq.php#Q209). Firefox users can skip this step.
3. Download **[iig-uops-bridge.user.js](https://github.com/LXYan2333/iig-uops-bridge/releases/latest/download/iig-uops-bridge.user.js)** from the [latest release](https://github.com/LXYan2333/iig-uops-bridge/releases/latest). Choose the `.user.js` asset, not the source-code archive. If Tampermonkey opens an installation page, confirm installation. Otherwise, open its dashboard, go to **Utilities → Import from file**, and select the downloaded file.
4. Reload the [Intel Intrinsics Guide](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html), including after changing the browser permission. A **uops.info bridge** toolbar will appear below the search box.

The bundled script is ready to install: no Node.js, Python, or local server is needed. Remote automatic updates are not configured; download and import the script from the latest release when updating. The interface supports English and Simplified Chinese. It follows your preferred browser language on first use (English for other languages); an explicit selection is saved across visits.

## Usage

- **Language:** switch between English and Simplified Chinese in the toolbar. Open results and the sidebar update immediately while retaining your selected variants and reference architectures.
- **Architectures of interest:** use the checkbox list to select any number of Intel and AMD microarchitectures, with no primary architecture. Each gets its own row in the comparison table. Selections are saved in Tampermonkey; an existing single-architecture setting is migrated to a list. New installations start with Tiger Lake checked. Clearing all selections pauses measurement lookup until you select an architecture. P cores and E cores are listed separately.
- **Display:** switch between automatic inline results, click to expand, and a fixed right sidebar. The sidebar follows the most recently opened or explicitly selected intrinsic. On narrow screens it overlays the page and can be collapsed.
- **Other variants / manual selection:** choose register, memory, broadcast, mask/maskz, and rounding forms from a radio-button list. Manually selected related variants are clearly labeled rather than presented as confirmed matches.
- **Measurement details:** expand operand dependency latencies, loop and unrolled throughput, port estimates, retire slots, MITE, MS, and other metrics from the source page.
- **Architecture links:** click an architecture name in the comparison table to open the instruction page at that architecture's section. The table search link enables all displayed architectures, measured data, and instruction-set filters.
- **Reference architectures:** optionally check additional architectures to append temporary reference rows without changing the saved selection. Missing measurements remain explicit in each row and do not imply that a processor lacks instruction support.
- **Settings / data:** optionally hide Intel Guide's built-in **Latency and Throughput** heading and performance table. This is off by default, takes effect immediately, and is saved across visits; uncheck it to restore the original section. The uops.info results remain visible. You can also inspect index versions and clear the performance cache. Individual results have a refresh control.

The comparison table shows one architecture per row; measurement details expand separately for each architecture. On narrow screens the table scrolls horizontally. All architectures share the same fetched page and cache.

Throughput is shown in **cycles/instruction**, using measured unrolled throughput when available and explicitly labeled loop throughput otherwise. Throughput calculated from port usage appears separately in the details. The μops summary uses executed μops; retire slots are listed separately. Latencies preserve bounds such as `≤`, ranges, and source annotations. Different dependency latencies are not collapsed into a single latency for the entire intrinsic.

## Matching and limitations

1. Identify the Guide entry using its intrinsic name, signature, CPUID flags, and Instruction text, then look up its XED identifier. If the page differs from the bundled index, fall back to the page description and show a notice.
2. Check operand widths, VEX/EVEX encoding, masking, zeroing, broadcast, and ER/SAE in addition to XED. Structurally compatible results without a trusted XED match are labeled **inferred matches**.
3. Require manual selection when candidates remain ambiguous, particularly when rounding/SAE argument values are unknown. Measurement availability on the selected architectures does not influence semantic match ranking.

Examples covered by the matcher:

| Guide entry | Default mapping or handling |
| --- | --- |
| `_mm512_cvtepi64_pd` | `VCVTQQ2PD (ZMM, ZMM)`, using a verified alias for the XED type fields. Forms such as `M512` and `M64_1to8` are available under other variants. |
| `_mm512_maskz_cvtepi64_pd` | `VCVTQQ2PD_Z (ZMM, K, ZMM)`, distinct from unmasked and merging-mask forms. |
| `_mm512_i64gather_pd` | `VGATHERQPD (ZMM, K, VSIB_ZMM)`, with a notice explaining the discrepancy between the Guide's `vm32z` text and its XED / 64-bit index information. |
| `_mm512_shrdi_epi64` | `VPSHRDQ (ZMM, ZMM, ZMM, I8)`, using the official table catalog when the XML omits its detail URL. |
| AVX2 masked gather | Treat the vector mask register as a regular operand, not an EVEX K mask. |
| Multiple FMA mappings | Group the possible instructions; the compiler and surrounding code determine the actual choice. |
| Instruction sequences such as reduce or SVML | Clearly identify sequences. Do not treat a single instruction's measurements as the total cost or simply add individual costs together. |

A match describes the instruction form listed by the Guide, not a guarantee of what a compiler will emit in a particular context. Unresolved cases retain candidate choices or a search link. The matcher does not strip a `V` prefix or ignore conflicting register widths to force a match.

## Data, caching, and permissions

- The bundled index records its Intel Guide version, uops.info date, and source hashes in `src/generated/index.json`. View the versions under **Settings / data**. Detail links come from the official XML or, when its URL is missing, an exact instruction-name and extension match in uops.info's official table catalog (`csv/instructions.csv`), using the table's own link-generation rule. XED, operands, encoding, and mask flags still come from the XML. Fetched pages must match the full instruction name and XED identifier before measurements are displayed.
- The browser fetches instruction detail pages on demand and extracts only **Measurements**. It excludes IACA and Documentation, does not execute remote page scripts, and does not download the approximately 143 MB XML dataset.
- Requests are deduplicated by instruction, with at most three in flight. Each variant's measurements across architectures are cached for seven days. Failed refreshes can fall back to clearly labeled stale data.
- Permissions cover injection into the Intel Guide, cross-origin requests to uops.info, settings, and cache storage. Requests omit login credentials. There is no custom backend or telemetry.
- The matching index is updated when rebuilding the script. Refreshing data in the UI updates the performance-page cache, not the index. If a source-page change breaks parsing, the script displays an error and a source link rather than reporting missing architecture data.

This release targets the official Intel Guide paths. Third-party mirrors and local offline copies are not supported.

## Development

Requires Node.js 20.19+ and npm. Regenerating the index also requires Python 3.9+.

```bash
npm ci
npm run build
npm test
```

The output is `dist/iig-uops-bridge.user.js`. The compact index is included in the repository, so normal builds and tests do not depend on the ignored `research/` directory. `npm test` builds the current source before running unit, parser, and full-script integration tests.

Browser tests use Intel's original renderer with small data snapshots, so they do not depend on the live sites. GM APIs are simulated in these tests; importing the script into Tampermonkey and making real cross-origin requests require separate manual verification.

```bash
npx playwright install chromium firefox
npm run test:browser -- --project=firefox
npm run test:browser -- --project=chromium
# Run all checks once both browsers are available:
npm run check
```

Coverage includes XED aliases, operand widths, encodings, masks, gather, ambiguous candidates, missing architecture data, latency bounds, measurement-source isolation, cache expiry, request deduplication and concurrency limits, stale asynchronous responses, all three views, and reinjection after the Guide rerenders.

To download the official data and regenerate the index:

```bash
npm run data:update
npm test
```

The downloader discovers the data URL from Intel's current page and renderer. If the main site is unavailable, it tries Intel's official static renderer on `www.intel.com`, then `www.intel.cn`, and reads the XML URL from that renderer. It retries temporary network/server failures; HTTP 403 switches to the next source without repeated retries. If all sources fail, the update fails and retains the previous data. It keeps a stable local filename while reading the actual version from the XML. To reuse downloaded materials, run `npm run data:build`. Raw downloads are stored in the ignored `research/` directory. Bump the version in `package.json` and rebuild before distributing an update.

Run data-tool regression tests with `python3 -m unittest discover -s tests -p '*_test.py'` (Python 3.9+). These tests cover blocked sources, fallback, transient failures, preservation of previous downloads, and recovery of missing detail URLs from the official catalog. Index regeneration now requires `research/uops-instructions.csv`; run `npm run data:update` to refresh older research directories.

Code layout:

| Path | Responsibility |
| --- | --- |
| `src/i18n.ts` | Translation catalog, language detection, and message interpolation |
| `src/match.ts` | Instruction matching |
| `src/parser.ts`, `src/service.ts` | Measurement parsing, requests, and caching |
| `src/guide.ts` | Intel Guide DOM adapter |
| `src/main.ts`, `src/ui.ts` | Injection, settings, and the three views |
| `scripts/` | Index generation, data downloads, and build tools |

Translation strings live in `src/i18n.ts`. Chinese source strings are the message keys, with a complete English catalog checked by tests. Interpolation parameters must match between languages. Instruction names and original uops.info measurement details retain their source wording; cached measurements are shared across languages.

## GitHub Actions

Three workflows are available:

- **Build and test** (`.github/workflows/build.yml`): runs on pushes, pull requests, and manual dispatch. Builds the userscript and runs unit/DOM tests plus Chromium and Firefox browser tests. Successful runs upload the installable script as an artifact retained for 30 days.
- **Build and release** (`.github/workflows/release.yml`): runs when a `vX.Y.Z` tag is pushed. Validates the package version, builds, and runs downloader, unit/DOM, Chromium, and Firefox tests before publishing a GitHub Release with `iig-uops-bridge.user.js` and its SHA-256 checksum. Uses the committed index without downloading fresh source data. An interrupted draft can be resumed by rerunning the workflow; a published release is left unchanged.
- **Update instruction index** (`.github/workflows/update-index.yml`): runs every Monday at **03:17 UTC** and can be started manually. Downloads official sources, validates and regenerates the index, and checks for changes. When the index changes, it increments the patch version, rebuilds, tests, and opens or refreshes one PR on `automation/update-instruction-index`. Unchanged data produces no new version or PR. Download or test failures stop the update. Raw downloads stay ignored.

To enable updates, put the workflows on the repository's default branch and allow Actions to create pull requests under **Settings → Actions → General → Workflow permissions**. The update job requests repository-content and pull-request write permissions; the build job only reads repository contents. No personal token or extra secrets are needed. See the [create-pull-request permission requirements](https://github.com/peter-evans/create-pull-request#workflow-permissions).

Use **Actions → Update instruction index → Run workflow** for the first run. Review and merge its PR to update the default branch. GitHub may require approval before running CI on a PR created by `GITHUB_TOKEN`; use **Approve workflows to run** on the PR when prompted. The update workflow already runs its own tests before creating the PR. See [GitHub's workflow-trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow).

Install published versions from [Releases](https://github.com/LXYan2333/iig-uops-bridge/releases/latest). Build artifacts are also available for testing unpublished commits. Index updates do not automatically merge PRs or publish releases; push a version tag after reviewing and merging an update. Installed scripts are updated by importing the new release file. Upstream site outages can fail an update without changing the default branch; retry the workflow after the source becomes available. GitHub schedules run on the default branch and may be delayed or disabled by repository inactivity; check the Actions tab if updates stop.

## Publishing a release

Set the package version, rebuild, and commit `package.json`, `package-lock.json`, and `dist/iig-uops-bridge.user.js` before tagging. The tag must exactly match the package version, prefixed with `v`; for example, package version `1.0.1` requires tag `v1.0.1`.

```bash
npm version 1.0.1 --no-git-tag-version
npm test
git add package.json package-lock.json dist/iig-uops-bridge.user.js
git commit -m "Prepare v1.0.1 release"
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin main
git push origin v1.0.1
```

The release job uses the built-in `GITHUB_TOKEN` with `contents: write`; no additional secret is required. Wait for **Build and release** to succeed before sharing the download link. Use a new version for subsequent releases instead of moving an existing tag.

## Sources

[Intel Intrinsics Guide](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html), [uops.info XML](https://uops.info/xml.html), and the [uops.info table](https://uops.info/table.html).

The generated index records SHA-256 hashes of its inputs. Test snapshot attribution and the original jQuery license notices are documented in [`tests/fixtures/SOURCES.txt`](tests/fixtures/SOURCES.txt) and the corresponding files. This project's code does not relicense those third-party datasets or scripts.
