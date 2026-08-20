import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { renderNginxConfig } from "../deploy/aliyun-hk/render-nginx-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(join(ROOT, relativePath), "utf8");
}

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

test("Hong Kong installer verifies sidecars, EFIT, ITER, and preserves managed TLS", async () => {
  const [installer, finalize] = await Promise.all([
    read("deploy/aliyun-hk/install-release.sh"),
    read("deploy/aliyun-hk/finalize-https.sh"),
  ]);
  assert.match(installer, /gzip -cd -- "\$ASSET_FILE\.gz" \| cmp -s/u);
  assert.match(installer, /dist\/client\/data\/exl50u-efit\/index\.json/u);
  assert.match(installer, /dist\/client\/data\/exl50u-efit-v2\/index\.json/u);
  assert.match(installer, /device-data\/exl50u-efit-v2/u);
  assert.match(installer, /device-assets\/iter-high-detail\/v1/u);
  assert.match(installer, /DIRECT_DATA_STATUS[\s\S]*?= 404/u);
  assert.match(installer, /render-nginx-config\.mjs/u);
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

  const readme = await read("deploy/aliyun-hk/README.md");
  assert.match(readme, /唯一允许的安装入口/u);
  assert.doesNotMatch(readme, /sudo ln -sfn "\$TARGET" \/srv\/fusiondigital\/current/u);
  assert.doesNotMatch(readme, /sudo install -m 0644[\s\S]{0,160}nginx\.conf/u);
});
