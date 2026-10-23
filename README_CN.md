# Intel Guide → uops.info

[English](README.md) | 简体中文

在 Intel Intrinsics Guide 中直接查看所选微架构的 uops.info 实测数据，并跳转到对应指令页面。

<img alt="image" src="https://github.com/user-attachments/assets/05d28eeb-face-4f68-9111-a7b86419bca6" />

## 安装

1. 安装适用于浏览器的 Tampermonkey：[Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) 或 [Chrome / Chromium](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)。
2. **Chrome / Chromium 用户**：打开 `chrome://extensions`，进入 **Tampermonkey → 详情**，开启 **允许运行用户脚本（Allow User Scripts）**。这是浏览器的扩展权限，与 Tampermonkey 仪表板中启用某个脚本是两回事。缺少运行用户脚本的权限时，即使安装成功，Guide 页面也可能没有任何效果。如果当前浏览器版本没有这个开关，请参照 [Tampermonkey 官方配置说明](https://www.tampermonkey.net/faq.php#Q209)。Firefox 用户可跳过此步骤。
3. 从[最新 Release](https://github.com/LXYan2333/iig-uops-bridge/releases/latest) 下载 **[iig-uops-bridge.user.js](https://github.com/LXYan2333/iig-uops-bridge/releases/latest/download/iig-uops-bridge.user.js)**，请选择 `.user.js` 附件，不要下载源码压缩包。如果 Tampermonkey 自动打开安装页，确认安装即可；否则打开其仪表板 → **实用工具 → 从文件导入**，选择刚下载的文件。
4. 刷新 [Intel Intrinsics Guide](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html)，修改上述浏览器权限后也需要刷新页面。搜索框下面会出现 **uops.info 桥接**工具栏。

安装使用的是已经构建好的单文件脚本，不需要 Node.js、Python 或本地服务。脚本没有配置远程自动更新地址；更新时从最新 Release 下载并重新导入脚本。

## 使用

- **语言**：支持 English 和简体中文，首次使用跟随浏览器首选语言（其他语言默认英文）。工具栏可随时切换并保存偏好，已展开的结果和侧栏同步更新，保留所选变体和参考架构。
- **感兴趣架构**：通过复选框选择多个 Intel 或 AMD 微架构，不设主架构。选择器按 Intel（蓝色）和 AMD（红色）分组，桌面左右排列，窄屏上下排列。每个架构占对比表的一行，选择会保存。旧版单架构设置自动转成列表，新安装默认勾选 Tiger Lake。全部取消后暂不读取测量数据，直到再次选择架构。P 核和 E 核分开列出。
- **展示**：详情内自动显示、点击后展开、固定右侧栏，三种模式随时切换。侧栏跟随最近打开或主动选中的 intrinsic；窄窗口上侧栏悬浮显示，可收起或切换模式。
- **其他变体 / 手动选择**：通过单选按钮列表选择寄存器、内存、广播、mask/maskz、舍入等形式。手动查看的相关变体会明确标记，不会替换成“已确认匹配”。
- **测量细节**：展开操作数之间的依赖延迟、loop/unrolled 吞吐、端口估算、retire slots、MITE、MS 等原页指标。
- **架构链接**：直接点击对比表中的架构名称，在新标签页打开对应指令与架构章节。表格搜索链接同时启用所有当前显示的架构、实测来源和指令集筛选。
- **参考架构**：也支持多选，临时勾选的架构作为额外行显示，不改变已保存的选择。缺少测量数据时会单独判断指令集支持情况；已有参考测量始终保留。
- **设置 / 数据**：可勾选隐藏 Intel Guide 自带的 **Latency and Throughput** 标题和性能表格，默认关闭，即时生效并保存偏好。取消勾选即可恢复，uops.info 数据保持显示。还可查看索引版本、清理性能缓存，每条结果也可以单独刷新。

对比表每行显示一个架构，各架构的测量细节可分别展开。窄窗口下表格可横向滚动。多个架构共用同一次请求及页面缓存。

吞吐的单位是 **cycles/instruction**，优先显示实测 unrolled，缺失时显示明确标注的 loop。端口计算的吞吐单独列在详情中。μops 摘要采用 Executed，retire slots 单独显示。延迟保留 `≤`、范围和原始附注；多条依赖的数值不会被合并成整个 intrinsic 的统一延迟。

## 指令集支持状态

当所选变体缺少某个架构的测量时，对应行会区分以下情况：

| 提示 | 含义 |
| --- | --- |
| 不支持所需指令集 | 架构模型不包含所需 ISA，下方显示如 AVX-512 VBMI2 的特性名称。 |
| 架构支持，暂无测量数据 | 模型包含该 ISA，但 uops.info 没有这个变体的实测值。 |
| 支持情况取决于具体型号 | 存在有资料支持的例外，目前为 Alder Lake-P 的 AVX-512。 |
| 暂无测量数据，支持情况未知 | 架构映射或 ISA 资料不完整，或来源结论不同。 |

展开提示可查看精确 ISA、CPUID 条件、模型名称和资料链接。判断始终跟随**当前选择的变体**，包括手动选择。例如 `_mm512_shrdi_epi64` 需要 AVX-512 VBMI2：Haswell、Skylake、Zen 3 的模型不支持，Tiger Lake、Zen 4 的模型支持。

支持信息来自固定版本的 Intel XED 和 LLVM，内置于脚本，不需要联网查询。这是**架构模型资料，不是当前电脑的能力检测**；具体型号、固件、操作系统或虚拟机配置仍可能影响可用性。部分早期 Alder Lake 桌面型号与后续型号不同，此例外不会套用到 E 核。没有可靠依据的架构别名保留未知，详见[映射和更新规则](scripts/SUPPORT_DATA.md)。

已有实测值始终保留；与静态模型不同的测试配置会有提示。网络错误继续显示为错误，不会伪装成“暂无测量数据”。三种展示方式和两种界面语言采用相同判断。

## 匹配方式与边界

1. 使用 intrinsic 名称、签名、CPUID 和 Instruction 原文识别条目，再读取对应的 XED 标识。页面与内置索引不一致时退回页面描述，并显示提示。
2. XED 只是第一层依据；继续区分各操作数宽度、VEX/EVEX、掩码、清零、广播和 ER/SAE。没有可信 XED 时，只把结构一致的结果标为**推断匹配**。
3. 并列候选需要手动选择，尤其是 rounding/SAE 参数值未知的情况。目标架构有没有数据不影响语义匹配的排序。

已覆盖的典型情况：

| Intel Guide 条目 | 默认对应与处理 |
| --- | --- |
| `_mm512_cvtepi64_pd` | `VCVTQQ2PD (ZMM, ZMM)`；使用已核验的 XED 类型字段别名。`M512`、`M64_1to8` 等形式在其他变体中。 |
| `_mm512_maskz_cvtepi64_pd` | `VCVTQQ2PD_Z (ZMM, K, ZMM)`，与普通或合并掩码形式分开。 |
| `_mm512_i64gather_pd` | `VGATHERQPD (ZMM, K, VSIB_ZMM)`；说明 Guide 的 `vm32z` 写法与其 XED/64 位索引信息的差异。 |
| `_mm512_shrdi_epi64` | `VPSHRDQ (ZMM, ZMM, ZMM, I8)`；XML 缺少详情 URL 时，通过官方表格目录补全。 |
| AVX2 masked gather | 向量掩码寄存器属于普通操作数，不误当成 EVEX 的 K 掩码。 |
| 多种 FMA 映射 | 分组列出可能指令，具体选择由编译器和上下文决定。 |
| reduce、SVML 等 sequence | 明确提示指令序列；不把单条数据当作整体成本，不直接相加。 |

匹配描述的是 Guide 所列的指令形式，不能保证编译器在具体上下文中一定选择它。无法确认时保留候选或搜索入口；不会通过删除 `V` 前缀或忽略不一致的寄存器宽度来强行匹配。

## 数据、缓存与权限

支持数据保存在 `src/generated/support.json`，固定的上游提交和 SHA-256 保存在 `scripts/support-sources.json`。“设置 / 数据”会显示 XED 和 LLVM 版本。普通构建使用已提交的数据；`npm run data:update` 下载并验证来源后生成两份索引，`npm run data:build` 复用本地资料。两份数据均生成成功后才替换旧文件。自动更新 workflow 会检查两份数据；升级 XED/LLVM 来源版本需要显式修改并审核。

- 内置索引的 Intel Guide 版本、uops.info 日期和来源哈希记录在 `src/generated/index.json` 中，也可在“设置 / 数据”查看版本。详情链接优先取自官方 XML；缺少 URL 时，按完整指令名称和扩展类型精确匹配 uops.info 官方表格目录（`csv/instructions.csv`），使用官网表格相同的链接生成规则。XED、操作数、编码和掩码标记仍取自 XML。读取页面后还会校验完整指令名称和 XED 标识，通过后才显示测量数据。
- 浏览器按需读取 uops.info 指令详情页，只提取 **Measurements**。不混入 IACA 或 Documentation，不执行远程页面脚本，也不下载约 143 MB 的完整 XML。
- 请求按指令去重，最多同时 3 个。按变体缓存整页各架构数据，有效期 7 天；刷新失败可显示明确标注的旧缓存。
- 权限仅用于 Intel Guide 页面注入、uops.info 跨站请求、脚本设置与缓存。跨站请求不携带登录凭据，没有自建后端或遥测。
- 索引随脚本构建更新；“刷新数据”更新的是性能页面缓存，不更新匹配索引。官网内容变更导致解析失败时，会显示错误及原页链接，而不会把解析失败伪装成架构无数据。

首版匹配 Intel 官方 Guide 路径；第三方镜像和本地离线 Guide 不在支持范围内。

## 开发与构建

需要 Node.js 20.19+、npm。重新生成索引另需 Python 3.9+。

```bash
npm ci
npm run build
npm test
```

产物为 `dist/iig-uops-bridge.user.js`。精简索引已纳入项目，正常构建和测试不依赖被忽略的 `research/` 目录。`npm test` 先构建当前源码，再运行单元、解析器及完整脚本集成测试。

浏览器测试使用 Intel 原版渲染脚本与小型数据快照，不依赖官网实时可用性；GM 接口在测试中模拟。通过 Tampermonkey 导入脚本及真实跨站请求需要单独手动验证。

```bash
npx playwright install chromium firefox
npm run test:browser -- --project=firefox
npm run test:browser -- --project=chromium
# 已安装上述两个浏览器时执行完整检查：
npm run check
```

测试内容包括：XED 别名、不同宽度/编码/掩码、gather、多个候选、架构缺失、延迟上界、数据来源隔离、缓存失效、请求去重/并发限制、旧异步结果隔离、三种视图切换，以及 Guide 重新渲染后的注入。

更新官方数据并重新生成索引：

```bash
npm run data:update
npm test
```

下载工具从 Intel 当前页面及渲染脚本发现数据地址。主站不可用时，依次尝试 `www.intel.com`、`www.intel.cn` 的 Intel 官方静态渲染脚本，再从脚本中读取 XML 地址。临时网络或服务器故障会有限重试；HTTP 403 直接尝试下一个来源。全部来源失败时终止更新，保留原有数据。保留稳定的本地文件名，但从 XML 内容读取真实版本。也可使用已有下载资料运行 `npm run data:build`。原始数据只保存在已忽略的 `research/` 中。分发更新时应修改 `package.json` 的版本并重新构建。

数据工具回归测试：`python3 -m unittest discover -s tests -p '*_test.py'`（Python 3.9+），覆盖来源拒绝访问、后备来源、临时故障、保留原有下载资料，以及通过官方目录补全缺失详情 URL。重新生成索引现在需要 `research/uops-instructions.csv`；旧资料目录请运行 `npm run data:update` 更新。

模块分工：`src/match.ts` 负责匹配，`src/parser.ts` / `src/service.ts` 负责读取与缓存，`src/guide.ts` 适配 Guide，`src/main.ts` / `src/ui.ts` 管理三种视图。索引生成工具在 `scripts/`。

界面文案集中在 `src/i18n.ts`，以中文原文为消息键，英文目录由测试校验完整性及插值参数一致性。指令名称与 uops.info 原始测量细节保留来源文本；不同语言共用测量缓存。

## GitHub Actions

提供三条工作流：

- **Build and test**（`.github/workflows/build.yml`）：提交、PR 和手动触发时构建脚本，运行单元/DOM 测试及 Chromium、Firefox 浏览器测试。成功后上传可安装脚本，构建产物保留 30 天。
- **Build and release**（`.github/workflows/release.yml`）：推送 `vX.Y.Z` tag 时触发，校验包版本、构建，并通过下载工具、单元/DOM、Chromium 和 Firefox 测试后发布 GitHub Release，包含 `iig-uops-bridge.user.js` 和 SHA-256 校验文件。使用提交中的索引，不临时下载源数据。中断的草稿发布可通过重跑工作流继续；已发布的 Release 保持不变。
- **Update instruction index**（`.github/workflows/update-index.yml`）：每周一 **UTC 03:17（北京时间 11:17）**执行，也支持手动触发。下载官方资料、验证并生成匹配索引和支持数据；XED/LLVM 来源保持固定版本。任一数据变化时递增补丁版本、重新构建和测试，并在 `automation/update-instruction-index` 分支创建或更新同一个 PR。没有变化就不创建新版本或新 PR；下载或测试失败会停止更新。原始下载资料保持忽略。

启用前，将工作流放到仓库默认分支，在 **Settings → Actions → General → Workflow permissions** 中允许 GitHub Actions 创建 PR。更新任务申请仓库内容和 PR 的写权限，普通构建只使用读取权限；无需配置个人 token 或额外 secrets。参见 [create-pull-request 权限要求](https://github.com/peter-evans/create-pull-request#workflow-permissions)。

首次可在 **Actions → Update instruction index → Run workflow** 手动运行。审核并合并生成的 PR 后，默认分支的索引与脚本才会更新。GitHub 可能要求审批由 `GITHUB_TOKEN` 创建的 PR 的 CI 运行；出现提示时点击 PR 中的 **Approve workflows to run**。更新工作流自身已经在创建 PR 前执行测试。参见 [GitHub 工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)。

正式版本从 [Releases](https://github.com/LXYan2333/iig-uops-bridge/releases/latest) 安装；构建 artifact 可用于测试尚未发布的提交。索引更新不会自动合并 PR 或发布 Release；审核并合并后，推送版本 tag 即可发布。浏览器内已安装的脚本通过导入新版本更新。上游网站不可用时，更新失败不会改变默认分支；恢复后可重新运行。定时任务只在默认分支运行，可能延迟或因仓库长期无活动而被停用；停止更新时请检查 Actions 页面。

## 发布版本

先设置包版本、重新构建，并提交 `package.json`、`package-lock.json` 和 `dist/iig-uops-bridge.user.js`，再创建 tag。tag 必须是包版本加上 `v` 前缀，例如包版本 `1.1.0` 对应 `v1.1.0`。

```bash
npm version 1.1.0 --no-git-tag-version
npm test
git add package.json package-lock.json dist/iig-uops-bridge.user.js
git commit -m "Prepare v1.1.0 release"
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin main
git push origin v1.1.0
```

发布任务使用内置 `GITHUB_TOKEN` 的 `contents: write` 权限，无需额外 secret。等待 **Build and release** 成功后再分享下载链接。后续发布使用新版本号，不要移动已有 tag。

## 来源

[Intel Intrinsics Guide](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html)、[uops.info XML](https://uops.info/xml.html)、[uops.info 表格](https://uops.info/table.html)。生成索引保留输入文件的 SHA-256；测试快照的来源及 jQuery 原始许可说明见 `tests/fixtures/SOURCES.txt` 与对应文件。新增代码不把这些第三方数据或脚本重新声明为其他许可证。

架构支持数据派生自 [Intel XED](https://github.com/intelxed/xed)（Apache-2.0）和 [LLVM](https://github.com/llvm/llvm-project)（Apache-2.0 with LLVM exceptions）。[第三方声明](third_party/NOTICE.txt)与许可证保留在 `third_party/`，并内嵌于可安装脚本。
