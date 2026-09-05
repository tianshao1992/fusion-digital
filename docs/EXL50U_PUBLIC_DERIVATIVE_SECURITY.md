# EXL-50U 公开简化派生网格：威胁模型与发布门禁

## 1. 决策与不可承诺的边界

项目所有者已明确授权：将 **EXL-50U 的简化、脱敏、非工程权威派生网格**作为浏览器 GLB 公开发送，以支持逐部件选择、显隐、隔离、透明度和剖切。授权不包含原始 CAD、STEP/STP、PPT/PPTX、压缩包、工程权威网格、私有文件路径或其他源数据。

公开 GLB 一旦发送到浏览器，就可以从缓存、开发者工具、网络请求或图形调试工具中保存。隐藏下载按钮、禁用右键、混淆 URL、`no-store`、短期签名 URL、CORS 或水印都不能使已发送的网格“不可下载”。本项目对“禁止下载”的可验证解释是：

- 不提供模型下载按钮或下载型链接；
- 不发布原始工程文件，只发布经授权的简化派生物；
- 清晰声明派生物可被技术性保存、不得作为工程权威依据；
- 用清单、哈希、体积预算和 CI 白名单确保部署物没有越界。

如果未来的要求变成“几何不能到达用户设备”，则必须停止公开 GLB，改用服务端远程渲染；这与逐部件浏览器实时几何是互斥的安全边界。

## 2. 三种交付方案

| 方案 | 可实现的交互 | 几何保密边界 | 仍无法阻止 | 适用结论 |
| --- | --- | --- | --- | --- |
| 公开 GLB / 客户端渲染 | 最完整；部件选择、显隐、透明、剖切、拾取 | 浏览器获得简化网格；源 CAD 留在私有域 | 保存公开 GLB、截图、从公开网格估算外形 | 当前已获授权方案 |
| 预渲染组合 | 固定角度、固定透明/剖切/细节预设 | 不发送可编辑网格 | 保存图片、截图、多视图近似重建 | 未授权公开网格时的降级方案 |
| 服务端远程渲染 | 可做交互流或按请求渲染，但延迟和成本较高 | 几何保留在受控服务端 | 截图、录屏、通过大量视图推断形状 | 对真正受限网格的推荐方案 |

## 3. 公开 GLB 的强制发布合同

EXL-50U 总装条目必须由 `device-catalog.json` 显式选择 `real-3d` 和 `public-static`，且只能
指向同源、规范化的 `/models/exl50u-general-assembly-v1/model-manifest.json`。
DeviceManifest 1.4 必须满足：

- `devicePackage.kind = public-simplified-derivative`；
- `devicePackage.authority = illustrative`；
- `access.classification = PUBLIC`；
- `access.redistributionAllowed = true`；
- `access.engineeringUseAllowed = false`；
- `access.statement` 明确包含用户授权、公开、简化派生物的含义；
- active 公开资产不声明标准 preview 或降级回退；
- `assets.shardBundles[0]` 只声明 20 个顺序固定、digest-named 的 high GLB，总计 270,978,652 B（271.0 MB）；它们是匿名运输分片，不表达工程系统、BOM 或源装配树；
- 不存在 `assets.sourceCad`；
- `disclaimer` 明确其不是工程权威模型，不可用于制造、尺寸校核、CAE 或安全决策；
- `derivationEvidence` 必须是 exact v8 七键：`kind`、`selectedAttempt`、
  `sourceInputCleaning`、`previewVisualLod`、`highQem`、`highPartition`、`coverage`；preview
  使用 sloppy visual LOD，且固定 `selectedTargetTriangleRatio = 0.03`、
  `simplifierNormalizedErrorLimit = 0.02`；high 使用 QEM，并按 `selectedAttempt` 固定为 `0.70/0.65`，两档各自保存互斥算术闭合的 `outputCleaning`；
- high 的聚合输出不得低于
  `floor(0.98 * selectedTargetTriangleRatio * sourceInputCleaning.sanitizedTriangles)`，该门禁只约束 high，不约束 sloppy preview；
- preview 的 canonical 10-view visual QA 必须满足最差 silhouette IoU >= 0.97、最坏 normalized
  depth p99 <= 0.02；公开对象只保存匿名指标和 receipt SHA-256，不保存完整私有报告；
