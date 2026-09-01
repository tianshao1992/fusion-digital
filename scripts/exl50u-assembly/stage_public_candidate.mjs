#!/usr/bin/env node

import { execFile } from "node:child_process";
import { constants as fsConstants, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { validateProfile } from "./validate_profile.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PIPELINE_ROOT = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(PIPELINE_ROOT, "..", "..");
const PROFILE_PATH = join(PIPELINE_ROOT, "profile.public.json");
const QA_PATH = join(PIPELINE_ROOT, "qa_runtime.mjs");
const REVIEW_SCHEMA = "fusiondigital.private-exl50u-general-assembly-review.v1";
const CANDIDATE_SCHEMA = "fusiondigital.exl50u-general-assembly-release-candidate.v1";
const ROUTE_ROOT = "/device-assets/exl50u-general-assembly/v1";
const FORMAT = "glTF 2.0 binary + EXT_meshopt_compression; POSITION Float32; NORMAL normalized Int8";
const ROLES = ["preview", "high"];
const SHA256_PATTERN = /^[A-F0-9]{64}$/u;

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${key ?? "argument"}`);
    }
    if (values.has(key)) throw new Error(`duplicate argument ${key}`);
    values.set(key, value);
  }
  const expectedKeys = new Set(["--candidate", "--review", "--release", "--as-of"]);
  if (values.size !== expectedKeys.size || [...values.keys()].some((key) => !expectedKeys.has(key))) {
    throw new Error(
      "usage: stage_public_candidate.mjs --candidate <private-root> --review <private-review.json> --release <new-stage-directory> --as-of YYYY-MM-DD",
    );
  }
  const asOf = values.get("--as-of");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(asOf)
    || new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) {
    throw new Error("--as-of must be a valid YYYY-MM-DD date");
  }
  return {
    candidate: resolve(values.get("--candidate")),
    review: resolve(values.get("--review")),
    release: resolve(values.get("--release")),
    asOf,
  };
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has undeclared or missing fields`);
  }
}

function assertNoDuplicateJsonKeys(source, label) {
  let index = 0;
  const skipWhitespace = () => {
    while (index < source.length && /\s/u.test(source[index])) index += 1;
  };
  const parseString = () => {
    if (source[index] !== '"') throw new Error(`${label} contains invalid JSON`);
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") index += 2;
      else if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      } else index += 1;
    }
    throw new Error(`${label} contains an unterminated JSON string`);
  };
  const parseValue = () => {
    skipWhitespace();
    if (source[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[index] === "}") { index += 1; return; }
      while (index < source.length) {
        const key = parseString();
        if (keys.has(key)) throw new Error(`${label} contains a duplicate JSON object key`);
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ":") throw new Error(`${label} contains invalid JSON`);
        index += 1;
        parseValue();
        skipWhitespace();
        if (source[index] === "}") { index += 1; return; }
        if (source[index] !== ",") throw new Error(`${label} contains invalid JSON`);
        index += 1;
        skipWhitespace();
      }
      throw new Error(`${label} contains an unterminated JSON object`);
    }
    if (source[index] === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") { index += 1; return; }
      while (index < source.length) {
        parseValue();
        skipWhitespace();
        if (source[index] === "]") { index += 1; return; }
        if (source[index] !== ",") throw new Error(`${label} contains invalid JSON`);
        index += 1;
      }
      throw new Error(`${label} contains an unterminated JSON array`);
    }
    if (source[index] === '"') { parseString(); return; }
    const start = index;
    while (index < source.length && !/[\s,}\]]/u.test(source[index])) index += 1;
    if (start === index) throw new Error(`${label} contains invalid JSON`);
    JSON.parse(source.slice(start, index));
  };
  parseValue();
  skipWhitespace();
  if (index !== source.length) throw new Error(`${label} contains trailing JSON data`);
}

function sha256Bytes(bytes, uppercase = true) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return uppercase ? digest.toUpperCase() : digest;
}

function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalBundleDigest(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => codepointCompare(left.filename, right.filename))) {
    hash.update(`${file.filename}\0${file.bytes}\0${file.sha256.toLowerCase()}\n`);
  }
  return hash.digest("hex");
}

async function sha256File(pathname, uppercase = true) {
  return sha256Bytes(await readFile(pathname), uppercase);
}

