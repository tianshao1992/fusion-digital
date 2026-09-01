import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEVICE_ID = "exl50u-general-assembly-20260630";

async function readJson(pathname) {
  return JSON.parse(await readFile(join(ROOT, pathname), "utf8"));
}

test("EXL-50U general assembly remains metadata-only until reviewed assets exist", async () => {
  const [catalog, profile, sensorManifest, runtimeLock] = await Promise.all([
    readJson("public/models/device-catalog.json"),
    readJson("scripts/exl50u-assembly/profile.public.json"),
    readJson("public/models/exl50u-sensor-points-v1/manifest.json"),
    readJson("assets/runtime-assets.lock.json"),
  ]);
  const device = catalog.devices.find((candidate) => candidate.id === DEVICE_ID);
  assert.ok(device);
  assert.equal(profile.deviceId, DEVICE_ID);
  assert.equal(device.availability, "pipeline-ready-assets-pending");
  assert.equal(device.delivery, "local-only");
  assert.deepEqual(device.viewer, {
    mode: "metadata-only",
    manifestEndpoint: null,
    turntableManifestEndpoint: null,
    overlayEligible: false,
  });
  assert.deepEqual(device.physicsOverlays, []);
  assert.equal(device.diagnosticWorkspace, null);
  assert.match(device.copy, /共同装配原点/);
  assert.match(device.copy, /不会复用现有 EXL‑50U 的 EFIT、历史端口或 76 个名义测点坐标合同/);
  assert.match(device.fileSummary, /当前无可加载 GLB/);

  assert.equal(profile.systems.length, 8);
  assert.equal(new Set(profile.systems.map((system) => system.id)).size, 8);
  assert.equal(new Set(profile.systems.map((system) => system.nodeName)).size, 8);
  assert.equal(new Set(profile.systems.map((system) => system.color)).size, 8);
  assert.equal(
    profile.systems.reduce((sum, system) => sum + system.previewTriangleBudget, 0),
    profile.budgets.previewTriangles,
  );
  assert.equal(
    profile.systems.reduce((sum, system) => sum + system.highTriangleBudget, 0),
    profile.budgets.highTriangles,
  );

  const publicProjection = JSON.stringify({ device, profile });
  assert.doesNotMatch(
    publicProjection,
    /[A-Za-z]:[\\/]|file:\/\/|privateTopLevelLabel|sourceAssembly|sourceSha256|auditSha256|\.private\.json/i,
  );
  assert.equal(sensorManifest.delivery?.existingDeviceModelOnly, true);
  assert.ok(
    runtimeLock.externalBundles.every((bundle) => bundle.id !== "exl50u-general-assembly-v1"),
    "no external runtime bundle may be enabled before real assembly assets pass review",
  );
});

test("analytics accepts and labels the pending general-assembly card without enabling geometry", async () => {
  const sources = await Promise.all([
    readFile(join(ROOT, "app/analytics/contracts.ts"), "utf8"),
    readFile(join(ROOT, "app/analytics/content-labels.ts"), "utf8"),
    readFile(join(ROOT, "deploy/aliyun-hk/analytics-collector.mjs"), "utf8"),
    readFile(join(ROOT, "deploy/aliyun-hk/analytics-store.mjs"), "utf8"),
  ]);
  for (const source of sources) assert.match(source, new RegExp(DEVICE_ID));
  assert.match(sources[1], /EXL-50U 总装（2026-06-30）/);
  assert.match(sources[3], /EXL-50U 总装（2026-06-30）/);
});
