#!/usr/bin/env node

import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error('usage: node scripts/ehl2/meshopt_float_position.mjs <input.glb> <output.glb>');
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(input);

// EHL-2 contains thin preliminary-CAD sheets that collapse on a device-wide
// Int16 position grid. Keep POSITION in Float32, quantize only directions, and
// apply Meshopt as a lossless transport encoding over those position values.
await document.transform(
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({
    pattern: /^(NORMAL|TANGENT)(_\d+)?$/,
    patternTargets: /^(NORMAL|TANGENT)(_\d+)?$/,
    quantizeNormal: 8,
  }),
);
document
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

await io.write(output, document);
