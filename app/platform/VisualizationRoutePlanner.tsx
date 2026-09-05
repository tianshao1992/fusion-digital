'use client';

import { useMemo, useState } from 'react';
import type { VisualizationArtifact } from '../visualization/contract';
import {
  routeVisualizationArtifact,
  type VisualizationClientProfile,
  type VisualizationIntent,
} from '../visualization/routing';
import './visualization-route-planner.css';

type ClientPreset = 'field' | 'engineering' | 'workstation';
type WorkloadId = 'cad' | 'assembly' | 'cae' | 'immersive';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

const clients: Record<ClientPreset, VisualizationClientProfile> = {
  field: { deviceMemoryGiB: 4, hardwareConcurrency: 8, mobile: true, webgpu: false },
  engineering: { deviceMemoryGiB: 8, hardwareConcurrency: 12, webgpu: true },
  workstation: { deviceMemoryGiB: 16, hardwareConcurrency: 24, webgpu: true },
};

const workloads: Record<WorkloadId, VisualizationArtifact> = {
  cad: {
    schema: 'fusiondigital.visualization-artifact.v2',
    artifactId: 'route-reference.medium-cad',
    version: '1',
    label: 'Medium CAD assembly',
    sourceRecord: { kind: 'design-asset', id: 'reference-cad' },
    provenance: { authority: 'synthetic', generator: 'FusionDigital routing reference' },
    coordinates: { units: 'm', upAxis: 'Z', handedness: 'right', frame: 'plant' },
    complexity: { compressedBytes: 82 * MIB, decodedBytes: 310 * MIB, triangles: 7_800_000 },
    access: { classification: 'public', clientDownloadAllowed: true },
    deliveries: [{ profile: 'web-mesh', format: 'glb', uri: 'reference://medium-cad.glb' }],
  },
  assembly: {
    schema: 'fusiondigital.visualization-artifact.v2',
    artifactId: 'route-reference.tiled-assembly',
    version: '1',
    label: 'Tiled plant assembly',
    sourceRecord: { kind: 'design-asset', id: 'reference-tiled-assembly' },
    provenance: { authority: 'synthetic', generator: 'FusionDigital routing reference' },
    coordinates: { units: 'm', upAxis: 'Z', handedness: 'right', frame: 'plant' },
    complexity: {
      compressedBytes: 4.8 * GIB,
      decodedBytes: 15 * GIB,
      workingSetBytes: 340 * MIB,
      triangles: 88_000_000,
    },
    access: { classification: 'internal', clientDownloadAllowed: true },
    deliveries: [{ profile: 'web-tiles', format: 'glb+manifest', uri: 'reference://assembly/index.json' }],
  },
  cae: {
    schema: 'fusiondigital.visualization-artifact.v2',
    artifactId: 'route-reference.large-cae',
    version: '1',
    label: 'Transient CAE field',
    sourceRecord: { kind: 'simulation-run', id: 'reference-run' },
    provenance: { authority: 'simulated', generator: 'FusionDigital routing reference' },
    coordinates: { units: 'm', upAxis: 'Z', handedness: 'right', frame: 'mesh' },
    complexity: {
      compressedBytes: 26 * GIB,
      decodedBytes: 74 * GIB,
      workingSetBytes: 12 * GIB,
      cells: 420_000_000,
      timeSteps: 1_200,
    },
    access: { classification: 'restricted', clientDownloadAllowed: false },
    deliveries: [
      { profile: 'paraview-remote', format: 'xdmf+hdf5', uri: 'reference://cae/session' },
    ],
  },
  immersive: {
    schema: 'fusiondigital.visualization-artifact.v2',
    artifactId: 'route-reference.usd-review',
    version: '1',
    label: 'OpenUSD design review',
    sourceRecord: { kind: 'design-asset', id: 'reference-usd-stage' },
    provenance: { authority: 'synthetic', generator: 'FusionDigital routing reference' },
    coordinates: { units: 'm', upAxis: 'Z', handedness: 'right', frame: 'plant' },
    complexity: { compressedBytes: 7 * GIB, decodedBytes: 22 * GIB, triangles: 120_000_000 },
    access: { classification: 'internal', clientDownloadAllowed: false },
    deliveries: [
      { profile: 'openusd', format: 'usdc', uri: 'reference://usd/plant.usdc' },
      { profile: 'omniverse-stream', format: 'kit-stream', uri: 'reference://omniverse/session' },
    ],
  },
};

