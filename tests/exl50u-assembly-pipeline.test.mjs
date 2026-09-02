import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Accessor, Document, NodeIO } from "@gltf-transform/core";

import { validateProfile } from "../scripts/exl50u-assembly/validate_profile.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIPELINE_ROOT = join(ROOT, "scripts", "exl50u-assembly");
const PROFILE_PATH = join(PIPELINE_ROOT, "profile.public.json");
const ENCODER_PATH = join(PIPELINE_ROOT, "meshopt_encode.mjs");
const QA_PATH = join(PIPELINE_ROOT, "qa_runtime.mjs");
const STAGE_PATH = join(PIPELINE_ROOT, "stage_public_candidate.mjs");
const PUBLIC_GLB_PATH = join(ROOT, "public", "models", "paramak-tokamak-demo", "paramak-tokamak-demo.glb");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  assert.ok(lines.length > 0, "command did not emit a JSON result");
  return JSON.parse(lines.at(-1));
}

async function expectCommandFailure(script, args, expectedPattern) {
  try {
    await execFileAsync(process.execPath, [script, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const result = parseLastJsonLine(error.stdout);
    assert.match(result.error, expectedPattern);
    return result;
  }
  assert.fail("command unexpectedly succeeded");
}

function rgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function parseGlbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trimEnd());
}

function boundsFor(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let component = 0; component < 3; component += 1) {
      min[component] = Math.min(min[component], positions[index + component]);
      max[component] = Math.max(max[component], positions[index + component]);
    }
  }
  return { min, max };
}

function mergeBounds(bounds) {
  return bounds.reduce((merged, value) => ({
    min: merged.min.map((component, index) => Math.min(component, value.min[index])),
    max: merged.max.map((component, index) => Math.max(component, value.max[index])),
  }), {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  });
}

async function createSyntheticRawDevice(directory, profile, profileBytes, role) {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  document.getRoot().setDefaultScene(scene);
  const assets = [];

  profile.systems.forEach((system, systemIndex) => {
    const x = systemIndex * 1.75;
    const ringCount = systemIndex + (role === "preview" ? 3 : 11);
    const positionValues = [x, 0, 0];
    const normalValues = [0, 0, 1];
    const indexValues = [];
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const angle = ringIndex * Math.PI * 2 / ringCount;
      positionValues.push(x + Math.cos(angle) * 0.6, Math.sin(angle) * 0.6, 0);
      normalValues.push(0, 0, 1);
      indexValues.push(0, ringIndex + 1, (ringIndex + 1) % ringCount + 1);
    }
    const positions = new Float32Array(positionValues);
    const normals = new Float32Array(normalValues);
    const indices = new Uint16Array(indexValues);
    const positionAccessor = document.createAccessor()
      .setType(Accessor.Type.VEC3)
      .setArray(positions)
      .setBuffer(buffer);
    const normalAccessor = document.createAccessor()
      .setType(Accessor.Type.VEC3)
      .setArray(normals)
      .setBuffer(buffer);
    const indexAccessor = document.createAccessor()
      .setType(Accessor.Type.SCALAR)
      .setArray(indices)
      .setBuffer(buffer);
    const material = document.createMaterial(`material_${system.nodeName}`)
      .setBaseColorFactor([...rgb(system.color), 1])
      .setMetallicFactor(0.34)
      .setRoughnessFactor(0.46)
      .setDoubleSided(true);
    const primitive = document.createPrimitive()
      .setIndices(indexAccessor)
      .setAttribute("POSITION", positionAccessor)
      .setAttribute("NORMAL", normalAccessor)
      .setMaterial(material);
    const mesh = document.createMesh(system.nodeName).addPrimitive(primitive);
    const node = document.createNode(system.nodeName).setMesh(mesh);
    scene.addChild(node);

    assets.push({
      nodeName: system.nodeName,
      vertices: positions.length / 3,
      triangles: indices.length / 3,
      boundsMetres: boundsFor(positions),
    });
  });

  const rawPath = join(directory, `device.${role}.raw.glb`);
  await new NodeIO().write(rawPath, document);
  const rawBytes = await readFile(rawPath);
  const record = {
    schemaVersion: "fusiondigital.exl50u-device-derivative-build.v1",
    role,
    profileSha256: sha256(profileBytes),
    inputs: profile.systems.map((system, index) => ({
      systemId: system.id,
      sourceSha256: sha256(`synthetic-source-${index}`),
      auditSha256: sha256(`synthetic-audit-${index}`),
      artifact: {
        basename: `${system.id}.${role}.raw.glb`,
        bytes: index + 1,
        sha256: sha256(`synthetic-artifact-${index}`),
      },
      buildRecord: {
        basename: `${system.id}.${role}.build.private.json`,
        bytes: index + 1,
        sha256: sha256(`synthetic-build-record-${index}`),
      },
    })),
    artifact: {
      basename: `device.${role}.raw.glb`,
      bytes: rawBytes.byteLength,
      sha256: sha256(rawBytes),
      vertices: assets.reduce((sum, asset) => sum + asset.vertices, 0),
      triangles: assets.reduce((sum, asset) => sum + asset.triangles, 0),
      decodedGpuBytes: assets.reduce(
        (sum, asset) => sum + asset.vertices * 24 + asset.triangles * 12,
        0,
      ),
      boundsMetres: mergeBounds(assets.map((asset) => asset.boundsMetres)),
      assets,
    },
  };
  const recordPath = join(directory, `device.${role}.build.private.json`);
  await writeFile(recordPath, `${JSON.stringify(record)}\n`, "utf8");
  return { rawPath, recordPath };
}

