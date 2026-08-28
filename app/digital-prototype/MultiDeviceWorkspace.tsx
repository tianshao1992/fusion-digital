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
import { trackAnalyticsContent } from '@/app/analytics/client';
import TokamakCadViewer from '../components/TokamakCadViewer';
import type { Ehl2DiagnosticOverlayOptions } from '../components/device-viewer/Ehl2DiagnosticThreeOverlay';
import { createEfitHybridDataSource, createEfitStore, EfitPanel, type EfitStore } from '../components/efit';
import { useI18n } from '../i18n';
import type { DeviceCatalog, DeviceCatalogEntry, DevicePhysicsOverlay } from './deviceCatalog';
import Ehl2DiagnosticExperience, { Ehl2DiagnosticNoScriptSummary } from './Ehl2DiagnosticExperience';
import Exl50uDiagnosticPanel from './Exl50uDiagnosticPanel';
import TurntableDeviceViewer from './TurntableDeviceViewer';

function MetadataViewer({ device }: { device: DeviceCatalogEntry }) {
  const { content, t } = useI18n();
  return <div className={`controlledDevicePlaceholder ${device.tone}`}>
    <div className="deviceLockGlyph" aria-hidden="true"><i /><i /><i /></div>
    <p>INFORMATION MODE</p>
    <h3>{content(device.title)}</h3>
    <span>{t('workspace.metadataOnly')}</span>
    <div className="controlledStats">{device.facts.slice(0, 2).map((fact) => <b key={fact}>{content(fact)}</b>)}</div>
    <a href="/platform#contracts">{t('workspace.integration')}</a>
  </div>;
}

function DeviceViewer({
  device,
  efitOverlay,
  efitStore,
  efitActive = true,
  diagnosticOverlayOptions,
}: {
  device: DeviceCatalogEntry;
  efitOverlay?: DevicePhysicsOverlay;
  efitStore: EfitStore | null;
  efitActive?: boolean;
  diagnosticOverlayOptions?: Ehl2DiagnosticOverlayOptions;
}) {
  const [showEfitSection, setShowEfitSection] = useState(true);
  const [showEfitSurface, setShowEfitSurface] = useState(true);
  const [showEfitAxis, setShowEfitAxis] = useState(true);
  const [efitMode, setEfitMode] = useState<'physical' | 'xray'>('xray');
  const defaultCoreSection = Boolean(efitOverlay)
    || device.id === 'iter-educational-model'
    || device.id === 'ehl-2-preliminary';

  if (device.viewer.mode === 'real-3d' && device.viewer.manifestEndpoint) return <TokamakCadViewer
    manifestUrl={device.viewer.manifestEndpoint}
    viewerId={device.id}
    sectionId={`${device.id}-workspace`}
    workspace
    showDownloadActions={false}
    showFootnotes={false}
    securityNotice={device.statement}
    appearancePreset={device.id === 'exl-50u-2026-upgrade'
      || device.id === 'iter-educational-model'
      || device.id === 'ehl-2-preliminary'
      ? 'industrial-silver-v1'
      : 'semantic'}
    defaultClipping={defaultCoreSection}
    defaultClipAxis={defaultCoreSection ? 'z' : 'x'}
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
      showSection: efitActive && showEfitSection,
      showSurface: efitActive && showEfitSurface,
      showMagneticAxis: efitActive && showEfitAxis,
    } : undefined}
    efitControls={efitOverlay && efitActive ? {
      mode: efitMode,
      showSection: showEfitSection,
      showSurface: showEfitSurface,
      showMagneticAxis: showEfitAxis,
      onModeChange: setEfitMode,
      onShowSectionChange: setShowEfitSection,
      onShowSurfaceChange: setShowEfitSurface,
      onShowMagneticAxisChange: setShowEfitAxis,
    } : undefined}
    diagnosticOverlayEnabled={device.diagnosticWorkspace?.kind === 'exl50u-diagview2'}
    diagnosticOverlayOptions={diagnosticOverlayOptions}
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
  const { t } = useI18n();
  const layoutRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [physicsShare, setPhysicsShare] = useState(DEFAULT_PHYSICS_SHARE);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'efit' | 'diagnostic'>('efit');
  const [diagnosticOverlayOptions, setDiagnosticOverlayOptions] = useState<Ehl2DiagnosticOverlayOptions | undefined>();
  const exlDiagnosticContract = device.diagnosticWorkspace?.kind === 'exl50u-diagview2'
    ? device.diagnosticWorkspace
    : null;

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

  const activateAnalysisMode = (nextMode: 'efit' | 'diagnostic') => {
    if (nextMode === analysisMode) return;
    if (nextMode === 'diagnostic') efitStore.actions.pause();
    setAnalysisMode(nextMode);
  };

  const handleAnalysisTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!exlDiagnosticContract) return;
    let next: 'efit' | 'diagnostic' | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home') next = 'efit';
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'End') next = 'diagnostic';
    if (!next) return;
    event.preventDefault();
    activateAnalysisMode(next);
    document.getElementById(`${device.id}-analysis-tab-${next}`)?.focus();
  };

  return <div
    className={`deviceExperienceLayout${dragging ? ' isResizing' : ''}`}
    data-layout="split-resizable"
    ref={layoutRef}
    style={layoutStyle}
  >
    <div className="deviceViewport hasPhysicsOverlay">
      <DeviceViewer
        device={device}
        efitOverlay={efitOverlay}
        efitStore={efitStore}
        efitActive={analysisMode === 'efit'}
        diagnosticOverlayOptions={analysisMode === 'diagnostic' ? diagnosticOverlayOptions : undefined}
      />
    </div>
    <div
      className="devicePaneSeparator"
      role="separator"
      aria-label={t('workspace.resize')}
      aria-orientation="vertical"
      aria-valuemin={Math.round(MIN_PHYSICS_SHARE * 100)}
      aria-valuemax={Math.round(MAX_PHYSICS_SHARE * 100)}
      aria-valuenow={Math.round(physicsPercent)}
      aria-valuetext={t('workspace.resizeValue', { percent: Math.round(physicsPercent) })}
      tabIndex={0}
      title={t('workspace.resizeHelp')}
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
    <DeviceAnalysisPanel
      device={device}
      overlay={efitOverlay}
      store={efitStore}
      mode={analysisMode}
      diagnosticContract={exlDiagnosticContract}
      onModeChange={activateAnalysisMode}
      onTabKeyDown={handleAnalysisTabKeyDown}
      onDiagnosticOverlayChange={setDiagnosticOverlayOptions}
    />
  </div>;
}

