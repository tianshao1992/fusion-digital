'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  buildDiagView2PreviewRays,
  createDefaultDiagView2Design,
  resolveDiagView2Pose,
  type DiagView2DiagnosticDesign,
  type DiagView2DiagnosticType,
  type DiagView2Vec3,
} from '../components/device-viewer/ehl2DiagView2Core';
import type { Ehl2DiagnosticOverlayOptions } from '../components/device-viewer/Ehl2DiagnosticThreeOverlay';
import {
  parseExl50uDiagView2PortDataset,
  type Exl50uDiagView2Port,
  type Exl50uDiagView2PortDataset,
} from '../components/device-viewer/exl50uDiagView2Ports';
import { useI18n } from '../i18n';
import type { Exl50uDiagnosticWorkspace } from './deviceCatalog';
import styles from './Exl50uDiagnosticPanel.module.css';

type Props = {
  active: boolean;
  contract: Exl50uDiagnosticWorkspace;
  onOverlayChange: (options?: Ehl2DiagnosticOverlayOptions) => void;
};

const SECTION_ORDER = ['U1', 'U2', 'S1', 'S2', 'S3', 'L1', 'L2'] as const;
const TYPE_COLOURS: Readonly<Record<DiagView2DiagnosticType, string>> = {
  CAMERA: '#80e4bf',
  ARRAY: '#75b9ff',
  LASER: '#ff765f',
};

function placementFor(port: Exl50uDiagView2Port): DiagView2DiagnosticDesign['placement'] {
  return {
    mode: 'explicit',
    positionM: port.diagViewMetres,
    normal: port.diagViewNormal,
  };
}

function finite(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateTuple(tuple: DiagView2Vec3, index: number, value: number): DiagView2Vec3 {
  return tuple.map((item, itemIndex) => itemIndex === index ? value : item) as [number, number, number];
}

function NumberField({
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
  unit?: string;
  onChange: (value: number) => void;
}) {
  return <label className={styles.numberField}>
    <span>{label}</span>
    <span className={styles.numberInput}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Math.min(max, Math.max(min, finite(event.currentTarget.value, value))))}
      />
      {unit && <small>{unit}</small>}
    </span>
  </label>;
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className={styles.controlGroup}><legend>{title}</legend>{children}</fieldset>;
}

function typeLabel(type: DiagView2DiagnosticType, english: boolean) {
  if (english) return type === 'CAMERA' ? 'Camera' : type === 'ARRAY' ? 'Array' : 'Laser';
  return type === 'CAMERA' ? '相机' : type === 'ARRAY' ? '阵列' : '激光';
}

