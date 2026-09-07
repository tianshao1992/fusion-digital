import { interpolateProfile, type TransportResult } from './contracts.ts';
export const labels: Record<string, [string, string]> = {
  te: ['电子温度', 'Electron temperature'], ti: ['离子温度', 'Ion temperature'], ne: ['电子密度', 'Electron density'],
  q: ['安全因子', 'Safety factor'], psi: ['极向磁通', 'Poloidal flux'], chi_e: ['电子热扩散', 'Electron diffusivity'], chi_i: ['离子热扩散', 'Ion diffusivity'],
  j_total: ['电流密度', 'Current density'], pressure: ['热压强', 'Thermal pressure'], p_alpha_e: ['电子 α 加热', 'Electron alpha heating'], p_alpha_i: ['离子 α 加热', 'Ion alpha heating'],
  fusion_power: ['聚变功率', 'Fusion power'], external_power: ['外部总功率', 'External power'], alpha_power: ['α 加热功率', 'Alpha power'], auxiliary_power: ['辅助加热', 'Auxiliary heating'],
  fusion_gain: ['聚变增益 Q', 'Fusion gain Q'], plasma_current: ['等离子体电流', 'Plasma current'], thermal_energy: ['热储能', 'Thermal energy'], q95: ['q95', 'q95'],
  te_volume_average: ['体平均电子温度', 'Volume-average Te'], ti_volume_average: ['体平均离子温度', 'Volume-average Ti'], ne_volume_average: ['体平均电子密度', 'Volume-average ne'], bootstrap_fraction: ['自举电流份额', 'Bootstrap fraction'],
};
export const label = (id: string, en: boolean) => labels[id]?.[en ? 1 : 0] ?? id;
export function displayUnit(unit: string): [number, string] {
  return ({ eV: [.001, 'keV'], W: [1e-6, 'MW'], J: [1e-6, 'MJ'], A: [1e-6, 'MA'], 'm^-3': [1e-20, '10²⁰ m⁻³'], 'A/m^2': [1e-6, 'MA/m²'], 'W/m^3': [1e-6, 'MW/m³'], Pa: [1e-3, 'kPa'], '1': [1, ''] } as Record<string, [number, string]>)[unit] ?? [1, unit];
}
export const number = (v: number | null | undefined) => v === null || v === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumSignificantDigits: 5 }).format(v);
export function profileAtTime(r: TransportResult, id: string, time: number) {
  const p = r.profiles.find(p => p.id === id);
  if (!p) return null;
  const axis = r.axes.find(a => a.id === p.axisId)!;
  return { x: axis.values, y: axis.values.map((_, k) => interpolateProfile(r.time.values, p.values.map(row => row[k]), time)), unit: p.unit };
}
export function download(name: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
