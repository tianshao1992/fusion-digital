import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../public/data/exl50u-efit/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
const expectedCounts = new Map([[18301, 973], [18303, 691], [18304, 253], [18308, 441]]);
const expectedRanges = new Map([[18301, [100, 1100]], [18303, [100, 1133]], [18304, [101, 359]], [18308, [100, 564]]]);

test("EFIT manifest locks source provenance and public-safe derivation", () => {
  assert.equal(manifest.schemaVersion, "exl50u.efit.contours.v1");
  assert.equal(manifest.provenance.sourceArchiveSha256, "5304a47e15613963d27238f7ff691e020b8befd9bdceb57155046517edbdb09f");
  assert.equal(manifest.provenance.sourceGFileCount, 2358);
  assert.match(manifest.provenance.distributionPolicy, /Raw experimental files are not distributed/);
  assert.equal(manifest.coordinateSystem.threeJsMapping, "x=R*cos(phi), y=Z, z=-R*sin(phi)");
  assert.match(manifest.coordinateSystem.cadRegistration, /separately versioned T_CAD_FROM_EFIT/);
  assert.equal(manifest.binaryLayout.endianness, "little");
  assert.deepEqual(manifest.binaryLayout.surfacePsiN, [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9]);
});

for (const shot of manifest.shots) {
  test(`shot ${shot.shot} binary has exact layout, hash, times and finite valid contours`, async () => {
    assert.equal(shot.frameCount, expectedCounts.get(shot.shot));
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
        }
      }
      previousTime = timeMs;
    }
  });
}