- `sourceInputCleaning` 绑定 source face/triangle 匿名计数，但不包含逐定义拓扑保留声明或
  任何旧版简化语义；不得用任意面积容差删除正面积三角形；
- 20 个 active high 文件的路径、数量、顺序、字节数、SHA-256、三角面、draw call、placement 与解码预算均受门禁限制；
- EXL 不参与几何叠加比较，页面始终传入 `showDownloadActions=false`。

ITER 的 18 个经审核高精度文件同样是已激活的公开外置运行时 bundle，而不是
`metadata-only`。ITER 与 EXL 总装的源 CAD、STEP、B-Rep、PMI 和工程权威网格仍不得进入
应用仓库、Sites 归档或公开派生包。香港自包含 release 只纳入 runtime lock 精确声明并已
校验的公开派生 GLB。

## 4. 存储、身份、授权和审计

公开站点不需要通过登录来“保护”已经决定公开的 GLB；给公开对象套登录或短期 URL 只会增加复杂度，不能撤回已经交付的数据。认证和授权应放在发布链路：

- 原始 EXL 数据进入独立的私有对象存储或 PLM/PDM，默认拒绝公网，和网站部署凭据分离；
- 派生作业使用最小权限服务身份，只能读经批准的源版本、写隔离的候选区；
- 发布批准使用组织身份登录、MFA 和角色分离；建议至少由资产所有者和发布者两人复核；
- 审计记录源版本/哈希、派生脚本及版本、派生 GLB 哈希、批准人、批准时间、适用授权、上线版本和撤回记录；
- 只有通过 CI 白名单与摘要锁的派生 GLB 才能复制到外置公开资产仓库；源桶不得与公开桶共享前缀或同步规则；
- EXL 的 manifest、notice、catalog 激活记录、生成 Worker 白名单与 runtime lock 必须在同一个应用提交中原子更新，不能拆分或临时退回 metadata-only。

摘要命名的 ITER/EXL GLB 成功响应应返回
`Cache-Control: public, max-age=31536000, immutable`、`Referrer-Policy: no-referrer`、
`X-Content-Type-Options: nosniff`、`Cross-Origin-Resource-Policy: same-origin` 和
`Content-Disposition: inline`。不可变缓存不会提供保密性；它依赖 URL 中的 SHA-256 和
发布前逐文件校验来保证内容身份。可变 manifest/notice、错误响应和未授权路径继续使用
`no-store`，不得把旧 `no-store` GLB 策略当作安全门或性能目标。

## 5. 防滥用与运营

CDN/WAF 可以对异常高频请求、枚举和热链设置速率限制并记录事件，但不得把速率限制描述为防下载。对公开 GLB 使用可观测性告警：请求量突增、非本站来源、连续 Range 抓取、异常 User-Agent、哈希不一致或未登记版本访问。撤回流程应同时删除公开对象、清理 CDN、回退 catalog，并保留审计证据；已经被第三方保存的副本无法远程销毁。

若采用服务端远程渲染，则必须额外具备 OIDC/MFA、装置级 RBAC、短时会话、每用户并发与渲染预算、GPU 作业隔离、输入参数白名单、完整审计、私有存储、输出水印及反自动化策略。即便如此，像素和录屏仍可被保存。

## 6. CI / 发布回归

发布门禁必须自动验证：

1. EXL 总装只允许正式 manifest/lock 声明的 20 个 high 匿名 GLB；标准 preview、其他 EXL 几何、STEP/STP、PPT/PPTX、压缩包和私有路径全部失败。
2. ITER 只允许 lock 中 18 个摘要命名的公开派生 GLB；ITER/EXL 的任何源 CAD 或未声明几何全部失败。
3. EXL 清单的授权、派生类型、非工程用途和免责声明字段完整；不得包含 `sourceCad`。运行时
   必须拒绝 v8 七键以外的旧别名或额外键，并核验 source triangle 算术、两档互斥
   `outputCleaning` 算术、每档 `receiptCount == renderableDefinitions`、attempt/ratio 映射、
   high 的真实 GLB unique triangles、primitive/mesh chunk 数及 coverage 零缺失；派生证据中的
   preview sloppy 收据仅用于受控 QA，不得成为 active 浏览器资产或失败回退，且不可与 high QEM 算法互换。
