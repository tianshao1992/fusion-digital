'use client';

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { Ehl2DiagnosticOverlayOptions } from '../components/device-viewer/Ehl2DiagnosticThreeOverlay';
import {
  DEFAULT_EXL50U_SENSOR_FAMILY_COLORS,
  EXL50U_SENSOR_FAMILIES,
  EXL50U_SENSOR_MARKER_OUTLINE_DARK,
  EXL50U_SENSOR_MARKER_OUTLINE_LIGHT,
  exl50uSensorColorHexToNumber,
  normalizeExl50uSensorColorHex,
  normalizeExl50uSensorFamilyColors,
  normalizeExl50uSensorPointColorOverrides,
  resolveExl50uSensorPointColor,
  type Exl50uSensorColorHex,
  type Exl50uSensorFamilyColors,
  type Exl50uSensorPointColorOverrides,
} from '../components/device-viewer/exl50uSensorPointColors';
import {
  EXL50U_SENSOR_POINT_DATASET_URL,
  EXL50U_SENSOR_POINT_SCHEMA_VERSION,
  EXL50U_SENSOR_SOURCE_SHA256,
  parseExl50uSensorPointDataset,
  updateExl50uSensorPoint,
  type Exl50uSensorFamily,
  type Exl50uSensorPoint,
  type Exl50uSensorPointDataset,
  type Exl50uSensorTuple,
} from '../components/device-viewer/exl50uSensorPoints';
import { useI18n } from '../i18n';
import './Exl50uSensorPointPanel.css';

type SensorPanelTab = 'browse' | 'edit' | 'manage';

type SensorPointContract = Readonly<{
  sensorDatasetEndpoint: string;
  sensorManifestEndpoint: string;
}>;

type SensorDraftV1 = Readonly<{
  schemaVersion: 'fusiondigital.exl50u.sensor-draft.v1';
  sourceSchemaVersion: typeof EXL50U_SENSOR_POINT_SCHEMA_VERSION;
  sourceSha256: typeof EXL50U_SENSOR_SOURCE_SHA256;
  savedAt: string;
  records: readonly Exl50uSensorPoint[];
  hiddenIds: readonly string[];
}>;

type SensorDraft = Readonly<{
  schemaVersion: 'fusiondigital.exl50u.sensor-draft.v2';
  sourceSchemaVersion: typeof EXL50U_SENSOR_POINT_SCHEMA_VERSION;
  sourceSha256: typeof EXL50U_SENSOR_SOURCE_SHA256;
  savedAt: string;
  records: readonly Exl50uSensorPoint[];
  hiddenIds: readonly string[];
  familyColors: Exl50uSensorFamilyColors;
  pointColorOverrides: Exl50uSensorPointColorOverrides;
}>;

type ParsedSensorDraft = Readonly<{ draft: SensorDraft; migratedFromV1: boolean }>;

const DRAFT_SCHEMA = 'fusiondigital.exl50u.sensor-draft.v2' as const;
const LEGACY_DRAFT_SCHEMA: SensorDraftV1['schemaVersion'] = 'fusiondigital.exl50u.sensor-draft.v1';
const DRAFT_KEY = `fusion-digital:exl50u-sensor-draft:v2:${EXL50U_SENSOR_SOURCE_SHA256}`;
const LEGACY_DRAFT_KEY = `fusion-digital:exl50u-sensor-draft:v1:${EXL50U_SENSOR_SOURCE_SHA256}`;
const FAMILIES = EXL50U_SENSOR_FAMILIES;

type SensorPointEditForm = {
  displayName: string;
  family: Exl50uSensorFamily;
  hMm: string;
  rMm: string;
  phiDeg: string;
  inheritFamilyColor: boolean;
  colorHex: Exl50uSensorColorHex;
};

function familyLabel(family: Exl50uSensorFamily, english: boolean) {
  if (family !== 'SMOKE') return family;
  return english ? 'Smoke' : '烟雾';
}

function samePoint(left: Exl50uSensorPoint, right: Exl50uSensorPoint) {
  return left.displayName === right.displayName
    && left.family === right.family
    && left.sourceTuple.hMm === right.sourceTuple.hMm
    && left.sourceTuple.rMm === right.sourceTuple.rMm
    && left.sourceTuple.phiDeg === right.sourceTuple.phiDeg;
}

