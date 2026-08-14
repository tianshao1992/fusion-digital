'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import TokamakCadViewer from '../components/TokamakCadViewer';
import { createEfitBinaryDataSource, createEfitStore, EfitPanel, type EfitStore } from '../components/efit';
import type { DeviceCatalog, DeviceCatalogEntry, DevicePhysicsOverlay } from './deviceCatalog';
import TurntableDeviceViewer from './TurntableDeviceViewer';

function MetadataViewer({ device }: { device: DeviceCatalogEntry }) {
  return <div className={`controlledDevicePlaceholder ${device.tone}`}>
    <div className="deviceLockGlyph" aria-hidden="true"><i /><i /><i /></div>
    <p>{device.eyebrow}</p>
    <h3>{device.title} 不向公网下发三维几何</h3>
    <span>{device.statement}</span>
    <div className="controlledStats">{device.facts.map((fact) => <b key={fact}>{fact}</b>)}</div>
    <a href="#asset-policy">查看资产与发布边界 ↗</a>
  </div>;
}

function DeviceViewer({
  device,
  efitOverlay,
  efitStore,
}: {
  device: DeviceCatalogEntry;
  efitOverlay?: DevicePhysicsOverlay;
  efitStore: EfitStore | null;
}) {
  const [showEfitSection, setShowEfitSection] = useState(true);
  const [showEfitSurface, setShowEfitSurface] = useState(true);
  const [showEfitAxis, setShowEfitAxis] = useState(true);
  const [efitMode, setEfitMode] = useState<'physical' | 'xray'>('xray');

  if (device.viewer.mode === 'real-3d' && device.viewer.manifestEndpoint) return <TokamakCadViewer
    manifestUrl={device.viewer.manifestEndpoint}
    viewerId={device.id}
    sectionId={`${device.id}-workspace`}
    workspace
    showDownloadActions={false}
    securityNotice={device.statement}
    defaultClipping={Boolean(efitOverlay)}
    defaultClipAxis={efitOverlay ? 'z' : 'x'}
    defaultClipOffset={efitOverlay ? 0.08 : 0}
    efitStore={efitStore}
    efitAlignment={efitOverlay ? {
      originWebMetres: [0, 0, 0],
      eRAtPhi0Web: [1, 0, 0],
      ePhiPositiveAtPhi0Web: [0, 0, -1],
      eZWeb: [0, 1, 0],
    } : undefined}
    efitOptions={efitOverlay ? {
      mode: efitMode,
      showSection: showEfitSection,
      showSurface: showEfitSurface,
      showMagneticAxis: showEfitAxis,
    } : undefined}
    efitControls={efitOverlay ? {
      mode: efitMode,
      showSection: showEfitSection,
      showSurface: showEfitSurface,
      showMagneticAxis: showEfitAxis,
      onModeChange: setEfitMode,
      onShowSectionChange: setShowEfitSection,
      onShowSurfaceChange: setShowEfitSurface,
      onShowMagneticAxisChange: setShowEfitAxis,
    } : undefined}
  />;
  if (device.viewer.mode === 'turntable-3d' && device.viewer.turntableManifestEndpoint) return <TurntableDeviceViewer
    title={device.title}
    manifestEndpoint={device.viewer.turntableManifestEndpoint}
  />;
  return <MetadataViewer device={device} />;
}

const WORKBENCH_PREFERENCE_KEY = 'fusion-digital:prototype-efit-width:v1';
const DEFAULT_PHYSICS_SHARE = 0.36;
const MIN_PHYSICS_SHARE = 0.26;
const MAX_PHYSICS_SHARE = 0.5;

function clampPhysicsShare(value: number, containerWidth?: number) {
  const minByContent = containerWidth ? 360 / containerWidth : MIN_PHYSICS_SHARE;
  const maxByContent = containerWidth ? 1 - 560 / containerWidth : MAX_PHYSICS_SHARE;
  const lower = Math.max(MIN_PHYSICS_SHARE, minByContent);
  const upper = Math.min(MAX_PHYSICS_SHARE, maxByContent);
  if (upper < lower) return DEFAULT_PHYSICS_SHARE;
  return Math.min(upper, Math.max(lower, value));
}

