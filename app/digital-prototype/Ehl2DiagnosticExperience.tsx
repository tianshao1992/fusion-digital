'use client';

import { useMemo, useState } from 'react';
import TokamakCadViewer from '../components/TokamakCadViewer';
import {
  DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
  EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT,
  EHL2_DIAGNOSTIC_SCENARIOS,
  EHL2_DIAGVIEW2_SOURCE,
  scenarioForId,
  scenarioIdsForMode,
  type Ehl2DiagnosticOverlayOptions,
  type Ehl2DiagnosticScenario,
  type Ehl2DiagnosticScenarioId,
  type Ehl2DiagnosticViewMode,
} from '../components/device-viewer/ehl2DiagView2';
import { useI18n } from '../i18n';
import type { DeviceCatalogEntry } from './deviceCatalog';
import styles from './Ehl2DiagnosticExperience.module.css';

type Props = { device: DeviceCatalogEntry };
type CompareFeedback =
  | { kind: 'minimum' }
  | { kind: 'maximum' }
  | { kind: 'selected'; count: number }
  | null;

const MAX_COMPARE_SCENARIOS = 4;
const MIN_COMPARE_SCENARIOS = 2;

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}

export default function Ehl2DiagnosticExperience({ device }: Props) {
  const { locale } = useI18n();
  const isEnglish = locale === 'en';
  const ui = (zh: string, en: string) => isEnglish ? en : zh;
  const workspace = device.diagnosticWorkspace;
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [options, setOptions] = useState<Ehl2DiagnosticOverlayOptions>({
    ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
    compareScenarioIds: [...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.compareScenarioIds],
  });
  const [compareFeedback, setCompareFeedback] = useState<CompareFeedback>(null);

  const activeScenario = scenarioForId(options.activeScenarioId);
  const visibleScenarioIds = useMemo(() => scenarioIdsForMode(options), [options]);
  const visibleScenarioSet = useMemo(() => new Set(visibleScenarioIds), [visibleScenarioIds]);
  const localizedOverlayOptions = useMemo<Ehl2DiagnosticOverlayOptions>(() => ({
    ...options,
    labelLocale: isEnglish ? 'en' : 'zh-CN',
  }), [isEnglish, options]);
  const changedAssumptions = [
    !sameNumber(options.horizontalHalfAngleDeg, 50) ? ui('水平半视场', 'horizontal half-FOV') : null,
    options.verticalHalfAngleDeg > 0 ? ui('垂直半视场', 'vertical half-FOV') : null,
    !sameNumber(options.pitchDeg, 0) ? ui('俯仰角', 'pitch') : null,
    !sameNumber(options.yawDeg, 0) ? ui('偏航角', 'yaw') : null,
    !sameNumber(options.lengthMetres, 3.2) ? ui('射线长度', 'ray length') : null,
  ].filter((item): item is string => Boolean(item));
  const compareFeedbackText = compareFeedback?.kind === 'minimum'
    ? ui('多方案对比至少保留两个方案。', 'Keep at least two scenarios in comparison mode.')
    : compareFeedback?.kind === 'maximum'
      ? ui('最多同时对比四个方案；请先取消一个已选方案。', 'Compare up to four scenarios; clear one selection first.')
      : compareFeedback?.kind === 'selected'
        ? ui(`已选择 ${compareFeedback.count} 个方案。`, `${compareFeedback.count} scenarios selected.`)
        : '';

  if (!workspace || workspace.kind !== 'ehl2-diagview2') {
    return <div className={styles.contractError} role="alert">
      {ui('EHL‑2 诊断工作台合同缺失，已停止加载光路叠加。', 'The EHL-2 diagnostic-workspace contract is missing, so the optical overlay was not loaded.')}
    </div>;
  }

  const setMode = (mode: Ehl2DiagnosticViewMode) => {
    setCompareFeedback(null);
    setOptions((current) => ({ ...current, mode }));
  };

  const inspectScenario = (scenarioId: Ehl2DiagnosticScenarioId) => {
    setCompareFeedback(null);
    setOptions((current) => ({ ...current, mode: 'inspect', activeScenarioId: scenarioId }));
  };

  const toggleCompareScenario = (scenarioId: Ehl2DiagnosticScenarioId) => {
    const selected = [...options.compareScenarioIds];
    const existingIndex = selected.indexOf(scenarioId);
    if (existingIndex >= 0) {
      if (selected.length <= MIN_COMPARE_SCENARIOS) {
        setCompareFeedback({ kind: 'minimum' });
        return;
      }
      selected.splice(existingIndex, 1);
    } else {
      if (selected.length >= MAX_COMPARE_SCENARIOS) {
        setCompareFeedback({ kind: 'maximum' });
        return;
      }
      selected.push(scenarioId);
    }
    setCompareFeedback({ kind: 'selected', count: selected.length });
    setOptions((current) => ({ ...current, mode: 'compare', compareScenarioIds: selected }));
  };

  const updateNumber = (
    key: 'horizontalHalfAngleDeg' | 'verticalHalfAngleDeg' | 'pitchDeg' | 'yawDeg' | 'lengthMetres',
    value: number,
  ) => setOptions((current) => ({ ...current, [key]: value }));

  const resetInspection = () => setOptions((current) => ({
    ...current,
    horizontalHalfAngleDeg: DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.horizontalHalfAngleDeg,
    verticalHalfAngleDeg: DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.verticalHalfAngleDeg,
    pitchDeg: DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.pitchDeg,
    yawDeg: DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.yawDeg,
    lengthMetres: DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS.lengthMetres,
  }));

  const modeDescription = options.mode === 'coverage'
    ? ui('复合基线固定显示 VS3‑270°、VS3‑135°、VS2‑0°、VS2‑225°；VS4 仅有平面来源，且未出现在第 6–7 页复合评估中。', 'The composite baseline fixes VS3-270°, VS3-135°, VS2-0° and VS2-225°. VS4 has a plan-view source only and is not included in the slides 6–7 composite assessment.')
    : options.mode === 'inspect'
      ? ui(`正在校核 ${activeScenario.diagnosticId} / ${activeScenario.azimuthDeg}°。高级参数仅生成用户假设，不改写 PPT 来源。`, `Inspecting ${activeScenario.diagnosticId} / ${activeScenario.azimuthDeg}°. Advanced parameters create user assumptions and never alter the PPT source record.`)
      : ui(`当前对比 ${visibleScenarioIds.length} 个方案；颜色只区分方案，不代表通过/失败。`, `Comparing ${visibleScenarioIds.length} scenarios. Colours distinguish scenarios and do not indicate pass or fail.`);

  return <div className={styles.root} data-diagnostic-mode={options.mode}>
    <div className={`deviceViewport ${styles.viewport}`}>
      <TokamakCadViewer
        manifestUrl={device.viewer.manifestEndpoint ?? undefined}
        viewerId={device.id}
        sectionId={`${device.id}-workspace`}
        workspace
        showDownloadActions={false}
        showFootnotes={false}
        securityNotice={device.statement}
        appearancePreset="industrial-silver-v1"
        defaultClipping
        defaultClipAxis="z"
        defaultClipOffset={0}
        diagnosticOverlayOptions={overlayVisible ? localizedOverlayOptions : undefined}
      />
    </div>

    <aside className={styles.workbench} aria-labelledby="ehl2-diagview-title">
      <header className={styles.header}>
        <div>
          <p>DIAGVIEW2 / EHL-2</p>
          <h2 id="ehl2-diagview-title">{ui('诊断视线方案工作台', 'Diagnostic viewing-scheme workbench')}</h2>
        </div>
        <label className={styles.visibilityToggle}>
          <input type="checkbox" checked={overlayVisible} onChange={(event) => setOverlayVisible(event.currentTarget.checked)} />
          <span>{ui('显示三维叠加', 'Show 3D overlay')}</span>
        </label>
      </header>

      <div className={styles.boundaryBanner} role="note">
        <b>{ui('设计参考 · 非物理配准', 'DESIGN REFERENCE · NOT PHYSICALLY REGISTERED')}</b>
        <span>{ui('PPT 给出平面方位与 ±50° 视场参考；未提供完整端口测量、光学处方、标定或三维遮挡验证。', 'The PPT provides plan-view azimuths and a ±50° FOV reference, but no complete port survey, optical prescription, calibration or 3D occlusion validation.')}</span>
      </div>

      <div className={styles.levelTabs} role="group" aria-label={ui('诊断工作台层级', 'Diagnostic-workbench level')}>
        {([
          ['coverage', ui('1 覆盖总览', '1 Coverage')],
          ['inspect', ui('2 单方案校核', '2 Inspect')],
          ['compare', ui('3 多方案对比', '3 Compare')],
        ] as const).map(([mode, label]) => <button
          key={mode}
          type="button"
          aria-pressed={options.mode === mode}
          className={options.mode === mode ? styles.activeTab : ''}
          onClick={() => setMode(mode)}
        >{label}</button>)}
      </div>

      <section
        id="ehl2-diag-panel"
        className={styles.panel}
        aria-label={ui('诊断方案内容', 'Diagnostic-scenario content')}
        tabIndex={0}
      >
        <div className={styles.modeSummary} aria-live="polite">
          <b>{options.mode === 'coverage' ? ui('四方案复合基线', 'Four-scenario composite baseline') : options.mode === 'inspect' ? ui('单方案参数检查', 'Single-scenario parameter check') : ui('并列方案比较', 'Side-by-side scenario comparison')}</b>
          <span>{modeDescription}</span>
        </div>

        {options.mode === 'coverage' && <div className={styles.baseline} aria-label={ui('复合基线方案', 'Composite-baseline scenarios')}>
          {EHL2_DIAGNOSTIC_SCENARIOS.filter((scenario) => scenario.includedInCompositeAssessment).map((scenario) => <span key={scenario.id} style={{ '--scenario-color': scenario.colorCss } as React.CSSProperties}>{scenario.diagnosticId} · {scenario.azimuthDeg}°</span>)}
        </div>}

        <div className={styles.scenarioGrid} aria-label={ui('五个 PPT 诊断方案', 'Five PPT diagnostic scenarios')}>
          {EHL2_DIAGNOSTIC_SCENARIOS.map((scenario) => <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            isEnglish={isEnglish}
            active={options.mode === 'coverage' ? scenario.includedInCompositeAssessment : visibleScenarioSet.has(scenario.id)}
            inspected={options.mode === 'inspect' && options.activeScenarioId === scenario.id}
            compared={options.compareScenarioIds.includes(scenario.id)}
            onInspect={() => inspectScenario(scenario.id)}
            onCompare={() => toggleCompareScenario(scenario.id)}
          />)}
        </div>
        <p className={styles.compareFeedback} aria-live="polite">{compareFeedbackText || (options.mode === 'compare' ? ui('选择 2–4 个方案进行对比。', 'Select 2–4 scenarios for comparison.') : '')}</p>

        {options.mode === 'inspect' && <details className={styles.advanced} open>
          <summary>{ui('高级参数与用户假设', 'Advanced parameters and user assumptions')}</summary>
          <p>{ui('以下调整仅改变浏览器中的方案草图，不代表 PPT 数据、实装姿态、通光孔径或标定结果。', 'These controls change only the browser sketch; they are not PPT data, an as-installed pose, a clear-aperture result or a calibration result.')}</p>
          <div className={styles.assumptionState} data-changed={changedAssumptions.length > 0}>
            <b>{changedAssumptions.length > 0 ? ui('已加入用户假设', 'USER ASSUMPTIONS ACTIVE') : ui('PPT 平面角保持原值', 'PPT PLAN-VIEW ANGLES RETAINED')}</b>
            <span>{changedAssumptions.length > 0 ? changedAssumptions.join(' · ') : ui('但端口名义半径 2.55 m 与射线长度 3.2 m 始终是网页可视化假设。', 'Nominal port radius 2.55 m and ray length 3.2 m remain browser-visualization assumptions.')}</span>
          </div>
          <ParameterControl label={ui('水平半视场', 'Horizontal half-FOV')} value={options.horizontalHalfAngleDeg} min={1} max={75} step={1} unit="°" onChange={(value) => updateNumber('horizontalHalfAngleDeg', value)} />
          <ParameterControl label={ui('垂直半视场（PPT 未给出）', 'Vertical half-FOV (not in PPT)')} value={options.verticalHalfAngleDeg} min={0} max={60} step={1} unit="°" onChange={(value) => updateNumber('verticalHalfAngleDeg', value)} />
          <ParameterControl label={ui('俯仰假设', 'Pitch assumption')} value={options.pitchDeg} min={-35} max={35} step={1} unit="°" onChange={(value) => updateNumber('pitchDeg', value)} />
          <ParameterControl label={ui('偏航假设', 'Yaw assumption')} value={options.yawDeg} min={-35} max={35} step={1} unit="°" onChange={(value) => updateNumber('yawDeg', value)} />
          <ParameterControl label={ui('射线显示长度', 'Displayed ray length')} value={options.lengthMetres} min={0.5} max={6} step={0.1} unit=" m" onChange={(value) => updateNumber('lengthMetres', value)} />
          <button type="button" className={styles.resetButton} onClick={resetInspection}>{ui('复位网页假设', 'Reset browser assumptions')}</button>
        </details>}

        <fieldset className={styles.renderControls}>
          <legend>{ui('三维表达', '3D presentation')}</legend>
          <div>
            <button type="button" aria-pressed={options.depthMode === 'xray'} className={options.depthMode === 'xray' ? styles.pressed : ''} onClick={() => setOptions((current) => ({ ...current, depthMode: 'xray' }))}>{ui('忽略遮挡', 'Occlusion bypass')}</button>
            <button type="button" aria-pressed={options.depthMode === 'physical'} className={options.depthMode === 'physical' ? styles.pressed : ''} onClick={() => setOptions((current) => ({ ...current, depthMode: 'physical' }))}>{ui('CAD 深度遮挡', 'CAD depth occlusion')}</button>
          </div>
          <label><input type="checkbox" checked={options.showBoundaryRays} onChange={(event) => setOptions((current) => ({ ...current, showBoundaryRays: event.currentTarget.checked }))} />{ui('边界射线', 'Boundary rays')}</label>
          <label><input type="checkbox" checked={options.showLabels} onChange={(event) => setOptions((current) => ({ ...current, showLabels: event.currentTarget.checked }))} />{ui('方案标签', 'Scenario labels')}</label>
          <label><input type="checkbox" checked={options.showBlindZones} onChange={(event) => setOptions((current) => ({ ...current, showBlindZones: event.currentTarget.checked }))} />{ui('PPT 盲区标记', 'PPT blind-zone markers')}</label>
          <small>{ui('“CAD 深度遮挡”仅是简化网页网格的绘制效果，不是对真实窗口、光阑、挡板或公差的工程校核。', '“CAD depth occlusion” is only a rendering effect against the simplified web mesh, not an engineering check of real windows, apertures, baffles or tolerances.')}</small>
        </fieldset>

        <section className={styles.blindZones} aria-labelledby="ehl2-blind-zone-title">
          <h3 id="ehl2-blind-zone-title">{ui('PPT 复合覆盖与盲区记录', 'PPT composite coverage and blind-zone record')}</h3>
          <dl>
            <div><dt>{ui('中心柱', 'Centre post')}</dt><dd>{ui('PPT 标注无盲区', 'PPT reports no blind zone')}</dd></div>
            <div><dt>{ui('下偏滤器', 'Lower divertor')}</dt><dd>{ui('PPT 标注无盲区', 'PPT reports no blind zone')}</dd></div>
            <div><dt>{ui('上偏滤器', 'Upper divertor')}</dt><dd>{ui('270° 附近局部未覆盖', 'Partially uncovered near 270°')}</dd></div>
            <div><dt>{ui('诊断窗口方位', 'Diagnostic-window azimuths')}</dt><dd>{EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.diagnosticWindowAzimuthsDeg.join('° / ')}°</dd></div>
          </dl>
          <p>{ui('来源：PPT 第 6–7 页的平面复合结果。该记录不能外推为三维视场、真实遮挡、空间分辨率或标定后的覆盖率。', 'Source: plan-view composite result on PPT slides 6–7. This record cannot be extrapolated to a 3D FOV, real occlusion, spatial resolution or calibrated coverage.')}</p>
        </section>

        <section className={styles.provenance} aria-labelledby="ehl2-diag-source-title">
          <h3 id="ehl2-diag-source-title">{ui('来源、坐标与能力边界', 'Source, coordinates and capability boundary')}</h3>
          <ul>
            <li><b>{ui('来源', 'Source')}</b><span>{EHL2_DIAGVIEW2_SOURCE.branch} @ {workspace.sourceRevision.slice(0, 12)} · {EHL2_DIAGVIEW2_SOURCE.presentationDate}</span></li>
            <li><b>{ui('坐标', 'Coordinates')}</b><span>{workspace.coordinateFrame} · DiagView2 XYZ → EHL‑2 Y-up: (x, y, z) → (x, z, −y)</span></li>
            <li><b>{ui('本期方法', 'Current method')}</b><span>{ui('复刻 DiagView2 CAMERA 的直线 LOS 与平面/用户假设视锥查看法。', 'Reproduces the DiagView2 CAMERA straight-LOS and plan-view / user-assumed FOV-cone viewing method.')}</span></li>
            <li><b>{ui('未激活', 'Inactive')}</b><span>{ui('PPT 未提供 ARRAY 或 LASER 的通道几何，因此本期不生成阵列或激光路径。', 'The PPT provides no ARRAY or LASER channel geometry, so this release does not generate array or laser paths.')}</span></li>
            <li><b>{ui('遮挡边界', 'Occlusion boundary')}</b><span>{ui('CAD depth 仅使用 WebGL 深度缓冲；不是 Trimesh 首交、BVH 射线求交或权威 CAD 通光校核。', 'CAD depth uses only the WebGL depth buffer; it is not a Trimesh first hit, BVH ray intersection or authoritative CAD clear-path check.')}</span></li>
            <li><b>{ui('已知量', 'Known')}</b><span>{ui('五个方案的平面方位、±50° 来源标记、部分光谱/套数与 PPT 页码。', 'Plan-view azimuth, ±50° source mark, partial spectral/set metadata and PPT slide references for five scenarios.')}</span></li>
            <li><b>{ui('缺失量', 'Missing')}</b><span>{ui('VS4 立面；端口实测位姿；窗口/反射镜/光阑；垂直视场；标定；误差预算；权威遮挡。', 'VS4 elevation; surveyed port poses; windows, mirrors and apertures; vertical FOV; calibration; error budget; authoritative occlusion.')}</span></li>
          </ul>
          <p className={styles.contractStatement}>{isEnglish ? workspace.statement : '该合同仅将五个 EHL‑2 可见光/红外方案视为源自 DiagView2 PPT 的平面设计参考；它不是实装测量、标定光学模型、三维视场验证或工程遮挡权威。'}</p>
        </section>

        <Ehl2DiagnosticSourceTable isEnglish={isEnglish} />
      </section>
    </aside>
  </div>;
}

