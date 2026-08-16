import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../public/data/exl50u-efit/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
const expectedCounts = new Map([[18301, 973], [18303, 691], [18304, 253], [18308, 441]]);
const expectedRanges = new Map([[18301, [100, 1100]], [18303, [100, 1133]], [18304, [101, 359]], [18308, [100, 564]]]);
const expectedBaseHashes = new Map([
  [18301, "069e4bab854b3a880bccc68790ae84706e07e86fbabe083d87a3a9e79686bf81"],
  [18303, "99191a749d35ec6136300dcfa00e8cedc47e6c105109241ec9b2334abff43a5a"],
  [18304, "d61559312cea79a3e94ed4b714f542fa6959b77bf447c1ac79b5806bf2f27e31"],
  [18308, "90da2a61bbe8a962a9a4c94344234bd929586887d293393c12585772523e8174"],
]);

test("EFIT manifest locks source provenance and public-safe derivation", () => {
  assert.equal(manifest.schemaVersion, "exl50u.efit.contours.v1");
  assert.equal(manifest.provenance.sourceArchiveSha256, "5304a47e15613963d27238f7ff691e020b8befd9bdceb57155046517edbdb09f");
  assert.equal(manifest.provenance.sourceGFileCount, 2358);
  assert.match(manifest.provenance.distributionPolicy, /Raw experimental files are not distributed/);
  assert.equal(manifest.coordinateSystem.threeJsMapping, "x=R*cos(phi), y=Z, z=-R*sin(phi)");
  assert.match(manifest.coordinateSystem.cadRegistration, /separately versioned T_CAD_FROM_EFIT/);
  assert.equal(manifest.binaryLayout.endianness, "little");
  assert.deepEqual(manifest.binaryLayout.surfacePsiN, [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]);
  assert.equal(manifest.extensions.topology.schemaVersion, "exl50u.efit.topology.v1");
  assert.equal(manifest.extensions.topology.optional, true);
  assert.deepEqual(manifest.extensions.topology.availableShots, [18303]);
  assert.equal(manifest.extensions.topology.source, "derived-from-psirz");
  assert.match(manifest.extensions.topology.derivation.strictDoubleNullPolicy, /Not granted/);
  assert.match(manifest.extensions.topology.derivation.strikePoints, /no extrapolation/i);
  assert.equal(manifest.extensions.topology.binaryLayout.frameHeaderBytes, 160);
  assert.equal(manifest.extensions.topology.binaryLayout.frameStrideBytes, 2208);
  assert.equal(manifest.extensions.topology.binaryLayout.pointsPerLeg, 64);
});

