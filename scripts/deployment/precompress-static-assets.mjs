#!/usr/bin/env node

import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const gzipAsync = promisify(gzip);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ASSETS_URL = new URL("../../dist/client/assets/", import.meta.url);
const MINIMUM_BYTES = 1024;
const COMPRESSIBLE_EXTENSION = /\.(?:css|js)$/u;

async function filesUnder(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const entryUrl = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directoryUrl);
    return entry.isDirectory() ? filesUnder(entryUrl) : [entryUrl];
  }))).flat();
}

export async function precompressStaticAssets({
  assetsUrl = DEFAULT_ASSETS_URL,
  minimumBytes = MINIMUM_BYTES,
} = {}) {
  if (!(assetsUrl instanceof URL) || !assetsUrl.href.endsWith("/")) {
    throw new Error("assetsUrl must be a directory URL.");
  }
  if (!Number.isSafeInteger(minimumBytes) || minimumBytes < 1) {
    throw new Error("minimumBytes must be a positive safe integer.");
  }

  const candidates = (await filesUnder(assetsUrl))
    .filter((fileUrl) => COMPRESSIBLE_EXTENSION.test(fileUrl.pathname))
    .sort((left, right) => left.href.localeCompare(right.href));
  let sourceBytes = 0;
  let compressedBytes = 0;
  let fileCount = 0;

  for (const fileUrl of candidates) {
    const fileStat = await stat(fileUrl);
    if (!fileStat.isFile() || fileStat.size < minimumBytes) continue;
    const source = await readFile(fileUrl);
    const compressed = await gzipAsync(source, { level: 9, mtime: 0 });
    await writeFile(new URL(`${fileUrl.pathname.split("/").at(-1)}.gz`, fileUrl), compressed);
    sourceBytes += source.length;
    compressedBytes += compressed.length;
    fileCount += 1;
  }

  return { fileCount, sourceBytes, compressedBytes };
}

async function main() {
  if (process.argv.length > 3) {
    throw new Error("Usage: precompress-static-assets.mjs [ASSETS_DIRECTORY]");
  }
  const assetsUrl = process.argv[2]
    ? pathToFileURL(`${resolve(process.argv[2])}/`)
    : DEFAULT_ASSETS_URL;
  const result = await precompressStaticAssets({ assetsUrl });
  console.log(
    `Precompressed ${result.fileCount} JS/CSS assets: `
    + `${result.sourceBytes} -> ${result.compressedBytes} bytes.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
