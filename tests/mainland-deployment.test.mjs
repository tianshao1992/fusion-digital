import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import {
  ALIYUN_BUILD_TARGETS,
  validateDeploymentBuildTarget,
} from "../scripts/deployment/build-target.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAINLAND = join(ROOT, "deploy", "aliyun-mainland");

async function read(relativePath) {
  return readFile(join(ROOT, relativePath), "utf8");
}

function writeTarString(buffer, offset, length, value) {
  const encoded = Buffer.from(value, "utf8");
  assert.ok(encoded.length <= length, `tar field is too long: ${value}`);
  encoded.copy(buffer, offset);
}

function writeTarOctal(buffer, offset, length, value) {
  writeTarString(
    buffer,
    offset,
    length,
    `${value.toString(8).padStart(length - 1, "0")}\0`,
  );
}

function createTarHeader({ name, type = "0", linkName = "", data = Buffer.alloc(0) }) {
  const header = Buffer.alloc(512);
  writeTarString(header, 0, 100, name);
  writeTarOctal(header, 100, 8, type === "5" ? 0o755 : 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, type === "0" ? data.length : 0);
  writeTarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  writeTarString(header, 157, 100, linkName);
  writeTarString(header, 257, 6, "ustar\0");
  writeTarString(header, 263, 2, "00");
  writeTarString(header, 265, 32, "root");
  writeTarString(header, 297, 32, "root");
  writeTarOctal(header, 329, 8, 0);
  writeTarOctal(header, 337, 8, 0);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function createTarGzip(entries) {
  const chunks = [];
  for (const entry of entries) {
    const data = entry.data ?? Buffer.alloc(0);
    chunks.push(createTarHeader({ ...entry, data }));
    if (entry.type === undefined || entry.type === "0") {
      chunks.push(data);
      const padding = (512 - (data.length % 512)) % 512;
      if (padding > 0) chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

function validateArchive(bundle) {
  const bash = process.platform === "win32"
    ? "C:\\Program Files\\Git\\bin\\bash.exe"
    : "bash";
  const portableBundle = process.platform === "win32"
    ? bundle.replace(/^([A-Za-z]):/u, (_, drive) => `/${drive.toLowerCase()}`).replaceAll("\\", "/")
    : bundle;
  return spawnSync(
    bash,
    [join(MAINLAND, "install-release.sh"), "--validate-archive-only", portableBundle],
    { cwd: ROOT, encoding: "utf8" },
  );
}

test("Aliyun VM build targets preserve Hong Kong compatibility and require anonymous mode", () => {
  assert.deepEqual(ALIYUN_BUILD_TARGETS, [
    "aliyun-hk",
    "aliyun-mainland",
    "aliyun-vm",
  ]);
  for (const target of ALIYUN_BUILD_TARGETS) {
    assert.deepEqual(validateDeploymentBuildTarget(target, "public-anonymous"), {
      target,
      isSites: false,
      isAliyunVm: true,
    });
    assert.throws(
      () => validateDeploymentBuildTarget(target, undefined),
      /Aliyun VM builds require NEXT_PUBLIC_FUSIONDIGITAL_MODE=public-anonymous/u,
    );
  }
  assert.equal(validateDeploymentBuildTarget("sites", undefined).isSites, true);
  assert.throws(
    () => validateDeploymentBuildTarget("unknown", "public-anonymous"),
    /Unsupported FUSIONDIGITAL_BUILD_TARGET/u,
  );
});

test("mainland staging does not change the checked-in Hong Kong production contract", async () => {
  const contract = JSON.parse(await read("deploy/production-contract.json"));
  assert.equal(contract.deployment.region, "cn-hongkong");
  assert.equal(contract.deployment.provider, "aliyun-ecs");
  assert.equal(contract.deployment.instanceId, "i-j6c5xpt6lvn9fdpujlt7");
  assert.equal(contract.deployment.publicNetwork.eipId, "eip-j6cn8zd1yjdjqta887j7f");
  assert.equal(contract.deployment.publicIpv4, "47.75.119.239");
  assert.deepEqual(contract.dns.expectedFinalAddresses.A, ["47.75.119.239"]);
  assert.ok(contract.dns.forbiddenTargets.addresses.includes("47.82.66.79"));
  assert.ok(!JSON.stringify(contract).includes("39.96.61.9"));

  for (const document of ["AGENTS.md", "README.md", "docs/RELEASE.md"]) {
    const source = await read(document);
    assert.match(source, /39\.96\.61\.9/u, `${document} must identify the staging IP`);
    assert.match(source, /pre-ICP staging/u, `${document} must identify the pre-ICP boundary`);
    assert.match(source, /47\.75\.119\.239/u, `${document} must retain the production EIP`);
    assert.match(
      source,
      /(?:不得|禁止|清除)[\s\S]{0,160}47\.82\.66\.79|47\.82\.66\.79[\s\S]{0,160}(?:不得|禁止|清除)/u,
      `${document} must identify the legacy Hong Kong IP as forbidden`,
    );
    assert.match(source, /备案/u, `${document} must retain the ICP gate`);
  }
});

test("Alibaba Cloud Linux bootstrap is pinned to the qualified mainland image", async () => {
  const source = await read("deploy/aliyun-mainland/bootstrap-alinux3.sh");
  assert.ok(source.includes('${ID:-} != "alinux"'));
  assert.ok(source.includes('${VERSION_ID:-} != 3*'));
  assert.match(source, /dnf install -y ca-certificates curl tar gzip nginx/u);
  assert.match(source, /https:\/\/rpm\.nodesource\.com\/setup_24\.x/u);
  assert.match(source, /24\.19\.0/u);
  assert.match(source, /usermod -aG fusiondigital nginx/u);
  assert.doesNotMatch(source, /apt-get|www-data|sshd_config|Port 443/u);
});

test("archive preflight accepts only regular files and directories", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "fusiondigital-archive-test-"));
  try {
    const safeBundle = join(temporaryDirectory, "safe.tgz");
    await writeFile(safeBundle, createTarGzip([
      { name: "dist/", type: "5" },
      { name: "dist/index.js", data: Buffer.from("safe\n", "utf8") },
    ]));
    const safeResult = validateArchive(safeBundle);
    assert.equal(
      safeResult.status,
      0,
      `${safeResult.stdout ?? ""}${safeResult.stderr ?? ""}`,
    );

    const rejectedEntries = [
      { label: "symlink", entry: { name: "link", type: "2", linkName: "../../escape" } },
      { label: "hardlink", entry: { name: "hard", type: "1", linkName: "dist/index.js" } },
      { label: "character device", entry: { name: "device", type: "3" } },
      { label: "block device", entry: { name: "block", type: "4" } },
      { label: "FIFO", entry: { name: "pipe", type: "6" } },
      { label: "path traversal", entry: { name: "../escape", data: Buffer.from("bad") } },
    ];
    for (const { label, entry } of rejectedEntries) {
      const bundle = join(temporaryDirectory, `${label.replaceAll(" ", "-")}.tgz`);
      await writeFile(bundle, createTarGzip([entry]));
      const result = validateArchive(bundle);
      assert.notEqual(
        result.status,
        0,
        `${label} archive unexpectedly passed validation`,
      );
      const diagnostic = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.match(
        diagnostic,
        label === "path traversal"
          ? /unsafe archive entry path/u
          : /unsafe archive entry type/u,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("mainland installer verifies immutable release contracts and retries startup", async () => {
  const source = await read("deploy/aliyun-mainland/install-release.sh");
  assert.match(source, /sha256sum --check --strict/u);
  assert.match(source, /flock -n 9/u);
  assert.match(source, /bundle must be owned by root/u);
  assert.match(source, /group\/world write permissions/u);
  assert.match(source, /mktemp -d \/tmp\/fusiondigital-bundle/u);
  assert.match(source, /install -m 0600 "\$BUNDLE" "\$BUNDLE_SNAPSHOT"/u);
  assert.match(source, /validate_release_archive "\$BUNDLE_SNAPSHOT"/u);
  assert.match(source, /only regular files and directories are allowed/u);
  assert.match(source, /find -P "\$PENDING"[^\n]+! -type f ! -type d/u);
  assert.match(source, /-type f -links \+1/u);
  assert.match(source, /realpath -e -- "\$extracted"/u);
  assert.match(source, /manifest\.schemaVersion !== 2/u);
  assert.match(source, /manifest\.commitSha !== process\.argv\[2\]/u);
  assert.match(source, /manifest\.mode !== "public-anonymous"/u);
  assert.match(source, /aliyun-mainland-pre-icp/u);
  assert.match(source, /ITER_COUNT -eq 18/u);
  assert.match(source, /ITER_BYTES -eq 98507692/u);
  assert.match(source, /mv -Tf "\$NEXT_LINK" "\$CURRENT"/u);
  assert.match(source, /FUSIONDIGITAL_HEALTH_ATTEMPTS:-30/u);
  assert.match(source, /rollback_transaction/u);
  assert.match(source, /ln -s "\$PREVIOUS" "\$NEXT_LINK"/u);
  assert.match(source, /cp -a "\$CONFIG_BACKUP_DIR\/nginx\.conf" "\$NGINX_CONFIG"/u);
  assert.match(source, /cp -a "\$CONFIG_BACKUP_DIR\/fusiondigital\.service" "\$SERVICE_CONFIG"/u);
  assert.match(source, /systemctl daemon-reload/u);
  assert.match(source, /systemctl restart fusiondigital/u);
  assert.match(source, /systemctl restart nginx/u);
  assert.match(source, /restoring the previous deployment transaction/u);
  assert.match(source, /deploy\/aliyun-mainland\/server\.mjs/u);
  assert.doesNotMatch(source, /sshd_config|Port 443|certbot/u);

  const releaseValidation = source.indexOf('[[ $RELEASE =~ ^[0-9a-f]{40}');
  const cleanupTrap = source.indexOf("trap cleanup_on_exit EXIT");
  assert.ok(releaseValidation >= 0 && releaseValidation < cleanupTrap);

  const transactionStart = source.indexOf("TRANSACTION_ACTIVE=true");
  const nginxInstall = source.indexOf(
    'install -m 0644 "$TARGET/deploy/aliyun-mainland/nginx.conf"',
  );
  const applicationRestart = source.lastIndexOf("systemctl restart fusiondigital");
  const nginxRestart = source.lastIndexOf("systemctl restart nginx");
  const healthCheck = source.indexOf("if ! wait_for_health");
  const transactionCommit = source.indexOf("TRANSACTION_ACTIVE=false", transactionStart);
  assert.ok(transactionStart >= 0 && transactionStart < nginxInstall);
  assert.ok(nginxInstall < applicationRestart && applicationRestart < nginxRestart);
  assert.ok(nginxRestart < healthCheck && healthCheck < transactionCommit);
});

test("mainland service and Nginx retain the anonymous same-origin security boundary", async () => {
  const [server, service, nginx] = await Promise.all([
    read("deploy/aliyun-mainland/server.mjs"),
    read("deploy/aliyun-mainland/fusiondigital.service"),
    read("deploy/aliyun-mainland/nginx.conf"),
  ]);
  assert.match(server, /host: "127\.0\.0\.1"/u);
  assert.match(server, /NEXT_PUBLIC_FUSIONDIGITAL_MODE must be public-anonymous/u);
  assert.match(service, /deploy\/aliyun-mainland\/server\.mjs/u);
  assert.match(service, /NEXT_PUBLIC_FUSIONDIGITAL_MODE=public-anonymous/u);
  assert.match(nginx, /listen 80 default_server/u);
  assert.match(nginx, /server_name "";[\s\S]*?return 404;/u);
  assert.match(nginx, /server_name fusiondigital\.club www\.fusiondigital\.club/u);
  assert.match(nginx, /location = \/api\/account \{ return 404; \}/u);
  assert.match(nginx, /Accept-Ranges "bytes"/u);
  assert.match(nginx, /proxy_pass http:\/\/fusiondigital_node/u);
  assert.doesNotMatch(nginx, /listen 443|ssl_certificate/u);

  await assert.rejects(
    stat(join(MAINLAND, "finalize-https.sh")),
    (error) => error?.code === "ENOENT",
  );
});

test("mainland build instructions reset Sites gates before selecting the VM target", async () => {
  const readme = await read("deploy/aliyun-mainland/README.md");
  const clearMode = readme.indexOf("Remove-Item Env:NEXT_PUBLIC_FUSIONDIGITAL_MODE");
  const sitesTarget = readme.indexOf('$env:FUSIONDIGITAL_BUILD_TARGET = "sites"');
  const check = readme.indexOf("npm run check");
  const anonymousMode = readme.indexOf(
    '$env:NEXT_PUBLIC_FUSIONDIGITAL_MODE = "public-anonymous"',
  );
  const mainlandTarget = readme.indexOf(
    '$env:FUSIONDIGITAL_BUILD_TARGET = "aliyun-mainland"',
  );
  assert.ok(clearMode >= 0 && clearMode < check);
  assert.ok(sitesTarget >= 0 && sitesTarget < check);
  assert.ok(check < anonymousMode && anonymousMode < mainlandTarget);
});