async function pathExists(pathname) {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function comparablePath(pathname) {
  return process.platform === "win32" ? pathname.toLocaleLowerCase("en-US") : pathname;
}

function isWithin(parent, child) {
  const difference = relative(comparablePath(parent), comparablePath(child));
  return difference === ""
    || (!isAbsolute(difference) && difference !== ".." && !difference.startsWith(`..${sep}`));
}

async function assertDirectoryAncestryOutsideGit(pathname, label) {
  let current = pathname;
  while (!(await pathExists(current))) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  current = await realpath(current);
  while (true) {
    if (await pathExists(join(current, ".git"))) {
      throw new Error(`${label} must stay outside every Git checkout`);
    }
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) break;
    current = parent;
  }
}

async function assertOutsideEveryGitCheckout(pathname, label, kind) {
  const lexicalStart = kind === "directory" ? pathname : dirname(pathname);
  await assertDirectoryAncestryOutsideGit(lexicalStart, label);
  if (await pathExists(pathname)) {
    const canonical = await realpath(pathname);
    const canonicalStart = kind === "directory" ? canonical : dirname(canonical);
    await assertDirectoryAncestryOutsideGit(canonicalStart, label);
  }
}

async function claimDirectoryNoClobber(pathname) {
  try {
    await mkdir(pathname, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("candidate release stage already exists; refusing to overwrite it");
    }
    throw error;
  }
}

async function readStrictJson(pathname, label) {
  const info = await lstat(pathname);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const bytes = await readFile(pathname);
  const source = bytes.toString("utf8");
  assertNoDuplicateJsonKeys(source, label);
  return { bytes, value: JSON.parse(source) };
}

function validateIdentity(value, expectedBasename, label) {
  assertExactKeys(value, ["basename", "bytes", "sha256"], label);
  if (value.basename !== expectedBasename
    || !Number.isSafeInteger(value.bytes)
    || value.bytes <= 0
    || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error(`${label} is invalid`);
  }
}

function validateReview(review, profileSha256, systems, qaByRole) {
  assertExactKeys(
    review,
    ["schemaVersion", "profileSha256", "artifacts", "commonOrigin", "visualReview"],
    "private review receipt",
  );
  if (review.schemaVersion !== REVIEW_SCHEMA || review.profileSha256 !== profileSha256) {
    throw new Error("private review receipt does not bind the exact public profile");
  }
  assertExactKeys(review.artifacts, ROLES, "private review artifacts");
  for (const role of ROLES) {
    const expectedBasename = `device.${role}.meshopt.glb`;
    validateIdentity(review.artifacts[role], expectedBasename, `private review artifacts.${role}`);
    const qa = qaByRole.get(role);
    if (review.artifacts[role].bytes !== qa.bytes || review.artifacts[role].sha256 !== qa.sha256) {
      throw new Error(`private review ${role} artifact differs from strict runtime QA`);
    }
  }
  assertExactKeys(
    review.commonOrigin,
    ["status", "reviewedSystemIds", "coordinateFrame", "worldPlacementsPreserved", "recentered"],
    "private review commonOrigin",
  );
  if (review.commonOrigin.status !== "PASS"
    || JSON.stringify(review.commonOrigin.reviewedSystemIds) !== JSON.stringify(systems)
    || review.commonOrigin.coordinateFrame !== "authoritative-common-assembly-origin"
    || review.commonOrigin.worldPlacementsPreserved !== true
    || review.commonOrigin.recentered !== false) {
    throw new Error("common-origin review did not pass for the exact eight systems");
  }
  assertExactKeys(
    review.visualReview,
    ["status", "reviewedSystemIds", "reviewedAgainst", "noMissingSystems", "noOrphanedGeometry", "noGrossIntersections"],
    "private review visualReview",
  );
  if (review.visualReview.status !== "PASS"
    || JSON.stringify(review.visualReview.reviewedSystemIds) !== JSON.stringify(systems)
    || review.visualReview.reviewedAgainst !== "authoritative-cad"
    || review.visualReview.noMissingSystems !== true
    || review.visualReview.noOrphanedGeometry !== true
    || review.visualReview.noGrossIntersections !== true) {
    throw new Error("visual review did not pass for the exact eight systems");
  }
}

function parseLastJsonLine(stdout, label) {
  const lines = stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) throw new Error(`${label} produced no result`);
  return JSON.parse(lines.at(-1));
}

async function runQa(role, artifact, profile, expectedNodes) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      process.execPath,
      [QA_PATH, profile, role, artifact],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 300_000 },
    ));
  } catch (error) {
    const result = parseLastJsonLine(String(error.stdout ?? ""), `${role} QA`);
    throw new Error(`${role} strict runtime QA failed: ${result.error ?? result.status}`);
  }
  const result = parseLastJsonLine(stdout, `${role} QA`);
  if (result.status !== "PASS"
    || result.role !== role
    || JSON.stringify(result.stableNodes) !== JSON.stringify(expectedNodes)
    || !result.checks
    || Object.values(result.checks).some((value) => value !== true)) {
    throw new Error(`${role} strict runtime QA did not satisfy every reviewed gate`);
  }
  return result;
}

