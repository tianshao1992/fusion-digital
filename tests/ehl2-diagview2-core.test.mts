import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DiagView2AbortError,
  DiagView2ValidationError,
  buildDiagView2MathProfile,
  buildDiagView2PreviewRays,
  buildDiagView2Report,
  buildDiagView2TraceRays,
  computeDiagView2Rho,
  computeDiagView2VirtualWeights,
  createDefaultDiagView2Design,
  createDiagView2RayResult,
  parseDiagView2Geqdsk,
  parseDiagView2DesignFile,
  projectReportsToHtml,
  reportToCsv,
  reportToHtml,
  reportToJson,
  resolveDiagView2Pose,
  resolveDiagView2RotatedFrame,
  runDiagView2VirtualForwardModel,
  serializeDiagView2DesignFile,
  type DiagView2DiagnosticDesign,
  type DiagView2Vec3,
} from '../app/components/device-viewer/ehl2DiagView2Core.ts';

function approximate(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function approximateVector(actual: DiagView2Vec3, expected: DiagView2Vec3, tolerance = 1e-10) {
  actual.forEach((coordinate, index) => approximate(coordinate, expected[index], tolerance));
}

function length(vector: DiagView2Vec3) {
  return Math.hypot(...vector);
}

function add(a: DiagView2Vec3, b: DiagView2Vec3): DiagView2Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: DiagView2Vec3, factor: number): DiagView2Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function cross(a: DiagView2Vec3, b: DiagView2Vec3): DiagView2Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: DiagView2Vec3, b: DiagView2Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(vector: DiagView2Vec3): DiagView2Vec3 {
  return scale(vector, 1 / length(vector));
}

function rotate(vector: DiagView2Vec3, axis: DiagView2Vec3, degrees: number): DiagView2Vec3 {
  const unit = normalize(axis);
  const angle = degrees * Math.PI / 180;
  return add(
    add(scale(vector, Math.cos(angle)), scale(cross(unit, vector), Math.sin(angle))),
    scale(unit, dot(unit, vector) * (1 - Math.cos(angle))),
  );
}

function buildGeqdskText(
  psiRMajor: readonly number[],
  options: {
    boundary?: readonly (readonly [number, number])[];
    simag?: number;
    sibry?: number;
    trailing?: readonly number[];
  } = {},
) {
  assert.equal(psiRMajor.length, 9);
  const nw = 3;
  const nh = 3;
  const fileOrderPsi: number[] = [];
  for (let zIndex = 0; zIndex < nh; zIndex += 1) {
    for (let rIndex = 0; rIndex < nw; rIndex += 1) {
      fileOrderPsi.push(psiRMajor[rIndex * nh + zIndex]);
    }
  }
  const simag = options.simag ?? 0;
  const sibry = options.sibry ?? 1;
  const boundary = options.boundary ?? [];
  const tokens = [
    // rdim, zdim, rcentr, rleft, zmid
    1, 2, 1, 0.5, 0,
    // rmaxis, zmaxis, simag, sibry, bcentr
    1, 0, simag, sibry, 2,
    // current + four reserved values
    100_000, simag, 0, 1, 0,
    // line 5 duplicate/reserved values
    0, 0, sibry, 0, 0,
    // fpol, pressure, ffprim, pprime
    1, 1, 1,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    ...fileOrderPsi,
    // qpsi
    1, 1, 1,
    boundary.length, 0,
    ...boundary.flatMap(([r, z]) => [r, z]),
    ...(options.trailing ?? []),
  ];
  // Include one Fortran D exponent to exercise the browser parser.
  const numericBody = tokens.map((value, index) => (
    index === 0 ? Number(value).toExponential(9).replace('e', 'D') : String(value)
  )).join(' ');
  return `${'SYNTHETIC EHL2 TEST'.padEnd(48, ' ')} 0 ${nw} ${nh}\n${numericBody}\n`;
}