for (const shot of manifest.shots) {
  test(`shot ${shot.shot} binary has exact layout, hash, times and finite valid contours`, async () => {
    assert.equal(shot.frameCount, expectedCounts.get(shot.shot));
    assert.equal(shot.binary.sha256, expectedBaseHashes.get(shot.shot), "topology extension must not rewrite base binaries");
    assert.equal(shot.binary.url, `/device-data/exl50u-efit/shot-${shot.shot}.bin`);
    assert.deepEqual(shot.timeRangeMs, expectedRanges.get(shot.shot));
    assert.equal(shot.availableTimesMs.length, shot.frameCount);
    assert.equal(new Set(shot.availableTimesMs).size, shot.frameCount);
    assert.ok(shot.availableTimesMs.every((time, index, times) => index === 0 || time > times[index - 1]));
    assert.deepEqual(
      shot.gaps,
      shot.availableTimesMs.slice(1).flatMap((time, index) => {
        const previous = shot.availableTimesMs[index];
        return time > previous + 1 ? [{ afterMs: previous, beforeMs: time, missingCount: time - previous - 1 }] : [];
      }),
    );

    const data = await readFile(new URL(`shot-${shot.shot}.bin`, root));
    assert.equal(data.byteLength, shot.binary.byteLength);
    assert.equal(data.byteLength, shot.binary.fileHeaderBytes + shot.frameCount * shot.binary.frameStrideBytes);
    assert.equal(createHash("sha256").update(data).digest("hex"), shot.binary.sha256);
    assert.equal(data.subarray(0, 8).toString("ascii"), "EXL50EF1");
    assert.equal(data.readUInt32LE(12), shot.shot);
    assert.equal(data.readUInt32LE(16), shot.frameCount);
    assert.equal(data.readUInt32LE(20), shot.binary.frameStrideBytes);

    let previousTime;
    for (let index = 0; index < shot.frameCount; index += 1) {
      const frame = shot.frames[index];
      const offset = shot.binary.fileHeaderBytes + index * shot.binary.frameStrideBytes;
      assert.equal(frame.offsetBytes, offset);
      const timeMs = data.readInt32LE(offset);
      const flags = data.readUInt32LE(offset + 4);
      const surfaceMask = data.readUInt16LE(offset + 46);
      const lcfsValidPoints = data.readUInt16LE(offset + 44);
      assert.equal(timeMs, shot.availableTimesMs[index]);
      assert.equal(timeMs, frame.timeMs);
      assert.equal(flags, frame.qualityFlags);
      assert.equal(surfaceMask, frame.surfaceMask);
      assert.equal(lcfsValidPoints, frame.lcfsValidPoints);
      assert.ok(Number.isFinite(frame.currentA));
      assert.ok(Number.isFinite(frame.rAxisM));
      assert.ok(Number.isFinite(frame.zAxisM));
      assert.ok(Number.isFinite(frame.bcentrT));
      assert.ok(Number.isFinite(frame.psiAxisWbPerRad));
      assert.ok(Number.isFinite(frame.psiBoundaryWbPerRad));
      assert.ok(Number.isFinite(frame.q95));
      assert.ok(flags & 1, "SOURCE_VALID bit must be set");
      assert.equal(Boolean(flags & 2), previousTime !== undefined && timeMs > previousTime + 1);

      for (const scalarOffset of [8,12,16,20,24,28,32]) {
        assert.ok(Number.isFinite(data.readFloatLE(offset + scalarOffset)), `finite scalar at ${scalarOffset}`);
      }
      for (let contour = 0; contour < 10; contour += 1) {
        const valid = contour === 9 ? lcfsValidPoints === 128 : Boolean(surfaceMask & (1 << contour));
        const start = offset + 64 + contour * 128 * 2 * 4;
        let finiteCount = 0;
        let zeroCount = 0;
        const points = [];
        for (let item = 0; item < 256; item += 1) {
          const value = data.readFloatLE(start + item * 4);
          assert.ok(Number.isFinite(value), "all GPU-facing contour coordinates are finite");
          finiteCount += 1;
          if (Object.is(value, 0) || Object.is(value, -0)) zeroCount += 1;
          if (item % 2 === 0) points.push([value, data.readFloatLE(start + (item + 1) * 4)]);
        }
        assert.equal(finiteCount, 256);
        if (!valid) assert.equal(zeroCount, 256, `invalid contour ${contour} is finite-safe zero-filled`);
        if (valid) {
          let twiceArea = 0;
          const segments = [];
          for (let point = 0; point < 128; point += 1) {
            const current = points[point];
            const next = points[(point + 1) % 128];
            twiceArea += current[0] * next[1] - next[0] * current[1];
            segments.push(Math.hypot(next[0] - current[0], next[1] - current[1]));
          }
          assert.ok(twiceArea > 0, `contour ${contour} has canonical counter-clockwise orientation`);
          const meanSegment = segments.reduce((sum, value) => sum + value, 0) / segments.length;
          assert.ok(Math.max(...segments) / meanSegment < 1.02, `contour ${contour} is equal-arc-length sampled`);
          if (contour === 9) {
            const radial = points.map((point) => point[0]);
            assert.equal(Math.fround(frame.lcfsRMinM), Math.min(...radial));
            assert.equal(Math.fround(frame.lcfsRMaxM), Math.max(...radial));
            assert.ok(frame.lcfsRMinM <= frame.rAxisM && frame.rAxisM <= frame.lcfsRMaxM);
          }
        }
      }
      previousTime = timeMs;
    }
  });
}