function artifactProjection(role, qa) {
  const digest = qa.sha256.toLowerCase();
  const filename = `device.${role}.${digest}.meshopt.glb`;
  return {
    role,
    filename,
    route: `${ROUTE_ROOT}/${filename}`,
    format: FORMAT,
    bytes: qa.bytes,
    sha256: qa.sha256,
    triangles: qa.triangles,
    vertices: qa.vertices,
    decodedGpuBytes: qa.decodedGpuBytes,
    boundsMetres: qa.boundsMetres,
  };
}

async function buildFingerprint() {
  const paths = [
    "profile.public.json",
    "source_audit.py",
    "verify_export_set.py",
    "prepare_private_run.py",
    "validate_profile.mjs",
    "pipeline.py",
    "build_system_shard.py",
    "run_system_build.py",
    "assemble_device.py",
    "meshopt_encode.mjs",
    "qa_runtime.mjs",
    "stage_public_candidate.mjs",
    "environment.win-64.yml",
  ];
  const scripts = [];
  for (const path of paths) {
    const bytes = await readFile(join(PIPELINE_ROOT, path));
    scripts.push({ path: `scripts/exl50u-assembly/${path}`, sha256: sha256Bytes(bytes) });
  }
  const packageJson = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"));
  return {
    scripts,
    environment: {
      node: process.versions.node,
      gltfTransform: packageJson.devDependencies["@gltf-transform/core"],
      meshoptimizer: packageJson.devDependencies.meshoptimizer,
      python: "3.11.16",
      cadquery: "2.8.0",
      ocp: "7.9.3.1",
      occt: "7.9.3",
      vtk: "9.6.1",
      numpy: "2.4.6",
    },
  };
}

function buildManifest(profile, asOf, assets, fingerprint) {
  const preview = assets.find((asset) => asset.role === "preview");
  const high = assets.find((asset) => asset.role === "high");
  const asWebModel = (asset, label, isDefault = false) => ({
    id: asset.role,
    label,
    quality: asset.role,
    ...(isDefault ? { default: true } : {}),
    path: asset.route,
    format: asset.format,
    bytes: asset.bytes,
    sha256: asset.sha256,
    triangles: asset.triangles,
    vertices: asset.vertices,
    decodedGpuBytes: asset.decodedGpuBytes,
    boundsMetres: asset.boundsMetres,
  });
  const compatibilityModel = {
    path: preview.route,
    format: preview.format,
    bytes: preview.bytes,
    sha256: preview.sha256,
    triangles: preview.triangles,
    vertices: preview.vertices,
    decodedGpuBytes: preview.decodedGpuBytes,
    boundsMetres: preview.boundsMetres,
  };
  return {
    $schema: "/models/device-manifest.schema.json",
    schemaVersion: "1.1",
    id: profile.manifestId,
    title: "EXL-50U integrated assembly browser visualization derivative",
    asOf,
    publicationState: "CANDIDATE_NOT_RELEASED",
    devicePackage: {
      kind: "public-simplified-derivative",
      deviceClass: "EXL-50U integrated-assembly visualization",
      authority: "illustrative",
      replacementContract: [
        "eight reviewed generic systems preserve one common assembly origin",
        "metre-scale Y-up right-handed browser coordinate frame",
        "preview and high derivatives pass exact runtime geometry and provenance QA",
        "source CAD, engineering metadata and build evidence are excluded",
      ],
    },
    access: {
      classification: "PUBLIC",
      redistributionAllowed: true,
      engineeringUseAllowed: false,
      statement: "This candidate contains simplified browser visualization derivatives only. It is not an engineering model and is not released until the formal publication workflow succeeds.",
    },
    coordinateSystem: {
      linearUnit: profile.coordinateSystem.linearUnit,
      upAxis: profile.coordinateSystem.upAxis,
      handedness: profile.coordinateSystem.handedness,
      sourceToWebScale: profile.coordinateSystem.sourceToWebScale,
    },
    assets: {
      webModel: compatibilityModel,
      webModels: [asWebModel(preview, "标准", true), asWebModel(high, "高清")],
    },
    systems: profile.systems.map((system) => ({
      id: system.id,
      title: system.title,
      shortTitle: system.shortTitle,
      category: system.category,
      color: system.color,
      description: "总装浏览器派生中的系统级简化节点，仅用于外观、显隐、透明和剖切交互。",
      parts: [{
        id: system.partId,
        title: system.title,
        nodeName: system.nodeName,
        description: "保持共同装配原点的公开系统级节点；不包含制造尺寸、PMI 或工程分析权威。",
        engineeringTag: `EXL50U.GA.${system.id.toUpperCase().replaceAll("-", "_")}`,
      }],
    })),
    generator: {
      name: "FusionDigital EXL-50U integrated-assembly derivative pipeline",
      version: "1.0.0-candidate",
      repository: "https://github.com/tianshao1992/fusion-digital",
      license: "User-authorized public visualization derivative",
      licenseUrl: "/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md",
      script: fingerprint.scripts.find((entry) => entry.path.endsWith("/stage_public_candidate.mjs")),
      compressionScript: fingerprint.scripts.find((entry) => entry.path.endsWith("/meshopt_encode.mjs")),
      runtimeQa: {
        ...fingerprint.scripts.find((entry) => entry.path.endsWith("/qa_runtime.mjs")),
        status: "PASS",
      },
      environment: fingerprint.environment,
      buildFingerprint: { scripts: fingerprint.scripts },
      conversion: {
        pipeline: "system STEP AP214/AP242 -> XCAF metre tessellation -> one reviewed QEM pass -> Float32 cleanup -> eight-node aggregate -> Int8 normals -> EXT_meshopt_compression",
        converter: "CadQuery/OCP XCAF derivative pipeline",
        converterVersion: "CadQuery 2.8.0 / OCP 7.9.3.1 / OCCT 7.9.3",
        positions: "Float32, non-normalized",
        normals: "normalized signed Int8",
        recentered: false,
        highLodAbsoluteDeflectionMillimetres: 0.5,
        highLodAngularDeflectionRadians: 0.25,
        highLodSharpEdgeNormals: true,
      },
    },
    disclaimer: "Candidate visualization only. Not released, not dimensionally authoritative, and not suitable for design, manufacturing, safety, physics analysis or operational decisions.",
  };
}