test('camera defaults reproduce the source 41-ray preview and 141-ray trace sets', () => {
  const design = createDefaultDiagView2Design('CAMERA');
  const preview = buildDiagView2PreviewRays(design);
  const trace = buildDiagView2TraceRays(design);

  assert.equal(preview.length, 41);
  assert.equal(trace.length, 141);
  assert.equal(preview.filter((ray) => ray.role === 'optical_axis').length, 1);
  assert.equal(preview.filter((ray) => ray.role === 'boundary').length, 40);
  assert.equal(trace.filter((ray) => ray.role === 'fill').length, 100);
  assert.equal(new Set(trace.map((ray) => ray.rayId)).size, 141);

  const axis = trace[0];
  assert.equal(axis.rayId, 'optical_axis');
  approximateVector(axis.originM, [2.55, 0, 0]);
  approximateVector(axis.direction, [-1, 0, 0]);
  approximateVector(axis.defaultEndpointM, [-2.45, 0, 0]);
  trace.forEach((ray) => {
    approximate(length(ray.direction), 1);
    assert.ok(ray.direction.every(Number.isFinite));
    assert.ok(ray.defaultEndpointM.every(Number.isFinite));
  });

  // The Python source intentionally emits duplicated corner directions once
  // per adjacent edge. The browser kernel must retain that 4x10 contract.
  approximateVector(preview[1].direction, preview[39].direction);
});

test('flange position, source dR sign, local offsets and world offsets resolve exactly', () => {
  const design: DiagView2DiagnosticDesign = {
    ...createDefaultDiagView2Design('CAMERA', 'side-port'),
    placement: {
      mode: 'flange',
      flange: {
        kind: 'side_flange',
        section: 'S2',
        angleDeg: 90,
        radiusMm: 2_000,
        zMm: 500,
        thetaDeg: 180,
      },
    },
    localOffsetMm: [-500, 100, 200],
    worldOffsetMm: [10, 20, 30],
  };
  const pose = resolveDiagView2Pose(design);
  approximateVector(pose.basePositionM, [0, 2, 0.5]);
  // -500 dR moves along +0.5*n. At theta=180 n points radially inward.
  approximateVector(pose.positionM, [-0.09, 1.52, 0.33], 1e-9);
  approximateVector(pose.normal, [0, -1, 0], 1e-10);
  approximate(length(pose.n), 1);
  approximate(length(pose.u), 1);
  approximate(length(pose.v), 1);
  approximate(dot(pose.n, pose.v), 0);
  approximate(dot(pose.u, pose.v), 0);
  assert.notEqual(dot(pose.n, pose.u), 0,
    'source recomputes u from the offset apex while retaining the original flange normal');

  const mid: DiagView2DiagnosticDesign = {
    ...createDefaultDiagView2Design('ARRAY', 'mid-port'),
    placement: {
      mode: 'flange',
      flange: {
        kind: 'mid_flange', section: 'M1', angleDeg: 271,
        xMm: 3_000, yMm: 4_000, zMm: -250, thetaDeg: 0,
      },
    },
  };
  const midPose = resolveDiagView2Pose(mid);
  approximateVector(midPose.positionM, [3, 4, -0.25]);
  // The source derives eR from X/Y for a mid flange; its Angle cell does not
  // replace the explicit Cartesian position.
  approximateVector(midPose.normal, [0.6, 0.8, 0]);
});

test('ray rotation follows the source Rroll * Rpitch * Ryaw column-vector order', () => {
  const design: DiagView2DiagnosticDesign = {
    ...createDefaultDiagView2Design('CAMERA', 'rotated'),
    rotationDeg: [10, 20, 30],
  };
  const pose = resolveDiagView2Pose(design);
  const actual = buildDiagView2PreviewRays(design)[0].direction;
  let expected = pose.n;
  expected = rotate(expected, pose.v, 20);
  expected = rotate(expected, pose.u, 10);
  expected = normalize(rotate(expected, pose.n, 30));
  approximateVector(actual, expected);
  const frame = resolveDiagView2RotatedFrame(design);
  approximateVector(frame.n, expected);
  approximateVector(frame.u, normalize(rotate(rotate(rotate(pose.u, pose.v, 20), pose.u, 10), pose.n, 30)));
});

test('array emits the exact configured 2..201 inclusive channel contract', () => {
  const base = createDefaultDiagView2Design('ARRAY');
  assert.equal(buildDiagView2TraceRays(base).length, 21);
  const two: DiagView2DiagnosticDesign = {
    ...base,
    array: { ...base.array!, rayCount: 2, vStartDeg: -30, vEndDeg: 45 },
  };
  const rays = buildDiagView2PreviewRays(two);
  assert.deepEqual(rays.map((ray) => ray.rayId), ['ch_0', 'ch_1']);
  assert.deepEqual(rays.map((ray) => ray.channelIndex), [0, 1]);
  assert.deepEqual(rays.map((ray) => ray.vAngleDeg), [-30, 45]);

  const maximum = { ...base, array: { ...base.array!, rayCount: 201 } };
  assert.equal(buildDiagView2TraceRays(maximum).length, 201);
  assert.throws(
    () => buildDiagView2TraceRays({ ...base, array: { ...base.array!, rayCount: 202 } }),
    /rayCount: expected 2 <= value <= 201/,
  );
});