function ResizableDeviceExperience({
  device,
  efitOverlay,
  efitStore,
}: {
  device: DeviceCatalogEntry;
  efitOverlay: DevicePhysicsOverlay;
  efitStore: EfitStore;
}) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [physicsShare, setPhysicsShare] = useState(DEFAULT_PHYSICS_SHARE);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const savedPreference = window.localStorage.getItem(WORKBENCH_PREFERENCE_KEY);
        if (savedPreference !== null) {
          const saved = Number(savedPreference);
          if (Number.isFinite(saved)) setPhysicsShare(clampPhysicsShare(saved));
        }
      } catch {
        // A blocked storage area must not prevent the engineering workspace loading.
      }
      setPreferenceLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!preferenceLoaded) return;
    try {
      window.localStorage.setItem(WORKBENCH_PREFERENCE_KEY, physicsShare.toFixed(4));
    } catch {
      // The split ratio is an optional device-local preference only.
    }
  }, [physicsShare, preferenceLoaded]);

  useEffect(() => {
    const element = layoutRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setPhysicsShare((current) => {
        const next = clampPhysicsShare(current, width);
        return Math.abs(next - current) > 0.0001 ? next : current;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const updateFromClientX = (clientX: number) => {
    const bounds = layoutRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    setPhysicsShare(clampPhysicsShare((bounds.right - clientX) / bounds.width, bounds.width));
  };

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSeparatorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.02;
    let next = physicsShare;
    if (event.key === 'ArrowLeft') next += step;
    else if (event.key === 'ArrowRight') next -= step;
    else if (event.key === 'Home') next = MIN_PHYSICS_SHARE;
    else if (event.key === 'End') next = MAX_PHYSICS_SHARE;
    else return;
    event.preventDefault();
    setPhysicsShare(clampPhysicsShare(next, layoutRef.current?.clientWidth));
  };

  const physicsPercent = physicsShare * 100;
  const layoutStyle = {
    '--device-physics-width': `${physicsPercent.toFixed(3)}%`,
  } as CSSProperties;

  return <div
    className={`deviceExperienceLayout${dragging ? ' isResizing' : ''}`}
    data-layout="split-resizable"
    ref={layoutRef}
    style={layoutStyle}
  >
    <div className="deviceViewport hasPhysicsOverlay">
      <DeviceViewer device={device} efitOverlay={efitOverlay} efitStore={efitStore} />
    </div>
    <div
      className="devicePaneSeparator"
      role="separator"
      aria-label="调整三维装置与 EFIT 分析面板的宽度"
      aria-orientation="vertical"
      aria-valuemin={Math.round(MIN_PHYSICS_SHARE * 100)}
      aria-valuemax={Math.round(MAX_PHYSICS_SHARE * 100)}
      aria-valuenow={Math.round(physicsPercent)}
      aria-valuetext={`EFIT 面板占工作区 ${Math.round(physicsPercent)}%`}
      tabIndex={0}
      title="拖动调整宽度；方向键微调；双击恢复默认"
      onDoubleClick={() => setPhysicsShare(DEFAULT_PHYSICS_SHARE)}
      onKeyDown={handleSeparatorKeyDown}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        updateFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (activePointer.current === event.pointerId) updateFromClientX(event.clientX);
      }}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
    ><span aria-hidden="true" /></div>
    <DevicePhysicsPanel device={device} overlay={efitOverlay} store={efitStore} />
  </div>;
}

function DeviceExperience({ device }: { device: DeviceCatalogEntry }) {
  const efitOverlay = device.physicsOverlays.find((overlay) => overlay.kind === 'axisymmetric-equilibrium');
  const endpoint = efitOverlay?.manifestEndpoint ?? null;
  const efitStore = useMemo(() => endpoint
    ? createEfitStore(createEfitBinaryDataSource({ indexUrl: endpoint }))
    : null, [endpoint]);

  useEffect(() => () => efitStore?.destroy(), [efitStore]);

  if (efitOverlay && efitStore) return <ResizableDeviceExperience
    device={device}
    efitOverlay={efitOverlay}
    efitStore={efitStore}
  />;

  return <div className="deviceExperienceLayout isSinglePane" data-layout="single-pane">
    <div className="deviceViewport">
      <DeviceViewer device={device} efitStore={efitStore} />
    </div>
  </div>;
}

function DeviceGovernanceNote({ device }: { device: DeviceCatalogEntry }) {
  if (!device.physicsOverlays.some((overlay) => overlay.kind === 'axisymmetric-equilibrium')) return null;
  return <div className="deviceGovernanceNote" role="note">
    <p><b>科学与安全边界</b>当前交付仅为经授权的浏览器简化派生模型，不可用于制造、尺寸校核、CAE 计算、安全决策或反向工程。</p>
    <p><b>预览交付与替换接口</b>{device.statement} 原始工程 CAD 不由网站交付。</p>
  </div>;
}

