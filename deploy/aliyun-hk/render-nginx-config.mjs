#!/usr/bin/env node

import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  classifyCertbotNginxState,
  hasCompleteCertificatePair,
} from "./certbot-nginx-support.mjs";
import { isDirectExecution } from "./direct-execution.mjs";
import { validateRuntimeAssetLock } from "./verify-runtime-assets.mjs";

const TLS_BEGIN = "    # FUSIONDIGITAL_TLS_BEGIN";
const TLS_END = "    # FUSIONDIGITAL_TLS_END";
const CERTIFICATE_ROOT = "/etc/letsencrypt/live/fusiondigital.club";
const LOCKED_GLB_ROUTES_BEGIN = "    # FUSIONDIGITAL_LOCKED_GLB_ROUTES_BEGIN";
const LOCKED_GLB_ROUTES_END = "    # FUSIONDIGITAL_LOCKED_GLB_ROUTES_END";
const LOCKED_GLB_CACHE_CONTROL = Object.freeze({
  immutable: "public, max-age=31536000, immutable",
  short: "public, max-age=3600",
  private: "no-store, private, max-age=0",
});

const TLS_DIRECTIVES = [
  TLS_BEGIN,
  "    listen 443 ssl http2;",
  "    listen [::]:443 ssl http2 ipv6only=on;",
  "    ssl_certificate /etc/letsencrypt/live/fusiondigital.club/fullchain.pem;",
  "    ssl_certificate_key /etc/letsencrypt/live/fusiondigital.club/privkey.pem;",
  "    include /etc/letsencrypt/options-ssl-nginx.conf;",
  "    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;",
  "    if ($scheme = http) { return 301 https://$host$request_uri; }",
  TLS_END,
].join("\n");

function replaceExactMarkerPair(source, begin, end, replacement, label) {
  const start = source.indexOf(begin);
  const finish = source.indexOf(end);
  if (
    start < 0
    || finish < start
    || source.indexOf(begin, start + 1) >= 0
    || source.indexOf(end, finish + 1) >= 0
  ) throw new Error(`Nginx template must contain exactly one ordered ${label} marker pair.`);
  return `${source.slice(0, start)}${replacement}${source.slice(finish + end.length)}`;
}

export function renderLockedGlbRoutes(files = []) {
  if (!Array.isArray(files)) throw new Error("Locked GLB routes must be an array.");
  const seenRoutes = new Set();
  const blocks = files.map((file) => {
    if (
      typeof file?.route !== "string"
      || typeof file?.clientPath !== "string"
      || !/^\/[A-Za-z0-9._/-]+\.glb$/u.test(file.route)
      || !/^models\/[A-Za-z0-9._/-]+\.glb$/u.test(file.clientPath)
      || file.route.includes("//")
      || file.route.split("/").includes("..")
      || file.clientPath.split("/").includes("..")
      || !Object.hasOwn(LOCKED_GLB_CACHE_CONTROL, file.cachePolicy)
      || seenRoutes.has(file.route)
    ) throw new Error("Runtime lock contains a GLB route unsafe for Nginx rendering.");
    seenRoutes.add(file.route);
    return [
      `    location = ${file.route} {`,
      `        alias /srv/fusiondigital/current/dist/client/${file.clientPath};`,
      "        gzip off;",
      "        gzip_static off;",
      "        types { }",
      "        default_type model/gltf-binary;",
      `        add_header Cache-Control "${LOCKED_GLB_CACHE_CONTROL[file.cachePolicy]}" always;`,
      '        add_header Referrer-Policy "no-referrer" always;',
      '        add_header X-Content-Type-Options "nosniff" always;',
      '        add_header Cross-Origin-Resource-Policy "same-origin" always;',
      '        add_header Content-Disposition "inline" always;',
      "        add_header Accept-Ranges $fusiondigital_partial_accept_ranges always;",
      "    }",
    ].join("\n");
  });
  return [LOCKED_GLB_ROUTES_BEGIN, ...blocks, LOCKED_GLB_ROUTES_END].join("\n");
}

export function renderExl50uLockedRoutes(files = []) {
  if (!Array.isArray(files)) throw new Error("EXL-50U locked routes must be an array.");
  return renderLockedGlbRoutes(files.map((file) => {
    if (
      typeof file?.filename !== "string"
      || file.route !== `/device-assets/exl50u-general-assembly/v1/${file.filename}`
      || !/^(?:device\.preview\.[a-f0-9]{64}\.meshopt|anonymous-shard-(?:0[1-9]|1[0-9]|20)\.[a-f0-9]{64}\.high\.meshopt)\.glb$/u.test(file.filename)
    ) throw new Error("EXL-50U runtime lock contains a route unsafe for Nginx rendering.");
    return {
      route: file.route,
      clientPath: `models/exl50u-general-assembly-v1/${file.filename}`,
      cachePolicy: "immutable",
    };
  }));
}

