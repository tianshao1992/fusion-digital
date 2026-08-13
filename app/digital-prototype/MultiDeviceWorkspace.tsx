'use client';

import { useState } from 'react';
import TokamakCadViewer from '../components/TokamakCadViewer';
import type { DeviceCatalog, DeviceCatalogEntry } from './deviceCatalog';
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

function DeviceViewer({ device }: { device: DeviceCatalogEntry }) {
  if (device.viewer.mode === 'real-3d' && device.viewer.manifestEndpoint) return <TokamakCadViewer
    manifestUrl={device.viewer.manifestEndpoint}
    viewerId={device.id}
    sectionId={`${device.id}-workspace`}
    workspace
    showDownloadActions={false}
    securityNotice={device.statement}
  />;
  if (device.viewer.mode === 'turntable-3d' && device.viewer.turntableManifestEndpoint) return <TurntableDeviceViewer
    title={device.title}
    manifestEndpoint={device.viewer.turntableManifestEndpoint}
  />;
  return <MetadataViewer device={device} />;
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
      <div className="deviceViewport"><DeviceViewer device={current} /></div>
    </div>

    <div className="devicePreviewPolicy" role="note">
      <b>PREVIEW SECURITY POLICY</b>
      <span>{catalog.securityPolicy.notice}</span>
      <small>REQUEST POLICY: CACHE {catalog.securityPolicy.cacheRequestPolicy.toUpperCase()} · REFERRER {catalog.securityPolicy.referrerPolicy.toUpperCase()}</small>
    </div>
  </section>;
}
