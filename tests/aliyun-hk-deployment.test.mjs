import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  assertOnlyNginxInstaller,
  CERTBOT_NGINX_STATE_FILES,
  ensureCertbotNginxSupport,
  inspectCertbotNginxStateBeforeIssuance,
} from "../deploy/aliyun-hk/certbot-nginx-support.mjs";
import {
  hasManagedCertificate,
  renderNginxConfig,
} from "../deploy/aliyun-hk/render-nginx-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(join(ROOT, relativePath), "utf8");
}

function runNode(args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: process.env,
      windowsHide: true,
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code, signal) => resolveRun({ code, signal, stdout, stderr }));
  });
}

test("Hong Kong Node CLIs execute through the current release directory symlink", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "fusiondigital-cli-symlink-"));
  const current = join(temporaryRoot, "current");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(ROOT, current, linkType);

  try {
    const renderer = join(current, "deploy", "aliyun-hk", "render-nginx-config.mjs");
    const support = join(current, "deploy", "aliyun-hk", "certbot-nginx-support.mjs");
    const template = join(current, "deploy", "aliyun-hk", "nginx.conf");
    const rendered = join(temporaryRoot, "rendered-nginx.conf");

    const renderResult = await runNode([renderer, template, rendered]);
    assert.equal(renderResult.code, 0, renderResult.stderr);
    assert.match(renderResult.stdout, /Rendered FusionDigital Nginx config/u);
    assert.match(await readFile(rendered, "utf8"), /server_name fusiondigital\.club/u);

    const inspectResult = await runNode([support, "--inspect-only"]);
    if (inspectResult.code === 0) {
      assert.match(inspectResult.stdout, /support preflight: (?:ABSENT|READY)/u);
    } else {
      assert.match(inspectResult.stderr, /Certbot Nginx/u);
    }

    const invalidResult = await runNode([support, "--bogus"]);
    assert.notEqual(invalidResult.code, 0);
    assert.match(invalidResult.stderr, /Usage: certbot-nginx-support\.mjs/u);

    const imported = await runNode([
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(pathToFileURL(renderer).href)}); await import(${JSON.stringify(pathToFileURL(support).href)}); console.log("imports-ok");`,
    ]);
    assert.equal(imported.code, 0, imported.stderr);
    assert.equal(imported.stdout.trim(), "imports-ok");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Hong Kong Nginx uses safe named aliases and lossless static compression", async () => {
  const nginx = await read("deploy/aliyun-hk/nginx.conf");
  assert.match(nginx, /listen 80 default_server/u);
  assert.match(nginx, /server_name "";[\s\S]*?return 404;/u);
  assert.match(nginx, /gzip on;/u);
  assert.match(nginx, /gzip_static on;/u);
  assert.match(nginx, /gzip_types[^;]*application\/javascript[^;]*application\/json/u);
  assert.match(nginx, /\?<iter_high_file>/u);
  assert.match(nginx, /\?<efit_json_dir>/u);
  assert.match(nginx, /\?<efit_bin_dir>exl50u-efit/u);
  assert.match(nginx, /\?<efit_gz_dir>exl50u-efit-v2/u);
  assert.match(nginx, /alias[^;]*\$iter_high_file;/u);
  assert.doesNotMatch(nginx, /alias[^;]*\$[12](?:\b|\/)/u);
  assert.match(nginx, /location ~ \^\/device-data\//u);
  assert.doesNotMatch(nginx, /location ~ \^\/(?:\(\?:device-\)\?)?data\/\([^\n]+\)\/[^{]+\{\s*alias/u);
  assert.match(nginx, /\.jsonl\\\.gz\)\$ \{[\s\S]*?gzip off;[\s\S]*?gzip_static off;/u);
  assert.match(nginx, /location ~ \^\/\(\?:device-\)\?data\/exl50u-efit[^{]+\{\s*return 404;/u);
});

test("Hong Kong TLS rendering is deterministic and enables HTTP2", async () => {
  const template = await read("deploy/aliyun-hk/nginx.conf");
  const plain = renderNginxConfig(template, { tlsEnabled: false });
  const secure = renderNginxConfig(template, { tlsEnabled: true });
  assert.doesNotMatch(plain, /listen 443/u);
  assert.match(secure, /listen 443 ssl http2;/u);
  assert.match(secure, /listen \[::\]:443 ssl http2 ipv6only=on;/u);
  assert.match(secure, /ssl_certificate \/etc\/letsencrypt\/live\/fusiondigital\.club\/fullchain\.pem;/u);
  assert.match(secure, /if \(\$scheme = http\) \{ return 301 https:\/\/\$host\$request_uri; \}/u);
  assert.throws(
    () => renderNginxConfig(template.replace("# FUSIONDIGITAL_TLS_END", ""), { tlsEnabled: true }),
    /exactly one ordered TLS marker pair/u,
  );
});

test("managed TLS material groups certificate pairs separately from Certbot Nginx state", async () => {
  const letsencryptRoot = await mkdtemp(join(tmpdir(), "fusiondigital-certbot-state-"));
  const certificateRoot = join(letsencryptRoot, "live", "fusiondigital.club");
  const testSecurityOptions = {
    enforceMode: process.platform !== "win32",
    enforceOwnership: false,
  };
  await mkdir(certificateRoot, { recursive: true });
  let prepareCalls = 0;
  const writeReadySupportState = async () => {
    const options = "safe options-ssl-nginx.conf\n";
    const dhParameters = "safe ssl-dhparams.pem\n";
    await Promise.all([
      writeFile(join(letsencryptRoot, "options-ssl-nginx.conf"), options, { mode: 0o644 }),
      writeFile(join(letsencryptRoot, "ssl-dhparams.pem"), dhParameters, { mode: 0o644 }),
      writeFile(
        join(letsencryptRoot, ".updated-options-ssl-nginx-conf-digest.txt"),
        createHash("sha256").update(options).digest("hex"),
        { mode: 0o644 },
      ),
      writeFile(
        join(letsencryptRoot, ".updated-ssl-dhparams-pem-digest.txt"),
        createHash("sha256").update(dhParameters).digest("hex"),
        { mode: 0o644 },
      ),
    ]);
  };
  const prepare = async () => {
    prepareCalls += 1;
    await writeReadySupportState();
  };
  let certbotStubCalls = 0;
  const issueAfterReadOnlyPreflight = async () => {
    await inspectCertbotNginxStateBeforeIssuance({
      letsencryptRoot,
      ...testSecurityOptions,
    });
    certbotStubCalls += 1;
  };

  try {
    // 0 certificate + 0 support is a valid HTTP-only state.
    assert.equal(await hasManagedCertificate(certificateRoot, letsencryptRoot), false);
    assert.deepEqual(
      await ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      { certificateReady: false, supportReady: false, prepared: false },
    );

    // Any partial, empty, or symlinked support state is INVALID even without a certificate.
    await writeFile(join(letsencryptRoot, "options-ssl-nginx.conf"), "safe options\n");
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      /support state is partial \(1\/4\)/u,
    );
    await assert.rejects(issueAfterReadOnlyPreflight(), /support state is partial \(1\/4\)/u);
    assert.equal(certbotStubCalls, 0);
    await assert.rejects(
      ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      /support state is partial \(1\/4\)/u,
    );
    await rm(join(letsencryptRoot, "options-ssl-nginx.conf"));

    await writeFile(join(letsencryptRoot, "options-ssl-nginx.conf"), "");
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      /Unsafe Certbot Nginx state file/u,
    );
    await assert.rejects(issueAfterReadOnlyPreflight(), /Unsafe Certbot Nginx state file/u);
    assert.equal(certbotStubCalls, 0);
    await rm(join(letsencryptRoot, "options-ssl-nginx.conf"));

    const symlinkTarget = join(letsencryptRoot, "support-target.conf");
    if (process.platform === "win32") {
      await mkdir(symlinkTarget);
    } else {
      await writeFile(symlinkTarget, "safe target\n");
    }
    await symlink(
      symlinkTarget,
      join(letsencryptRoot, "options-ssl-nginx.conf"),
      process.platform === "win32" ? "junction" : "file",
    );
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      /symbolic link/u,
    );
    await assert.rejects(issueAfterReadOnlyPreflight(), /symbolic link/u);
    assert.equal(certbotStubCalls, 0);
    await rm(join(letsencryptRoot, "options-ssl-nginx.conf"));
    await rm(symlinkTarget, { recursive: process.platform === "win32" });

    // A complete READY support state remains HTTP-only without a certificate.
    await writeReadySupportState();
    assert.equal(
      await hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      false,
    );
    assert.deepEqual(
      await ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      { certificateReady: false, supportReady: true, prepared: false },
    );
    assert.equal(prepareCalls, 0);

    await writeFile(
      join(letsencryptRoot, ".updated-options-ssl-nginx-conf-digest.txt"),
      "b".repeat(64),
      { mode: 0o644 },
    );
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      /state digest does not match/u,
    );
    await assert.rejects(issueAfterReadOnlyPreflight(), /state digest does not match/u);
    assert.equal(certbotStubCalls, 0);
    await assert.rejects(
      ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      /state digest does not match/u,
    );
    await Promise.all(CERTBOT_NGINX_STATE_FILES.map(({ basename }) =>
      rm(join(letsencryptRoot, basename))));

    // A half certificate pair always fails closed.
    await writeFile(join(certificateRoot, "fullchain.pem"), "certificate\n");
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot),
      /certificate pair is incomplete or invalid/u,
    );
    await assert.rejects(
      ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      /certificate pair is incomplete or invalid/u,
    );

    // A complete manual certificate pair safely prepares all four state files,
    // enables TLS, and is idempotent on the next invocation.
    await writeFile(join(certificateRoot, "privkey.pem"), "private key\n");
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot),
      /support state is incomplete/u,
    );
    assert.deepEqual(
      await ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      { certificateReady: true, supportReady: true, prepared: true },
    );
    assert.equal(
      await hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      true,
    );
    assert.equal(prepareCalls, 1);
    for (const { basename, kind } of CERTBOT_NGINX_STATE_FILES) {
      const path = join(letsencryptRoot, basename);
      if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o644);
      if (kind === "digest") assert.match(await readFile(path, "utf8"), /^[0-9a-f]{64}$/u);
    }
    assert.deepEqual(
      await ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      { certificateReady: true, supportReady: true, prepared: false },
    );
    assert.equal(prepareCalls, 1);

    await writeFile(
      join(letsencryptRoot, ".updated-options-ssl-nginx-conf-digest.txt"),
      "b".repeat(64),
      { mode: 0o644 },
    );
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      /state digest does not match/u,
    );
    await assert.rejects(
      ensureCertbotNginxSupport({
        certificateRoot,
        letsencryptRoot,
        inspectInstaller: async () => {},
        prepare,
        validateNginx: async () => {},
        ...testSecurityOptions,
      }),
      /state digest does not match/u,
    );
    await writeFile(join(letsencryptRoot, "options-ssl-nginx.conf"), "", { mode: 0o644 });
    await assert.rejects(
      hasManagedCertificate(certificateRoot, letsencryptRoot, testSecurityOptions),
      /Unsafe Certbot Nginx state file/u,
    );
  } finally {
    await rm(letsencryptRoot, { recursive: true, force: true });
  }
});

test("Certbot preparation accepts the nginx installer only", () => {
  assert.doesNotThrow(() => assertOnlyNginxInstaller("* nginx\n"));
  assert.throws(() => assertOnlyNginxInstaller("* apache\n"), /nginx installer only/u);
  assert.throws(
    () => assertOnlyNginxInstaller("* nginx\n* apache\n"),
    /nginx installer only/u,
  );
});

test("Hong Kong installer verifies sidecars, EFIT, ITER, and preserves managed TLS", async () => {
  const [installer, finalize, supportHelper] = await Promise.all([
    read("deploy/aliyun-hk/install-release.sh"),
    read("deploy/aliyun-hk/finalize-https.sh"),
    read("deploy/aliyun-hk/certbot-nginx-support.mjs"),
  ]);
  assert.match(installer, /gzip -cd -- "\$ASSET_FILE\.gz" \| cmp -s/u);
  assert.match(installer, /dist\/client\/data\/exl50u-efit\/index\.json/u);
  assert.match(installer, /dist\/client\/data\/exl50u-efit-v2\/index\.json/u);
  assert.match(installer, /device-data\/exl50u-efit-v2/u);
  assert.match(installer, /device-assets\/iter-high-detail\/v1/u);
  assert.match(installer, /DIRECT_DATA_STATUS[\s\S]*?= 404/u);
  assert.match(installer, /render-nginx-config\.mjs/u);
  assert.match(installer, /certbot-nginx-support\.mjs/u);
  assert.match(installer, /test -f "\$PENDING\/deploy\/aliyun-hk\/direct-execution\.mjs"/u);
  assert.doesNotMatch(installer, /node[^\n]*certbot-nginx-support\.mjs/u);
  assert.match(installer, /TLS_WAS_CONFIGURED/u);
  assert.match(installer, /listen\[\[:space:\]\]\+\[\^;\]\*443\[\^;\]\*ssl/u);
  assert.match(installer, /RENDER_ARGS=\(--require-tls/u);
  assert.match(installer, /restoring the previous Hong Kong deployment transaction/u);
  assert.match(installer, /mv -Tf "\$NEXT_LINK" "\$CURRENT"/u);
  assert.match(installer, /chmod 750[^\n]+finalize-https\.sh/u);
  assert.match(installer, /flock -n 9/u);
  assert.doesNotMatch(installer, /apt-get|nodesource|swapon|usermod/u);
  assert.match(installer, /complete README section 3 first/u);
  assert.match(
    installer,
    /install -d -m 0750 -o root -g fusiondigital \/srv\/fusiondigital "\$RELEASES_ROOT"/u,
  );
  assert.match(installer, /validate_release_archive "\$BUNDLE_SNAPSHOT"/u);
  assert.match(installer, /CONFIG_BACKUP_DIR\/nginx\.conf/u);
  assert.match(installer, /CONFIG_BACKUP_DIR\/nginx-enabled/u);
  assert.match(installer, /manifest\.buildTarget !== "aliyun-hk"/u);
  assert.match(installer, /Content-Range: bytes 0-1023/u);
  assert.match(installer, /Accept-Encoding: gzip/u);
  assert.match(installer, /Content-Type: application\/gzip/u);
  assert.match(installer, /body\[0\] !== 0x1f/u);
  assert.match(installer, /Content-Encoding: gzip/u);
  assert.match(installer, /HTTP_VERSION[\s\S]*?= 2/u);
  assert.match(installer, /ORIGIN_CURL_ARGS/u);
  assert.match(installer, /--noproxy '\*'/u);
  assert.match(installer, /--connect-timeout 2/u);
  assert.match(installer, /--max-time 10/u);
  assert.match(installer, /ORIGIN_URL=https:\/\/fusiondigital\.club/u);
  assert.doesNotMatch(installer, /sort \| head/u);
  assert.match(installer, /LC_ALL=C sort \| sed -n '1p'/u);
  assert.match(installer, /rollback_proven/u);
  assert.match(installer, /rollback could not be proven; retaining failed release/u);
  assert.match(installer, /current still references failed release; retaining/u);
  assert.match(installer, /TARGET_CREATED_BY_THIS_RUN=false/u);
  assert.match(installer, /mv "\$PENDING" "\$TARGET"\s+TARGET_CREATED_BY_THIS_RUN=true/u);
  assert.match(installer, /\$TARGET_CREATED_BY_THIS_RUN/u);
  assert.ok(
    installer.indexOf("is healthy with controlled assets")
      < installer.lastIndexOf("TRANSACTION_ACTIVE=false"),
  );
  assert.match(finalize, /certonly/u);
  assert.match(finalize, /--keep-until-expiring/u);
  assert.match(finalize, /render-nginx-config\.mjs/u);
  assert.match(finalize, /HTTP_VERSION[\s\S]*?= 2/u);
  assert.doesNotMatch(finalize, /--redirect/u);
  assert.match(finalize, /PORT_443_LISTENERS/u);
  assert.match(finalize, /HTTPS finalization will not modify SSH/u);
  assert.ok(finalize.indexOf("PORT_443_LISTENERS") < finalize.indexOf('certbot "${CERTBOT_ARGS[@]}"'));
  assert.match(finalize, /ALLOW_HTTP01=false/u);
  assert.match(finalize, /--http-01/u);
  assert.match(finalize, /CERTIFICATE_READY=true/u);
  assert.match(finalize, /PRESENT_CERTIFICATE_PATHS/u);
  assert.match(finalize, /certificate pair is incomplete or invalid/u);
  assert.match(finalize, /Certificate issuance skipped/u);
  assert.match(finalize, /openssl x509 -checkend 604800/u);
  assert.match(finalize, /openssl x509 -checkhost fusiondigital\.club/u);
  assert.match(finalize, /openssl x509 -checkhost www\.fusiondigital\.club/u);
  assert.match(finalize, /certificate_key_digest[\s\S]*?private_key_digest/u);
  assert.match(finalize, /RENEWAL_CONFIG=\/etc\/letsencrypt\/renewal\/fusiondigital\.club\.conf/u);
  assert.match(finalize, /authenticator\[\[:space:\]\]\*=\[\[:space:\]\]\*manual/u);
  assert.match(finalize, /certbot reconfigure --cert-name fusiondigital\.club --nginx/u);
  assert.match(finalize, /certbot renew --dry-run/u);
  assert.match(finalize, /certbot-nginx-support\.mjs/u);
  assert.match(finalize, /certbot-nginx-support\.mjs" --inspect-only/u);
  assert.ok(
    finalize.indexOf("certbot-nginx-support.mjs")
      < finalize.indexOf("render-nginx-config.mjs"),
  );
  assert.ok(
    finalize.indexOf('certbot-nginx-support.mjs" --inspect-only')
      < finalize.indexOf('certbot "${CERTBOT_ARGS[@]}"'),
  );
  assert.match(finalize, /CONFIG_BACKUP_DIR=\$\(mktemp -d/u);
  assert.match(finalize, /TRANSACTION_ACTIVE=false/u);
  assert.match(finalize, /trap cleanup_on_exit EXIT/u);
  assert.match(finalize, /rollback_nginx/u);
  assert.match(
    finalize,
    /cp -a -- "\$CONFIG_BACKUP_DIR\/nginx\.conf" "\$NGINX_CONFIG"/u,
  );
  assert.ok(
    finalize.indexOf("TRANSACTION_ACTIVE=true")
      < finalize.indexOf("render-nginx-config.mjs"),
  );
  assert.ok(
    finalize.lastIndexOf("TRANSACTION_ACTIVE=false")
      > finalize.indexOf('test "$HTTP_VERSION" = 2'),
  );
  assert.doesNotMatch(
    finalize,
    /sshd_config|SSH_DROPIN|PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|systemctl reload ssh|\/usr\/sbin\/sshd/u,
  );
  assert.match(
    supportHelper,
    /\["plugins", "--prepare", "--installers"\]/u,
  );
  assert.match(supportHelper, /\["plugins", "--installers"\]/u);
  assert.match(supportHelper, /Expected the nginx installer only/u);
  assert.match(supportHelper, /createHash\("sha256"\)/u);
  assert.match(supportHelper, /state digest does not match/u);
  assert.match(supportHelper, /execFileSync\("nginx", \["-t"\]/u);
  assert.match(supportHelper, /options-ssl-nginx\.conf/u);
  assert.match(supportHelper, /ssl-dhparams\.pem/u);
  assert.match(supportHelper, /\.updated-options-ssl-nginx-conf-digest\.txt/u);
  assert.match(supportHelper, /\.updated-ssl-dhparams-pem-digest\.txt/u);
  assert.match(supportHelper, /must have mode 0644/u);
  assert.match(supportHelper, /owned by root:root/u);
  assert.match(supportHelper, /exactly 64 lowercase hex characters/u);
  assert.match(supportHelper, /Usage: certbot-nginx-support\.mjs \[--inspect-only\]/u);
  assert.doesNotMatch(supportHelper, /certbot[^\n]*run[^\n]*manual[^\n]*nginx/u);

  const readme = await read("deploy/aliyun-hk/README.md");
  assert.match(readme, /唯一允许的安装入口/u);
  assert.match(readme, /脚本不会修改、校验或重载\s*SSH/u);
  assert.match(readme, /推荐路径：DNS-01 预签证书/u);
  assert.match(readme, /生产 DNS 仍未切换[\s\S]*?--resolve/u);
  assert.match(readme, /退化路径：HTTP-01 维护窗口/u);
  assert.match(readme, /一次性人工 DNS-01[\s\S]*?certbot reconfigure/u);
  assert.match(readme, /certbot renew --dry-run/u);
  assert.match(readme, /不能宣布正式发布完成/u);
  assert.match(readme, /certbot certonly --manual --preferred-challenges=dns/u);
  assert.match(readme, /certbot plugins --prepare --installers/u);
  assert.match(readme, /774 B/u);
  assert.match(readme, /424 B/u);
  assert.match(readme, /\.updated-options-ssl-nginx-conf-digest\.txt/u);
  assert.match(readme, /\.updated-ssl-dhparams-pem-digest\.txt/u);
  assert.doesNotMatch(readme, /sudo ln -sfn "\$TARGET" \/srv\/fusiondigital\/current/u);
  assert.doesNotMatch(readme, /sudo install -m 0644[\s\S]{0,160}nginx\.conf/u);
});