function DeviceExperience({ device }: { device: DeviceCatalogEntry }) {
  if (device.diagnosticWorkspace?.kind === 'ehl2-diagview2') {
    return <Ehl2DiagnosticExperience device={device} />;
  }
  return <StandardDeviceExperience device={device} />;
}

function StandardDeviceExperience({ device }: { device: DeviceCatalogEntry }) {
  const efitOverlay = device.physicsOverlays.find((overlay) => overlay.kind === 'axisymmetric-equilibrium');
  const endpoint = efitOverlay?.manifestEndpoint ?? null;
  const efitStore = useMemo(() => endpoint
    ? createEfitStore(createEfitHybridDataSource({ indexUrl: endpoint }))
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

export default function MultiDeviceWorkspace({ catalog }: { catalog: DeviceCatalog }) {
  const { content, t } = useI18n();
  const [selectedId, setSelectedId] = useState(catalog.devices[0].id);
  const current = catalog.devices.find((device) => device.id === selectedId) ?? catalog.devices[0];

  useEffect(() => {
    trackAnalyticsContent('prototype-device', selectedId);
  }, [selectedId]);

  const handleDeviceTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % catalog.devices.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + catalog.devices.length) % catalog.devices.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = catalog.devices.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = catalog.devices[nextIndex];
    setSelectedId(next.id);
    document.getElementById(`device-tab-${next.id}`)?.focus();
  };

  return <section className="multiDeviceSection" id="prototype-workspace" aria-labelledby="multi-device-title">
    <div className="multiDeviceIntro">
      <h2 id="multi-device-title">{t('workspace.title')}</h2>
    </div>

    <div className="deviceSelector" role="tablist" aria-label={t('workspace.deviceTabs')}>
      {catalog.devices.map((device, index) => {
        const selected = current.id === device.id;
        const accessibleSummary = `${content(device.title)} · ${content(device.state)} · ${content(device.deviceOverview)} · ${t('workspace.fileSummary')}: ${content(device.fileSummary)}`;
        return <button
          key={device.id}
          id={`device-tab-${device.id}`}
          type="button"
          role="tab"
          tabIndex={selected ? 0 : -1}
          aria-label={accessibleSummary}
          aria-selected={selected}
          aria-controls={`device-panel-${device.id}`}
          className={`${selected ? 'active ' : ''}${device.tone}`}
          onClick={() => setSelectedId(device.id)}
          onKeyDown={(event) => handleDeviceTabKeyDown(event, index)}
        >
          <span className="deviceCardHead"><small>{t('workspace.deviceOverview')}</small><span className="deviceCardIndex">{device.index}</span></span>
          <strong>{content(device.title)}</strong>
          <em>{content(device.state)}</em>
          <span className="deviceCardIntro">{content(device.deviceOverview)}</span>
          <span className="deviceCardAssets"><b>{t('workspace.fileSummary')}</b><span>{content(device.fileSummary)}</span></span>
        </button>;
      })}
    </div>

    {catalog.devices.map((device) => {
      const selected = current.id === device.id;
      return <div
        key={device.id}
        className="deviceStage"
        id={`device-panel-${device.id}`}
        role="tabpanel"
        aria-labelledby={`device-tab-${device.id}`}
        tabIndex={0}
        hidden={!selected}
      >
        {selected && <DeviceExperience key={device.id} device={device} />}
      </div>;
    })}
    <noscript><Ehl2DiagnosticNoScriptSummary /></noscript>

  </section>;
}

