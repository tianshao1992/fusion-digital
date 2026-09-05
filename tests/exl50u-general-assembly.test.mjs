import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateExl50uGeneralAssemblyActivatedCard } from "../scripts/assets/activate-exl50u-general-assembly-catalog.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEVICE_ID = "exl50u-general-assembly-20260630";

async function readJson(pathname) {
  return JSON.parse(await readFile(join(ROOT, pathname), "utf8"));
}

async function readOptionalJson(pathname) {
  try {
    return await readJson(pathname);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

test("EXL-50U general assembly publication state follows the formal manifest", async () => {
  const [catalog, runtimeLock, formalManifest] = await Promise.all([
    readJson("public/models/device-catalog.json"),
    readJson("assets/runtime-assets.lock.json"),
    readOptionalJson("public/models/exl50u-general-assembly-v1/model-manifest.json"),
  ]);
  const device = catalog.devices.find((candidate) => candidate.id === DEVICE_ID);
  const lockedBundle = runtimeLock.externalBundles.find(
    (bundle) => bundle.id === "exl50u-general-assembly-v1",
  );
  assert.ok(device);
  if (formalManifest && formalManifest.reviewCandidate === undefined) {
    assert.doesNotThrow(() => validateExl50uGeneralAssemblyActivatedCard(device));
    assert.ok(lockedBundle, "formal publication must activate the matching runtime bundle");
    assert.equal(formalManifest.id, "exl50u-general-assembly-v1");
  } else {
    if (formalManifest) {
      assert.deepEqual(formalManifest.reviewCandidate, {
        status: "USER_VISUAL_REVIEW_REQUIRED",
        productionEligible: false,
      });
      assert.ok(lockedBundle, "Sites review candidate retains its matching runtime bundle");
    }
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
    if (!formalManifest) assert.equal(lockedBundle, undefined, "metadata-only publication must not lock an EXL bundle");
  }
});

test("the private eight-system pipeline remains an independent, non-public contract", async () => {
  const [profile, sensorManifest] = await Promise.all([
    readJson("scripts/exl50u-assembly/profile.public.json"),
    readJson("public/models/exl50u-sensor-points-v1/manifest.json"),
  ]);
  assert.equal(profile.deviceId, DEVICE_ID);

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

  const publicProjection = JSON.stringify({ profile });
  assert.doesNotMatch(
    publicProjection,
    /[A-Za-z]:[\\/]|file:\/\/|privateTopLevelLabel|sourceAssembly|sourceSha256|auditSha256|\.private\.json/i,
  );
  assert.equal(sensorManifest.delivery?.existingDeviceModelOnly, true);
});

test("analytics accepts and labels the general-assembly card across publication states", async () => {
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
