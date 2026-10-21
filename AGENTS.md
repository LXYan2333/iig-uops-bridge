# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the TypeScript userscript: `match.ts` handles instruction matching; `guide.ts` adapts Intel’s DOM; `parser.ts` and `service.ts` parse, fetch, and cache measurements; `main.ts`, `ui.ts`, and `style.css` implement the interface.
- `src/i18n.ts` holds translations; `src/generated/index.json` contains the bundled instruction index.
- `scripts/` contains build, download, index-generation, and fixture-extraction tools.
- `tests/*.test.ts` covers units and DOM integration; `tests/browser/*.spec.ts` contains browser tests; `tests/fixtures/` holds attributed source snapshots.
- `dist/iig-uops-bridge.user.js` is the installable artifact. Keep downloaded research, dependencies, and browser results in their ignored directories.

## Build, Test, and Development Commands

Use Node.js 20.19+ and npm; index generation additionally requires Python 3.9+.

- `npm ci`: install pinned dependencies.
- `npm run build`: type-check and bundle with esbuild.
- `npm test`: build, then run Vitest with jsdom.
- `npx playwright install firefox`: install the Firefox test browser.
- `npm run test:browser -- --project=firefox`: build and run Firefox integration tests.
- `npm run check`: build and run all suites, including Chromium. Chromium defaults to `/usr/bin/chromium`; override with `CHROMIUM_PATH`.
- `npm run data:build`: regenerate the index from local research; `npm run data:update` downloads fresh sources first.

For manual testing, import the built artifact into Tampermonkey and reload Intel Guide. Chromium requires the extension’s **Allow User Scripts** permission.

## Coding Style & Naming Conventions

Follow existing TypeScript style: two-space indentation, single quotes, semicolons, camelCase functions and variables, and PascalCase types/classes. Strict type checking is enabled; no formatter or linter is configured. Use DOM APIs and `textContent` for rendering. Route interface text through `i18n.ts`; preserve interpolation parameters across languages. Keep `README.md` English-only and synchronize relevant changes with `README_CN.md`.

## Testing Guidelines

Use descriptive behavior names in `*.test.ts` and `*.spec.ts`. Cover matching ambiguity, missing measurements, settings migration, caching, and asynchronous updates when affected. No numeric coverage threshold is configured. Browser fixtures simulate GM APIs; report actual Tampermonkey testing separately. Preserve fixture attribution and never execute fetched page scripts.

## Commit & Pull Request Guidelines

There are no commits yet, so no historical convention exists. Use concise imperative subjects, such as `Add architecture comparison rows`. Describe behavior changes, relevant issues, validation commands/results, and known limitations; include screenshots for visible UI changes. Rebuild distributable changes, and bump the package version before publishing an update.
