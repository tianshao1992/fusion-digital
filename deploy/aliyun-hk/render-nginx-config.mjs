#!/usr/bin/env node

import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const TLS_BEGIN = "    # FUSIONDIGITAL_TLS_BEGIN";
const TLS_END = "    # FUSIONDIGITAL_TLS_END";
const CERTIFICATE_ROOT = "/etc/letsencrypt/live/fusiondigital.club";

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

export function renderNginxConfig(source, { tlsEnabled }) {
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
  return `${source.slice(0, start)}${replacement}${source.slice(endOffset)}`;
}

async function isRegularFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function hasManagedCertificate(root = CERTIFICATE_ROOT) {
  const [certificate, privateKey, options, dhParameters] = await Promise.all([
    isRegularFile(resolve(root, "fullchain.pem")),
    isRegularFile(resolve(root, "privkey.pem")),
    isRegularFile("/etc/letsencrypt/options-ssl-nginx.conf"),
    isRegularFile("/etc/letsencrypt/ssl-dhparams.pem"),
  ]);
  if (!certificate && !privateKey) return false;
  if (!certificate || !privateKey || !options || !dhParameters) {
    throw new Error("Managed fusiondigital.club certificate configuration is incomplete.");
  }
  return true;
}

export async function renderToFile({ sourcePath, destinationPath, requireTls = false }) {
  const tlsEnabled = await hasManagedCertificate();
  if (requireTls && !tlsEnabled) {
    throw new Error("Managed fusiondigital.club certificate files are missing.");
  }
  const rendered = renderNginxConfig(await readFile(sourcePath, "utf8"), { tlsEnabled });
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
  if (args.length !== 2) {
    throw new Error("Usage: render-nginx-config.mjs [--require-tls] SOURCE DESTINATION");
  }
  const result = await renderToFile({
    sourcePath: resolve(args[0]),
    destinationPath: resolve(args[1]),
    requireTls,
  });
  console.log(`Rendered FusionDigital Nginx config (TLS/HTTP2=${result.tlsEnabled}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
