#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targets = process.argv.slice(2).map((value) => path.resolve(value));
if (targets.length === 0) {
  throw new Error('Usage: node scripts/iter/normalize_public_glb_metadata.mjs <file.glb> [...]');
}

function paddedJsonBuffer(document) {
  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const padding = (4 - (json.byteLength % 4)) % 4;
  return padding === 0 ? json : Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
}

for (const target of targets) {
  const source = await readFile(target);
  if (source.byteLength < 20
    || source.readUInt32LE(0) !== 0x46546c67
    || source.readUInt32LE(4) !== 2
    || source.readUInt32LE(8) !== source.byteLength
    || source.readUInt32LE(16) !== 0x4e4f534a) {
    throw new Error(`${target} is not a complete glTF 2.0 binary with a leading JSON chunk.`);
  }
  const oldJsonLength = source.readUInt32LE(12);
  const oldJsonEnd = 20 + oldJsonLength;
  if (oldJsonEnd > source.byteLength) throw new Error(`${target} has an out-of-range JSON chunk.`);
  const document = JSON.parse(source.subarray(20, oldJsonEnd).toString('utf8').trimEnd());
  document.asset ??= { version: '2.0' };
  document.asset.extras ??= {};
  delete document.asset.extras.candidateStatus;
  document.asset.extras.publicationStatus = 'PUBLIC_VISUALIZATION_DERIVATIVE_REVIEWED';
  for (const node of document.nodes ?? []) {
    if (typeof node?.name !== 'string' || !node.name.startsWith('ITER_PART__')) continue;
    node.extras ??= {};
    if (typeof node.extras.geometryStatus === 'string') {
      node.extras.geometryStatus = 'registered-public-visualization-derivative';
    }
  }
  if (/(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/|\bprivate\b|source\.path|PRIVATE_PREVIEW_INCOMPLETE)/i.test(JSON.stringify(document))) {
    throw new Error(`${target} still contains private provenance after normalization.`);
  }
  const json = paddedJsonBuffer(document);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.byteLength + (source.byteLength - oldJsonEnd), 8);
  header.writeUInt32LE(json.byteLength, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const output = Buffer.concat([header, json, source.subarray(oldJsonEnd)]);
  if (output.readUInt32LE(8) !== output.byteLength) throw new Error(`${target} rewrite length mismatch.`);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, output);
  await rename(temporary, target);
}