export function Ehl2DiagnosticNoScriptSummary() {
  const { locale } = useI18n();
  const isEnglish = locale === 'en';
  return <section className={styles.noScriptSummary} aria-labelledby="ehl2-diag-noscript-title">
    <h2 id="ehl2-diag-noscript-title">{isEnglish ? 'EHL-2 diagnostic viewing-scheme reference' : 'EHL‑2 诊断视线方案参考'}</h2>
    <p>{isEnglish
      ? 'JavaScript is unavailable. The interactive 3D overlay remains off; this server-rendered table preserves the five PPT-derived scenarios and their evidence boundary.'
      : '当前未启用 JavaScript，交互式三维叠加保持关闭；以下服务端表格保留五个 PPT 来源方案及其证据边界。'}</p>
    <Ehl2DiagnosticSourceTable isEnglish={isEnglish} />
  </section>;
}

function Ehl2DiagnosticSourceTable({ isEnglish }: { isEnglish: boolean }) {
  const ui = (zh: string, en: string) => isEnglish ? en : zh;
  return <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={ui('诊断方案来源表', 'Diagnostic-scenario source table')}>
    <table>
      <caption>{ui('五方案静态来源表（SSR / 无 JavaScript 仍可读取）', 'Static five-scenario source table (readable with SSR / no JavaScript)')}</caption>
      <thead><tr><th>{ui('方案', 'Scenario')}</th><th>{ui('方位', 'Azimuth')}</th><th>{ui('PPT 视场标记', 'PPT FOV mark')}</th><th>{ui('谱段', 'Bands')}</th><th>{ui('设备套数', 'Sets')}</th><th>{ui('复合基线', 'Composite')}</th><th>{ui('来源 / 完整度', 'Source / completeness')}</th></tr></thead>
      <tbody>{EHL2_DIAGNOSTIC_SCENARIOS.map((scenario) => <tr key={scenario.id}>
        <th scope="row">{scenario.diagnosticId}</th>
        <td>{scenario.azimuthDeg}°</td>
        <td>{scenario.sourceFovLabel}°</td>
        <td>{bandLabel(scenario, isEnglish)}</td>
        <td>{scenario.equipmentSets ?? '—'}</td>
        <td>{scenario.includedInCompositeAssessment ? ui('是', 'Yes') : ui('否', 'No')}</td>
        <td>{ui(`PPT 第 ${scenario.sourceSlides.join('、')} 页`, `PPT slides ${scenario.sourceSlides.join(', ')}`)} · {scenario.elevationReferenceAvailable ? ui('平面/立面参考', 'plan/elevation reference') : ui('仅平面，立面缺失', 'plan only; elevation missing')}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ScenarioCard({
  scenario,
  isEnglish,
  active,
  inspected,
  compared,
  onInspect,
  onCompare,
}: {
  scenario: Ehl2DiagnosticScenario;
  isEnglish: boolean;
  active: boolean;
  inspected: boolean;
  compared: boolean;
  onInspect: () => void;
  onCompare: () => void;
}) {
  const ui = (zh: string, en: string) => isEnglish ? en : zh;
  return <article
    className={`${styles.scenarioCard}${active ? ` ${styles.activeScenario}` : ''}${!scenario.elevationReferenceAvailable ? ` ${styles.incompleteScenario}` : ''}`}
    style={{ '--scenario-color': scenario.colorCss } as React.CSSProperties}
  >
    <header><span aria-hidden="true" /><b>{scenario.diagnosticId}</b><small>{scenario.azimuthDeg}°</small></header>
    <dl>
      <div><dt>FOV</dt><dd>{scenario.sourceFovLabel}° · {ui('PPT 平面', 'PPT plan view')}</dd></div>
      <div><dt>{ui('谱段', 'Bands')}</dt><dd>{bandLabel(scenario, isEnglish)}</dd></div>
      <div><dt>{ui('套数', 'Sets')}</dt><dd>{scenario.equipmentSets ?? ui('未给出', 'Not stated')}</dd></div>
    </dl>
    <p>{scenario.elevationReferenceAvailable
      ? ui(`PPT 第 ${scenario.sourceSlides.join('、')} 页`, `PPT slides ${scenario.sourceSlides.join(', ')}`)
      : ui('VS4 仅有平面来源；立面与谱段/套数不完整。', 'VS4 has a plan-view source only; elevation, bands and set count are incomplete.')}</p>
    <div>
      <button type="button" aria-label={ui(`校核 ${scenario.diagnosticId} ${scenario.azimuthDeg}°`, `Inspect ${scenario.diagnosticId} at ${scenario.azimuthDeg}°`)} aria-pressed={inspected} onClick={onInspect}>{ui('单项校核', 'Inspect')}</button>
      <label><input type="checkbox" aria-label={ui(`将 ${scenario.diagnosticId} ${scenario.azimuthDeg}° 加入对比`, `Compare ${scenario.diagnosticId} at ${scenario.azimuthDeg}°`)} checked={compared} onChange={onCompare} />{ui('加入对比', 'Compare')}</label>
    </div>
  </article>;
}

function bandLabel(scenario: Ehl2DiagnosticScenario, isEnglish: boolean) {
  if (scenario.spectralBands.length === 0) return isEnglish ? 'Not stated' : '未给出';
  return scenario.spectralBands.map((band) => band === 'infrared'
    ? (isEnglish ? 'Infrared' : '红外')
    : (isEnglish ? 'Visible' : '可见光')).join(' + ');
}

function ParameterControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return <label className={styles.parameter}>
    <span>{label}</span>
    <output>{Number.isInteger(value) ? value : value.toFixed(1)}{unit}</output>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
  </label>;
}