async function expectQaFailure(profilePath, artifactPath, expectedPattern) {
  try {
    await execFileAsync(process.execPath, [QA_PATH, profilePath, "preview", artifactPath], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const result = JSON.parse(String(error.stdout).trim());
    assert.equal(result.status, "FAIL");
    assert.match(result.error, expectedPattern);
    return;
  }
  assert.fail("QA unexpectedly accepted tampered evidence");
}

test("EXL-50U general-assembly public profile is exact and fail-closed", async () => {
  const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8"));
  const result = validateProfile(profile);
  assert.deepEqual(result, {
    systems: 8,
    parts: 8,
    previewTriangles: 700_000,
    highTriangles: 4_480_000,
    highBytes: 48 * 1024 * 1024,
    highDecodedGpuBytes: 384 * 1024 * 1024,
  });

  const tampered = structuredClone(profile);
  tampered.systems[0].nodeName = "EXL50U_GA_PART__unreviewed";
  assert.throws(() => validateProfile(tampered), /unreviewed stable identity/);
  assert.doesNotMatch(
    JSON.stringify(profile),
    /[A-Za-z]:[\\/]|file:\/\/|privateTopLevelLabel|sourceAssembly|sourceSha256/i,
  );
});

test("runtime QA rejects an oversized sparse GLB before reading its contents", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "fusiondigital-exl50u-assembly-size-"));
  const artifactPath = join(temporaryRoot, "device.preview.meshopt.glb");
  try {
    await writeFile(artifactPath, "not-a-glb", "utf8");
    await truncate(artifactPath, 5 * 1024 * 1024 * 1024);
    await expectQaFailure(
      PROFILE_PATH,
      artifactPath,
      /source bytes exceed the preview role budget before file read/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("file operands inherit Git-checkout isolation from their parent directories", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "fusiondigital-exl50u-git-isolation-"));
  const candidate = join(temporaryRoot, "candidate");
  await mkdir(candidate);
  try {
    await expectCommandFailure(
      ENCODER_PATH,
      [PUBLIC_GLB_PATH, join(temporaryRoot, "encoded.glb")],
      /meshopt input must remain outside every Git checkout/,
    );
    await expectCommandFailure(
      STAGE_PATH,
      [
        "--candidate", candidate,
        "--review", PROFILE_PATH,
        "--release", join(temporaryRoot, "release"),
        "--as-of", "2026-09-01",
      ],
      /private review receipt must stay outside every Git checkout/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("POSIX containment remains case-sensitive", { skip: process.platform === "win32" }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "fusiondigital-exl50u-path-case-"));
  const candidate = join(temporaryRoot, "Candidate");
  const sibling = join(temporaryRoot, "candidate");
  await Promise.all([mkdir(candidate), mkdir(sibling)]);
  const review = join(sibling, "review.private.json");
  await writeFile(review, "{}\n", "utf8");
  try {
    await expectCommandFailure(
      STAGE_PATH,
      [
        "--candidate", candidate,
        "--review", review,
        "--release", join(temporaryRoot, "release"),
        "--as-of", "2026-09-01",
      ],
      /private review receipt must remain within the private candidate root/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("synthetic eight-system device survives Meshopt and strict runtime QA", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "fusiondigital-exl50u-assembly-"));
  const directory = join(temporaryRoot, "candidate");
  await mkdir(directory);
  try {
    const profileBytes = await readFile(PROFILE_PATH);
    const profile = JSON.parse(profileBytes.toString("utf8"));
    const previewBuild = await createSyntheticRawDevice(directory, profile, profileBytes, "preview");
    const genericInputPath = join(directory, "generic-source.glb");
    const genericOutputPath = join(directory, "generic-output.glb");
    await writeFile(genericInputPath, await readFile(previewBuild.rawPath));
    const genericArgs = [ENCODER_PATH, genericInputPath, genericOutputPath];
    const concurrentEncodes = await Promise.allSettled([
      execFileAsync(process.execPath, genericArgs, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      }),
      execFileAsync(process.execPath, genericArgs, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      }),
    ]);
    assert.equal(concurrentEncodes.filter((entry) => entry.status === "fulfilled").length, 1);
    assert.equal(concurrentEncodes.filter((entry) => entry.status === "rejected").length, 1);
    const encodeRaceFailure = parseLastJsonLine(
      concurrentEncodes.find((entry) => entry.status === "rejected").reason.stdout,
    );
    assert.equal(encodeRaceFailure.status, "FAIL");
    assert.match(encodeRaceFailure.error, /output already exists; refusing to overwrite it/);
    const genericOutputSha256 = sha256(await readFile(genericOutputPath));
    await expectCommandFailure(
      ENCODER_PATH,
      [genericInputPath, genericOutputPath],
      /output already exists; refusing to overwrite it/,
    );
    assert.equal(sha256(await readFile(genericOutputPath)), genericOutputSha256);

    const outputPath = join(directory, "device.preview.meshopt.glb");
    const recordPath = join(directory, "device.preview.meshopt.build.private.json");
    await writeFile(recordPath, "preexisting-review-evidence\n", { encoding: "utf8", flag: "wx" });
    await expectCommandFailure(
      ENCODER_PATH,
      [previewBuild.rawPath, outputPath],
      /meshopt build record already exists; refusing to overwrite it/,
    );
    assert.equal(await readFile(recordPath, "utf8"), "preexisting-review-evidence\n");
    await assert.rejects(
      () => readFile(outputPath),
      (error) => error?.code === "ENOENT",
    );
    await rm(recordPath);

    await execFileAsync(process.execPath, [
      ENCODER_PATH,
      join(directory, "device.preview.raw.glb"),
      outputPath,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });

    const { stdout } = await execFileAsync(
      process.execPath,
      [QA_PATH, PROFILE_PATH, "preview", outputPath],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    const result = JSON.parse(stdout.trim());
    assert.equal(result.status, "PASS");
    assert.equal(result.meshInstances, 8);
    assert.equal(result.triangles, 52);
    assert.equal(result.vertices, 60);
    assert.deepEqual(result.stableNodes, profile.systems.map((system) => system.nodeName));
    assert.ok(Object.values(result.checks).every(Boolean));

    const encodedJson = parseGlbJson(await readFile(outputPath));
    const indexAccessors = encodedJson.meshes.map(
      (mesh) => encodedJson.accessors[mesh.primitives[0].indices],
    );
    assert.equal(new Set(indexAccessors.map((accessor) => accessor.bufferView)).size, 1);
    assert.deepEqual(
      indexAccessors.map((accessor) => accessor.byteOffset ?? 0),
      [0, 18, 42, 72, 108, 150, 198, 252],
    );

    const originalRecord = await readFile(recordPath, "utf8");
    const tamperedRecord = JSON.parse(originalRecord);
    tamperedRecord.role = "high";
    await writeFile(recordPath, `${JSON.stringify(tamperedRecord)}\n`, "utf8");
    await expectQaFailure(PROFILE_PATH, outputPath, /meshopt build record identity is invalid/);
    await writeFile(recordPath, originalRecord, "utf8");

    const tamperedProfilePath = join(directory, "profile.tampered.json");
    const tamperedProfile = structuredClone(profile);
    tamperedProfile.systems[0].color = "#000000";
    await writeFile(tamperedProfilePath, `${JSON.stringify(tamperedProfile)}\n`, "utf8");
    await expectQaFailure(
      tamperedProfilePath,
      outputPath,
      /profile or upstream build-record provenance differs from the QA inputs/,
    );

    await createSyntheticRawDevice(directory, profile, profileBytes, "high");
    const highOutputPath = join(directory, "device.high.meshopt.glb");
    await execFileAsync(process.execPath, [
      ENCODER_PATH,
      join(directory, "device.high.raw.glb"),
      highOutputPath,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const { stdout: highQaStdout } = await execFileAsync(
      process.execPath,
      [QA_PATH, PROFILE_PATH, "high", highOutputPath],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    const highResult = JSON.parse(highQaStdout.trim());
    assert.equal(highResult.status, "PASS");

    const reviewPath = join(directory, "general-assembly.review.private.json");
    const reviewReceipt = {
      schemaVersion: "fusiondigital.private-exl50u-general-assembly-review.v1",
      profileSha256: sha256(profileBytes),
      artifacts: {
        preview: {
          basename: "device.preview.meshopt.glb",
          bytes: result.bytes,
          sha256: result.sha256,
        },
        high: {
          basename: "device.high.meshopt.glb",
          bytes: highResult.bytes,
          sha256: highResult.sha256,
        },
      },
      commonOrigin: {
        status: "PASS",
        reviewedSystemIds: profile.systems.map((system) => system.id),
        coordinateFrame: "authoritative-common-assembly-origin",
        worldPlacementsPreserved: true,
        recentered: false,
      },
      visualReview: {
        status: "PASS",
        reviewedSystemIds: profile.systems.map((system) => system.id),
        reviewedAgainst: "authoritative-cad",
        noMissingSystems: true,
        noOrphanedGeometry: true,
        noGrossIntersections: true,
      },
    };
    await writeFile(reviewPath, `${JSON.stringify(reviewReceipt)}\n`, "utf8");

    const releasePath = join(temporaryRoot, "release-candidate");
    const stageArgs = [
      STAGE_PATH,
      "--candidate", directory,
      "--review", reviewPath,
      "--release", releasePath,
      "--as-of", "2026-09-01",
    ];
    const concurrentStages = await Promise.allSettled([
      execFileAsync(process.execPath, stageArgs, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }),
      execFileAsync(process.execPath, stageArgs, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }),
    ]);
    assert.equal(concurrentStages.filter((entry) => entry.status === "fulfilled").length, 1);
    assert.equal(concurrentStages.filter((entry) => entry.status === "rejected").length, 1);
    const stageWinner = concurrentStages.find((entry) => entry.status === "fulfilled");
    const stageLoser = concurrentStages.find((entry) => entry.status === "rejected");
    const stageResult = parseLastJsonLine(stageWinner.value.stdout);
    const stageRaceFailure = parseLastJsonLine(stageLoser.reason.stdout);
    assert.equal(stageResult.status, "STAGED_CANDIDATE");
    assert.equal(stageResult.publicationState, "CANDIDATE_NOT_RELEASED");
    assert.equal(stageResult.fileCount, 2);
    assert.equal(stageRaceFailure.status, "BLOCKED");
    assert.match(stageRaceFailure.error, /candidate release stage already exists; refusing to overwrite it/);

    const stagedManifest = JSON.parse(await readFile(
      join(releasePath, "metadata", "model-manifest.candidate.json"),
      "utf8",
    ));
    const stagedBundle = JSON.parse(await readFile(
      join(releasePath, "metadata", "external-bundle.candidate.json"),
      "utf8",
    ));
    const workerFragment = JSON.parse(await readFile(
      join(releasePath, "metadata", "worker-allowlist.candidate.json"),
      "utf8",
    ));
    assert.equal(stagedManifest.id, profile.manifestId);
    assert.equal(stagedManifest.publicationState, "CANDIDATE_NOT_RELEASED");
    assert.deepEqual(
      stagedManifest.generator.buildFingerprint.scripts
        .filter((entry) => /(?:prepare_private_run\.py|validate_profile\.mjs)$/u.test(entry.path))
        .map((entry) => entry.path),
      [
        "scripts/exl50u-assembly/prepare_private_run.py",
        "scripts/exl50u-assembly/validate_profile.mjs",
      ],
    );
    assert.deepEqual(
      stagedManifest.assets.webModels.map((asset) => asset.quality),
      ["preview", "high"],
    );
    assert.equal(stagedBundle.fileCount, 2);
    assert.equal(stagedBundle.files.length, 2);
    assert.equal(
      stagedBundle.aggregateAlgorithm,
      "sha256-filename-bytes-sha256-codepoint-v1",
    );
    const canonicalBundleHash = createHash("sha256");
    for (const asset of [...stagedBundle.files].sort((left, right) => (
      left.filename < right.filename ? -1 : left.filename > right.filename ? 1 : 0
    ))) {
      canonicalBundleHash.update(`${asset.filename}\0${asset.bytes}\0${asset.sha256}\n`);
    }
    assert.equal(stagedBundle.aggregateSha256, canonicalBundleHash.digest("hex"));
    assert.match(stagedManifest.generator.licenseUrl, /PUBLICATION-NOTICE\.md$/u);
    const publicationNotice = await readFile(
      join(releasePath, "metadata", "PUBLICATION-NOTICE.md"),
      "utf8",
    );
    assert.ok(publicationNotice.startsWith("# EXL-50U integrated-assembly public derivative candidate"));
    assert.match(publicationNotice, /approximate metre-scale envelope/u);
    assert.match(publicationNotice, /dimension annotations, authoritative dimension tables/u);
    assert.doesNotMatch(publicationNotice, /Source CAD, dimensions,/u);
    assert.equal(workerFragment.unknownRoutes, "404");
    for (const asset of stagedBundle.files) {
      assert.match(
        asset.route,
        /^\/device-assets\/exl50u-general-assembly\/v1\/device\.(?:preview|high)\.[a-f0-9]{64}\.meshopt\.glb$/u,
      );
      assert.equal(
        sha256(await readFile(join(releasePath, "assets", asset.filename))).toLowerCase(),
        asset.sha256,
      );
    }
    const preexistingMarker = join(releasePath, "preexisting-owner.txt");
    await writeFile(preexistingMarker, "preserve\n", { encoding: "utf8", flag: "wx" });
    const manifestSha256 = sha256(await readFile(
      join(releasePath, "metadata", "model-manifest.candidate.json"),
    ));
    await expectCommandFailure(
      STAGE_PATH,
      stageArgs.slice(1),
      /candidate release stage already exists; refusing to overwrite it/,
    );
    assert.equal(await readFile(preexistingMarker, "utf8"), "preserve\n");
    assert.equal(
      sha256(await readFile(join(releasePath, "metadata", "model-manifest.candidate.json"))),
      manifestSha256,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