const rendererLabels = {
  'three-web': 'Three.js / WebGL',
  'vtk-local': 'vtk.js local',
  'paraview-remote': 'ParaView / trame',
  'omniverse-stream': 'Omniverse streaming',
  'metadata-only': 'Metadata-only fallback',
} as const;

const reasonCopy = {
  'immersive-usd-session': ['可选沉浸式 USD 会话满足当前意图。', 'Optional immersive USD session matches the current intent.'],
  'streamed-web-tiles-fit-budget': ['按需瓦片工作集可控制在客户端预算内。', 'On-demand tile working set fits the client budget.'],
  'web-mesh-fit-budget': ['压缩网格及解码工作集适合浏览器本地渲染。', 'Compressed mesh and decoded working set fit local browser rendering.'],
  'local-vtk-fit-budget': ['科学数据规模适合 vtk.js 本地分析。', 'Scientific dataset fits local vtk.js analysis.'],
  'remote-scientific-rendering-required': ['数据受限或超出本地预算，保留服务端科学计算。', 'Restricted or oversized data stays beside server-side scientific compute.'],
  'no-authorized-runtime': ['没有满足权限与容量约束的运行时，仅显示可信元数据。', 'No runtime satisfies access and capacity constraints; show trusted metadata only.'],
} as const;

function formatBytes(value: number) {
  return value >= GIB ? `${(value / GIB).toFixed(1)} GiB` : `${Math.round(value / MIB)} MiB`;
}