test("shot 18303 optional topology sidecar is base-bound, bounded and finite-safe", async () => {
  const shot = manifest.shots.find((item) => item.shot === 18303);
  assert.ok(shot);
  for (const other of manifest.shots.filter((item) => item.shot !== 18303)) {
    assert.equal(other.topologyBinary, undefined, `shot ${other.shot} must not advertise an absent sidecar`);
  }

  const topology = shot.topologyBinary;
  assert.equal(topology.url, "/device-data/exl50u-efit/shot-18303-topology.bin");
  assert.equal(topology.baseBinarySha256, shot.binary.sha256);
  assert.equal(topology.baseSha256PrefixHex, shot.binary.sha256.slice(0, 32));
  assert.equal(topology.fileHeaderBytes, 64);
  assert.equal(topology.frameHeaderBytes, 160);
  assert.equal(topology.frameStrideBytes, 2208);

  const data = await readFile(new URL("shot-18303-topology.bin", root));
  assert.equal(data.byteLength, topology.byteLength);
  assert.equal(data.byteLength, 64 + shot.frameCount * 2208);
  assert.equal(createHash("sha256").update(data).digest("hex"), topology.sha256);
  assert.equal(data.subarray(0, 8).toString("ascii"), "EXL50TP1");
  assert.equal(data.readUInt32LE(8), 1);
  assert.equal(data.readUInt32LE(12), 18303);
  assert.equal(data.readUInt32LE(16), shot.frameCount);
  assert.equal(data.readUInt32LE(20), 2208);
  assert.equal(data.readUInt32LE(24), 160);
  assert.equal(data.readUInt32LE(28), 4);
  assert.equal(data.readUInt32LE(32), 64);
  assert.equal(data.readUInt32LE(36), 2);
  assert.equal(data.readUInt32LE(40), 4);
  assert.equal(data.subarray(48, 64).toString("hex"), shot.binary.sha256.slice(0, 32));

  const layout = manifest.extensions.topology.binaryLayout;
  const kindCounts = new Map();
  const recordCounts = { xPoints: 0, primaryXPoints: 0, secondaryXPoints: 0, strikePoints: 0, separatrixLegs: 0 };
  let incompleteFrames = 0;
  for (let frameIndex = 0; frameIndex < shot.frameCount; frameIndex += 1) {
    const summary = shot.frames[frameIndex];
    const offset = 64 + frameIndex * 2208;
    const timeMs = data.readInt32LE(offset);
    const flags = data.readUInt32LE(offset + 4);
    const kindCode = data.readUInt8(offset + 8);
    const xPointCount = data.readUInt8(offset + 9);
    const strikePointCount = data.readUInt8(offset + 10);
    const legCount = data.readUInt8(offset + 11);
    assert.equal(timeMs, shot.availableTimesMs[frameIndex]);
    assert.equal(timeMs, summary.timeMs);
    assert.equal(flags, summary.topologyFlags);
    assert.equal(kindCode, layout.topologyKindCodes[summary.topologyKind]);
    assert.equal(xPointCount, summary.xPointCount);
    assert.equal(strikePointCount, summary.strikePointCount);
    assert.equal(legCount, summary.separatrixLegCount);
    assert.ok(xPointCount <= 2 && strikePointCount <= 4 && legCount <= 4);
    kindCounts.set(summary.topologyKind, (kindCounts.get(summary.topologyKind) ?? 0) + 1);
    recordCounts.xPoints += xPointCount;
    recordCounts.strikePoints += strikePointCount;
    recordCounts.separatrixLegs += legCount;
    if (flags & (1 << layout.topologyFlagBits.INCOMPLETE_LEGS)) incompleteFrames += 1;

    const xPoints = [];
    for (let xIndex = 0; xIndex < 2; xIndex += 1) {
      const role = data.readUInt8(offset + 24 + xIndex);
      const recordOffset = offset + 32 + xIndex * 16;
      const values = [0, 4, 8, 12].map((item) => data.readFloatLE(recordOffset + item));
      assert.ok(values.every(Number.isFinite), "all X-point record floats are finite");
      if (xIndex < xPointCount) {
        assert.ok(role === layout.xPointRoleCodes.primary || role === layout.xPointRoleCodes.secondary);
        assert.ok(values[0] >= 0.2 && values[0] <= 2.2);
        assert.ok(values[1] >= -1.9 && values[1] <= 1.9);
        assert.ok(Math.abs(values[2] - 1) <= 0.01001);
        assert.ok(values[3] >= 0);
        if (role === layout.xPointRoleCodes.primary) recordCounts.primaryXPoints += 1;
        if (role === layout.xPointRoleCodes.secondary) recordCounts.secondaryXPoints += 1;
        xPoints.push({ r: values[0], z: values[1], role });
      } else {
        assert.equal(role, 0);
        assert.ok(values.every((value) => Object.is(value, 0) || Object.is(value, -0)));
      }
    }

    const strikes = [];
    for (let strikeIndex = 0; strikeIndex < 4; strikeIndex += 1) {
      const recordOffset = offset + 64 + strikeIndex * 12;
      const r = data.readFloatLE(recordOffset);
      const z = data.readFloatLE(recordOffset + 4);
      const wallSegment = data.readUInt16LE(recordOffset + 8);
      const strikeFlags = data.readUInt16LE(recordOffset + 10);
      assert.ok(Number.isFinite(r) && Number.isFinite(z));
      if (strikeIndex < strikePointCount) {
        assert.ok(r >= 0.27 && r <= 1.351);
        assert.ok(z >= -1.63 && z <= 1.63);
        assert.ok(wallSegment < manifest.geometry.limiterRzM.length / 2 - 1);
        assert.equal(strikeFlags, 3, "strike is both an exact segment hit and a limiter proxy");
        strikes.push({ r, z });
      } else {
        assert.ok(Object.is(r, 0) || Object.is(r, -0));
        assert.ok(Object.is(z, 0) || Object.is(z, -0));
        assert.equal(wallSegment, 0);
        assert.equal(strikeFlags, 0);
      }
    }

    for (let legIndex = 0; legIndex < 4; legIndex += 1) {
      const validPoints = data.readUInt8(offset + 12 + legIndex);
      const xPointIndex = data.readUInt8(offset + 16 + legIndex);
      const strikePointIndex = data.readUInt8(offset + 20 + legIndex);
      const payloadOffset = offset + 160 + legIndex * 64 * 2 * 4;
      const points = [];
      let zeroCount = 0;
      for (let pointIndex = 0; pointIndex < 64; pointIndex += 1) {
        const r = data.readFloatLE(payloadOffset + pointIndex * 8);
        const z = data.readFloatLE(payloadOffset + pointIndex * 8 + 4);
        assert.ok(Number.isFinite(r) && Number.isFinite(z), "all GPU-facing leg coordinates are finite");
        if ((Object.is(r, 0) || Object.is(r, -0)) && (Object.is(z, 0) || Object.is(z, -0))) zeroCount += 1;
        points.push([r, z]);
      }
      if (legIndex < legCount) {
        assert.equal(validPoints, 64);
        assert.ok(xPointIndex < xPointCount);
        assert.ok(strikePointIndex < strikePointCount);
        assert.ok(Math.hypot(points[0][0] - xPoints[xPointIndex].r, points[0][1] - xPoints[xPointIndex].z) < 2e-4);
        assert.ok(Math.hypot(points[63][0] - strikes[strikePointIndex].r, points[63][1] - strikes[strikePointIndex].z) < 2e-4);
        assert.ok(Math.hypot(points[0][0] - points[63][0], points[0][1] - points[63][1]) > 0.04, "leg stays open");
        const segments = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
        const meanSegment = segments.reduce((sum, value) => sum + value, 0) / segments.length;
        assert.ok(Math.max(...segments) / meanSegment < 1.04, "leg is equal-arc-length sampled");
      } else {
        assert.equal(validPoints, 0);
        assert.equal(zeroCount, 64, `unused leg slot ${legIndex} is finite-safe zero-filled`);
      }
    }
  }

  assert.deepEqual(Object.fromEntries([...kindCounts].sort()), shot.topologySummary.kindCounts);
  assert.deepEqual(recordCounts, shot.topologySummary.recordCounts);
  assert.equal(incompleteFrames, 5);
  assert.deepEqual(shot.topologySummary.recordCounts, {
    primaryXPoints: 206,
    secondaryXPoints: 144,
    separatrixLegs: 407,
    strikePoints: 407,
    xPoints: 350,
  });
  assert.deepEqual(shot.topologySummary.kindCounts, {
    limited: 477,
    "lower-single-null": 31,
    "near-double-null": 144,
    unknown: 8,
    "upper-single-null": 31,
  });
  assert.ok(Math.abs(shot.topologySummary.uncertaintyFloorM - 0.01677415) < 1e-7);
});

