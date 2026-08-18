# FusionDigital 贡献指南

感谢参与 FusionDigital。项目同时包含科学调研、工程知识、网页实现和可下载报告，因此“内容正确”和“代码可运行”必须分别审核。

## 角色与责任

- 领域维护者：核对物理、工程、控制、诊断或装置结论及适用边界。
- 数据维护者：维护条目结构、来源、代码关系、证据等级和去重标识。
- 软件维护者：负责页面、组件、可访问性、性能、构建与测试。
- 发布维护者：确认目标提交、生产构建和 Sites 版本完全一致。

一个人可以承担多个角色，但涉及安全、装置状态或实验效果的重大结论应至少有一位相应领域专家复核。

## 分支与 Pull Request

1. 从最新 `master` 创建短生命周期分支。
2. 一个 Pull Request 只解决一个主题，避免把无关格式化混入内容更新。
3. 在说明中写明：问题、改动、证据来源、生成文件、验证结果和已知局限。
4. 至少由一位软件维护者审核；科学结论变化还需要领域维护者审核。
5. 检查通过后使用 squash 或线性历史合并，保持提交目的清晰。

建议采用 Conventional Commits 风格：

```text
feat(ai): add device evidence filters
content(physics): update transport surrogate evidence
docs: clarify research-data workflow
fix(engineering): correct commercial tool link
```

## 基本检查

```bash
npm ci
npm run assets:verify:tracked
npm run check
```

需要验证 ITER 高清模式或准备内网自包含部署时再运行：

```bash
npm run assets:hydrate
npm run assets:verify
```

修改智能原生、控制或诊断源数据时还要运行相应生成器；诊断域使用：

```bash
npm run research:ai
npm run research:diagnostics
git diff -- research/diagnostics public/data app/diagnostics/diagnosticsResearch.ts public/fusion-diagnostics-paper-code-index.csv public/fusion-diagnostics-references.bib
```

如果重新生成 Word 报告：

```bash
python -m pip install -r requirements-research.txt
npm run research:report
npm run research:diagnostics:report
```

二进制报告无法通过普通文本 diff 审核。提交前应打开 Word 文件抽查目录、表格、图片、外链和分页，并在 Pull Request 中说明检查范围。

## 调研条目的最低字段

每个智能原生工作至少应包含：

- 稳定的 `id` 和 `projectId`
- `primaryDomain` 与必要的 `relatedDomains`
- 标题、年份、机构
- 解决问题与技术方法
- 适配或验证装置
- `evidenceLevel` 和具体证据
- 论文或官方原始来源
- 代码/软件名称、链接、状态及与研究的关系
- 使用数据、成熟度、主要局限和标签

同一项目跨多个领域时，不复制成多个“独立工作”；使用一个 `projectId`、一个主域和多个关联域。

## 证据等级

| 等级 | 含义 |
| --- | --- |
| E0 | 概念、方法或计划 |
| E1 | 仿真、合成数据或概念设计验证 |
| E2 | 真实装置历史数据的离线训练、测试或回放 |
| E3 | 实时系统、硬件在环或影子运行，未直接闭环驱动装置 |
| E4 | 在真实装置中闭环影响执行器或实验轨迹 |

只按公开来源直接证明的最高等级标注。目标用于 ITER、SPARC 或电厂不等于已在目标对象验证；高推理速度不等于实时部署；装置数据训练不等于闭环实验。

## 代码与软件关系

- `official-direct`：作者或项目方公开、与工作直接对应的代码或权重。
- `official-enabling`：官方父模型或使能工具，不是论文实现的完整替代。
- `commercial-enabling`：商业或专有软件支撑工作，应标明访问方式。
- `community-reproduction`：第三方复现或相近实现。
- `not-public`：未发现可确认的对应实现。

不要把 PyTorch、JAX、OpenMDAO 等通用框架当作特定论文的对应代码。链接应优先指向 DOI、期刊、实验室、项目或作者官方仓库，不使用搜索结果页充当来源。

## 内容和安全边界