4. 所有 GLB 路径同源且规范化，真实文件字节数和 SHA-256 与 manifest/runtime lock 一致，并低于公开交付预算。
5. catalog 保持 `showDownloadActions=false`、EXL `overlayEligible=false`；服务端 HTML 不出现 GLB/STEP 下载链接或本地路径。
6. 摘要 GLB 的 GET/HEAD/Range 返回 identity 编码、正确长度/范围与 immutable cache；未知 viewer mode、未知路径、重定向或缺字段条目必须 fail closed，并使用 `no-store` 错误响应。
7. 香港构建后的 `dist/` 必须含并复核 ITER 18 + EXL 20；Sites 构建后的 `dist/` 必须不含两类外置 GLB，并由精确 Worker 白名单按需代理。
8. Sites 的 `ITER_HIGH_DETAIL_ASSET_BASE_URL` 与 `EXL50U_GENERAL_ASSEMBLY_ASSET_BASE_URL` 必须固定到同一资产仓库的同一 40 位完整提交 SHA；branch、tag、短 SHA、3xx 与客户端指定上游全部拒绝。
9. EXL manifest、notice、catalog、生成 allow-list 与 runtime lock 必须在同一应用提交中相干。

## 7. High-only 20 个匿名分片发布合同

EXL-50U 总装浏览器派生包仅把 high 作为同一份公开授权和同一 DeviceManifest 的原子交付，
不得通过标准 preview、第二份清单、隐藏 URL 或目录枚举绕过发布门禁：

- active 发布不含标准 preview，也不允许在 high 失败后降级回退；旧 preview 摘要路径必须返回 404；
- high 必须精确拆为 `anonymous-shard-01` 至 `anonymous-shard-20`，总计 270,978,652 B（271.0 MB），每片小于 24 MiB、解码预算不超过 96 MiB，并始终串行加载；能力足够的桌面客户端可以自动启动，窄屏、省流量或低内存客户端必须由用户显式启动；任一下载、摘要、解码或聚合检查失败都必须 fail closed；
- 20 是 high 运输 shard 文件数；`highPartition.geometryChunkCount` 是 20 文件中解码得到的
  primitive/mesh 几何 chunk 总数，必须与实际 GLB、partition triangles 对账，不能固定写成 20；
- 20 个 high GLB 总量不超过 300 MiB；high 聚合解码预算不超过 1.5 GiB，场景三角面不超过 3500 万、draw call 不超过 800；无法证明预算时必须 fail closed；
- GLB 固定使用 Float32 POSITION、normalized Int8 NORMAL、Uint32 indices、`EXT_meshopt_compression` 与 `EXT_mesh_gpu_instancing`；
- 公开 GLB JSON 不得含 `name` / `extras`；唯一公开根名 `EXL50U_GA_VISUALIZATION` 由运行时合成，20 个编号只表示运输顺序；
- manifest 和界面必须继续说明 high 是非工程可视化派生，不可用于制造、尺寸校核、CAE、安全决策或配置控制；
- `/device-assets/exl50u-general-assembly/v1/` 只允许 20 条摘要锁定 high 路径。GET、HEAD 与 Range/206 必须经过 Worker 或香港精确 Nginx location；未知、旧 preview、编码、遍历及旧目录枚举路径必须返回 404；
- SSR HTML 不得直出任一 GLB URL、下载属性或模型下载链接。浏览器运行时从 manifest 选择资产不改变“已发送数据可被技术性保存”的既有边界。
- canonical visual QA 完整报告、QEM 私有证据、源 manifest、仅供投影器交叉核验的
  `geometryAccounting`、源路径/摘要和 definition/occurrence ID 必须留在仓库外受控边界；
  不得进入应用 Git、资产仓库、公开 DeviceManifest、notice 或浏览器响应。

自动回归至少验证：同一版本化 manifest 原子声明、20 个固定 high 路径和唯一角色、bytes/hash/GLB
header、匿名分组、v8 exact-key/算法互斥、source/output-cleaning 算术、canonical visual QA、
partition/GLB/coverage 交叉闭合、Meshopt/GPU instancing required extensions、GPU/场景预算、
manifest/lock/allow-list 对账、Worker 与香港 GET/HEAD/Range 响应头、旧路径和恶意路径 404、
SSR 无直链/下载，以及两种构建目标各自正确包含或排除外置 GLB。