test("shot 18303 topology golden frames preserve diverted geometry and primary/secondary roles", async () => {
  const shot = manifest.shots.find((item) => item.shot === 18303);
  const data = await readFile(new URL("shot-18303-topology.bin", root));
  const readFrame = (timeMs) => {
    const frameIndex = shot.availableTimesMs.indexOf(timeMs);
    assert.notEqual(frameIndex, -1);
    const offset = 64 + frameIndex * 2208;
    const xCount = data.readUInt8(offset + 9);
    const strikeCount = data.readUInt8(offset + 10);
    return {
      summary: shot.frames[frameIndex],
      xPoints: Array.from({ length: xCount }, (_, index) => ({
        r: data.readFloatLE(offset + 32 + index * 16),
        z: data.readFloatLE(offset + 36 + index * 16),
        psiN: data.readFloatLE(offset + 40 + index * 16),
        role: data.readUInt8(offset + 24 + index),
      })),
      strikes: Array.from({ length: strikeCount }, (_, index) => ({
        r: data.readFloatLE(offset + 64 + index * 12),
        z: data.readFloatLE(offset + 68 + index * 12),
      })),
    };
  };

  const at350 = readFrame(350);
  assert.equal(at350.summary.topologyKind, "upper-single-null");
  assert.equal(at350.xPoints[0].role, 1);
  assert.ok(Math.hypot(at350.xPoints[0].r - 0.5686, at350.xPoints[0].z - 0.9070) < 0.004);
  assert.ok(Math.hypot(at350.strikes[0].r - 0.2760, at350.strikes[0].z - 1.0817) < 0.004);
  assert.ok(Math.hypot(at350.strikes[1].r - 1.0794, at350.strikes[1].z - 1.6300) < 0.004);

  const at400 = readFrame(400);
  assert.equal(at400.summary.topologyKind, "near-double-null");
  assert.deepEqual(at400.xPoints.map((point) => point.role), [1, 2]);
  assert.ok(Math.hypot(at400.xPoints[0].r - 0.6037, at400.xPoints[0].z - 0.9457) < 0.004);
  assert.ok(Math.hypot(at400.xPoints[1].r - 0.6045, at400.xPoints[1].z + 0.9334) < 0.004);
  assert.ok(Math.abs(at400.xPoints[1].psiN - 1.00264) < 0.0005);
  assert.equal(at400.summary.separatrixLegCount, 2, "secondary near-null must not fabricate a second separatrix");

  const at500 = readFrame(500);
  assert.equal(at500.summary.topologyKind, "lower-single-null");
  assert.equal(at500.xPoints.length, 1);
  assert.equal(at500.xPoints[0].role, 1);
  assert.ok(Math.hypot(at500.xPoints[0].r - 0.5727, at500.xPoints[0].z + 0.9097) < 0.004);
  assert.ok(Math.hypot(at500.strikes[0].r - 0.2812, at500.strikes[0].z + 1.0875) < 0.004);
  assert.ok(Math.hypot(at500.strikes[1].r - 1.0851, at500.strikes[1].z + 1.6300) < 0.004);
});
