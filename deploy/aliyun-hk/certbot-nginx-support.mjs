#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  chown,
  copyFile,
  lstat,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_LETSENCRYPT_ROOT = "/etc/letsencrypt";
const CERTIFICATE_BASENAMES = ["fullchain.pem", "privkey.pem"];

export const CERTBOT_NGINX_STATE_FILES = [
  { basename: "options-ssl-nginx.conf", kind: "support" },
  { basename: "ssl-dhparams.pem", kind: "support" },
  { basename: ".updated-options-ssl-nginx-conf-digest.txt", kind: "digest" },
  { basename: ".updated-ssl-dhparams-pem-digest.txt", kind: "digest" },
];

async function regularFileState(path, { allowSymlink = false } = {}) {
  let linkMetadata;
  try {
    linkMetadata = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, valid: false, reason: "missing" };
    throw error;
  }
  if (!allowSymlink && linkMetadata.isSymbolicLink()) {
    return { exists: true, valid: false, reason: "symbolic link" };
  }
  let metadata = linkMetadata;
  if (allowSymlink) {
    try {
      metadata = await stat(path);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return { exists: true, valid: false, reason: "broken symbolic link" };
      }
      throw error;
    }
  }
  return {
    exists: true,
    valid: metadata.isFile() && metadata.size > 0,
    metadata,
    reason: metadata.isFile() && metadata.size > 0 ? undefined : "not a non-empty regular file",
  };
}

export async function hasCompleteCertificatePair(certificateRoot) {
  const states = await Promise.all(CERTIFICATE_BASENAMES.map((name) =>
    regularFileState(resolve(certificateRoot, name), { allowSymlink: true })));
  const present = states.filter(({ valid }) => valid).length;
  const invalid = states.find(({ exists, valid }) => exists && !valid);
  if (invalid || present === 1) {
    throw new Error("Managed fusiondigital.club certificate pair is incomplete or invalid.");
  }
  return present === 2;
}

export async function inspectCertbotNginxState(letsencryptRoot = DEFAULT_LETSENCRYPT_ROOT) {
  const files = await Promise.all(CERTBOT_NGINX_STATE_FILES.map(async (definition) => {
    const path = resolve(letsencryptRoot, definition.basename);
    return { ...definition, path, ...(await regularFileState(path)) };
  }));
  return { files, ready: files.every(({ valid }) => valid) };
}

async function verifyStateFile(file, {
  expectedUid,
  expectedGid,
  enforceMode,
  enforceOwnership,
}) {
  const current = await regularFileState(file.path);
  if (!current.valid) {
    throw new Error(`Certbot Nginx state file ${file.path} is ${current.reason}.`);
  }
  if (enforceMode && (current.metadata.mode & 0o777) !== 0o644) {
    throw new Error(`Certbot Nginx state file must have mode 0644: ${file.path}`);
  }
  if (enforceOwnership
    && (current.metadata.uid !== expectedUid || current.metadata.gid !== expectedGid)) {
    throw new Error(`Certbot Nginx state file must be owned by root:root: ${file.path}`);
  }
  if (file.kind === "digest") {
    const digest = await readFile(file.path, "utf8");
    if (!/^[0-9a-f]{64}$/u.test(digest)) {
      throw new Error(`Certbot Nginx digest must contain exactly 64 lowercase hex characters: ${file.path}`);
    }
  }
}

async function verifyStateHashes(files) {
  const byBasename = new Map(files.map((file) => [file.basename, file]));
  const pairs = [
    ["options-ssl-nginx.conf", ".updated-options-ssl-nginx-conf-digest.txt"],
    ["ssl-dhparams.pem", ".updated-ssl-dhparams-pem-digest.txt"],
  ];
  for (const [supportBasename, digestBasename] of pairs) {
    const support = byBasename.get(supportBasename);
    const digest = byBasename.get(digestBasename);
    const actual = createHash("sha256").update(await readFile(support.path)).digest("hex");
    const expected = await readFile(digest.path, "utf8");
    if (actual !== expected) {
      throw new Error(`Certbot Nginx state digest does not match ${support.path}.`);
    }
  }
}

export async function classifyCertbotNginxState({
  letsencryptRoot = DEFAULT_LETSENCRYPT_ROOT,
  expectedUid = 0,
  expectedGid = 0,
  enforceMode = true,
  enforceOwnership = true,
} = {}) {
  const state = await inspectCertbotNginxState(letsencryptRoot);
  const existingCount = state.files.filter(({ exists }) => exists).length;
  if (existingCount === 0) return { ...state, status: "ABSENT" };
  if (!state.ready || existingCount !== CERTBOT_NGINX_STATE_FILES.length) {
    const unsafe = state.files.find(({ exists, valid }) => exists && !valid);
    if (unsafe) {
      return {
        ...state,
        status: "INVALID",
        error: new Error(`Unsafe Certbot Nginx state file ${unsafe.path}: ${unsafe.reason}.`),
      };
    }
    return {
      ...state,
      status: "INVALID",
      error: new Error(`Certbot Nginx support state is partial (${existingCount}/4).`),
    };
  }
  try {
    for (const file of state.files) {
      await verifyStateFile(file, { expectedUid, expectedGid, enforceMode, enforceOwnership });
    }
    await verifyStateHashes(state.files);
    return { ...state, status: "READY" };
  } catch (error) {
    return { ...state, status: "INVALID", error };
  }
}