export default function MultiDeviceWorkspace({ catalog }: { catalog: DeviceCatalog }) {
  const [selectedId, setSelectedId] = useState(catalog.devices[0].id);
  const [compare, setCompare] = useState(false);
  const current = catalog.devices.find((device) => device.id === selectedId) ?? catalog.devices[0];
  const overlayCandidates = catalog.devices.filter((device) => device.viewer.mode === 'real-3d'
    && device.viewer.overlayEligible
    && device.comparisonFrame !== null);
  // The public workspace intentionally stays single-device until a shared-canvas
  // renderer has passed the same publication policy. The controlled local viewer
  // already provides true multi-device overlays without publishing protected data.
  const overlayReady = false;

  return <section className="multiDeviceSection" id="prototype-workspace" aria-labelledby="multi-device-title">
    <div className="multiDeviceIntro">
      <p>02 / MULTI-DEVICE WORKSPACE</p>
      <div>
        <h2 id="multi-device-title">三套装置，分级交互的数字样机入口。</h2>
        <span>设备选择与展示方式由同一目录驱动；已获公开展示授权的简化派生几何可进入实时三维，受限装置保持纯信息模式。发送到浏览器的几何无法从技术上保证不可保存，原始工程 CAD 始终不由网站交付。</span>
      </div>
      <div className="multiDeviceModes" aria-label="查看模式">
        <button className={!compare ? 'active' : ''} type="button" onClick={() => setCompare(false)} aria-pressed={!compare}>单装置切换</button>
        <button className={compare ? 'active' : ''} type="button" disabled={!overlayReady} title={overlayCandidates.length < 2 ? '需要至少两套获批且坐标系一致的实时三维资产' : '共享画布适配器尚未通过发布策略'} onClick={() => setCompare(true)} aria-pressed={compare}>叠加比较</button>
      </div>
    </div>

    <div className="deviceSelector" role="tablist" aria-label="数字样机装置" style={{ gridTemplateColumns: `repeat(${Math.min(catalog.devices.length, 4)}, minmax(0, 1fr))` }}>
      {catalog.devices.map((device) => <button
        key={device.id}
        type="button"
        role="tab"
        aria-selected={current.id === device.id}
        aria-controls={`device-panel-${device.id}`}
        className={`${current.id === device.id ? 'active ' : ''}${device.tone}`}
        onClick={() => { setSelectedId(device.id); setCompare(false); }}
      >
        <span>{device.index}</span>
        <small>{device.eyebrow}</small>
        <strong>{device.title}</strong>
        <em>{device.state}</em>
      </button>)}
    </div>

    <div className="deviceStage" id={`device-panel-${current.id}`} role="tabpanel">
      <aside className={`deviceAuthority ${current.tone}`}>
        <small>DEVICE AUTHORITY / {current.viewer.mode.toUpperCase()}</small>
        <h3>{current.title}</h3>
        <p>{current.copy}</p>
        <ul>{current.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        <div className="compareGate"><b>OVERLAY GATE</b><span>{overlayReady
          ? '仅获授权、采用实时三维模式且共享同一比较坐标系的装置可以叠加。'
          : '当前没有两套同时获批且坐标一致的实时三维资产；转台帧与纯信息模式不会进入几何叠加。'}</span></div>
      </aside>
      <DeviceExperience device={current} />
    </div>

    <DeviceGovernanceNote device={current} />

    <div className="devicePreviewPolicy" role="note">
      <b>PREVIEW SECURITY POLICY</b>
      <span>{catalog.securityPolicy.notice}</span>
      <small>REQUEST POLICY: CACHE {catalog.securityPolicy.cacheRequestPolicy.toUpperCase()} · REFERRER {catalog.securityPolicy.referrerPolicy.toUpperCase()}</small>
    </div>
  </section>;
}

function DevicePhysicsPanel({
  device,
  overlay,
  store,
}: {
  device: DeviceCatalogEntry;
  overlay: DeviceCatalogEntry['physicsOverlays'][number];
  store: EfitStore;
}) {
  return <aside className="devicePhysicsPanel" aria-label={`${device.title} EFIT 位形与时序`}>
    <EfitPanel store={store} preferredShot={overlay.defaultShot} title="EFIT 位形与放电时序" />
    <div className="devicePhysicsBoundary" role="note">
      <b>AXISYMMETRIC FLUX SURFACE / VISUALIZATION-DERIVED</b>
      <span>{overlay.statement}</span>
      <small>坐标合同 {overlay.coordinateFrame} · 当前为轴对称磁通面重建，不是三维磁力线或 MHD 场。</small>
    </div>
  </aside>;
}