- 不提交访问令牌、账号、内部 URL、未脱敏日志或个人敏感信息。
- 不提交未经批准的装置参数、实验数据、CAD、商业软件模型或合作方资料。
- 原始 EXL-50U / EHL-2 / ITER CAD、STEP、B-Rep、PMI、尺寸、公差、完整装配元数据，以及原始 EFIT 档案、G-file 和 psi 网格，只能保留在受控工程/实验数据系统中；禁止放入 GitHub、Codeup、Git LFS、内网公开下载或百度网盘。
- 仓库和外置资产包只能包含经过授权与审核的浏览器运行时派生物。EXL-50U、公开 EFIT 派生数据和 Paramak 资产随 Git；ITER 高清模式的 18 个 GLB 分片由 `assets/runtime-assets.lock.json` 锁定并独立分发。
- 第三方论文图、商标和软件说明必须保留来源与许可边界。
- 对推断性结论使用“可能、推断、公开证据未证明”等明确口径。
- 任何 AI 建议都不得被描述为已获装置控制或安全权限，除非有直接、可核验的公开证据。

## 生成文件规则

以下文件由源数据生成，但为了网站直接构建而纳入版本控制：

- `app/ai/aiResearch.ts`
- `public/data/fusion-ai-native-landscape.json`
- `public/fusion-ai-native-paper-code-index.csv`
- `public/fusion-ai-native-research-report.docx`（按需生成）

不要手工修改生成文件后遗漏源数据。若生成结果发生非预期大规模变化，应先停止提交并检查 `projectId`、领域映射、日期和脚本版本。

## 运行时资产变更

完整分发流程见[运行时资产获取与校验](docs/ASSET_BOOTSTRAP.md)。一般页面开发不要修改资产锁；外置资产变更必须由获授权的维护者执行，并把“运行时派生物审核”和“源工程资料管控”作为两个独立边界。

更新 ITER 18 片时：

1. 在受控环境从获授权来源生成浏览器运行时派生物，不把源 CAD/STEP 或私密元数据复制到工作区；
2. 同步更新网站模型清单、Worker 精确 allow-list 与 `assets/runtime-assets.lock.json`；
3. 运行 `npm run assets:verify:tracked` 和 `npm run assets:verify`，确认文件名、字节数和 SHA-256 一致；
4. 使用 `npm run assets:stage -- --output .runtime-assets/upload-pack` 生成上传区（根目录包含锁文件和 `iter-high-detail-v1/` 子目录）；
5. 把上传区原样发布到稳定 HTTPS 对象存储，或打包后让使用者从百度网盘手工下载并用 `--source-dir` 导入；
6. 在另一台无缓存机器完成冷恢复，再提交代码与锁文件。hydration 目录和 `.runtime-assets/` 不提交。

镜像应能通过“根地址 + 锁定文件名”直接 `GET`，不能依赖个人 Cookie 或短期签名链接。下载失败或校验不一致时修复镜像/重新下载，不能关闭校验或随意刷新锁文件。

Sites 发布必须使用没有 `public/models/iter-high-detail-v1/` hydration 目录的干净工作区，默认由 Worker 外部取回，避免静态包超过约 256 MiB。内网自包含构建则先 hydration，并保留该目录让 local-first 路径命中。

Codeup SSH 地址为 `git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git`。增加远端时先运行 `git ls-remote --heads codeup` 和 `git fetch codeup` 审计历史，确认兼容后再推送；禁止为“同步”直接强制覆盖。Git LFS 迁移会重写历史，未经团队迁移评审不得执行。

## Pull Request 检查清单

- [ ] 改动范围单一，没有无关文件
- [ ] 来源是原始论文、官方页面或官方仓库
- [ ] 装置、年份、指标和适用边界已复核
- [ ] 代码状态没有夸大开放性
- [ ] 生成文件与源数据同步
- [ ] `npm run check` 通过
- [ ] `npm run assets:verify:tracked` 通过；涉及完整资产时 `npm run assets:verify` 也通过
- [ ] 资产变更已完成另一台机器的冷下载/导入验证，且未提交 hydration/stage 目录
- [ ] 新链接可访问，或已在说明中记录限制
- [ ] 没有源 CAD、源 EFIT、敏感数据、凭证、私密镜像地址或版权风险
- [ ] 页面在键盘和移动端仍可使用