function DeviceAnalysisPanel({
  device,
  overlay,
  store,
  mode,
  diagnosticContract,
  onModeChange,
  onTabKeyDown,
  onDiagnosticOverlayChange,
}: {
  device: DeviceCatalogEntry;
  overlay: DeviceCatalogEntry['physicsOverlays'][number];
  store: EfitStore;
  mode: 'efit' | 'diagnostic';
  diagnosticContract: Extract<NonNullable<DeviceCatalogEntry['diagnosticWorkspace']>, { kind: 'exl50u-diagview2' }> | null;
  onModeChange: (mode: 'efit' | 'diagnostic') => void;
  onTabKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onDiagnosticOverlayChange: (options?: Ehl2DiagnosticOverlayOptions) => void;
}) {
  const { content, locale, t } = useI18n();
  const english = locale === 'en';
  const efitTabId = `${device.id}-analysis-tab-efit`;
  const diagnosticTabId = `${device.id}-analysis-tab-diagnostic`;
  const efitPanelId = `${device.id}-analysis-panel-efit`;
  const diagnosticPanelId = `${device.id}-analysis-panel-diagnostic`;
  return <aside className="devicePhysicsPanel deviceAnalysisPanel" aria-label={english ? `${content(device.title)} analysis sidebar` : `${content(device.title)} 分析侧栏`}>
    {diagnosticContract && <div className="deviceAnalysisTabs" role="tablist" aria-label={english ? 'EXL-50U analysis mode' : 'EXL‑50U 分析模式'}>
      <button
        id={efitTabId}
        type="button"
        role="tab"
        aria-selected={mode === 'efit'}
        aria-controls={efitPanelId}
        tabIndex={mode === 'efit' ? 0 : -1}
        onKeyDown={onTabKeyDown}
        onClick={() => onModeChange('efit')}
      ><span>01</span>{english ? 'EFIT equilibrium' : 'EFIT 平衡'}</button>
      <button
        id={diagnosticTabId}
        type="button"
        role="tab"
        aria-selected={mode === 'diagnostic'}
        aria-controls={diagnosticPanelId}
        tabIndex={mode === 'diagnostic' ? 0 : -1}
        onKeyDown={onTabKeyDown}
        onClick={() => onModeChange('diagnostic')}
      ><span>02</span>{english ? 'Diagnostic visualization' : '诊断可视化'}</button>
    </div>}
    <div
      id={efitPanelId}
      role={diagnosticContract ? 'tabpanel' : undefined}
      aria-labelledby={diagnosticContract ? efitTabId : undefined}
      hidden={Boolean(diagnosticContract) && mode !== 'efit'}
    >
      <EfitPanel
        store={store}
        preferredShot={overlay.defaultShot}
        preferredTimeMs={overlay.defaultTimeMs}
        title={t('workspace.efitTitle')}
      />
    </div>
    {diagnosticContract && <div
      id={diagnosticPanelId}
      role="tabpanel"
      aria-labelledby={diagnosticTabId}
      hidden={mode !== 'diagnostic'}
      tabIndex={0}
    >
      <Exl50uDiagnosticPanel
        active={mode === 'diagnostic'}
        contract={diagnosticContract}
        onOverlayChange={onDiagnosticOverlayChange}
      />
    </div>}
  </aside>;
}