test('laser custom coordinates are absolute millimetres and bypass local rotation', () => {
  const base = createDefaultDiagView2Design('LASER');
  const design: DiagView2DiagnosticDesign = {
    ...base,
    rotationDeg: [45, -30, 80],
    laser: {
      ...base.laser!,
      customPathPointsMm: [[2_000, 0, 0], [2_000, 1_000, 0]],
    },
  };
  const rays = buildDiagView2TraceRays(design);
  assert.equal(rays.length, 2);
  approximateVector(rays[0].originM, [2.55, 0, 0]);
  approximateVector(rays[0].defaultEndpointM, [2, 0, 0]);
  approximateVector(rays[0].direction, [-1, 0, 0]);
  approximate(rays[0].defaultLengthM, 0.55);
  approximateVector(rays[1].originM, [2, 0, 0]);
  approximateVector(rays[1].defaultEndpointM, [2, 1, 0]);
  approximateVector(rays[1].direction, [0, 1, 0]);

  const duplicatePoint = {
    ...base,
    laser: { ...base.laser!, customPathPointsMm: [[2_550, 0, 0]] as const },
  };
  assert.throws(() => buildDiagView2TraceRays(duplicatePoint), /zero-length segment/);
});

test('v2 geometry storage migrates losslessly into the typed enhanced v3 store', () => {
  const v2 = {
    version: 2,
    diagnostics: [{
      name_suffix: 'camera-a',
      diagnostic_type: 'CAMERA',
      params: {
        position: [1.2, -0.3, 0.8],
        normal: [-2, 0, 0],
        rotation: [3, -4, 5],
        h_start: -25,
        h_end: 35,
        v_start: -12,
        v_end: 18,
        length: 7,
      },
    }],
  };
  const migrated = parseDiagView2DesignFile(v2);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.migratedFromVersion, 2);
  assert.equal(migrated.diagnostics[0].nameSuffix, 'camera-a');
  assert.deepEqual(migrated.diagnostics[0].placement, {
    mode: 'explicit', positionM: [1.2, -0.3, 0.8], normal: [-1, 0, 0],
  });
  assert.deepEqual(migrated.diagnostics[0].camera, {
    hStartDeg: -25, hEndDeg: 35, vStartDeg: -12, vEndDeg: 18, lengthM: 7,
  });
  assert.deepEqual(migrated.diagnostics[0].display, {
    colorHex: '#61d6a7', opacity: 0.6, visible: true,
  });

  const v3Json = serializeDiagView2DesignFile(migrated);
  assert.doesNotMatch(v3Json, /NaN|Infinity/);
  const v3 = parseDiagView2DesignFile(v3Json);
  assert.equal(v3.migratedFromVersion, undefined);
  assert.deepEqual(v3.diagnostics, migrated.diagnostics);
  assert.match(v3Json, /868d74d5e0e6c9abaec0eb623bcdd13ead771c79/);
  assert.match(v3Json, /"display"/);

  const laserV2 = parseDiagView2DesignFile({
    version: 2,
    diagnostics: [{
      name_suffix: 'laser-a', diagnostic_type: 'laser',
      params: {
        position: [1, 0, 0], normal: [-1, 0, 0],
        laser_diameter_mm: 80, laser_length: 4,
        laser_points: [[2, 3, 4]],
      },
    }],
  });
  assert.deepEqual(laserV2.diagnostics[0].laser?.customPathPointsMm, [[2_000, 3_000, 4_000]]);
});

