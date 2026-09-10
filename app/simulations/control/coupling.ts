import { digest, parseControlResult, type ControlEngine, type ControlResult } from './contracts.ts';

// Assessment is recomputed from validated data, never accepted from an uploaded "ready" flag.
// This version intentionally cannot authorize a solver handoff.
export function assessControlCoupling(value: ControlResult | null, target: ControlEngine | 'torax', sampleIndex = 0) {
  const result = value ? parseControlResult(value) : null;
  if (result && (!Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex >= result.time.values.length)) throw new Error('INVALID_COUPLING_TIME');
  const requirement = (id: string, satisfied: boolean, zh: string, en: string) => ({ id, status: satisfied ? 'satisfied' as const : 'missing' as const, zh, en });
  const toTorax = target === 'torax';
  return {
    schema: 'control-coupling-assessment.v1', mode: 'one-way-snapshot', readiness: 'blocked', execution: 'not-implemented',
    direction: toTorax ? 'control-to-torax' : 'torax-to-control',
    source: result && toTorax ? { engineId: result.engine.id, runId: result.id, recordSha256: result.provenance.resultSha256, deviceId: 'EXL-50U', deviceRevisionSha256: null, sampleSeconds: result.time.values[sampleIndex], initialConditionSeconds: result.initialState.timeSeconds } : null,
    target: { engineId: target, adapterCommit: null },
    requirements: [
      requirement('source-record', !!result && toTorax && digest(result.provenance.resultSha256), '经过校验的源运行', 'Validated source run'),
      requirement('device-revision', false, '装置版本和初态匹配', 'Device revision and initial-state matching'),
      ...(toTorax ? [
        requirement('native-lcfs', !!result?.geometry.frames.some(f => f.timeIndex === sampleIndex), '当前时刻原生 LCFS', 'Native LCFS at selected time'),
        requirement('flux-grid', false, '有单位、排列与磁通约定的 R/Z/ψ 网格', 'R/Z/ψ grid with units, ordering and flux convention'),
        requirement('cocos-signs', false, 'COCOS、磁通轴/边界及 Ip/Bφ 符号', 'COCOS, axis/boundary flux and Ip/Bφ signs'),
        requirement('radial-mapping', false, '径向磁通映射和目标几何所需剖面', 'Radial flux mapping and receiver geometry profiles'),
      ] : [
        requirement('kinetic-profiles', false, 'EXL-50U 的 Te/Ti/ne 源快照', 'EXL-50U Te/Ti/ne source snapshot'),
        requirement('profile-closure', false, '组分、总压力/电流闭合及坐标映射', 'Species, total pressure/current closure and coordinate mapping'),
        requirement('plant-binding', false, '目标 plant 的参数/初始化绑定', 'Receiver plant parameter/initialization binding'),
      ]),
      requirement('receiver-adapter', false, '经过验证的接收端适配器', 'Validated receiver adapter'),
      requirement('time-contract', false, '耦合步长、守恒、重启与失效处理', 'Coupling time step, conservation, restart and failure handling'),
    ],
  };
}

export function controlSnapshot(value: ControlResult, sampleIndex: number) {
  const r = parseControlResult(value), assessment = assessControlCoupling(r, 'torax', sampleIndex);
  return { schema: 'control-equilibrium-snapshot.v1', authority: 'simulated', assessment,
    signals: r.signals.map(s => ({ id: s.id, unit: s.unit, value: s.values[sampleIndex] })),
    geometry: { coordinate: 'cylindrical-rz', unit: 'm', cocos: null, flux: null, lcfs: r.geometry.frames.find(f => f.timeIndex === sampleIndex)?.lcfs ?? null },
    limitations: ['Read-only interface evidence; not an executable TORAX geometry input.', ...r.limitations] };
}