function parseDraft(raw: string, baseline: Exl50uSensorPointDataset): ParsedSensorDraft | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const migratedFromV1 = value.schemaVersion === LEGACY_DRAFT_SCHEMA;
    if ((!migratedFromV1 && value.schemaVersion !== DRAFT_SCHEMA)
      || value.sourceSchemaVersion !== baseline.schemaVersion
      || value.sourceSha256 !== baseline.source.sha256
      || typeof value.savedAt !== 'string'
      || !Array.isArray(value.records)
      || !Array.isArray(value.hiddenIds)
      || value.records.length !== baseline.records.length) return null;
    const baselineById = new Map(baseline.records.map((point) => [point.id, point]));
    const records = value.records.map((candidate) => {
      if (!candidate || typeof candidate !== 'object') throw new Error('invalid record');
      const original = baselineById.get(candidate.id);
      if (!original || candidate.sourceIndex !== original.sourceIndex
        || candidate.sourceKey !== original.sourceKey || candidate.status !== 'active') {
        throw new Error('draft identity drift');
      }
      const tuple = candidate.sourceTuple as Exl50uSensorTuple;
      return updateExl50uSensorPoint(original, {
        displayName: candidate.displayName,
        family: candidate.family,
        sourceTuple: {
          hMm: Number(tuple?.hMm),
          rMm: Number(tuple?.rMm),
          phiDeg: Number(tuple?.phiDeg),
        },
      });
    });
    if (new Set(records.map((point) => point.id)).size !== baseline.records.length) return null;
    const knownIds = new Set(baseline.records.map((point) => point.id));
    const hiddenIds = (value.hiddenIds as unknown[]).filter((id): id is string => typeof id === 'string' && knownIds.has(id));
    const familyColors = migratedFromV1
      ? DEFAULT_EXL50U_SENSOR_FAMILY_COLORS
      : normalizeExl50uSensorFamilyColors(value.familyColors);
    const pointColorOverrides = migratedFromV1
      ? {}
      : normalizeExl50uSensorPointColorOverrides(value.pointColorOverrides, knownIds);
    if (!familyColors || !pointColorOverrides) return null;
    return {
      migratedFromV1,
      draft: {
        schemaVersion: DRAFT_SCHEMA,
        sourceSchemaVersion: baseline.schemaVersion,
        sourceSha256: baseline.source.sha256,
        savedAt: value.savedAt,
        records,
        hiddenIds: [...new Set(hiddenIds)].sort(),
        familyColors,
        pointColorOverrides,
      },
    };
  } catch {
    return null;
  }
}

function makeDraft(
  dataset: Exl50uSensorPointDataset,
  records: readonly Exl50uSensorPoint[],
  hiddenIds: ReadonlySet<string>,
  familyColors: Exl50uSensorFamilyColors,
  pointColorOverrides: Exl50uSensorPointColorOverrides,
): SensorDraft {
  return {
    schemaVersion: DRAFT_SCHEMA,
    sourceSchemaVersion: dataset.schemaVersion,
    sourceSha256: dataset.source.sha256,
    savedAt: new Date().toISOString(),
    records,
    hiddenIds: [...hiddenIds].sort(),
    familyColors,
    pointColorOverrides,
  };
}