test('enhanced v3 persists an independent validated display style for every diagnostic', () => {
  const diagnostics = (['CAMERA', 'ARRAY', 'LASER'] as const).map((type, index) => ({
    ...createDefaultDiagView2Design(type, `style-${type.toLowerCase()}`),
    display: {
      colorHex: ['#123456', '#abcdef', '#ff735d'][index],
      opacity: [0.2, 0.55, 0.9][index],
      visible: index !== 1,
    },
  }));
  const roundTrip = parseDiagView2DesignFile(serializeDiagView2DesignFile(diagnostics));
  assert.deepEqual(roundTrip.diagnostics.map((item) => item.display), diagnostics.map((item) => item.display));

  const invalidStyle = JSON.parse(serializeDiagView2DesignFile(diagnostics));
  invalidStyle.diagnostics[0].display.colorHex = 'green';
  assert.throws(() => parseDiagView2DesignFile(invalidStyle), /display\.colorHex: expected #RRGGBB/);
  invalidStyle.diagnostics[0].display.colorHex = '#123456';
  invalidStyle.diagnostics[0].display.opacity = 1.01;
  assert.throws(() => parseDiagView2DesignFile(invalidStyle), /display\.opacity: expected 0 <= value <= 1/);
  invalidStyle.diagnostics[0].display.opacity = 0.5;
  invalidStyle.diagnostics[0].display.visible = 'yes';
  assert.throws(() => parseDiagView2DesignFile(invalidStyle), /display\.visible: expected a boolean/);
});

test('ray results preserve triangle, face normal and incidence and feed every report format', () => {
  const design = {
    ...createDefaultDiagView2Design('CAMERA', 'camera-<unsafe>'),
    placement: { mode: 'explicit', positionM: [0, 2, 1], normal: [0, -1, 0] },
  } satisfies DiagView2DiagnosticDesign;
  const ray = buildDiagView2TraceRays(design)[0];
  const result = createDiagView2RayResult(ray, {
    hitModel: 'Vacuum Vessel <shell>',
    hitPointM: [0, 1, 1],
    hitDistanceM: 1,
    triangleIndex: 42,
    hitFaceNormal: [0, 1, 0],
  });
  assert.equal(result.hasIntersection, true);
  assert.equal(result.triangleIndex, 42);
  assert.deepEqual(result.hitFaceNormal, [0, 1, 0]);
  approximate(result.incidenceAngleDeg!, 0);
  approximateVector(result.effectiveEndpointM, [0, 1, 1]);

  const report = buildDiagView2Report(design, [result], {
    deviceName: 'EHL-2 & test',
    createdAt: '2026-08-21T08:30:00.000Z',
    intersectionMode: 'render-state',
    poloidalReferenceMajorRadiusM: 1,
  });
  assert.deepEqual(report.summary, { rayCount: 1, hitCount: 1, intersectionStatus: 'completed', virtualOutput: true });
  assert.equal(report.rays[0].triangleIndex, 42);
  assert.deepEqual(report.rays[0].hitPointMm, [0, 1_000, 1_000]);
  approximate(report.rays[0].hitToroidalAngleDeg!, 90);
  approximate(report.rays[0].hitPoloidalAngleDeg!, 90);
  assert.equal(report.meta.poloidalReferenceMajorRadiusM, 1);
  assert.equal(report.meta.hitAngleDefinition, 'toroidal=atan2(Y,X); poloidal=atan2(Z,sqrt(X^2+Y^2)-R_major)');
  assert.equal(report.meta.reportId, 'CAM_20260821T083000Z');
  assert.equal(report.meta.intersectionMode, 'render-state');
  const json = reportToJson(report);
  assert.doesNotMatch(json, /NaN|Infinity/);
  assert.match(json, /"triangleIndex": 42/);
  assert.match(json, /"intersectionMode": "render-state"/);
  assert.match(json, /"hitToroidalAngleDeg": 90/);
  assert.match(json, /"hitPoloidalAngleDeg": 90/);
  const csv = reportToCsv(report);
  assert.match(csv, /Triangle_Index/);
  assert.match(csv, /Vacuum Vessel <shell>,42/);
  assert.match(csv, /# Intersection_Mode:,render-state/);
  assert.match(csv, /# Hit_Angle_Definition:,"toroidal=atan2\(Y,X\); poloidal=atan2\(Z,sqrt\(X\^2\+Y\^2\)-R_major\)"/);
  assert.match(csv, /# Poloidal_Reference_R_Major_m:,1/);
  assert.match(csv, /Hit_X_mm,Hit_Y_mm,Hit_Z_mm,Hit_Distance_mm,Hit_Toroidal_Angle_deg,Hit_Poloidal_Angle_deg/);
  assert.match(csv, /# Design_ID:,camera-<unsafe>/);
  assert.match(csv, /# Diagnostic_Name:,camera-<unsafe>/);
  assert.match(csv, /# Placement_Mode:,explicit/);
  assert.match(csv, /# Optical_Centre_m:,/);
  assert.match(csv, /# Normal:,/);
  assert.match(csv, /# Local_Offset_dR_dY_dZ_mm:,0 \/ 0 \/ 0/);
  assert.match(csv, /# World_Offset_dX_dY_dZ_mm:,0 \/ 0 \/ 0/);
  assert.match(csv, /# Rotation_Pitch_Yaw_Roll_deg:,0 \/ 0 \/ 0/);
  assert.match(csv, /# Camera_H_Start_deg:,-20/);
  assert.match(csv, /# Camera_V_End_deg:,20/);
  assert.match(csv, /# Camera_Length_m:,5/);
  assert.match(csv, /# Display_Opacity:,0\.6/);
  assert.match(csv, /# Display_Visible:,true/);
  const csvLines = csv.trimEnd().split('\r\n');
  const csvHeader = csvLines.find((line) => line.startsWith('Ray_ID,'));
  const csvRay = csvLines.find((line) => line.startsWith('optical_axis,'));
  assert.ok(csvHeader && csvRay);
  const csvColumns = csvHeader.split(',');
  const csvValues = csvRay.split(',');
  assert.equal(csvValues.length, csvColumns.length, 'CSV headers and report-ray fields must stay aligned');
  approximate(Number(csvValues[csvColumns.indexOf('Hit_Toroidal_Angle_deg')]), 90);
  approximate(Number(csvValues[csvColumns.indexOf('Hit_Poloidal_Angle_deg')]), 90);
  const html = reportToHtml(report);
  assert.match(html, /Virtual output/);
  assert.match(html, /EHL-2 &amp; test/);
  assert.match(html, /Vacuum Vessel &lt;shell&gt;/);
  assert.match(html, /<dt>Intersection mode<\/dt><dd>render-state<\/dd>/);
  assert.match(html, /<dt>Hit angle definition<\/dt><dd>toroidal=atan2\(Y,X\); poloidal=atan2\(Z,sqrt\(X\^2\+Y\^2\)-R_major\)<\/dd>/);
  assert.match(html, /<dt>Poloidal reference R major \(m\)<\/dt><dd>1\.000000<\/dd>/);
  assert.match(html, /<th>Hit point XYZ \(mm\)<\/th>/);
  assert.match(html, /<th>Hit distance \(mm\)<\/th>/);
  assert.match(html, /<th>Toroidal hit angle \(deg\)<\/th>/);
  assert.match(html, /<th>Poloidal hit angle \(deg\)<\/th>/);
  assert.match(html, /Vacuum Vessel &lt;shell&gt;<\/td>\s*<td>42<\/td>\s*<td>0\.000, 1000\.000, 1000\.000<\/td>\s*<td>1000\.000<\/td>\s*<td>90\.000<\/td>\s*<td>90\.000<\/td>/,
    'single-diagnostic HTML must expose the source report hit point, distance and both hit angles');
  assert.match(html, /<dt>Design ID<\/dt><dd>camera-&lt;unsafe&gt;<\/dd>/);
  assert.match(html, /<dt>World Offset dX dY dZ mm<\/dt><dd>0 \/ 0 \/ 0<\/dd>/);
  assert.match(html, /<dt>Camera Length m<\/dt><dd>5<\/dd>/);
  assert.match(html, /<dt>Camera H Start deg<\/dt><dd>-20<\/dd>/);
  assert.match(html, /<dt>Local Offset dR dY dZ mm<\/dt><dd>0 \/ 0 \/ 0<\/dd>/);
  assert.doesNotMatch(html, /Vacuum Vessel <shell>/);

  assert.throws(
    () => buildDiagView2Report(design, []),
    /completed CAD analysis results are required/,
    'a report must never serialize an unexecuted trace as an all-miss result',
  );

  assert.throws(() => createDiagView2RayResult(ray, {
    hitModel: 'VV', hitPointM: [0, 1, 1], hitDistanceM: 0.8,
    triangleIndex: 1, hitFaceNormal: [0, 1, 0],
  }), /does not match the projected hit point/);
  assert.throws(
    () => buildDiagView2Report(design, [result], { poloidalReferenceMajorRadiusM: -1 }),
    /report\.poloidalReferenceMajorRadiusM/,
  );
});

test('LASER exports geometry without fabricating CAD misses', () => {
  const design = {
    ...createDefaultDiagView2Design('LASER', 'laser-geometry'),
    laser: {
      diameterMm: 120,
      lengthM: 5,
      customPathPointsMm: [[2_000, 100, 0], [2_500, 250, 300]] as const,
    },
  } satisfies DiagView2DiagnosticDesign;
  const report = buildDiagView2Report(design, [], {
    deviceName: 'EHL-2',
    createdAt: '2026-08-21T08:30:00.000Z',
  });
  assert.equal(report.meta.intersectionMode, 'not-applicable');
  assert.equal(report.meta.poloidalReferenceMajorRadiusM, 0.95,
    'without an active plasma override the report must disclose the exact audited source default R0');
  assert.equal(report.summary.intersectionStatus, 'not-applicable');
  assert.equal(report.summary.rayCount, 2);
  assert.equal(report.summary.hitCount, 0);
  assert.deepEqual(report.rays.map((ray) => ray.role), ['path_segment', 'path_segment']);
  assert.deepEqual(report.rays.map((ray) => ray.channelIndex), [0, 1]);
  assert.ok(report.rays.every((ray) => ray.hitToroidalAngleDeg === null && ray.hitPoloidalAngleDeg === null),
    'geometry-only laser segments must not fabricate hit angles');
  assert.match(reportToCsv(report), /# Intersection_Status:,not-applicable/);
  assert.match(reportToCsv(report), /# Laser_Diameter_mm:,120/);
  assert.match(reportToCsv(report), /# Laser_Path_Segment_Count:,2/);
  assert.match(reportToCsv(report), /# Laser_Total_Path_Length_m:,/);
  assert.match(reportToHtml(report), /Laser diameter \(mm\)<\/dt><dd>120\.000/);
  assert.match(reportToJson(report), /"intersectionStatus": "not-applicable"/);
  assert.throws(
    () => buildDiagView2Report(design, [createDiagView2RayResult(buildDiagView2PreviewRays(design)[0])]),
    /LASER geometry reports do not accept CAD intersection results/,
  );
});

test('multi-diagnostic HTML preserves not-run and exploratory states without promoting them to formal evidence', () => {
  const camera = { ...createDefaultDiagView2Design('CAMERA', 'camera-project'), nameSuffix: '<camera>' };
  const laser = createDefaultDiagView2Design('LASER', 'laser-project');
  const pending = createDefaultDiagView2Design('ARRAY', 'pending-project');
  const cameraReport = buildDiagView2Report(
    camera,
    [createDiagView2RayResult(buildDiagView2PreviewRays(camera)[0])],
    { createdAt: '2026-08-21T00:00:00.000Z', intersectionMode: 'source-cad' },
  );
  const laserReport = buildDiagView2Report(laser, [], { createdAt: '2026-08-21T00:00:00.000Z' });
  const html = projectReportsToHtml([
    { design: camera, analysisStatus: 'completed', report: cameraReport },
    { design: laser, analysisStatus: 'not-applicable', report: laserReport },
    { design: pending, analysisStatus: 'not-run', report: null },
    { design: { ...pending, id: 'exploratory', nameSuffix: 'exploratory' }, analysisStatus: 'exploratory-completed', report: null },
  ], { deviceName: 'EHL-2', createdAt: '2026-08-21T00:00:00.000Z' });

  assert.match(html, /DiagView2 multi-diagnostic project report/);
  assert.match(html, /&lt;camera&gt;/);
  assert.match(html, /Completed against all source CAD/);
  assert.match(html, /Geometry only; CAD intersection is not applicable/);
  assert.match(html, /No formal ray result is attached to this section/);
  assert.match(html, /Exploratory render-state result; excluded from formal evidence/);
  assert.match(html, /<dt>Design ID<\/dt><dd>camera-project<\/dd>/,
    'the project report must retain per-diagnostic design metadata, not only ray-hit rows');
  assert.match(html, /<dt>Laser Diameter mm<\/dt><dd>100<\/dd>/,
    'the combined report must preserve laser geometry even when CAD intersection is not applicable');
  assert.match(html, /<dt>Array Ray Count<\/dt><dd>21<\/dd>/,
    'a not-run snapshot must still document its diagnostic configuration without inventing evidence');
  assert.doesNotMatch(html, /<camera>/);
  assert.throws(
    () => projectReportsToHtml([{ design: camera, analysisStatus: 'completed', report: null }]),
    DiagView2ValidationError,
  );
  assert.throws(
    () => projectReportsToHtml([{ design: pending, analysisStatus: 'exploratory-completed', report: cameraReport }]),
    DiagView2ValidationError,
  );
});

test('GEQDSK parsing preserves R-fast file order, SI units and normalized flux', () => {
  const psi = [
    2, 2, 2,
    1, 0, 1,
    2, 2, 2,
  ];
  const gfile = parseDiagView2Geqdsk(buildGeqdskText(psi, { trailing: [999] }));
  assert.equal(gfile.caseName, 'SYNTHETIC EHL2 TEST');
  assert.equal(gfile.nw, 3);
  assert.equal(gfile.nh, 3);
  assert.deepEqual([...gfile.rM], [0.5, 1, 1.5]);
  assert.deepEqual([...gfile.zM], [-1, 0, 1]);
  assert.deepEqual([...gfile.psirz], psi);
  assert.deepEqual([...gfile.psiNorm], psi);
  assert.equal(gfile.rmaxisM, 1);
  assert.equal(gfile.bcentrT, 2);
  assert.equal(gfile.currentA, 100_000);
  assert.equal(gfile.trailingTokenCount, 1);
});

test('rho and all four source mathematical profiles zero values outside the LCFS', () => {
  assert.deepEqual([...computeDiagView2Rho([-1, 0, 0.25, 1, 2])], [0, 0, 0.5, 1, 1]);
  const psi = [
    2, 2, 2,
    1, 0.25, 1,
    2, 2, 2,
  ];
  const gfile = parseDiagView2Geqdsk(buildGeqdskText(psi));
  const expectedShapeAtRhoHalf = {
    linear: 0.5,
    parabolic: 0.75,
    'square-parabolic': 0.5625,
    'flat-center': (1 - 0.5 ** 4) ** 2,
  } as const;
  for (const [model, shape] of Object.entries(expectedShapeAtRhoHalf)) {
    const profile = buildDiagView2MathProfile(
      gfile,
      model as keyof typeof expectedShapeAtRhoHalf,
      10,
      2,
    );
    approximate(profile.values[4], 2 + 8 * shape);
    approximate(profile.values[3], 2, 1e-12);
    assert.equal(profile.values[1], 0, `${model} must zero psi_norm > 1`);
    assert.equal(profile.authority, 'virtual-software');
    assert.equal(profile.unit, 'relative-emissivity');
  }

  const bounded = parseDiagView2Geqdsk(buildGeqdskText(
    new Array(9).fill(0),
    { boundary: [[0.75, -0.25], [1.25, -0.25], [1.25, 0.25], [0.75, 0.25]] },
  ));
  const boundedProfile = buildDiagView2MathProfile(bounded, 'linear', 1, 1);
  assert.equal(boundedProfile.values[4], 1, 'magnetic-axis grid point lies inside the supplied LCFS');
  assert.equal(boundedProfile.values[3], 0, 'point outside the supplied LCFS polygon must be zero');
  assert.equal(boundedProfile.values[5], 0, 'point above the supplied LCFS polygon must be zero');

  const explicitlyClosed = parseDiagView2Geqdsk(buildGeqdskText(
    new Array(9).fill(0),
    { boundary: [[0.75, -0.25], [1.25, -0.25], [1.25, 0.25], [0.75, 0.25], [0.75, -0.25]] },
  ));
  const closedProfile = buildDiagView2MathProfile(explicitlyClosed, 'linear', 1, 1);
  assert.deepEqual([...closedProfile.values], [...boundedProfile.values],
    'an explicit repeated LCFS endpoint must not turn its zero-length closing edge into an all-domain match');
});

test('5 mm R-Z marching stops at the center post and returns sparse weights and normalized virtual signals', () => {
  const gfile = parseDiagView2Geqdsk(buildGeqdskText(new Array(9).fill(0)));
  const profile = buildDiagView2MathProfile(gfile, 'linear', 1, 1);
  const base = createDefaultDiagView2Design('ARRAY', 'forward-array');
  const design: DiagView2DiagnosticDesign = {
    ...base,
    placement: { mode: 'explicit', positionM: [2, 0, 0], normal: [-1, 0, 0] },
    array: { ...base.array!, vStartDeg: 0, vEndDeg: 0, rayCount: 2 },
  };
  const progress: number[] = [];
  const result = runDiagView2VirtualForwardModel(design, gfile, profile, {
    stepM: 0.005,
    maxLengthM: 3,
    control: { onProgress: ({ fraction }) => progress.push(fraction) },
  });
  assert.equal(result.authority, 'virtual-software');
  assert.equal(result.model, 'axisymmetric-rz-ray-marching');
  assert.equal(result.stepM, 0.005);
  assert.deepEqual(progress, [0, 0.5, 1]);
  assert.equal(result.rays.length, 2);
  assert.equal(result.weights.length, 2);
  result.weights.forEach((row) => {
    approximate(row.centerPostBlockDistanceM!, 1.75);
    approximate(row.sampledLengthM, 1.5, 2e-7);
    assert.ok(row.cellIndices.length > 0);
    assert.equal(row.cellIndices.length, row.pathLengthsM.length);
  });
  approximate(result.signals[0], 1.5, 2e-7);
  approximate(result.signals[1], 1.5, 2e-7);
  assert.deepEqual([...result.normalizedSignals], [1, 1]);
  approximate(result.normalizationReferenceSignal, 1.5, 2e-7);
  assert.equal(result.signalUnit, 'relative-emissivity·m');
  assert.match(result.warnings.join(' '), /not an experimental measurement/i);
  assert.match(result.warnings.join(' '), /CHERAB\/ADAS is not implemented/i);

  const cameraWeights = computeDiagView2VirtualWeights(
    createDefaultDiagView2Design('CAMERA'),
    gfile,
    { stepM: 0.05, maxLengthM: 1, maxTotalSamples: 3_000 },
  );
  assert.equal(cameraWeights.rays.length, 141);
  assert.equal(cameraWeights.weights.length, 141);
});

test('virtual projection supports cooperative abort and rejects runaway sample budgets', () => {
  const gfile = parseDiagView2Geqdsk(buildGeqdskText(new Array(9).fill(0)));
  const design = createDefaultDiagView2Design('ARRAY');
  assert.throws(
    () => computeDiagView2VirtualWeights(design, gfile, {
      control: { shouldAbort: () => true },
    }),
    DiagView2AbortError,
  );
  assert.throws(
    () => computeDiagView2VirtualWeights(design, gfile, {
      stepM: 0.005,
      maxLengthM: 10,
      maxTotalSamples: 100,
    }),
    /conservative samples exceed maxTotalSamples/,
  );
  assert.throws(
    () => runDiagView2VirtualForwardModel(
      createDefaultDiagView2Design('LASER'),
      gfile,
      buildDiagView2MathProfile(gfile),
    ),
    /supports CAMERA and ARRAY only/,
  );
});

test('all external parsers fail closed on malformed, non-finite and unreviewed input', () => {
  assert.throws(() => parseDiagView2DesignFile('{'), DiagView2ValidationError);
  assert.throws(() => parseDiagView2DesignFile({
    version: 2,
    diagnostics: [{
      name_suffix: 'bad', diagnostic_type: 'CAMERA',
      params: {
        position: [Number.NaN, 0, 0], normal: [-1, 0, 0], rotation: [0, 0, 0],
        h_start: -20, h_end: 20, v_start: -10, v_end: 20, length: 5,
      },
    }],
  }), /expected a finite number/);
  assert.throws(() => parseDiagView2DesignFile({
    version: 3,
    schema: 'fusiondigital.diagview2-design',
    source: {
      branch: 'origin/digView2',
      commit: 'unreviewed',
      compatibility: 'browser-reconstruction',
    },
    diagnostics: [createDefaultDiagView2Design()],
  }), /unreviewed DiagView2 source revision/);
  assert.throws(() => parseDiagView2DesignFile({
    version: 3,
    schema: 'fusiondigital.diagview2-design',
    diagnostics: [createDefaultDiagView2Design()],
  }), /design file.source: expected an object/);
  assert.throws(() => buildDiagView2TraceRays({
    ...createDefaultDiagView2Design(),
    camera: {
      ...createDefaultDiagView2Design().camera!,
      vEndDeg: 90,
    },
  }), /tan\(\) singularity/);
  assert.throws(() => resolveDiagView2Pose({
    ...createDefaultDiagView2Design(),
    placement: { mode: 'explicit', positionM: [0, 0, 0], normal: [0, 0, 0] },
  }), /zero-length vector/);
  assert.throws(() => parseDiagView2Geqdsk('short'), /48-character case field/);
  assert.throws(() => parseDiagView2Geqdsk(buildGeqdskText(
    new Array(9).fill(0),
    { simag: 1, sibry: 1 },
  )), /non-zero normalization span/);
});