export default function VisualizationRoutePlanner({ en }: { en: boolean }) {
  const [client, setClient] = useState<ClientPreset>('engineering');
  const [workload, setWorkload] = useState<WorkloadId>('cae');
  const [paraViewRemote, setParaViewRemote] = useState(true);
  const [omniverseStream, setOmniverseStream] = useState(false);

  const intent: VisualizationIntent = workload === 'immersive' ? 'immersive' : workload === 'cae' ? 'analyze' : 'inspect';
  const decision = useMemo(
    () =>
      routeVisualizationArtifact(workloads[workload], {
        client: clients[client],
        availability: { paraViewRemote, omniverseStream },
        intent,
      }),
    [client, intent, omniverseStream, paraViewRemote, workload],
  );

  const artifact = workloads[workload];
  const reason = reasonCopy[decision.reason][en ? 1 : 0];

  return (
    <section id="visualization" className="visualizationPlanner" aria-labelledby="visualization-title">
      <div className="visualizationPlanner__header">
        <div>
          <p className="visualizationPlanner__kicker">05 / OPEN VISUALIZATION FABRIC</p>
          <h2 id="visualization-title">{en ? 'Route data, not brands' : '按数据特征分流，而不是押注单一引擎'}</h2>
        </div>
        <p>
          {en
            ? 'A deterministic policy chooses browser geometry, local scientific rendering, remote ParaView, or an optional immersive session from one audited artifact contract.'
            : '同一份可审计制品合同，根据权限、工作集、设备预算和任务意图，确定浏览器几何、本地科学渲染、远程 ParaView 或可选沉浸式会话。'}
        </p>
      </div>

      <div className="visualizationPlanner__truth">
        <strong>{en ? 'ROUTING REFERENCE' : '路由参考'}</strong>
        <span>{en ? 'Synthetic capacity profiles; not a benchmark or facility result.' : '容量参数为合成参考，不是基准测试或设施结果。'}</span>
      </div>

      <div className="visualizationPlanner__pipeline" aria-label={en ? 'Visualization pipeline' : '可视化流水线'}>
        {[
          ['01', en ? 'Source authority' : '数据权威', 'CAD / CAE / facility'],
          ['02', en ? 'Open build' : '开放构建', 'Blender headless'],
          ['03', en ? 'Scene contract' : '场景合同', 'glTF / OpenUSD / VTK'],
          ['04', en ? 'Policy router' : '策略路由', 'budget + access'],
          ['05', en ? 'Runtime' : '运行时', 'Three / ParaView / optional OV'],
        ].map(([number, title, caption]) => (
          <div className="visualizationPlanner__stage" key={number}>
            <span>{number}</span>
            <strong>{title}</strong>
            <small>{caption}</small>
          </div>
        ))}
      </div>

      <div className="visualizationPlanner__workspace">
        <div className="visualizationPlanner__controls">
          <fieldset>
            <legend>{en ? 'Reference workload' : '参考负载'}</legend>
            {(Object.keys(workloads) as WorkloadId[]).map((id) => {
              const labels: Record<WorkloadId, string> = en
                ? { cad: 'Medium CAD', assembly: 'Tiled plant', cae: 'Large CAE', immersive: 'USD review' }
                : { cad: '中型 CAD', assembly: '分块装置', cae: '超大 CAE', immersive: 'USD 评审' };
              return (
                <button
                  type="button"
                  className={workload === id ? 'isActive' : undefined}
                  aria-pressed={workload === id}
                  onClick={() => setWorkload(id)}
                  key={id}
                >
                  {labels[id]}
                </button>
              );
            })}
          </fieldset>
          <fieldset>
            <legend>{en ? 'Client envelope' : '客户端能力'}</legend>
            {(Object.keys(clients) as ClientPreset[]).map((id) => {
              const labels: Record<ClientPreset, string> = en
                ? { field: 'Field tablet', engineering: 'Engineering laptop', workstation: 'Workstation' }
                : { field: '现场平板', engineering: '工程笔记本', workstation: '工作站' };
              return (
                <button
                  type="button"
                  className={client === id ? 'isActive' : undefined}
                  aria-pressed={client === id}
                  onClick={() => setClient(id)}
                  key={id}
                >
                  {labels[id]}
                </button>
              );
            })}
          </fieldset>
          <div className="visualizationPlanner__toggles">
            <label>
              <input type="checkbox" checked={paraViewRemote} onChange={(event) => setParaViewRemote(event.target.checked)} />
              <span>ParaView / trame {en ? 'available' : '可用'}</span>
            </label>
            <label>
              <input type="checkbox" checked={omniverseStream} onChange={(event) => setOmniverseStream(event.target.checked)} />
              <span>Omniverse {en ? 'optional adapter' : '可选适配器'}</span>
            </label>
          </div>
        </div>

        <div className="visualizationPlanner__decision" aria-live="polite">
          <p className="visualizationPlanner__label">{en ? 'SELECTED RUNTIME' : '选定运行时'}</p>
          <div className="visualizationPlanner__engine">
            <span className={decision.openSourceCore ? 'isOpen' : 'isOptional'} />
            <h3>{rendererLabels[decision.renderer]}</h3>
          </div>
          <p className="visualizationPlanner__reason">{reason}</p>
          <dl>
            <div><dt>{en ? 'Authority' : '数据身份'}</dt><dd>{artifact.provenance.authority.toUpperCase()}</dd></div>
            <div><dt>{en ? 'Access' : '访问等级'}</dt><dd>{artifact.access.classification}</dd></div>
            <div><dt>{en ? 'Working set' : '工作集'}</dt><dd>{formatBytes(artifact.complexity.workingSetBytes ?? artifact.complexity.decodedBytes ?? 0)}</dd></div>
            <div><dt>{en ? 'Client budget' : '客户端预算'}</dt><dd>{formatBytes(decision.budget.workingSetBytes)}</dd></div>
            <div><dt>{en ? 'Delivery' : '交付格式'}</dt><dd>{decision.selectedDelivery?.format ?? 'metadata'}</dd></div>
            <div><dt>{en ? 'Core status' : '核心状态'}</dt><dd>{decision.openSourceCore ? (en ? 'OPEN SOURCE' : '开源') : (en ? 'OPTIONAL / PROPRIETARY' : '可选 / 专有')}</dd></div>
          </dl>
        </div>
      </div>

      <div className="visualizationPlanner__boundary">
        <div><strong>Three.js + vtk.js</strong><span>{en ? 'Local interaction and bounded working sets' : '本地交互与受控工作集'}</span></div>
        <div><strong>ParaView + trame</strong><span>{en ? 'Open-source server-side scientific rendering' : '开源服务端科学渲染'}</span></div>
        <div><strong>Blender + OpenUSD</strong><span>{en ? 'Offline asset preparation and scene composition' : '离线资产制备与场景组合'}</span></div>
        <div className="isOptional"><strong>Omniverse</strong><span>{en ? 'Optional adapter; never the source of truth' : '可选适配器；不作为事实源'}</span></div>
      </div>
    </section>
  );
}