export default function Exl50uDiagnosticPanel({ active, contract, onOverlayChange }: Props) {
  const { locale } = useI18n();
  const english = locale === 'en';
  const ui = useCallback((zh: string, en: string) => english ? en : zh, [english]);
  const [dataset, setDataset] = useState<Exl50uDiagView2PortDataset | null>(null);
  const [datasetError, setDatasetError] = useState('');
  const [selectedPortId, setSelectedPortId] = useState('S1@0');
  const [design, setDesign] = useState<DiagView2DiagnosticDesign>(() => createDefaultDiagView2Design('CAMERA', 'EXL50U-CAMERA-01'));
  const [showRays, setShowRays] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showAllPorts, setShowAllPorts] = useState(false);
  const [depthMode, setDepthMode] = useState<'physical' | 'xray'>('physical');
  const [opacity, setOpacity] = useState(.78);
  const [colour, setColour] = useState(TYPE_COLOURS.CAMERA);

  useEffect(() => {
    const controller = new AbortController();
    fetch(contract.portDatasetEndpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseExl50uDiagView2PortDataset(await response.json());
      })
      .then((next) => {
        const preferred = next.records.find((record) => record.id === 'S1@0') ?? next.records[0];
        setDataset(next);
        setSelectedPortId(preferred.id);
        setDesign((current) => ({ ...current, placement: placementFor(preferred) }));
        setDatasetError('');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDatasetError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [contract.portDatasetEndpoint]);

  const selectedPort = useMemo(
    () => dataset?.records.find((record) => record.id === selectedPortId) ?? null,
    [dataset, selectedPortId],
  );
  const selectedSection = selectedPort?.section ?? 'S1';
  const sectionRecords = useMemo(
    () => dataset?.records.filter((record) => record.section === selectedSection) ?? [],
    [dataset, selectedSection],
  );

  const choosePort = useCallback((port: Exl50uDiagView2Port) => {
    setSelectedPortId(port.id);
    setDesign((current) => ({ ...current, placement: placementFor(port) }));
  }, []);

  const changeType = (nextType: DiagView2DiagnosticType) => {
    const defaults = createDefaultDiagView2Design(nextType, `EXL50U-${nextType}-01`);
    setDesign((current) => ({
      ...defaults,
      placement: current.placement,
      localOffsetMm: current.localOffsetMm,
      worldOffsetMm: current.worldOffsetMm,
      rotationDeg: current.rotationDeg,
    }));
    setColour(TYPE_COLOURS[nextType]);
  };

  const geometry = useMemo(() => {
    try {
      return { rays: buildDiagView2PreviewRays(design), pose: resolveDiagView2Pose(design), error: '' };
    } catch (error) {
      return {
        rays: [],
        pose: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [design]);

  const overlay = useMemo<Ehl2DiagnosticOverlayOptions>(() => ({
    kind: 'diagview2-workbench',
    labelLocale: english ? 'en' : 'zh-CN',
    designId: design.id,
    designName: design.nameSuffix,
    diagnosticType: design.diagnosticType,
    previewRays: geometry.rays,
    rayResults: [],
    depthMode,
    showRays: showRays && geometry.error === '',
    showLabels,
    showHitMarkers: false,
    laserDiameterMm: design.laser?.diameterMm ?? 0,
    opacity,
    color: Number.parseInt(colour.slice(1), 16),
    colorCss: colour,
    portMarkers: {
      pointsWebMetres: dataset?.records.map((record) => ({
        id: record.id,
        positionWebMetres: record.webMetres,
        normalWeb: record.webNormal,
        label: record.id,
      })) ?? [],
      opacity: .82,
      visible: Boolean(dataset),
      selectedId: selectedPortId,
      showSelectedLabel: showLabels,
      ...(showAllPorts ? {} : {
        pointsWebMetres: selectedPort ? [{
          id: selectedPort.id,
          positionWebMetres: selectedPort.webMetres,
          normalWeb: selectedPort.webNormal,
          label: selectedPort.id,
        }] : [],
      }),
    },
  }), [colour, dataset, depthMode, design, english, geometry.error, geometry.rays, opacity, selectedPort, selectedPortId, showAllPorts, showLabels, showRays]);

  useEffect(() => {
    onOverlayChange(active ? overlay : undefined);
  }, [active, onOverlayChange, overlay]);
  useEffect(() => () => onOverlayChange(undefined), [onOverlayChange]);

  const updateDesign = (update: (current: DiagView2DiagnosticDesign) => DiagView2DiagnosticDesign) => setDesign(update);
  const reset = () => {
    const preferred = dataset?.records.find((record) => record.id === 'S1@0') ?? dataset?.records[0];
    const next = createDefaultDiagView2Design('CAMERA', 'EXL50U-CAMERA-01');
    setDesign(preferred ? { ...next, placement: placementFor(preferred) } : next);
    if (preferred) setSelectedPortId(preferred.id);
    setShowRays(true);
    setShowLabels(true);
    setShowAllPorts(false);
    setDepthMode('physical');
    setOpacity(.78);
    setColour(TYPE_COLOURS.CAMERA);
  };

  return <div className={styles.root} data-active={active}>
    <header className={styles.header}>
      <div><p>DIAGVIEW2 / EXL-50U</p><h2>{ui('诊断可视化', 'Diagnostic visualization')}</h2></div>
      <span>{dataset ? `${dataset.recordCount} PORTS` : 'DATA CHECK'}</span>
    </header>

    <section className={styles.boundary} role="note">
      <b>{ui('历史设计表 · 审阅修正', 'HISTORICAL DESIGN TABLE · REVIEWED CORRECTION')}</b>
      <span>{ui('按源表米制数值恢复 84 个端口，并修复 S2 的 5 个错误三角公式；仅用于公开简化 CAD 上的虚拟视场预览。', 'Restores 84 ports from the metre-scale source values and repairs five incorrect S2 trigonometric formulae. For virtual FOV preview on the public simplified CAD only.')}</span>
    </section>

    {(datasetError || geometry.error) && <p className={styles.error} role="alert">{datasetError || geometry.error}</p>}

    <ControlGroup title={ui('01 · 端口位姿', '01 · Port pose')}>
      <div className={styles.selectGrid}>
        <label><span>{ui('法兰分区', 'Section')}</span><select value={selectedSection} disabled={!dataset} onChange={(event) => {
          const next = dataset?.records.find((record) => record.section === event.currentTarget.value);
          if (next) choosePort(next);
        }}>{SECTION_ORDER.map((section) => <option key={section} value={section}>{section}</option>)}</select></label>
        <label><span>{ui('方位角', 'Azimuth')}</span><select value={selectedPort?.id ?? ''} disabled={!selectedPort} onChange={(event) => {
          const next = dataset?.records.find((record) => record.id === event.currentTarget.value);
          if (next) choosePort(next);
        }}>{sectionRecords.map((record) => <option key={record.id} value={record.id}>{record.azimuthDeg}°</option>)}</select></label>
      </div>
      {selectedPort && <dl className={styles.poseReadout}>
        <div><dt>{ui('光心 / m', 'Centre / m')}</dt><dd>{selectedPort.diagViewMetres.map((value) => value.toFixed(4)).join(' / ')}</dd></div>
        <div><dt>{ui('法线 n', 'Normal n')}</dt><dd>{selectedPort.diagViewNormal.map((value) => value.toFixed(4)).join(' / ')}</dd></div>
      </dl>}
      <div className={styles.tripleGrid}>{(['dR', 'dY', 'dZ'] as const).map((label, index) => <NumberField key={label} label={label} value={design.localOffsetMm[index]} min={-500} max={500} step={1} unit="mm" onChange={(value) => updateDesign((current) => ({ ...current, localOffsetMm: updateTuple(current.localOffsetMm, index, value) }))} />)}</div>
      <div className={styles.tripleGrid}>{([ui('俯仰', 'Pitch'), ui('偏航', 'Yaw'), ui('滚转', 'Roll')] as const).map((label, index) => <NumberField key={label} label={label} value={design.rotationDeg[index]} min={-180} max={180} step={1} unit="°" onChange={(value) => updateDesign((current) => ({ ...current, rotationDeg: updateTuple(current.rotationDeg, index, value) }))} />)}</div>
    </ControlGroup>

    <ControlGroup title={ui('02 · 诊断几何', '02 · Diagnostic geometry')}>
      <div className={styles.typeTabs} role="radiogroup" aria-label={ui('诊断类型', 'Diagnostic type')}>{(['CAMERA', 'ARRAY', 'LASER'] as const).map((type) => <button key={type} type="button" role="radio" aria-checked={design.diagnosticType === type} className={design.diagnosticType === type ? styles.activeType : ''} onClick={() => changeType(type)}>{typeLabel(type, english)}</button>)}</div>
      {design.camera && <div className={styles.parameterGrid}>
        <NumberField label="H min" value={design.camera.hStartDeg} min={-89} max={89} step={1} unit="°" onChange={(value) => updateDesign((current) => ({ ...current, camera: current.camera && { ...current.camera, hStartDeg: value } }))} />
        <NumberField label="H max" value={design.camera.hEndDeg} min={-89} max={89} step={1} unit="°" onChange={(value) => updateDesign((current) => ({ ...current, camera: current.camera && { ...current.camera, hEndDeg: value } }))} />
        <NumberField label="V min" value={design.camera.vStartDeg} min={-89} max={89} step={1} unit="°" onChange={(value) => updateDesign((current) => ({ ...current, camera: current.camera && { ...current.camera, vStartDeg: value } }))} />
        <NumberField label="V max" value={design.camera.vEndDeg} min={-89} max={89} step={1} unit="°" onChange={(value) => updateDesign((current) => ({ ...current, camera: current.camera && { ...current.camera, vEndDeg: value } }))} />
        <NumberField label={ui('长度', 'Length')} value={design.camera.lengthM} min={.1} max={20} step={.1} unit="m" onChange={(value) => updateDesign((current) => ({ ...current, camera: current.camera && { ...current.camera, lengthM: value } }))} />
      </div>}
      {design.array && <div className={styles.parameterGrid}>
        <NumberField label="V min" value={design.array.vStartDeg} min={-89} max={89} step={1} unit="°" onChange={(value) => updateDesign((current) => ({ ...current, array: current.array && { ...current.array, vStartDeg: value } }))} />
        <NumberField label="V max" value={design.array.vEndDeg} min={-89} max={89} step={1} unit="°" onChange={(value) => updateDesign((current) => ({ ...current, array: current.array && { ...current.array, vEndDeg: value } }))} />
        <NumberField label={ui('通道', 'Channels')} value={design.array.rayCount} min={2} max={201} step={1} onChange={(value) => updateDesign((current) => ({ ...current, array: current.array && { ...current.array, rayCount: Math.round(value) } }))} />
        <NumberField label={ui('长度', 'Length')} value={design.array.lengthM} min={.1} max={20} step={.1} unit="m" onChange={(value) => updateDesign((current) => ({ ...current, array: current.array && { ...current.array, lengthM: value } }))} />
      </div>}
      {design.laser && <div className={styles.parameterGrid}>
        <NumberField label={ui('光束直径', 'Beam diameter')} value={design.laser.diameterMm} min={1} max={500} step={1} unit="mm" onChange={(value) => updateDesign((current) => ({ ...current, laser: current.laser && { ...current.laser, diameterMm: value } }))} />
        <NumberField label={ui('长度', 'Length')} value={design.laser.lengthM} min={.1} max={20} step={.1} unit="m" onChange={(value) => updateDesign((current) => ({ ...current, laser: current.laser && { ...current.laser, lengthM: value } }))} />
      </div>}
      <p className={styles.metric}><b>{geometry.rays.length}</b><span>{ui('预览射线', 'preview rays')}</span>{geometry.pose && <><b>{design.diagnosticType}</b><span>{ui('源几何逻辑', 'source geometry logic')}</span></>}</p>
    </ControlGroup>

    <ControlGroup title={ui('03 · 三维显示', '03 · 3D display')}>
      <div className={styles.checkGrid}>
        <label><input type="checkbox" checked={showRays} onChange={(event) => setShowRays(event.currentTarget.checked)} />{ui('显示光路', 'Show paths')}</label>
        <label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.currentTarget.checked)} />{ui('名称标签', 'Labels')}</label>
        <label><input type="checkbox" checked={showAllPorts} onChange={(event) => setShowAllPorts(event.currentTarget.checked)} />{ui('全部 84 端口', 'All 84 ports')}</label>
        <label><input type="checkbox" checked={depthMode === 'xray'} onChange={(event) => setDepthMode(event.currentTarget.checked ? 'xray' : 'physical')} />{ui('穿透显示', 'X-ray display')}</label>
      </div>
      <div className={styles.displayGrid}>
        <label className={styles.colourField}><span>{ui('光路颜色', 'Path colour')}</span><input type="color" value={colour} onChange={(event) => setColour(event.currentTarget.value)} /></label>
        <NumberField label={ui('不透明度', 'Opacity')} value={opacity} min={.1} max={1} step={.05} unit="α" onChange={setOpacity} />
      </div>
      <button className={styles.resetButton} type="button" onClick={reset}>{ui('恢复 EXL‑50U 诊断默认值', 'Restore EXL-50U diagnostic defaults')}</button>
    </ControlGroup>

    <section className={styles.provenance}>
      <h3>{ui('来源与边界', 'Source and boundary')}</h3>
      <dl>
        <div><dt>{ui('代码', 'Code')}</dt><dd>origin/digView2 @ {contract.sourceRevision.slice(0, 8)}</dd></div>
        <div><dt>{ui('数据', 'Data')}</dt><dd>{ui('84 条历史设计记录；S2 公式已审阅修复', '84 historical design rows; reviewed S2 formula repair')}</dd></div>
        <div><dt>{ui('EFIT', 'EFIT')}</dt><dd>{ui('继续使用本站独立 EXL‑50U 数据，不复用源仓未验证的全局 G-file', 'Uses the site\'s independent EXL-50U dataset, not the source repo\'s unverified global G-file')}</dd></div>
      </dl>
      <p>{english ? contract.statement : '这是公开简化 CAD 上的虚拟诊断视场，不是实装测量、标定光学、工程净孔、制造或安全权威。'}</p>
    </section>
  </div>;
}