function downloadText(fileName: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function editFormFor(
  point: Exl50uSensorPoint,
  colorHex: Exl50uSensorColorHex,
  hasPointColorOverride: boolean,
): SensorPointEditForm {
  return {
    displayName: point.displayName,
    family: point.family,
    hMm: String(point.sourceTuple.hMm),
    rMm: String(point.sourceTuple.rMm),
    phiDeg: String(point.sourceTuple.phiDeg),
    inheritFamilyColor: !hasPointColorOverride,
    colorHex,
  };
}

function SensorPointEditor({
  point,
  pointColor,
  familyColor,
  hasPointColorOverride,
  english,
  onApply,
  onReset,
  onLocate,
}: {
  point: Exl50uSensorPoint;
  pointColor: Exl50uSensorColorHex;
  familyColor: Exl50uSensorColorHex;
  hasPointColorOverride: boolean;
  english: boolean;
  onApply: (form: SensorPointEditForm) => void;
  onReset: () => void;
  onLocate: () => void;
}) {
  const [form, setForm] = useState<SensorPointEditForm>(() => editFormFor(point, pointColor, hasPointColorOverride));
  return <form className="sensorPointEdit" onSubmit={(event) => { event.preventDefault(); onApply(form); }}>
    <div className="sensorPointIdentity"><b>{point.id}</b><span>{point.sourceKey}</span></div>
    <label>{english ? 'Display name' : '显示名称'}<input value={form.displayName} required maxLength={80} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
    <label>{english ? 'Family' : '类别'}<select value={form.family} onChange={(event) => setForm((current) => ({ ...current, family: event.target.value as Exl50uSensorFamily }))}>{FAMILIES.map((item) => <option key={item} value={item}>{familyLabel(item, english)}</option>)}</select></label>
    <div className="sensorTupleGrid">
      <label>H / mm<input type="number" required step="any" value={form.hMm} onChange={(event) => setForm((current) => ({ ...current, hMm: event.target.value }))} /></label>
      <label>R / mm<input type="number" required step="any" value={form.rMm} onChange={(event) => setForm((current) => ({ ...current, rMm: event.target.value }))} /></label>
      <label>φ / °<input type="number" required min="0" max="359.999999" step="any" value={form.phiDeg} onChange={(event) => setForm((current) => ({ ...current, phiDeg: event.target.value }))} /></label>
    </div>
    <fieldset className="sensorPointColorEditor">
      <legend>{english ? 'Point colour' : '测点颜色'}</legend>
      <label className="sensorPointColorFollow">
        <input type="checkbox" checked={form.inheritFamilyColor} onChange={(event) => setForm((current) => ({
          ...current,
          inheritFamilyColor: event.target.checked,
          colorHex: event.target.checked ? familyColor : current.colorHex,
        }))} />
        <span>{english ? 'Follow family colour' : '跟随类别颜色'}</span>
      </label>
      <label className="sensorPointColorPicker">
        <span>{form.inheritFamilyColor ? (english ? 'Inherited' : '继承颜色') : (english ? 'Custom' : '自定义颜色')}</span>
        <input
          type="color"
          value={form.colorHex}
          disabled={form.inheritFamilyColor}
          onChange={(event) => setForm((current) => ({
            ...current,
            inheritFamilyColor: false,
            colorHex: event.target.value.toUpperCase() as Exl50uSensorColorHex,
          }))}
        />
        <output>{form.colorHex}</output>
      </label>
    </fieldset>
    <p className="sensorPointWebCoordinate">Web XYZ / m · {point.webMetres.map((value) => value.toFixed(4)).join(' / ')}</p>
    <div className="sensorPointActions">
      <button type="submit" className="primary">{english ? 'Apply to draft' : '应用到草稿'}</button>
      <button type="button" onClick={onReset}>{english ? 'Reset this point' : '恢复此测点'}</button>
      <button type="button" onClick={onLocate}>{english ? 'Locate in 3D' : '三维定位'}</button>
    </div>
  </form>;
}

export default function Exl50uSensorPointPanel({
  active,
  contract,
  selectedPointId,
  onSelectedPointIdChange,
  onOverlayChange,
  onFocusPoint,
}: {
  active: boolean;
  contract: SensorPointContract;
  selectedPointId: string | null;
  onSelectedPointIdChange: (pointId: string) => void;
  onOverlayChange: (options?: Ehl2DiagnosticOverlayOptions) => void;
  onFocusPoint: (point: readonly [number, number, number]) => void;
}) {
  const { locale } = useI18n();
  const english = locale === 'en';
  const [dataset, setDataset] = useState<Exl50uSensorPointDataset | null>(null);
  const [records, setRecords] = useState<readonly Exl50uSensorPoint[]>([]);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [familyColors, setFamilyColors] = useState<Exl50uSensorFamilyColors>(() => ({ ...DEFAULT_EXL50U_SENSOR_FAMILY_COLORS }));
  const [pointColorOverrides, setPointColorOverrides] = useState<Exl50uSensorPointColorOverrides>({});
  const [tab, setTab] = useState<SensorPanelTab>('browse');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<'ALL' | Exl50uSensorFamily>('ALL');
  const [showLabels, setShowLabels] = useState(true);
  const [depthMode, setDepthMode] = useState<'xray' | 'physical'>('xray');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(contract.sensorDatasetEndpoint || EXL50U_SENSOR_POINT_DATASET_URL, {
      signal: controller.signal,
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseExl50uSensorPointDataset(await response.json());
    }).then((nextDataset) => {
      let nextRecords = nextDataset.records;
      let nextHidden = new Set<string>();
      let nextFamilyColors = DEFAULT_EXL50U_SENSOR_FAMILY_COLORS;
      let nextPointColorOverrides: Exl50uSensorPointColorOverrides = {};
      try {
        const currentRaw = window.localStorage.getItem(DRAFT_KEY);
        const legacyRaw = currentRaw ? null : window.localStorage.getItem(LEGACY_DRAFT_KEY);
        const saved = currentRaw
          ? parseDraft(currentRaw, nextDataset)
          : (legacyRaw ? parseDraft(legacyRaw, nextDataset) : null);
        if (saved) {
          nextRecords = saved.draft.records;
          nextHidden = new Set(saved.draft.hiddenIds);
          nextFamilyColors = saved.draft.familyColors;
          nextPointColorOverrides = saved.draft.pointColorOverrides;
          setNotice(saved.migratedFromV1
            ? (english ? 'Restored the legacy draft; save once to migrate its colour settings.' : '已恢复旧版草稿；保存一次即可迁移颜色设置。')
            : (english ? 'Restored a version-matched local draft.' : '已恢复与当前版本匹配的本地草稿。'));
        }
      } catch {
        // Browser storage is optional. The reviewed public baseline still loads.
      }
      setLoadError('');
      setDataset(nextDataset);
      setRecords(nextRecords);
      setHiddenIds(nextHidden);
      setFamilyColors(nextFamilyColors);
      setPointColorOverrides(nextPointColorOverrides);
      onSelectedPointIdChange(selectedPointId && nextRecords.some((point) => point.id === selectedPointId)
        ? selectedPointId
        : nextRecords[0].id);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => controller.abort();
    // selectedPointId is intentionally not a fetch dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.sensorDatasetEndpoint]);

  const pointById = useMemo(() => new Map(records.map((point) => [point.id, point])), [records]);
  const selectedPoint = selectedPointId ? pointById.get(selectedPointId) ?? null : null;
  const baselineById = useMemo(() => new Map(dataset?.records.map((point) => [point.id, point]) ?? []), [dataset]);
  const dirtyIds = useMemo(() => new Set(records.filter((point) => {
    const baseline = baselineById.get(point.id);
    return baseline ? !samePoint(point, baseline) : true;
  }).map((point) => point.id)), [baselineById, records]);
  const pointColorById = useMemo(() => new Map(records.map((point) => [
    point.id,
    resolveExl50uSensorPointColor(point, familyColors, pointColorOverrides),
  ])), [familyColors, pointColorOverrides, records]);
  const customizedFamilyCount = useMemo(() => FAMILIES.filter(
    (item) => familyColors[item] !== DEFAULT_EXL50U_SENSOR_FAMILY_COLORS[item],
  ).length, [familyColors]);
  const customizedPointCount = Object.keys(pointColorOverrides).length;

  const currentFamilyCounts = useMemo(() => FAMILIES.reduce<Record<Exl50uSensorFamily, number>>((counts, item) => {
    counts[item] = records.filter((point) => point.family === item).length;
    return counts;
  }, { LD: 0, PF: 0, TF: 0, TF_V: 0, SMOKE: 0 }), [records]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((point) => (family === 'ALL' || point.family === family)
      && (!needle || `${point.displayName} ${point.sourceKey} ${point.id} ${point.family}`.toLocaleLowerCase().includes(needle)));
  }, [family, query, records]);

  const overlayOptions = useMemo<Ehl2DiagnosticOverlayOptions | undefined>(() => {
    if (!dataset || !active) return undefined;
    const visible = records.filter((point) => !hiddenIds.has(point.id));
    return {
      kind: 'device-point-markers',
      labelLocale: english ? 'en' : 'zh-CN',
      depthMode,
      pointMarkers: {
        layerId: dataset.id,
        markerKind: 'exl50u-host-sensor-point',
        authority: dataset.authority,
        coordinateFrame: dataset.coordinateSystem.id,
        labelDetail: english ? 'NOMINAL HOST POINT · LOCAL DRAFT' : '主机名义测点 · 本地草稿',
        interactive: true,
        opacity: 1,
        selectedId: selectedPoint && !hiddenIds.has(selectedPoint.id) ? selectedPoint.id : undefined,
        outlineDarkColor: EXL50U_SENSOR_MARKER_OUTLINE_DARK,
        outlineLightColor: EXL50U_SENSOR_MARKER_OUTLINE_LIGHT,
        showSelectedLabel: showLabels,
        pointsWebMetres: visible.map((point) => ({
          id: point.id,
          positionWebMetres: point.webMetres,
          label: point.displayName,
          color: exl50uSensorColorHexToNumber(pointColorById.get(point.id) ?? familyColors[point.family]),
          detail: `${familyLabel(point.family, english)} · H ${point.sourceTuple.hMm.toFixed(1)} mm · R ${point.sourceTuple.rMm.toFixed(1)} mm · φ ${point.sourceTuple.phiDeg.toFixed(1)}°`,
        })),
      },
    };
  }, [active, dataset, depthMode, english, familyColors, hiddenIds, pointColorById, records, selectedPoint, showLabels]);

  useEffect(() => {
    onOverlayChange(overlayOptions);
    return () => onOverlayChange(undefined);
  }, [onOverlayChange, overlayOptions]);

  const selectAndFocus = (point: Exl50uSensorPoint) => {
    if (hiddenIds.has(point.id)) {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(point.id);
        return next;
      });
      setNotice(english ? 'Made the point visible in the unsaved browser draft.' : '已在未保存的浏览器草稿中显示该测点。');
    }
    onSelectedPointIdChange(point.id);
    onFocusPoint(point.webMetres);
  };

  const toggleHidden = (pointId: string) => {
    setHiddenIds((current) => {
      const next = new Set(current);
      if (next.has(pointId)) next.delete(pointId);
      else next.add(pointId);
      return next;
    });
    setNotice(english ? 'Visibility changed in the unsaved browser draft.' : '测点显隐已修改，浏览器草稿尚未保存。');
  };

  const toggleFamilyVisibility = (item: Exl50uSensorFamily) => {
    const familyPoints = records.filter((point) => point.family === item);
    const allHidden = familyPoints.every((point) => hiddenIds.has(point.id));
    setHiddenIds((current) => {
      const next = new Set(current);
      familyPoints.forEach((point) => allHidden ? next.delete(point.id) : next.add(point.id));
      return next;
    });
    setNotice(english ? 'Family visibility changed in the unsaved browser draft.' : '类别显隐已修改，浏览器草稿尚未保存。');
  };

  const setFamilyColor = (item: Exl50uSensorFamily, candidate: string) => {
    const color = normalizeExl50uSensorColorHex(candidate);
    if (!color) return;
    setFamilyColors((current) => ({ ...current, [item]: color }));
    setNotice(english
      ? `Changed ${familyLabel(item, true)} for points that follow their family colour.`
      : `已修改 ${familyLabel(item, false)} 类别颜色；设置为单点颜色的测点不受影响。`);
  };

  const resetFamilyColor = (item: Exl50uSensorFamily) => {
    setFamilyColors((current) => ({ ...current, [item]: DEFAULT_EXL50U_SENSOR_FAMILY_COLORS[item] }));
    setNotice(english ? 'Restored the high-contrast family default.' : '已恢复该类别的高对比度默认色。');
  };

  const clearFamilyPointColors = (item: Exl50uSensorFamily) => {
    const familyIds = new Set(records.filter((point) => point.family === item).map((point) => point.id));
    setPointColorOverrides((current) => Object.fromEntries(
      Object.entries(current).filter(([pointId]) => !familyIds.has(pointId)),
    ) as Exl50uSensorPointColorOverrides);
    setNotice(english ? 'All points in this family now follow the family colour.' : '该类别内所有测点已统一跟随类别颜色。');
  };

  const applyEdit = (form: SensorPointEditForm) => {
    if (!selectedPoint) return;
    try {
      if ([form.hMm, form.rMm, form.phiDeg].some((value) => value.trim() === '')) {
        throw new Error(english ? 'H, R and phi are required.' : 'H、R 与 φ 均为必填项。');
      }
      const updated = updateExl50uSensorPoint(selectedPoint, {
        displayName: form.displayName,
        family: form.family,
        sourceTuple: { hMm: Number(form.hMm), rMm: Number(form.rMm), phiDeg: Number(form.phiDeg) },
      });
      const colorHex = normalizeExl50uSensorColorHex(form.colorHex);
      if (!colorHex) throw new Error(english ? 'Choose a valid six-digit point colour.' : '请选择有效的六位测点颜色。');
      setRecords((current) => current.map((point) => point.id === updated.id ? updated : point));
      setPointColorOverrides((current) => {
        const next = { ...current };
        if (form.inheritFamilyColor) delete next[updated.id];
        else next[updated.id] = colorHex;
        return next;
      });
      setNotice(english ? 'Applied to the unsaved browser draft.' : '已应用到尚未保存的浏览器草稿。');
      onFocusPoint(updated.webMetres);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const resetPoint = () => {
    if (!selectedPointId) return;
    const baseline = baselineById.get(selectedPointId);
    if (!baseline) return;
    setRecords((current) => current.map((point) => point.id === baseline.id ? baseline : point));
    setHiddenIds((current) => {
      const next = new Set(current);
      next.delete(baseline.id);
      return next;
    });
    setPointColorOverrides((current) => {
      const next = { ...current };
      delete next[baseline.id];
      return next;
    });
    setNotice(english ? 'Restored this point from the public baseline; the browser draft is unsaved.' : '该测点已恢复为公共基线，浏览器草稿尚未保存。');
  };

  const resetAll = () => {
    if (!dataset) return;
    setRecords(dataset.records);
    setHiddenIds(new Set());
    setFamilyColors({ ...DEFAULT_EXL50U_SENSOR_FAMILY_COLORS });
    setPointColorOverrides({});
    try {
      window.localStorage.removeItem(DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch { /* optional storage */ }
    setNotice(english ? 'Restored all 76 public baseline points.' : '已恢复全部 76 个公共基线测点。');
  };

  const saveDraft = () => {
    if (!dataset) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft(dataset, records, hiddenIds, familyColors, pointColorOverrides)));
      window.localStorage.removeItem(LEGACY_DRAFT_KEY);
      setNotice(english ? 'Saved locally in this browser.' : '已保存在当前浏览器本地。');
    } catch {
      setNotice(english ? 'Browser storage is unavailable; export the draft instead.' : '浏览器存储不可用，请改为导出草稿。');
    }
  };

  const exportDraft = () => {
    if (!dataset) return;
    downloadText('exl50u-sensor-draft-v2.json', 'application/json;charset=utf-8', `${JSON.stringify(makeDraft(dataset, records, hiddenIds, familyColors, pointColorOverrides), null, 2)}\n`);
  };

  const exportCsv = () => {
    const header = ['stable_id', 'source_key', 'display_name', 'family', 'elevation_mm', 'radius_mm', 'toroidal_deg', 'web_x_m', 'web_y_m', 'web_z_m', 'visible', 'color_hex', 'color_source'];
    const rows = records.map((point) => [
      point.id, point.sourceKey, point.displayName, point.family,
      point.sourceTuple.hMm, point.sourceTuple.rMm, point.sourceTuple.phiDeg,
      ...point.webMetres, hiddenIds.has(point.id) ? 'false' : 'true',
      pointColorById.get(point.id) ?? familyColors[point.family],
      pointColorOverrides[point.id] ? 'point' : 'family',
    ]);
    downloadText('exl50u-sensor-points-v1.csv', 'text/csv;charset=utf-8', `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`);
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: SensorPanelTab) => {
    const order: SensorPanelTab[] = ['browse', 'edit', 'manage'];
    const index = order.indexOf(current);
    let next: SensorPanelTab | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = order[(index + 1) % order.length];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = order[(index - 1 + order.length) % order.length];
    else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order[order.length - 1];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`exl50u-sensor-tab-${next}`)?.focus();
  };

  if (loadError) return <section className="sensorPointPanel sensorPointError" aria-live="polite">
    <h3>{english ? 'Host point data unavailable' : '主机测点数据不可用'}</h3>
    <p>{loadError}</p>
  </section>;
  if (!dataset) return <section className="sensorPointPanel sensorPointLoading" aria-live="polite">
    {english ? 'Validating 76 host points…' : '正在校验 76 个主机测点…'}
  </section>;

  return <section className="sensorPointPanel" aria-label={english ? 'EXL-50U host point manager' : 'EXL‑50U 主机测点管理'}>
    <header className="sensorPointHeader">
      <div><small>EXL‑50U · HOST POINT LAYER</small><h3>{english ? 'Nominal measurement points' : '主机名义测点'}</h3></div>
      <b>{dataset.recordCount}</b>
    </header>
    <p className="sensorPointBoundary">
      {english
        ? 'Exact nominal points are authorised for both public endpoints. Edits stay as a non-authoritative browser draft.'
        : '精确名义测点已授权公共双端发布；前端修改仅为非权威浏览器草稿。'}
    </p>

    <div className="sensorPointTabs" role="tablist" aria-label={english ? 'Host point tools' : '主机测点工具'}>
      {([
        ['browse', english ? 'Browse & locate' : '浏览定位'],
        ['edit', english ? 'Edit one point' : '单点编辑'],
        ['manage', english ? 'Batch manage' : '批量管理'],
      ] as const).map(([id, label], index) => <button
        key={id}
        id={`exl50u-sensor-tab-${id}`}
        type="button"
        role="tab"
        aria-selected={tab === id}
        aria-controls={`exl50u-sensor-panel-${id}`}
        tabIndex={tab === id ? 0 : -1}
        onClick={() => setTab(id)}
        onKeyDown={(event) => handleTabKeyDown(event, id)}
      ><span>0{index + 1}</span>{label}</button>)}
    </div>

    <div id="exl50u-sensor-panel-browse" role="tabpanel" aria-labelledby="exl50u-sensor-tab-browse" hidden={tab !== 'browse'}>
      <div className="sensorPointFilters">
        <label>{english ? 'Search' : '搜索'}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={english ? 'Name, id or family' : '名称、编号或类别'} /></label>
        <label>{english ? 'Family' : '类别'}<select value={family} onChange={(event) => setFamily(event.target.value as 'ALL' | Exl50uSensorFamily)}>
          <option value="ALL">{english ? 'All families' : '全部类别'}</option>
          {FAMILIES.map((item) => <option key={item} value={item}>{familyLabel(item, english)} · {currentFamilyCounts[item]}</option>)}
        </select></label>
      </div>
      <div className="sensorPointViewToggles">
        <button type="button" aria-pressed={depthMode === 'xray'} onClick={() => setDepthMode((value) => value === 'xray' ? 'physical' : 'xray')}>{depthMode === 'xray' ? (english ? 'X-ray markers' : '透视测点') : (english ? 'Physical depth' : '物理遮挡')}</button>
        <button type="button" aria-pressed={showLabels} onClick={() => setShowLabels((value) => !value)}>{english ? 'Selected label' : '选中标签'}</button>
      </div>
      <p className="sensorPointResultCount">{filtered.length} / {records.length}</p>
      <div className="sensorPointList">
        {filtered.map((point) => {
          const selected = selectedPointId === point.id;
          const hidden = hiddenIds.has(point.id);
          return <article key={point.id} className={selected ? 'isSelected' : ''} style={{ '--sensor-color': pointColorById.get(point.id) ?? familyColors[point.family] } as CSSProperties}>
            <button type="button" className="sensorPointSelect" onClick={() => selectAndFocus(point)}>
              <span><b>{point.displayName}</b><small>{point.id} · {familyLabel(point.family, english)}</small></span>
              <em>H {point.sourceTuple.hMm.toFixed(1)} · R {point.sourceTuple.rMm.toFixed(1)} · φ {point.sourceTuple.phiDeg.toFixed(1)}°</em>
            </button>
            <button type="button" className="sensorPointVisibility" aria-pressed={!hidden} onClick={() => toggleHidden(point.id)}>{hidden ? (english ? 'Show' : '显示') : (english ? 'Hide' : '隐藏')}</button>
          </article>;
        })}
      </div>
    </div>

    <div id="exl50u-sensor-panel-edit" role="tabpanel" aria-labelledby="exl50u-sensor-tab-edit" hidden={tab !== 'edit'}>
      {selectedPoint ? <SensorPointEditor
        key={`${selectedPoint.id}:${selectedPoint.displayName}:${selectedPoint.family}:${selectedPoint.sourceTuple.hMm}:${selectedPoint.sourceTuple.rMm}:${selectedPoint.sourceTuple.phiDeg}:${pointColorById.get(selectedPoint.id)}`}
        point={selectedPoint}
        pointColor={pointColorById.get(selectedPoint.id) ?? familyColors[selectedPoint.family]}
        familyColor={familyColors[selectedPoint.family]}
        hasPointColorOverride={Boolean(pointColorOverrides[selectedPoint.id])}
        english={english}
        onApply={applyEdit}
        onReset={resetPoint}
        onLocate={() => selectAndFocus(selectedPoint)}
      /> : <p>{english ? 'Choose a point in Browse first.' : '请先在“浏览定位”中选择测点。'}</p>}
    </div>

    <div id="exl50u-sensor-panel-manage" role="tabpanel" aria-labelledby="exl50u-sensor-tab-manage" hidden={tab !== 'manage'}>
      <dl className="sensorPointStats">
        <div><dt>{english ? 'Modified' : '已修改'}</dt><dd>{dirtyIds.size}</dd></div>
        <div><dt>{english ? 'Hidden' : '已隐藏'}</dt><dd>{hiddenIds.size}</dd></div>
        <div><dt>{english ? 'Custom colours' : '自定义颜色'}</dt><dd>{customizedFamilyCount + customizedPointCount}</dd></div>
        <div><dt>{english ? 'Duplicate CAD models' : '新增整机网格'}</dt><dd>0</dd></div>
      </dl>
      <div className="sensorFamilyManager">
        {FAMILIES.map((item) => {
          const familyPoints = records.filter((point) => point.family === item);
          const allHidden = familyPoints.every((point) => hiddenIds.has(point.id));
          const familyOverrideCount = familyPoints.filter((point) => pointColorOverrides[point.id]).length;
          return <section key={item} className="sensorFamilyRow">
            <div className="sensorFamilyIdentity">
              <span className="sensorFamilySwatch" style={{ '--sensor-color': familyColors[item] } as CSSProperties} />
              <b>{familyLabel(item, english)}</b>
              <small>{familyPoints.length} {english ? 'points' : '点'} · {familyOverrideCount} {english ? 'point colours' : '单点颜色'}</small>
            </div>
            <label className="sensorFamilyColorPicker">
              <span>{english ? 'Family colour' : '类别颜色'}</span>
              <input type="color" aria-label={`${familyLabel(item, english)} ${english ? 'family colour' : '类别颜色'}`} value={familyColors[item]} onChange={(event) => setFamilyColor(item, event.target.value)} />
              <output>{familyColors[item]}</output>
            </label>
            <div className="sensorFamilyActions">
              <button type="button" aria-pressed={!allHidden} onClick={() => toggleFamilyVisibility(item)}>{allHidden ? (english ? 'Show family' : '显示类别') : (english ? 'Hide family' : '隐藏类别')}</button>
              <button type="button" onClick={() => resetFamilyColor(item)}>{english ? 'Restore default' : '恢复默认色'}</button>
              <button type="button" disabled={familyOverrideCount === 0} onClick={() => clearFamilyPointColors(item)}>{english ? 'Unify family colour' : '统一该类颜色'}</button>
            </div>
          </section>;
        })}
      </div>
      <div className="sensorPointActions sensorPointManageActions">
        <button type="button" className="primary" onClick={saveDraft}>{english ? 'Save browser draft' : '保存浏览器草稿'}</button>
        <button type="button" onClick={exportDraft}>{english ? 'Export JSON' : '导出 JSON'}</button>
        <button type="button" onClick={exportCsv}>{english ? 'Export CSV' : '导出 CSV'}</button>
        <button type="button" onClick={resetAll}>{english ? 'Restore public baseline' : '恢复公共基线'}</button>
      </div>
      <p className="sensorPointContractLink"><a href={contract.sensorManifestEndpoint} target="_blank" rel="noreferrer">{english ? 'View versioned manifest' : '查看版本化清单'}</a></p>
    </div>
    {notice && <p className="sensorPointNotice" aria-live="polite">{notice}</p>}
  </section>;
}