export function lockedGlbRoutesFromRuntimeLock(runtimeLock, bundles) {
  const routes = [];
  const exl50uInteractivePrefix = "public/models/exl50u-interactive/";
  for (const file of runtimeLock.gitAssets.files) {
    if (!file.path.toLowerCase().endsWith(".glb")) continue;
    const clientPath = file.path.slice("public/".length);
    // Preserve the reviewed browser-facing aliases without leaving their
    // backing GLBs outside the runtime-lock-derived route set.
    const route = file.path.startsWith(exl50uInteractivePrefix)
      ? `/device-assets/exl50u-interactive/${file.path.slice(exl50uInteractivePrefix.length)}`
      : `/${clientPath}`;
    routes.push({
      route,
      clientPath,
      cachePolicy: file.path.startsWith(exl50uInteractivePrefix) ? "private" : "short",
    });
  }
  for (const bundle of bundles) {
    const clientRoot = bundle.destinationRoot.slice("public/".length);
    for (const file of bundle.files) {
      routes.push({
        route: file.route,
        clientPath: `${clientRoot}/${file.filename}`,
        cachePolicy: "immutable",
      });
    }
  }
  return routes;
}

export function renderNginxConfig(source, { tlsEnabled, exl50uFiles = [], lockedGlbRoutes }) {
  const start = source.indexOf(TLS_BEGIN);
  const end = source.indexOf(TLS_END);
  if (
    start < 0
    || end < start
    || source.indexOf(TLS_BEGIN, start + 1) >= 0
    || source.indexOf(TLS_END, end + 1) >= 0
  ) {
    throw new Error("Nginx template must contain exactly one ordered TLS marker pair.");
  }
  const endOffset = end + TLS_END.length;
  const replacement = tlsEnabled ? TLS_DIRECTIVES : `${TLS_BEGIN}\n${TLS_END}`;
  const tlsRendered = `${source.slice(0, start)}${replacement}${source.slice(endOffset)}`;
  return replaceExactMarkerPair(
    tlsRendered,
    LOCKED_GLB_ROUTES_BEGIN,
    LOCKED_GLB_ROUTES_END,
    lockedGlbRoutes === undefined
      ? renderExl50uLockedRoutes(exl50uFiles)
      : renderLockedGlbRoutes(lockedGlbRoutes),
    "locked-GLB-route",
  );
}

export async function hasManagedCertificate(
  root = CERTIFICATE_ROOT,
  letsencryptRoot = "/etc/letsencrypt",
  stateSecurity = {},
) {
  const supportState = await classifyCertbotNginxState({ ...stateSecurity, letsencryptRoot });
  if (supportState.status === "INVALID") throw supportState.error;
  if (!(await hasCompleteCertificatePair(root))) return false;
  if (supportState.status !== "READY") {
    throw new Error("Certbot Nginx support state is incomplete; run the shared prepare helper.");
  }
  return true;
}

export async function renderToFile({ sourcePath, destinationPath, runtimeLockPath, requireTls = false }) {
  if (!runtimeLockPath) throw new Error("A runtime asset lock is required for Nginx rendering.");
  const runtimeLock = JSON.parse(await readFile(runtimeLockPath, "utf8"));
  const bundles = validateRuntimeAssetLock(runtimeLock);
  const lockedGlbRoutes = lockedGlbRoutesFromRuntimeLock(runtimeLock, bundles);
  const tlsEnabled = await hasManagedCertificate();
  if (requireTls && !tlsEnabled) {
    throw new Error("Managed fusiondigital.club certificate files are missing.");
  }
  const rendered = renderNginxConfig(await readFile(sourcePath, "utf8"), { tlsEnabled, lockedGlbRoutes });
  await mkdir(dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, rendered, { encoding: "utf8", mode: 0o600 });
    await chmod(temporaryPath, 0o644);
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return { tlsEnabled };
}

async function main() {
  const args = process.argv.slice(2);
  const requireTlsIndex = args.indexOf("--require-tls");
  const requireTls = requireTlsIndex >= 0;
  if (requireTls) args.splice(requireTlsIndex, 1);
  const runtimeLockIndex = args.indexOf("--runtime-lock");
  if (runtimeLockIndex < 0 || !args[runtimeLockIndex + 1]) {
    throw new Error("Usage: render-nginx-config.mjs [--require-tls] --runtime-lock LOCK SOURCE DESTINATION");
  }
  const runtimeLockPath = resolve(args[runtimeLockIndex + 1]);
  args.splice(runtimeLockIndex, 2);
  if (args.length !== 2) throw new Error("Usage: render-nginx-config.mjs [--require-tls] --runtime-lock LOCK SOURCE DESTINATION");
  const result = await renderToFile({
    sourcePath: resolve(args[0]),
    destinationPath: resolve(args[1]),
    runtimeLockPath,
    requireTls,
  });
  console.log(`Rendered FusionDigital Nginx config (TLS/HTTP2=${result.tlsEnabled}).`);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