function assertPublicProjection(value, label) {
  const serialized = JSON.stringify(value);
  if (/(?:^|[^A-Za-z])[A-Za-z]:[\\/]|file:\/\/|\.private\.json|privateTopLevelLabel|sourceAssembly|sourceSha256|auditSha256/iu.test(serialized)) {
    throw new Error(`${label} contains non-public provenance`);
  }
}

async function writeJson(pathname, value) {
  await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await Promise.all([
    assertOutsideEveryGitCheckout(options.candidate, "private candidate", "directory"),
    assertOutsideEveryGitCheckout(options.review, "private review receipt", "file"),
    assertOutsideEveryGitCheckout(options.release, "candidate release stage", "new-directory"),
  ]);
  const candidateInfo = await lstat(options.candidate);
  if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink()) {
    throw new Error("private candidate must be a regular directory");
  }
  const canonicalCandidate = await realpath(options.candidate);
  const canonicalReview = await realpath(options.review);
  const releaseParent = await realpath(dirname(options.release));
  const canonicalRelease = join(releaseParent, basename(options.release));
  if (!isWithin(canonicalCandidate, canonicalReview)) {
    throw new Error("private review receipt must remain within the private candidate root");
  }
  if (isWithin(canonicalCandidate, canonicalRelease)
    || isWithin(canonicalRelease, canonicalCandidate)) {
    throw new Error("candidate release stage and private candidate must be disjoint");
  }

  const profileBytes = await readFile(PROFILE_PATH);
  const profile = JSON.parse(profileBytes.toString("utf8"));
  validateProfile(profile);
  const systemIds = profile.systems.map((system) => system.id);
  const expectedNodes = profile.systems.map((system) => system.nodeName);
  const profileSha256 = sha256Bytes(profileBytes);

  const qaByRole = new Map();
  for (const role of ROLES) {
    const artifact = join(canonicalCandidate, `device.${role}.meshopt.glb`);
    const info = await lstat(artifact);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${role} candidate is not a regular file`);
    const canonicalArtifact = await realpath(artifact);
    if (!isWithin(canonicalCandidate, canonicalArtifact)) {
      throw new Error(`${role} candidate escapes the private candidate root`);
    }
    qaByRole.set(role, await runQa(role, canonicalArtifact, PROFILE_PATH, expectedNodes));
  }

  const { value: review } = await readStrictJson(canonicalReview, "private review receipt");
  validateReview(review, profileSha256, systemIds, qaByRole);

  const assets = ROLES.map((role) => artifactProjection(role, qaByRole.get(role)));
  if (new Set(assets.map((asset) => asset.sha256)).size !== assets.length) {
    throw new Error("preview and high candidates must not have identical content");
  }
  const fingerprint = await buildFingerprint();
  const manifest = buildManifest(profile, options.asOf, assets, fingerprint);
  const aggregateSha256 = canonicalBundleDigest(assets);
  const bundle = {
    schemaVersion: CANDIDATE_SCHEMA,
    publicationState: "CANDIDATE_NOT_RELEASED",
    id: "exl50u-general-assembly-v1",
    title: "EXL-50U integrated-assembly browser visualization derivative",
    classification: "PUBLIC_VISUALIZATION_DERIVATIVE",
    engineeringUseAllowed: false,
    sourceCadIncluded: false,
    routeRoot: ROUTE_ROOT,
    fileCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    aggregateAlgorithm: "sha256-filename-bytes-sha256-codepoint-v1",
    aggregateSha256,
    files: assets.map((asset) => ({
      role: asset.role,
      filename: asset.filename,
      route: asset.route,
      bytes: asset.bytes,
      sha256: asset.sha256.toLowerCase(),
    })),
  };
  const workerFragment = {
    schemaVersion: "fusiondigital.worker-external-asset-candidate.v1",
    publicationState: "CANDIDATE_NOT_RELEASED",
    routeRoot: ROUTE_ROOT,
    assets: bundle.files.map((asset) => ({
      role: asset.role,
      route: asset.route,
      bytes: asset.bytes,
      sha256: asset.sha256,
    })),
    unknownRoutes: "404",
  };
  for (const [label, value] of [["candidate manifest", manifest], ["bundle fragment", bundle], ["Worker fragment", workerFragment]]) {
    assertPublicProjection(value, label);
  }

  const temporary = await mkdtemp(join(
    releaseParent,
    `.${basename(canonicalRelease)}.${process.pid}.partial-`,
  ));
  let committed = false;
  let releaseClaimed = false;
  try {
    await mkdir(join(temporary, "assets"), { recursive: true });
    await mkdir(join(temporary, "metadata"), { recursive: true });
    for (const asset of assets) {
      const source = join(canonicalCandidate, `device.${asset.role}.meshopt.glb`);
      const destination = join(temporary, "assets", asset.filename);
      await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
      const copiedInfo = await stat(destination);
      if (copiedInfo.size !== asset.bytes || await sha256File(destination) !== asset.sha256) {
        throw new Error(`${asset.role} staged copy differs from its reviewed artifact`);
      }
    }
    await writeJson(join(temporary, "metadata", "model-manifest.candidate.json"), manifest);
    await writeJson(join(temporary, "metadata", "external-bundle.candidate.json"), bundle);
    await writeJson(join(temporary, "metadata", "worker-allowlist.candidate.json"), workerFragment);
    await writeFile(
      join(temporary, "metadata", "PUBLICATION-NOTICE.md"),
      "# EXL-50U integrated-assembly public derivative candidate\n\nThis candidate contains simplified browser-rendering derivatives only. Source CAD, dimensions, PMI, BOM, drawings, author metadata and build evidence are excluded. It is illustrative, unreleased and not suitable for engineering, manufacturing, safety, physics analysis or operations.\n",
      { encoding: "utf8", flag: "wx" },
    );
    await claimDirectoryNoClobber(canonicalRelease);
    releaseClaimed = true;
    await rename(join(temporary, "assets"), join(canonicalRelease, "assets"));
    await rename(join(temporary, "metadata"), join(canonicalRelease, "metadata"));
    committed = true;
  } finally {
    if (!committed && releaseClaimed && await pathExists(canonicalRelease)) {
      await rm(canonicalRelease, { recursive: true, force: true });
    }
    if (!committed && await pathExists(temporary)) await rm(temporary, { recursive: true, force: true });
    if (committed && await pathExists(temporary)) await rm(temporary, { recursive: true, force: true });
  }

  process.stdout.write(`${JSON.stringify({
    status: "STAGED_CANDIDATE",
    publicationState: "CANDIDATE_NOT_RELEASED",
    stageDirectory: basename(canonicalRelease),
    profileSha256,
    fileCount: assets.length,
    totalBytes: bundle.totalBytes,
    aggregateSha256,
  })}\n`);
}

function sanitizedMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z]:[\\/][^\s'"`]+/gu, "<path>")
    .replace(/file:\/\/[^\s'"`]+/giu, "<path>");
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ status: "BLOCKED", error: sanitizedMessage(error) })}\n`);
  process.exitCode = 2;
});
