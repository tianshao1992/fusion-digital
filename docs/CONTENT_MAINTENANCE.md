# FusionDigital 内容维护手册

## 1. 内容更新的基本原则

每次更新都应回答四个问题：

1. 新来源改变了什么事实？
2. 这个事实适用于哪台装置、哪个工况和哪个时间点？
3. 公开证据实际证明到哪一步？
4. 网站、数据文件和报告中哪些位置需要同步？

不要为了填满字段而推断。无法确认的信息应保留为空或明确写“未公开/未单独判级”。

## 2. 新增智能原生工作

选择最接近的源文件：

- `core_control_diagnostics.json`：物理模拟、集成控制与 AI 赋能诊断（历史数据域名仍保持兼容）
- `engineering_energy_aux.json`：工程仿真、能量转化、辅机模拟
- `data_hmi_integration.json`：数据基座、人机交互、总体集成

新增前先搜索标题、DOI、仓库 URL 和项目名称，确认不是已有项目的别名。如果同一项目增加新的领域应用，应更新原项目并增加 `relatedDomains`，不要复制为新的唯一工作。

推荐顺序：

1. 记录原始论文或机构来源。
2. 核对年份、机构和装置。
3. 写明问题、方法、数据和直接证据。
4. 判断 E0–E4，必要时记录部署等级。
5. 检索作者/项目官方仓库，判断代码关系。
6. 写明局限和适用域。
7. 运行生成与审计。

## 3. 更新命令

```bash
npm run research:ai
npm run research:control
npm run research:diagnostics
npm run check
```

确认以下生成文件发生了预期变化：

```text
app/ai/aiResearch.ts
public/data/fusion-ai-native-landscape.json
public/fusion-ai-native-paper-code-index.csv
app/diagnostics/diagnosticsResearch.ts
public/data/fusion-diagnostics-landscape.json
public/data/fusion-diagnostics-device-profiles.json
public/fusion-diagnostics-paper-code-index.csv
public/fusion-diagnostics-references.bib
```

需要更新完整报告时：

```bash
python -m pip install -r requirements-research.txt
npm run research:report
npm run research:control:report
npm run research:diagnostics:report
```

Windows 且安装 Microsoft Word 时，可使用 `scripts/research/render_word_pdf.vbs` 将 DOCX 渲染为 PDF 进行逐页检查。其他平台可使用 LibreOffice 转 PDF，但分页可能与 Word 不同。

## 4. 论文与来源

优先顺序：

1. DOI 或期刊正式页面
2. 实验室、装置、研究机构或项目官方页面
3. 作者/项目官方预印本和技术报告
4. 官方会议材料、学位论文或数据集说明

原则上不使用媒体二手报道支撑技术指标，也不把搜索结果页、聚合站或 AI 摘要作为证据。确需使用新闻稿时，应明确它是官方项目进展而非同行评审结论。

建议补充 `sourceType`，常用值包括：

```text
journal-article
preprint
conference-paper
conference-material
official-project-page
official-documentation
official-source
```

## 5. 装置状态

装置建设、首等离子体、升级和运行状态具有时效性。更新 `/facilities` 时：

- 记录“截至日期”。
- 区分计划日期、官方目标、已经完成和第三方预测。
- 优先引用装置/机构官网和正式论文。
- 对 EXL-50U、EHL-2 等团队相关装置的内部信息，只发布已经获批公开的内容。
- 不把装置适配计划写成已验证应用。

## 6. 图片和报告

- 论文原图应保留来源、图号和使用边界。
- 重绘图必须区分数据驱动图、机制示意图和架构概念图。
- 不在示意图中伪造精确数值、磁面、传感器位置或安全链路。
- 图片中的术语、箭头和层级应由领域专家复核。
- 大型 PNG 应在不损失论文级可读性的前提下压缩，网页图片使用懒加载。
- Word/PDF 更新后检查目录、页码、表格跨页、图片清晰度和外链。

## 7. 物理、工程和装置模块

这些模块当前仍有部分数据直接位于 TypeScript 文件。更新时应同时检查：

- 页面正文与汇总数字
- 外部工具/论文链接
- 下载 CSV/JSON
- 报告中的同名章节
- 首页卡片、导航或统计数字

中期目标是像智能原生模块一样，将三者迁移为“源数据 → 生成文件 → 审计 → 页面/报告”的统一管线。

## 8. 外链维护

外链失效时不要直接删除证据：

1. 查询 DOI、期刊和机构的新地址。
2. 保留文献标题、作者、年份和原标识。
3. 优先替换为稳定 DOI 或官方归档。
4. 如果只能找到门户首页，标注限制并建立维护 Issue。
5. 不使用未经授权的论文镜像替代正式来源。

## 9. 发布前内容检查

- 条目总数变化是否合理
- `projectId` 是否误合并或重复
- 主域与关联域是否准确
- 论文和代码链接是否对应同一工作
- 指标是否保留条件、装置和数据集范围
- `E4` 是否确有真实装置闭环证据
- 商业软件是否标注专有访问
- 页面、JSON、CSV 和 Word 是否同步
- 是否包含敏感参数、内部账号或合作限制内容
