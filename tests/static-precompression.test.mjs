import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import { precompressStaticAssets } from "../scripts/deployment/precompress-static-assets.mjs";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("Aliyun static precompression is lossless and limited to sizeable JS/CSS", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fusiondigital-precompress-"));
  try {
    const nested = join(directory, "nested");
    await mkdir(nested);
    const javascript = Buffer.from("export const plasma = 'stable';\n".repeat(96), "utf8");
    const stylesheet = Buffer.from(".fusion { color: #53d8ff; }\n".repeat(96), "utf8");
    await Promise.all([
      writeFile(join(directory, "large.js"), javascript),
      writeFile(join(nested, "large.css"), stylesheet),
      writeFile(join(directory, "small.js"), "export default 1;\n"),
      writeFile(join(directory, "image.svg"), "<svg></svg>"),
    ]);

    const result = await precompressStaticAssets({
      assetsUrl: pathToFileURL(`${directory}/`),
    });
    assert.equal(result.fileCount, 2);
    assert.equal(result.sourceBytes, javascript.length + stylesheet.length);
    assert.ok(result.compressedBytes < result.sourceBytes);
    assert.deepEqual(gunzipSync(await readFile(join(directory, "large.js.gz"))), javascript);
    assert.deepEqual(gunzipSync(await readFile(join(nested, "large.css.gz"))), stylesheet);
    assert.equal(await exists(join(directory, "small.js.gz")), false);
    assert.equal(await exists(join(directory, "image.svg.gz")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
