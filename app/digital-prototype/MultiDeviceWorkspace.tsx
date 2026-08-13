'use client';

import { useState } from 'react';
import TokamakCadViewer from '../components/TokamakCadViewer';

type DeviceId = 'paramak' | 'exl-50u' | 'iter';

const devices = [
  {
    id: 'paramak' as const,
    index: '01',
    title: 'Paramak 通用 Tokamak',
    eyebrow: 'PUBLIC · ONLINE',
    state: '可在线浏览',
    tone: 'online',
    facts: ['MIT 公开许可', '17 个稳定部件', '2.2 MB 浏览器模型'],
    copy: '参数化 360° 主体示意，用于验证装配树、剖切、显隐和后续多装置比较。',
  },
  {
    id: 'exl-50u' as const,
    index: '02',
    title: 'EXL‑50U 2026 升级版',
    eyebrow: 'CONTROLLED · LOCAL',
    state: '受控转换中',
    tone: 'controlled',
    facts: ['1,519 个产品定义', '16,748 个装配实例', '源模型单位：米'],
    copy: '已检测完整主机 AP214 装配；授权与脱敏审批完成前，仅在本地受控工作台加载。',
  },
  {
    id: 'iter' as const,
    index: '03',
    title: 'ITER 教育简化模型',
    eyebrow: 'RESTRICTED · LOCAL ONLY',
    state: '禁止公网加载',
    tone: 'restricted',
    facts: ['18 个部件身份', '17 个本地派生件', '官方条款限制再分发'],
    copy: '可在本地非商业评估工作台浏览；网站只展示库存与许可状态，不请求任何 ITER 几何。',
  },
] as const;

export default function MultiDeviceWorkspace() {
  const [selected, setSelected] = useState<DeviceId>('paramak');
  const [compare, setCompare] = useState(false);
  const current = devices.find((device) => device.id === selected)!;

  return <section className="multiDeviceSection" id="prototype-workspace" aria-labelledby="multi-device-title">
    <div className="multiDeviceIntro">
      <p>02 / MULTI-DEVICE WORKSPACE</p>
      <div>
        <h2 id="multi-device-title">三套装置，同一数字样机契约。</h2>
        <span>切换查看各装置的数据边界；只有已获授权、坐标对齐且具备浏览器派生包的模型，才能进入叠加比较。</span>
      </div>
      <div className="multiDeviceModes" aria-label="查看模式">
        <button className={!compare ? 'active' : ''} type="button" onClick={() => setCompare(false)} aria-pressed={!compare}>单装置切换</button>
        <button className={compare ? 'active' : ''} type="button" onClick={() => setCompare(true)} aria-pressed={compare}>叠加比较</button>
      </div>
    </div>

    <div className="deviceSelector" role="tablist" aria-label="数字样机装置">
      {devices.map((device) => <button
        key={device.id}
        type="button"
        role="tab"
        aria-selected={selected === device.id}
        aria-controls={`device-panel-${device.id}`}
        className={`${selected === device.id ? 'active ' : ''}${device.tone}`}
        onClick={() => setSelected(device.id)}
      >
        <span>{device.index}</span>
        <small>{device.eyebrow}</small>
        <strong>{device.title}</strong>
        <em>{device.state}</em>
      </button>)}
    </div>

    <div className="deviceStage" id={`device-panel-${current.id}`} role="tabpanel">
      <aside className={`deviceAuthority ${current.tone}`}>
        <small>DEVICE AUTHORITY</small>
        <h3>{current.title}</h3>
        <p>{current.copy}</p>
        <ul>{current.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        {compare && <div className="compareGate"><b>OVERLAY GATE</b><span>{selected === 'paramak'
          ? '当前仅 Paramak 具备公开在线资产；第二套获批模型就绪后，工作台才会开放在线叠加。'
          : '此装置没有公网交付权限，叠加请求已在资产层拒绝。'}</span></div>}
      </aside>
      <div className="deviceViewport">
        {selected === 'paramak' ? <TokamakCadViewer
          manifestUrl="/models/paramak-full-device/model-manifest.json"
          viewerId="paramak-full-device"
          sectionId="paramak-online-workspace"
          workspace
        /> : <div className={`controlledDevicePlaceholder ${current.tone}`}>
          <div className="deviceLockGlyph" aria-hidden="true"><i /><i /><i /></div>
          <p>{current.eyebrow}</p>
          <h3>{selected === 'exl-50u' ? 'EXL‑50U 工程几何保留在本地受控区' : 'ITER 几何不会由公网网站请求'}</h3>
          <span>{selected === 'exl-50u'
            ? '已完成源文件审计与整机转换可行性验证。下一步是保留装配树、按系统分块、生成 LOD，并在取得公开展示授权后发布脱敏派生包。'
            : '本地工作台已支持分部件流式加载；受 ITER 使用条款约束，其原始及派生模型不进入 Git、public 或部署包。'}</span>
          <div className="controlledStats">
            {current.facts.map((fact) => <b key={fact}>{fact}</b>)}
          </div>
          <a href="#asset-policy">查看资产与发布边界 ↗</a>
        </div>}
      </div>
    </div>
  </section>;
}
