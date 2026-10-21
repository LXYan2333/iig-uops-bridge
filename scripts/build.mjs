import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const header = `// ==UserScript==
// @name         Intel Guide → uops.info
// @namespace    iig-uops-bridge
// @version      ${version}
// @description  View uops.info measurements for your selected microarchitectures in Intel Intrinsics Guide
// @description:zh-CN 在 Intel Intrinsics Guide 中查看所选微架构的 uops.info 数据
// @match        https://www.intel.com/content/www/*/docs/intrinsics-guide/*
// @match        https://www.intel.com/content/dam/develop/public/us/en/include/intrinsics-guide/index.html*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_unregisterMenuCommand
// @grant        GM_registerMenuCommand
// @connect      uops.info
// @run-at       document-idle
// @noframes
// ==/UserScript==`;
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.ts'], bundle: true, outfile: 'dist/iig-uops-bridge.user.js',
  format: 'iife', target: ['firefox115', 'chrome120'], minify: true, legalComments: 'none',
  banner: { js: header }, loader: { '.css': 'text' } });
console.log('Built dist/iig-uops-bridge.user.js');