export async function assertCertbotNginxStateReady(options = {}) {
  const state = await classifyCertbotNginxState(options);
  if (state.status === "INVALID") throw state.error;
  if (state.status !== "READY") throw new Error("Certbot Nginx support state is incomplete.");
  return state;
}

async function atomicCopy(source, destination, { mode, uid, gid, enforceOwnership }) {
  const temporaryPath = join(
    dirname(destination),
    `.${basename(destination)}.fusiondigital-${process.pid}-${randomUUID()}`,
  );
  try {
    await copyFile(source, temporaryPath);
    if (enforceOwnership) await chown(temporaryPath, uid, gid);
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export function assertOnlyNginxInstaller(output) {
  const installers = [...output.matchAll(/^\s*\*\s+(\S+)\s*$/gmu)].map((match) => match[1]);
  if (installers.length !== 1 || installers[0] !== "nginx") {
    throw new Error(
      `Expected the nginx installer only; Certbot reported: ${installers.join(", ") || "none"}.`,
    );
  }
}

export function inspectCertbotNginxInstaller() {
  const output = execFileSync(
    "certbot",
    ["plugins", "--installers"],
    { encoding: "utf8" },
  );
  process.stdout.write(output);
  assertOnlyNginxInstaller(output);
}

export function prepareCertbotNginxPlugin() {
  // Certbot 2.9 NginxConfigurator.prepare() validates Nginx and installs its
  // two support files plus their version-control digests. The plugins command
  // does not obtain or install a certificate into a virtual host.
  execFileSync(
    "certbot",
    ["plugins", "--prepare", "--installers"],
    { stdio: "inherit" },
  );
}

export function validateNginxConfiguration() {
  execFileSync("nginx", ["-t"], { stdio: "inherit" });
}

export async function ensureCertbotNginxSupport({
  certificateRoot = resolve(DEFAULT_LETSENCRYPT_ROOT, "live", "fusiondigital.club"),
  letsencryptRoot = DEFAULT_LETSENCRYPT_ROOT,
  inspectInstaller = inspectCertbotNginxInstaller,
  prepare = prepareCertbotNginxPlugin,
  validateNginx = validateNginxConfiguration,
  expectedUid = 0,
  expectedGid = 0,
  enforceMode = true,
  enforceOwnership = true,
} = {}) {
  const initial = await classifyCertbotNginxState({
    letsencryptRoot,
    expectedUid,
    expectedGid,
    enforceMode,
    enforceOwnership,
  });
  if (initial.status === "INVALID") throw initial.error;

  if (!(await hasCompleteCertificatePair(certificateRoot))) {
    return {
      certificateReady: false,
      supportReady: initial.status === "READY",
      prepared: false,
    };
  }

  if (initial.status === "READY") {
    return { certificateReady: true, supportReady: true, prepared: false };
  }

  const backupRoot = await mkdtemp(join(tmpdir(), "fusiondigital-certbot-nginx-"));
  const backups = [];
  try {
    for (const file of initial.files.filter(({ exists }) => exists)) {
      const backupPath = resolve(backupRoot, file.basename);
      await copyFile(file.path, backupPath);
      backups.push({
        path: file.path,
        backupPath,
        mode: file.metadata.mode & 0o777,
        uid: file.metadata.uid,
        gid: file.metadata.gid,
      });
    }

    await inspectInstaller();
    await prepare();
    const prepared = await inspectCertbotNginxState(letsencryptRoot);
    for (const file of prepared.files) {
      if (!file.valid) {
        throw new Error(`Certbot Nginx plugin prepare did not create a safe state file: ${file.path}`);
      }
      await atomicCopy(file.path, file.path, {
        mode: 0o644,
        uid: expectedUid,
        gid: expectedGid,
        enforceOwnership,
      });
      await verifyStateFile(file, { expectedUid, expectedGid, enforceMode, enforceOwnership });
    }
    await assertCertbotNginxStateReady({
      letsencryptRoot,
      expectedUid,
      expectedGid,
      enforceMode,
      enforceOwnership,
    });
    await validateNginx();
    return { certificateReady: true, supportReady: true, prepared: true };
  } catch (error) {
    const backedUpPaths = new Set(backups.map(({ path }) => path));
    for (const file of CERTBOT_NGINX_STATE_FILES) {
      const path = resolve(letsencryptRoot, file.basename);
      if (!backedUpPaths.has(path)) await rm(path, { force: true });
    }
    for (const backup of backups) {
      await atomicCopy(backup.backupPath, backup.path, {
        mode: backup.mode,
        uid: backup.uid,
        gid: backup.gid,
        enforceOwnership,
      });
    }
    throw error;
  } finally {
    await rm(backupRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (process.getuid?.() !== 0) throw new Error("run as root");
  const result = await ensureCertbotNginxSupport();
  if (!result.certificateReady) {
    console.log("No complete certificate pair; leaving Nginx in HTTP-only mode.");
  } else if (result.prepared) {
    console.log("Prepared and verified Certbot 2.9 Nginx support state.");
  } else {
    console.log("Certbot Nginx support state is already complete and verified.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
