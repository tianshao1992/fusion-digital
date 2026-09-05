#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Box3, Matrix4 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import {
  EXL50U_GA_BUNDLE_ID,
  EXL50U_GA_ASSET_FORMAT,
  EXL50U_GA_MAX_BUNDLE_DECODED_BYTES,
  EXL50U_GA_MAX_BUNDLE_PLACEMENT_INSTANCES,
  EXL50U_GA_MAX_DRAW_CALLS,
  EXL50U_GA_MAX_SCENE_TRIANGLES,
  EXL50U_GA_MAX_PREVIEW_BYTES,
  EXL50U_GA_MAX_PREVIEW_DECODED_BYTES,
  EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD,
  EXL50U_GA_MAX_SHARD_BYTES,
  EXL50U_GA_MAX_SHARD_DECODED_BYTES,
  EXL50U_GA_MAX_TOTAL_BYTES,
  EXL50U_GA_PUBLICATION_NOTICE,
  EXL50U_GA_ROUTE_ROOT,
  EXL50U_GA_SHARD_COUNT,
  extractExl50uGeneralAssemblyAssets,
  normalizeExl50uGeneralAssemblyDerivationEvidence,
} from "./exl50u-general-assembly-runtime-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const TEMPLATE_PATH = new URL("./exl50u-general-assembly-manifest-template.json", import.meta.url);
const FIXED_TEMPLATE = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8"));
const ROOT_NODE_NAME = "EXL50U_GA_VISUALIZATION";
const REQUIRED_EXTENSIONS = ["EXT_mesh_gpu_instancing", "EXT_meshopt_compression"];
const COMPONENT_BYTES = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const TYPE_COMPONENTS = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4], ["MAT2", 4], ["MAT3", 9], ["MAT4", 16]]);
const TOP_LEVEL_KEYS = [
  "accessors", "asset", "bufferViews", "buffers", "extensionsRequired",
  "extensionsUsed", "meshes", "nodes", "scene", "scenes",
];
if (globalThis.ProgressEvent === undefined) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactObjectKeys(value, required, optional, label) {
  if (!object(value)) throw new Error(`${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || actual.some((key) => !allowed.has(key))) {
    throw new Error(`${label} contains missing or non-whitelisted fields`);
  }
  return value;
}

function exactArray(value, length, label) {
  if (!Array.isArray(value) || (length !== undefined && value.length !== length)) {
    throw new Error(`${label} must be an array${length === undefined ? "" : ` of length ${length}`}`);
  }
  return value;
}

function safeIndex(value, length, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= length) {
    throw new Error(`${label} is out of range`);
  }
  return value;
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function finiteNumberArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(item))) {
    throw new Error(`${label} must contain exactly ${length} finite numbers`);
  }
  return value;
}

function assertPaddingOnly(bytes, start, end, label, maximum = 3, paddingByte = 0) {
  const length = end - start;
  if (length < 0 || length > maximum || bytes.subarray(start, end).some((value) => value !== paddingByte)) {
    throw new Error(`${label} contains non-alignment or redundant bytes`);
  }
}

function assertPackedRanges(ranges, byteLength, bytes, label) {
  const ordered = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = 0;
  for (const range of ordered) {
    if (range.start < cursor || range.end <= range.start || range.end > byteLength) {
      throw new Error(`${label} contains overlapping or out-of-range data`);
    }
    if (bytes) assertPaddingOnly(bytes, cursor, range.start, `${label} gap`);
    else if (range.start - cursor > 3) throw new Error(`${label} contains redundant gaps`);
    cursor = range.end;
  }
  if (bytes) assertPaddingOnly(bytes, cursor, byteLength, `${label} tail`);
  else if (byteLength - cursor > 3) throw new Error(`${label} contains redundant trailing space`);
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === ""
    || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function safeBasename(value, label) {
  if (
    typeof value !== "string"
    || value === ""
    || isAbsolute(value)
    || basename(value) !== value
    || value.includes("..")
    || !/^[A-Za-z0-9._-]+\.glb$/u.test(value)
  ) throw new Error(`${label} must be a safe GLB basename`);
  return value;
}

async function sha256File(pathname) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(pathname)) hash.update(chunk);
  return hash.digest("hex");
}

function assertNoDuplicateJsonObjectKeys(source) {
  let cursor = 0;
  const whitespace = /\s/u;
  const skipWhitespace = () => {
    while (cursor < source.length && whitespace.test(source[cursor])) cursor += 1;
  };
  const readString = () => {
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (source[cursor] === '"') {
        cursor += 1;
        return JSON.parse(source.slice(start, cursor));
      }
      cursor += 1;
    }
    throw new Error("GLB JSON contains an unterminated string");
  };
  const parseValue = () => {
    skipWhitespace();
    if (source[cursor] === "{") {
      cursor += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        skipWhitespace();
        const key = readString();
        if (keys.has(key)) throw new Error(`GLB JSON contains a duplicate object key: ${key}`);
        keys.add(key);
        skipWhitespace();
        if (source[cursor] !== ":") throw new Error("GLB JSON object separator is invalid");
        cursor += 1;
        parseValue();
        skipWhitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") throw new Error("GLB JSON object delimiter is invalid");
        cursor += 1;
      }
      throw new Error("GLB JSON object is unterminated");
    }
    if (source[cursor] === "[") {
      cursor += 1;
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        parseValue();
        skipWhitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") throw new Error("GLB JSON array delimiter is invalid");
        cursor += 1;
      }
      throw new Error("GLB JSON array is unterminated");
    }
    if (source[cursor] === '"') {
      readString();
      return;
    }
    const start = cursor;
    while (cursor < source.length && !/[\s,}\]]/u.test(source[cursor])) cursor += 1;
    if (cursor === start) throw new Error("GLB JSON value is invalid");
  };
  parseValue();
  skipWhitespace();
  if (cursor !== source.length) throw new Error("GLB JSON contains trailing data");
}

function parseGlbJson(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.byteLength < 28
    || view.getUint32(0, true) !== 0x46546c67
    || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength
  ) throw new Error("asset is not an exact GLB 2.0 container");
  let offset = 12;
  let document;
  let jsonBytes;
  let binBytes;
  let jsonChunks = 0;
  let binChunks = 0;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.byteLength) throw new Error("GLB chunk exceeds the declared container");
    if (type === 0x4e4f534a) {
      if (offset !== 12) throw new Error("GLB JSON chunk must be first");
      jsonChunks += 1;
      jsonBytes = bytes.subarray(start, end);
      let jsonEnd = jsonBytes.byteLength;
      while (jsonEnd > 0 && jsonBytes[jsonEnd - 1] === 0x20) jsonEnd -= 1;
      assertPaddingOnly(jsonBytes, jsonEnd, jsonBytes.byteLength, "GLB JSON padding", 3, 0x20);
      const jsonSource = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes.subarray(0, jsonEnd));
      document = JSON.parse(jsonSource);
      assertNoDuplicateJsonObjectKeys(jsonSource);
    } else if (type === 0x004e4942) {
      if (jsonChunks !== 1) throw new Error("GLB BIN chunk must follow the JSON chunk");
      binChunks += 1;
      binBytes = bytes.subarray(start, end);
    } else {
      throw new Error("GLB contains an undeclared chunk type");
    }
    offset = end;
  }
  if (offset !== bytes.byteLength || jsonChunks !== 1 || binChunks !== 1 || !object(document)) {
    throw new Error("GLB must contain exactly one JSON and one BIN chunk");
  }
  if (Object.keys(document).length !== TOP_LEVEL_KEYS.length
    || Object.keys(document).some((key) => !TOP_LEVEL_KEYS.includes(key))) {
    throw new Error("GLB top-level container fields are not on the anonymous visualization whitelist");
  }
  exactObjectKeys(document.asset, ["version"], [], "GLB asset");
  if (document.asset.version !== "2.0") throw new Error("GLB asset must contain only version 2.0");
  const used = [...(document.extensionsUsed ?? [])].sort();
  const required = [...(document.extensionsRequired ?? [])].sort();
  if (
    JSON.stringify(used) !== JSON.stringify([...REQUIRED_EXTENSIONS].sort())
    || JSON.stringify(required) !== JSON.stringify([...REQUIRED_EXTENSIONS].sort())
  ) throw new Error("GLB must require only GPU instancing and Meshopt");

  const accessors = exactArray(document.accessors, undefined, "GLB accessors");
  const bufferViews = exactArray(document.bufferViews, undefined, "GLB bufferViews");
  const buffers = exactArray(document.buffers, 2, "GLB buffers");
  const meshes = exactArray(document.meshes, undefined, "GLB meshes");
  const nodes = exactArray(document.nodes, undefined, "GLB nodes");
  if ([accessors, bufferViews, meshes, nodes].some((items) => items.length === 0)) {
    throw new Error("GLB anonymous visualization arrays must be non-empty");
  }
  exactObjectKeys(buffers[0], ["byteLength"], [], "GLB compressed buffer");
  exactObjectKeys(buffers[1], ["byteLength", "extensions"], [], "GLB fallback buffer");
  positiveSafeInteger(buffers[0].byteLength, "GLB compressed buffer byteLength");
  positiveSafeInteger(buffers[1].byteLength, "GLB fallback buffer byteLength");
  exactObjectKeys(buffers[1].extensions, ["EXT_meshopt_compression"], [], "GLB fallback buffer extensions");
  exactObjectKeys(
    buffers[1].extensions.EXT_meshopt_compression,
    ["fallback"],
    [],
    "GLB fallback declaration",
  );
  if (buffers[1].extensions.EXT_meshopt_compression.fallback !== true) {
    throw new Error("GLB must declare the exact Meshopt fallback buffer");
  }
  if (binBytes.byteLength < buffers[0].byteLength || binBytes.byteLength - buffers[0].byteLength > 3) {
    throw new Error("GLB BIN chunk length differs from its compressed buffer");
  }
  assertPaddingOnly(binBytes, buffers[0].byteLength, binBytes.byteLength, "GLB BIN chunk tail");

  const compressedRanges = [];
  const fallbackRanges = [];
  for (let index = 0; index < bufferViews.length; index += 1) {
    const bufferView = exactObjectKeys(
      bufferViews[index],
      ["buffer", "byteOffset", "byteLength", "extensions"],
      ["byteStride", "target"],
      `GLB bufferViews[${index}]`,
    );
    if (bufferView.buffer !== 1) throw new Error(`GLB bufferViews[${index}] must reference only the fallback buffer`);
    const byteOffset = nonNegativeSafeInteger(bufferView.byteOffset, `GLB bufferViews[${index}].byteOffset`);
    const byteLength = positiveSafeInteger(bufferView.byteLength, `GLB bufferViews[${index}].byteLength`);
    if (byteOffset + byteLength > buffers[1].byteLength) throw new Error(`GLB bufferViews[${index}] exceeds fallback buffer`);
    if (bufferView.byteStride !== undefined) {
      const stride = positiveSafeInteger(bufferView.byteStride, `GLB bufferViews[${index}].byteStride`);
      if (stride > 252 || stride % 4 !== 0) throw new Error(`GLB bufferViews[${index}].byteStride is invalid`);
    }
    if (bufferView.target !== undefined && ![34962, 34963].includes(bufferView.target)) {
      throw new Error(`GLB bufferViews[${index}].target is not whitelisted`);
    }
    exactObjectKeys(bufferView.extensions, ["EXT_meshopt_compression"], [], `GLB bufferViews[${index}].extensions`);
    const compression = exactObjectKeys(
      bufferView.extensions.EXT_meshopt_compression,
      ["buffer", "byteOffset", "byteLength", "mode", "byteStride", "count"],
      ["filter"],
      `GLB bufferViews[${index}] Meshopt declaration`,
    );
    if (compression.buffer !== 0) throw new Error(`GLB bufferViews[${index}] Meshopt data must use buffer 0`);
    const compressedOffset = nonNegativeSafeInteger(compression.byteOffset, `GLB bufferViews[${index}] compressed offset`);
    const compressedLength = positiveSafeInteger(compression.byteLength, `GLB bufferViews[${index}] compressed length`);
    positiveSafeInteger(compression.byteStride, `GLB bufferViews[${index}] compressed stride`);
    positiveSafeInteger(compression.count, `GLB bufferViews[${index}] compressed count`);
    if (compressedOffset + compressedLength > buffers[0].byteLength) {
      throw new Error(`GLB bufferViews[${index}] compressed range exceeds BIN buffer`);
    }
    if (!["ATTRIBUTES", "TRIANGLES"].includes(compression.mode)
      || (compression.filter !== undefined && compression.filter !== "OCTAHEDRAL")) {
      throw new Error(`GLB bufferViews[${index}] Meshopt mode or filter is not whitelisted`);
    }
    compressedRanges.push({ start: compressedOffset, end: compressedOffset + compressedLength });
    fallbackRanges.push({ start: byteOffset, end: byteOffset + byteLength });
  }
  assertPackedRanges(compressedRanges, buffers[0].byteLength, binBytes, "GLB compressed BIN data");
  assertPackedRanges(fallbackRanges, buffers[1].byteLength, null, "GLB fallback layout");

  const accessorRangesByBufferView = new Map();
  for (let index = 0; index < accessors.length; index += 1) {
    const accessor = exactObjectKeys(
      accessors[index],
      ["bufferView", "componentType", "count", "type"],
      ["byteOffset", "normalized", "min", "max"],
      `GLB accessors[${index}]`,
    );
    const viewIndex = safeIndex(accessor.bufferView, bufferViews.length, `GLB accessors[${index}].bufferView`);
    if (!COMPONENT_BYTES.has(accessor.componentType) || !TYPE_COMPONENTS.has(accessor.type)) {
      throw new Error(`GLB accessors[${index}] scalar layout is not whitelisted`);
    }
    positiveSafeInteger(accessor.count, `GLB accessors[${index}].count`);
    const accessorByteOffset = nonNegativeSafeInteger(
      accessor.byteOffset ?? 0,
      `GLB accessors[${index}].byteOffset`,
    );
    if (![undefined, true, false].includes(accessor.normalized)) {
      throw new Error(`GLB accessors[${index}] offset or normalization is invalid`);
    }
    const components = TYPE_COMPONENTS.get(accessor.type);
    if (accessor.min !== undefined) finiteNumberArray(accessor.min, components, `GLB accessors[${index}].min`);
    if (accessor.max !== undefined) finiteNumberArray(accessor.max, components, `GLB accessors[${index}].max`);
    const compression = bufferViews[viewIndex].extensions.EXT_meshopt_compression;
    const accessorByteLength = accessor.count * compression.byteStride;
    if (!Number.isSafeInteger(accessorByteLength)
      || accessorByteOffset % compression.byteStride !== 0
      || accessorByteOffset + accessorByteLength > bufferViews[viewIndex].byteLength) {
      throw new Error(`GLB accessors[${index}] range is invalid for its Meshopt bufferView`);
    }
    const ranges = accessorRangesByBufferView.get(viewIndex) ?? [];
    ranges.push({ start: accessorByteOffset, end: accessorByteOffset + accessorByteLength });
    accessorRangesByBufferView.set(viewIndex, ranges);
  }
  if (accessorRangesByBufferView.size !== bufferViews.length) throw new Error("GLB contains an unreferenced bufferView");
  for (let viewIndex = 0; viewIndex < bufferViews.length; viewIndex += 1) {
    const bufferView = bufferViews[viewIndex];
    const compression = bufferView.extensions.EXT_meshopt_compression;
    const ranges = [...accessorRangesByBufferView.get(viewIndex)].sort((left, right) => left.start - right.start);
    if (compression.mode === "ATTRIBUTES") {
      if (ranges.length !== 1 || ranges[0].start !== 0 || ranges[0].end !== bufferView.byteLength
        || compression.count * compression.byteStride !== bufferView.byteLength) {
        throw new Error(`GLB attribute bufferView[${viewIndex}] must contain exactly one complete accessor`);
      }
    } else if (compression.mode !== "TRIANGLES"
      || compression.count * compression.byteStride !== bufferView.byteLength
      || ranges[0].start !== 0
      || ranges.at(-1).end !== bufferView.byteLength
      || ranges.some((range, index) => index > 0 && range.start !== ranges[index - 1].end)) {
      throw new Error(`GLB triangle bufferView[${viewIndex}] accessors must form one exact non-overlapping partition`);
    }
  }

  const scenes = exactArray(document.scenes, 1, "GLB scenes");
  exactObjectKeys(scenes[0], ["nodes"], [], "GLB scene");
  if (
    document.scene !== 0
    || !Array.isArray(scenes[0].nodes)
    || scenes[0].nodes.length !== 1
    || scenes[0].nodes[0] !== 0
  ) {
    throw new Error("GLB must be anonymous and have one scene with one unnamed root node");
  }
  const visited = new Set();
  const visiting = new Set();
  const parentByChild = new Map();
  const referencedMeshes = new Set();
  const referencedAccessors = new Map();
  let instancedNodeCount = 0;
  function claimSemanticAccessor(accessorIndex, label, expected) {
    const semanticClass = label.includes("POSITION") ? "POSITION"
      : label.includes("NORMAL") ? "NORMAL"
        : label.includes("indices") ? "INDICES"
          : label.split(" ", 1)[0];
    if (referencedAccessors.has(accessorIndex)
      && referencedAccessors.get(accessorIndex) !== semanticClass) {
      throw new Error(`GLB accessor is reused across incompatible public semantics: ${label}`);
    }
    referencedAccessors.set(accessorIndex, semanticClass);
    const accessor = accessors[accessorIndex];
    const bufferView = bufferViews[accessor.bufferView];
    const compression = bufferView.extensions.EXT_meshopt_compression;
    if (
      (Array.isArray(expected.componentType)
        ? !expected.componentType.includes(accessor.componentType)
        : accessor.componentType !== expected.componentType)
      || accessor.type !== expected.type
      || (accessor.normalized === true) !== expected.normalized
      || compression.mode !== expected.mode
      || (compression.filter ?? null) !== expected.filter
      || compression.byteStride !== (expected.byteStride ?? COMPONENT_BYTES.get(accessor.componentType))
      || (bufferView.byteStride !== undefined
        && bufferView.byteStride !== (expected.byteStride ?? COMPONENT_BYTES.get(accessor.componentType)))
      || (bufferView.target !== undefined && bufferView.target !== expected.target)
    ) throw new Error(`GLB ${label} storage is not the fixed anonymous public layout`);
    return accessor;
  }
  function visitNode(index) {
    safeIndex(index, nodes.length, "GLB node child index");
    if (visiting.has(index)) throw new Error("GLB node tree contains a cycle");
    if (visited.has(index)) return;
    visiting.add(index);
    const node = exactObjectKeys(nodes[index], [], ["children", "extensions", "matrix", "mesh", "rotation"], `GLB nodes[${index}]`);
    if (node.matrix !== undefined) finiteNumberArray(node.matrix, 16, `GLB nodes[${index}].matrix`);
    if (node.rotation !== undefined) {
      finiteNumberArray(node.rotation, 4, `GLB nodes[${index}].rotation`);
      const expectedRootRotation = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
      if (index !== 0 || node.rotation.some((value, axis) => Math.abs(value - expectedRootRotation[axis]) > 1e-15)) {
        throw new Error("GLB permits only the fixed anonymous source-Z-up to public-Y-up root rotation");
      }
    }
    if (node.mesh !== undefined) referencedMeshes.add(safeIndex(node.mesh, meshes.length, `GLB nodes[${index}].mesh`));
    if (node.extensions !== undefined) {
      exactObjectKeys(node.extensions, ["EXT_mesh_gpu_instancing"], [], `GLB nodes[${index}].extensions`);
      const instancing = exactObjectKeys(
        node.extensions.EXT_mesh_gpu_instancing,
        ["attributes"],
        [],
        `GLB nodes[${index}] instancing`,
      );
      exactObjectKeys(instancing.attributes, [], ["TRANSLATION", "ROTATION", "SCALE"], `GLB nodes[${index}] instancing attributes`);
      const entries = Object.entries(instancing.attributes);
      if (entries.length === 0 || node.mesh === undefined) throw new Error("GLB instancing must bind at least one transform to a mesh");
      let count;
      for (const [semantic, accessorIndex] of entries) {
        const safeAccessorIndex = safeIndex(accessorIndex, accessors.length, `GLB ${semantic} accessor`);
        const expectedType = semantic === "ROTATION" ? "VEC4" : "VEC3";
        const accessor = claimSemanticAccessor(safeAccessorIndex, `${semantic} instancing accessor`, {
          componentType: 5126,
          type: expectedType,
          normalized: false,
          mode: "ATTRIBUTES",
          filter: null,
          byteStride: semantic === "ROTATION" ? 16 : 12,
          target: 34962,
        });
        if (count !== undefined && accessor.count !== count) throw new Error("GLB instancing transform counts differ");
        count = accessor.count;
      }
      instancedNodeCount += 1;
    }
    const children = node.children ?? [];
    if (!Array.isArray(children)) throw new Error(`GLB nodes[${index}].children must be an array`);
    if (index !== 0 && node.mesh === undefined && children.length === 0) throw new Error("GLB contains a non-rendering leaf node");
    for (const child of children) {
      if (parentByChild.has(child)) throw new Error("GLB node tree contains a node with multiple parents");
      parentByChild.set(child, index);
      visitNode(child);
    }
    visiting.delete(index);
    visited.add(index);
  }
  visitNode(0);
  if (visited.size !== document.nodes.length) {
    throw new Error("GLB must contain one connected anonymous scene-root tree with no hidden nodes");
  }
  if (instancedNodeCount === 0) throw new Error("GLB must use EXT_mesh_gpu_instancing");
  if (referencedMeshes.size !== meshes.length) throw new Error("GLB contains an unreferenced mesh");
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
    const mesh = exactObjectKeys(meshes[meshIndex], ["primitives"], [], `GLB meshes[${meshIndex}]`);
    if (!Array.isArray(mesh.primitives) || mesh.primitives.length === 0) {
      throw new Error("GLB mesh has no primitives");
    }
    for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex += 1) {
      const primitive = exactObjectKeys(
        mesh.primitives[primitiveIndex],
        ["attributes", "indices", "mode"],
        [],
        `GLB meshes[${meshIndex}].primitives[${primitiveIndex}]`,
      );
      exactObjectKeys(primitive.attributes, ["POSITION", "NORMAL"], [], `GLB meshes[${meshIndex}] attributes`);
      const positionIndex = safeIndex(primitive.attributes.POSITION, accessors.length, "GLB POSITION accessor");
      const normalIndex = safeIndex(primitive.attributes.NORMAL, accessors.length, "GLB NORMAL accessor");
      const indicesIndex = safeIndex(primitive.indices, accessors.length, "GLB indices accessor");
      const position = claimSemanticAccessor(positionIndex, "POSITION accessor", {
        componentType: 5126,
        type: "VEC3",
        normalized: false,
        mode: "ATTRIBUTES",
        filter: null,
        byteStride: 12,
        target: 34962,
      });
      const normal = claimSemanticAccessor(normalIndex, "NORMAL accessor", {
        componentType: 5120,
        type: "VEC3",
        normalized: true,
        mode: "ATTRIBUTES",
        filter: "OCTAHEDRAL",
        byteStride: 4,
        target: 34962,
      });
      const indices = claimSemanticAccessor(indicesIndex, "indices accessor", {
        componentType: [5123, 5125],
        type: "SCALAR",
        normalized: false,
        mode: "TRIANGLES",
        filter: null,
        byteStride: null,
        target: 34963,
      });
      if (primitive.mode !== 4) {
        throw new Error(
          "GLB primitives must use Float32 POSITION, normalized Int8 NORMAL and Uint16/Uint32 indexed triangles "
            + `(got POSITION ${position?.componentType}/${position?.type}, `
            + `NORMAL ${normal?.componentType}/${normal?.type}, indices ${indices?.componentType}/${indices?.type})`,
        );
      }
    }
  }
  if (referencedAccessors.size !== accessors.length) throw new Error("GLB contains an unreferenced accessor or redundant data");
  return {
    document,
    jsonSha256: createHash("sha256").update(jsonBytes).digest("hex"),
    binSha256: createHash("sha256").update(binBytes).digest("hex"),
  };
}

function decodedBytes(document) {
  let total = 0;
  for (const accessor of document.accessors ?? []) {
    const width = COMPONENT_BYTES.get(accessor.componentType);
    const components = TYPE_COMPONENTS.get(accessor.type);
    if (!width || !components || !Number.isSafeInteger(accessor.count) || accessor.count < 0) {
      throw new Error("GLB has an unsupported accessor for decoded-byte accounting");
    }
    total += accessor.count * width * components;
    if (!Number.isSafeInteger(total)) throw new Error("GLB decoded-byte accounting exceeds a safe integer");
  }
  return total;
}

function decodedBufferViewBytes(document) {
  const total = document.bufferViews.reduce((sum, bufferView) => sum + bufferView.byteLength, 0);
  if (!Number.isSafeInteger(total)) throw new Error("GLB decoded bufferView accounting exceeds a safe integer");
  return total;
}

function residentGeometryBytes(document) {
  const geometryBufferViews = new Set();
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      for (const accessorIndex of [primitive.attributes.POSITION, primitive.attributes.NORMAL, primitive.indices]) {
        geometryBufferViews.add(document.accessors[accessorIndex].bufferView);
      }
    }
  }
  const total = [...geometryBufferViews]
    .reduce((sum, bufferViewIndex) => sum + document.bufferViews[bufferViewIndex].byteLength, 0);
  if (!Number.isSafeInteger(total)) throw new Error("GLB resident geometry accounting exceeds a safe integer");
  return total;
}

function declaredSceneMetrics(document) {
  let drawCalls = 0;
  let sceneTriangles = 0;
  let placementInstances = 0;
  let expandedInstanceMatrixBytes = 0;
  for (const node of document.nodes) {
    if (node.mesh === undefined) continue;
    const instancing = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    const firstInstancingAccessor = instancing ? Object.values(instancing)[0] : undefined;
    const copies = firstInstancingAccessor === undefined ? 1 : document.accessors[firstInstancingAccessor].count;
    const primitiveCount = document.meshes[node.mesh].primitives.length;
    const renderablePlacements = copies * primitiveCount;
    placementInstances += renderablePlacements;
    // GLTFLoader creates one InstancedMesh per primitive, and every one owns a
    // resident Float32 4x4 matrix for each copy. Counting once per source node
    // would let a multi-primitive mesh multiply browser memory after preflight.
    if (firstInstancingAccessor !== undefined) {
      expandedInstanceMatrixBytes += renderablePlacements * 16 * 4;
    }
    if (!Number.isSafeInteger(placementInstances) || !Number.isSafeInteger(expandedInstanceMatrixBytes)) {
      throw new Error("GLB declared placement expansion exceeds a safe integer");
    }
    for (const primitive of document.meshes[node.mesh].primitives) {
      drawCalls += 1;
      sceneTriangles += (document.accessors[primitive.indices].count / 3) * copies;
      if (!Number.isSafeInteger(sceneTriangles)) {
        throw new Error("GLB declared scene triangles exceed a safe integer");
      }
    }
  }
  return { drawCalls, expandedInstanceMatrixBytes, placementInstances, sceneTriangles };
}

function exactBounds(box) {
  const values = [...box.min.toArray(), ...box.max.toArray()];
  if (box.isEmpty() || values.some((value) => !Number.isFinite(value))) {
    throw new Error("GLB world bounds are empty or non-finite");
  }
  return { min: box.min.toArray(), max: box.max.toArray() };
}

export async function inspectReviewedAnonymousGlb(pathname, options = {}) {
  const maxBytes = options.maxBytes ?? EXL50U_GA_MAX_SHARD_BYTES - 1;
  const maxDecodedBytes = options.maxDecodedBytes ?? EXL50U_GA_MAX_PREVIEW_DECODED_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0
    || !Number.isSafeInteger(maxDecodedBytes) || maxDecodedBytes <= 0) {
    throw new Error("GLB preflight budgets are invalid");
  }
  const info = await lstat(pathname);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maxBytes) {
    throw new Error("GLB exceeds its pre-decode file budget or is not a regular file");
  }
  const bytes = await readFile(pathname);
  const { document, jsonSha256, binSha256 } = parseGlbJson(bytes);
  const declaredDecodedBytes = decodedBytes(document);
  const declared = declaredSceneMetrics(document);
  // Meshopt decodes each complete bufferView, including the fourth padding byte
  // in every normalized Int8 NORMAL tuple. During parse the TRS bufferViews and
  // the expanded InstancedMesh matrices coexist; after parse, geometry views
  // and matrices remain resident and are the value published to the viewer.
  const decodedViewBytes = decodedBufferViewBytes(document);
  const residentGeometryDecodedBytes = residentGeometryBytes(document);
  const residentDecodedGpuBytes = residentGeometryDecodedBytes + declared.expandedInstanceMatrixBytes;
  const preflightWorkingBytes = decodedViewBytes + declared.expandedInstanceMatrixBytes;
  if (
    !Number.isSafeInteger(preflightWorkingBytes)
    || !Number.isSafeInteger(residentDecodedGpuBytes)
    || preflightWorkingBytes > maxDecodedBytes
    || declared.placementInstances > EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD
    || document.buffers[1].byteLength > Math.floor(maxDecodedBytes * 4 / 3) + 3
    || declared.sceneTriangles > EXL50U_GA_MAX_SCENE_TRIANGLES
    || declared.drawCalls > EXL50U_GA_MAX_DRAW_CALLS
  ) throw new Error("GLB exceeds its declared pre-decode memory, placement, scene, or draw-call budget");
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { scene } = await loader.parseAsync(arrayBuffer, "");
  scene.updateMatrixWorld(true);
  if (scene.children.length !== 1) {
    throw new Error("GLB must expose exactly one decoded scene root; the runtime synthesizes the public wrapper name");
  }
  // Raw JSON above is the authority for the no-name boundary. Three assigns
  // fallback names such as `mesh_0` to anonymous primitives during decode;
  // those are loader artifacts, not transport metadata, and must not become
  // runtime semantics or make a reviewed anonymous GLB fail projection.
  scene.traverse((node) => { node.name = ""; });

  const geometries = new Map();
  const bounds = new Box3();
  const instanceMatrix = new Matrix4();
  const worldMatrix = new Matrix4();
  let placementInstances = 0;
  let drawCalls = 0;
  let sceneDrawTriangles = 0;
  let decodedInstanceMatrixBytes = 0;
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    if (!position || !normal || !index || index.count % 3 !== 0) {
      throw new Error("GLB mesh must contain indexed POSITION and NORMAL triangles");
    }
    if (position.itemSize !== 3 || normal.itemSize !== 3) {
      throw new Error("GLB POSITION and NORMAL accessors must be VEC3");
    }
    geometries.set(geometry.uuid, geometry);
    const copies = node.isInstancedMesh ? node.count : 1;
    if (!Number.isSafeInteger(copies) || copies <= 0) throw new Error("GLB mesh has no placement instances");
    if (node.isInstancedMesh) {
      const matrixBytes = node.instanceMatrix?.array?.byteLength;
      if (!Number.isSafeInteger(matrixBytes) || matrixBytes <= 0) {
        throw new Error("GLB InstancedMesh has no resident instanceMatrix allocation");
      }
      decodedInstanceMatrixBytes += matrixBytes;
      if (!Number.isSafeInteger(decodedInstanceMatrixBytes)) {
        throw new Error("GLB decoded instanceMatrix accounting exceeds a safe integer");
      }
    }
    placementInstances += copies;
    drawCalls += Array.isArray(node.material) ? node.material.length : 1;
    sceneDrawTriangles += (index.count / 3) * copies;
    geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) throw new Error("GLB mesh bounds are empty");
    if (node.isInstancedMesh) {
      for (let instance = 0; instance < node.count; instance += 1) {
        node.getMatrixAt(instance, instanceMatrix);
        worldMatrix.multiplyMatrices(node.matrixWorld, instanceMatrix);
        bounds.union(geometry.boundingBox.clone().applyMatrix4(worldMatrix));
      }
    } else {
      bounds.union(geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    }
  });
  if (
    placementInstances !== declared.placementInstances
    || drawCalls !== declared.drawCalls
    || sceneDrawTriangles !== declared.sceneTriangles
    || decodedInstanceMatrixBytes !== declared.expandedInstanceMatrixBytes
  ) {
    throw new Error("GLB declared render expansion differs from the decoded Three.js scene");
  }
  if (geometries.size === 0) throw new Error("GLB contains no renderable geometry");

  let uniqueGeometryMeshes = 0;
  let uniqueGeometryTriangles = 0;
  let uniqueGeometryVertices = 0;
  // Delivery chunks are GLB primitives. Compatible chunks may deliberately
  // share decoded bufferViews or even complete accessors, so Three.js UUID
  // deduplication is a memory fact, not the partition/chunk accounting fact.
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      uniqueGeometryMeshes += 1;
      uniqueGeometryTriangles += document.accessors[primitive.indices].count / 3;
      uniqueGeometryVertices += document.accessors[primitive.attributes.POSITION].count;
    }
  }
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    uniqueGeometryMeshes,
    uniqueGeometryTriangles,
    uniqueGeometryVertices,
    placementInstances,
    drawCalls,
    sceneDrawTriangles,
    decodedAccessorBytes: declaredDecodedBytes,
    decodedBufferViewBytes: decodedViewBytes,
    residentGeometryBytes: residentGeometryDecodedBytes,
    instanceMatrixBytes: decodedInstanceMatrixBytes,
    decodedGpuBytes: residentGeometryDecodedBytes + decodedInstanceMatrixBytes,
    boundsMetres: exactBounds(bounds),
    containerJsonSha256: jsonSha256,
    containerBinSha256: binSha256,
  };
}

function assertDerivativeFact(expected, actual, label) {
  for (const [sourceKey, projectedKey] of [
    ["bytes", "bytes"],
    ["sha256", "sha256"],
    ["decodedBytes", "decodedAccessorBytes"],
    ["sceneTriangles", "sceneDrawTriangles"],
    ["drawCalls", "drawCalls"],
  ]) {
    const expectedValue = sourceKey === "sha256"
      ? String(expected?.[sourceKey] ?? "").toLowerCase()
      : expected?.[sourceKey];
    if (expectedValue !== actual[projectedKey]) {
      throw new Error(`${label} ${sourceKey} does not match the independently inspected GLB`);
    }
  }
}

function unionBounds(facts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const fact of facts) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], fact.boundsMetres.min[axis]);
      max[axis] = Math.max(max[axis], fact.boundsMetres.max[axis]);
    }
  }
  return { min, max };
}

function metricTotals(facts) {
  const keys = [
    "uniqueGeometryMeshes",
    "uniqueGeometryTriangles",
    "uniqueGeometryVertices",
    "placementInstances",
    "drawCalls",
    "sceneDrawTriangles",
    "decodedGpuBytes",
  ];
  return Object.fromEntries(keys.map((key) => [key, facts.reduce((sum, fact) => sum + fact[key], 0)]));
}

function assertSourceGeometryAccounting({ accounting, attempt, derivationEvidence, preview, shards }) {
  const accountingKeys = [
    "anonymousDefinitions", "anonymousOccurrences", "sourceUniqueVertices", "sourceUniqueTriangles",
    "sourceSceneTriangles", "previewUniqueTriangles", "previewSceneTriangles", "highUniqueTriangles",
    "highSceneTriangles", "definitionsMissingFromPreview", "definitionsMissingFromHigh",
    "occurrencesMissingFromPreview", "occurrencesMissingFromHigh", "sourceSkippedLeafGeometry",
  ];
  exactObjectKeys(accounting, accountingKeys, [], "public derivative geometryAccounting");
  exactObjectKeys(
    accounting.sourceSkippedLeafGeometry,
    ["totalDefinitions", "totalOccurrences"],
    [],
    "public derivative sourceSkippedLeafGeometry",
  );
  const positiveFields = [
    "anonymousDefinitions", "anonymousOccurrences", "sourceUniqueVertices", "sourceUniqueTriangles",
    "sourceSceneTriangles", "previewUniqueTriangles", "previewSceneTriangles", "highUniqueTriangles",
    "highSceneTriangles",
  ];
  const missingFields = [
    "definitionsMissingFromPreview", "definitionsMissingFromHigh",
    "occurrencesMissingFromPreview", "occurrencesMissingFromHigh",
  ];
  for (const field of positiveFields) positiveSafeInteger(accounting[field], `geometryAccounting.${field}`);
  for (const field of missingFields) nonNegativeSafeInteger(accounting[field], `geometryAccounting.${field}`);
  nonNegativeSafeInteger(
    accounting.sourceSkippedLeafGeometry.totalDefinitions,
    "geometryAccounting.sourceSkippedLeafGeometry.totalDefinitions",
  );
  nonNegativeSafeInteger(
    accounting.sourceSkippedLeafGeometry.totalOccurrences,
    "geometryAccounting.sourceSkippedLeafGeometry.totalOccurrences",
  );
  const highTotals = metricTotals(shards);
  const sourceInput = derivationEvidence.sourceInputCleaning;
  const previewCleaning = derivationEvidence.previewVisualLod.outputCleaning;
  const highCleaning = derivationEvidence.highQem.outputCleaning;
  const partition = derivationEvidence.highPartition;
  const coverage = derivationEvidence.coverage;
  if (
    attempt !== derivationEvidence.selectedAttempt
    || accounting.anonymousDefinitions !== coverage.renderableDefinitions
    || accounting.anonymousOccurrences !== coverage.renderableOccurrences
    || accounting.sourceUniqueTriangles !== sourceInput.sourceTriangles
    || accounting.sourceSceneTriangles < accounting.sourceUniqueTriangles
    || accounting.previewUniqueTriangles !== preview.uniqueGeometryTriangles
    || accounting.previewUniqueTriangles !== previewCleaning.finalTriangles
    || accounting.previewSceneTriangles !== preview.sceneDrawTriangles
    || accounting.highUniqueTriangles !== highTotals.uniqueGeometryTriangles
    || accounting.highUniqueTriangles !== highCleaning.finalTriangles
    || accounting.highSceneTriangles !== highTotals.sceneDrawTriangles
    || missingFields.some((field) => accounting[field] !== 0)
    || accounting.definitionsMissingFromPreview !== coverage.previewMissingDefinitions
    || accounting.definitionsMissingFromHigh !== coverage.highMissingDefinitions
    || accounting.occurrencesMissingFromPreview !== coverage.previewMissingOccurrences
    || accounting.occurrencesMissingFromHigh !== coverage.highMissingOccurrences
    || accounting.sourceSkippedLeafGeometry.totalDefinitions !== coverage.skippedDefinitions
    || accounting.sourceSkippedLeafGeometry.totalOccurrences !== coverage.skippedOccurrences
    || partition.finalTrianglesBeforePartition !== highTotals.uniqueGeometryTriangles
    || partition.partitionedTriangles !== highTotals.uniqueGeometryTriangles
    || partition.geometryChunkCount !== highTotals.uniqueGeometryMeshes
  ) {
    throw new Error("public derivative attempt, evidence, geometryAccounting, or independently decoded GLBs disagree");
  }
}

export function projectDeviceManifest({
  template,
  asOf,
  preview,
  shards,
  derivationEvidence,
  attempt,
  geometryAccounting,
  reviewCandidate = false,
}) {
  const parsedAsOf = new Date(`${asOf}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(asOf)
    || Number.isNaN(parsedAsOf.valueOf())
    || parsedAsOf.toISOString().slice(0, 10) !== asOf
  ) {
    throw new Error("--as-of must be a real YYYY-MM-DD date");
  }
  if (!object(template) || template.id !== EXL50U_GA_BUNDLE_ID || shards.length !== EXL50U_GA_SHARD_COUNT) {
    throw new Error("EXL-50U manifest template or shard count is invalid");
  }
  const normalizedDerivationEvidence = normalizeExl50uGeneralAssemblyDerivationEvidence(derivationEvidence, { reviewCandidate });
  if (template.assets !== undefined || template.derivationEvidence !== undefined) {
    throw new Error("EXL-50U manifest template must not contain pre-populated assets or derivation evidence");
  }
  if (
    template.access?.classification !== "PUBLIC"
    || template.access?.redistributionAllowed !== true
    || template.access?.engineeringUseAllowed !== false
  ) {
    throw new Error("EXL-50U manifest template must be public, redistributable, and non-engineering");
  }
  if (!isDeepStrictEqual(template, FIXED_TEMPLATE)) {
    throw new Error("EXL-50U manifest template must exactly match the reviewed public projection contract");
  }
  for (const [label, fact, maxDecodedBytes] of [
    ["preview", preview, EXL50U_GA_MAX_PREVIEW_DECODED_BYTES],
    ...shards.map((fact, index) => [`shard ${index + 1}`, fact, EXL50U_GA_MAX_SHARD_DECODED_BYTES]),
  ]) {
    if (
      !object(fact)
      || !/^[a-f0-9]{64}$/u.test(fact.sha256 ?? "")
      || !Number.isSafeInteger(fact.bytes)
      || fact.bytes <= 0
      || !object(fact.boundsMetres)
      || !Array.isArray(fact.boundsMetres.min)
      || !Array.isArray(fact.boundsMetres.max)
      || fact.boundsMetres.min.length !== 3
      || fact.boundsMetres.max.length !== 3
      || fact.boundsMetres.min.some((value, axis) => !Number.isFinite(value) || value >= fact.boundsMetres.max[axis])
      || [
        "uniqueGeometryMeshes",
        "uniqueGeometryTriangles",
        "uniqueGeometryVertices",
        "placementInstances",
        "drawCalls",
        "sceneDrawTriangles",
        "decodedGpuBytes",
      ].some((field) => !Number.isSafeInteger(fact[field]) || fact[field] <= 0)
      || [
        "decodedAccessorBytes",
        "decodedBufferViewBytes",
        "residentGeometryBytes",
        "instanceMatrixBytes",
      ].some((field) => !Number.isSafeInteger(fact[field]) || fact[field] <= 0)
      || fact.decodedAccessorBytes > fact.decodedBufferViewBytes
      || fact.residentGeometryBytes > fact.decodedBufferViewBytes
      || fact.decodedGpuBytes !== fact.residentGeometryBytes + fact.instanceMatrixBytes
      || fact.decodedBufferViewBytes + fact.instanceMatrixBytes > maxDecodedBytes
      || fact.placementInstances < fact.uniqueGeometryMeshes
      || fact.placementInstances > EXL50U_GA_MAX_PLACEMENT_INSTANCES_PER_SHARD
      || fact.drawCalls < fact.uniqueGeometryMeshes
      || fact.drawCalls > fact.placementInstances
      || fact.sceneDrawTriangles < fact.uniqueGeometryTriangles
      || fact.sceneDrawTriangles > EXL50U_GA_MAX_SCENE_TRIANGLES
      || fact.drawCalls > EXL50U_GA_MAX_DRAW_CALLS
    ) throw new Error(`${label} contains invalid independently projected metrics`);
  }
  if (
    preview.bytes > EXL50U_GA_MAX_PREVIEW_BYTES
    || preview.decodedGpuBytes > EXL50U_GA_MAX_PREVIEW_DECODED_BYTES
  ) {
    throw new Error("EXL-50U preview exceeds its compressed or decoded byte budget");
  }
  if (shards.some((shard) => (
    shard.bytes >= EXL50U_GA_MAX_SHARD_BYTES
    || shard.decodedGpuBytes > EXL50U_GA_MAX_SHARD_DECODED_BYTES
  ))) {
    throw new Error("an EXL-50U high-detail transport shard exceeds its compressed or decoded byte budget");
  }
  if (shards.reduce((sum, shard) => sum + shard.decodedGpuBytes, 0) > EXL50U_GA_MAX_BUNDLE_DECODED_BYTES) {
    throw new Error("EXL-50U high-detail transport exceeds its aggregate decoded byte budget");
  }
  if (shards.reduce((sum, shard) => sum + shard.sceneDrawTriangles, 0) <= preview.sceneDrawTriangles) {
    throw new Error("high-detail shards must contain more scene triangles than the preview");
  }
  const totals = metricTotals(shards);
  if (
    totals.sceneDrawTriangles > EXL50U_GA_MAX_SCENE_TRIANGLES
    || totals.drawCalls > EXL50U_GA_MAX_DRAW_CALLS
    || totals.placementInstances > EXL50U_GA_MAX_BUNDLE_PLACEMENT_INSTANCES
  ) {
    throw new Error("EXL-50U high-detail transport exceeds its aggregate scene or draw-call budget");
  }
  assertSourceGeometryAccounting({
    accounting: geometryAccounting,
    attempt,
    derivationEvidence: normalizedDerivationEvidence,
    preview,
    shards,
  });
  const previewAsset = {
    path: `${EXL50U_GA_ROUTE_ROOT}/${preview.filename}`,
    format: EXL50U_GA_ASSET_FORMAT,
    sha256: preview.sha256,
    bytes: preview.bytes,
    triangles: preview.sceneDrawTriangles,
    vertices: preview.uniqueGeometryVertices,
    decodedGpuBytes: preview.decodedGpuBytes,
    boundsMetres: preview.boundsMetres,
  };
  const manifest = {
    ...structuredClone(template),
    asOf,
    derivationEvidence: normalizedDerivationEvidence,
    ...(reviewCandidate ? { reviewCandidate: {
      status: "USER_VISUAL_REVIEW_REQUIRED",
      productionEligible: false,
    } } : {}),
    assets: {
      webModel: previewAsset,
      webModels: [{ id: "preview", label: "标准", quality: "preview", default: true, ...previewAsset }],
      shardBundles: [{
        id: "anonymous-high",
        label: "高清（20 个匿名运输分片）",
        quality: "high",
        delivery: "shards",
        format: EXL50U_GA_ASSET_FORMAT,
        rootNodeName: ROOT_NODE_NAME,
        extensionsRequired: REQUIRED_EXTENSIONS,
        grouping: {
          kind: "anonymous-transport",
          engineeringSemantic: false,
          engineeringUseAllowed: false,
          representsBom: false,
          representsEngineeringSystems: false,
          representsAssemblyTree: false,
        },
        bytes: shards.reduce((sum, shard) => sum + shard.bytes, 0),
        ...totals,
        boundsMetres: unionBounds(shards),
        shards: shards.map((shard, offset) => ({
          id: `anonymous-shard-${String(offset + 1).padStart(2, "0")}`,
          index: offset + 1,
          path: `${EXL50U_GA_ROUTE_ROOT}/${shard.filename}`,
          sha256: shard.sha256,
          bytes: shard.bytes,
          uniqueGeometryMeshes: shard.uniqueGeometryMeshes,
          uniqueGeometryTriangles: shard.uniqueGeometryTriangles,
          uniqueGeometryVertices: shard.uniqueGeometryVertices,
          placementInstances: shard.placementInstances,
          drawCalls: shard.drawCalls,
          sceneDrawTriangles: shard.sceneDrawTriangles,
          decodedGpuBytes: shard.decodedGpuBytes,
          boundsMetres: shard.boundsMetres,
        })),
      }],
    },
  };
  extractExl50uGeneralAssemblyAssets(manifest);
  return manifest;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--review-candidate") {
      options.reviewCandidate = true;
      continue;
    }
    if (!["--derivative-manifest", "--asset-dir", "--output", "--as-of"].includes(token)) {
      throw new Error(`Unknown option: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    options[token.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  for (const key of ["derivativeManifest", "assetDir", "output", "asOf"]) {
    if (!options[key]) throw new Error(`Missing --${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const derivativeManifestPath = resolve(options.derivativeManifest);
  const assetDir = resolve(options.assetDir);
  const output = resolve(options.output);
  if (
    isInside(assetDir, output)
    || isInside(output, assetDir)
  ) {
    throw new Error("output and reviewed GLB asset directory must be disjoint");
  }
  if (await lstat(assetDir).then((info) => !info.isDirectory() || info.isSymbolicLink())) {
    throw new Error("asset directory must be a real directory");
  }
  await stat(output).then(
    () => { throw new Error("output already exists"); },
    (error) => { if (error?.code !== "ENOENT") throw error; },
  );

  const derivative = JSON.parse(await readFile(derivativeManifestPath, "utf8"));
  if (
    derivative.format !== "FDPublicDerivative01"
    || derivative.version !== 1
    || derivative.layout?.preview !== 1
    || derivative.layout?.highShards !== EXL50U_GA_SHARD_COUNT
    || !object(derivative.preview)
    || !Array.isArray(derivative.high)
    || derivative.high.length !== EXL50U_GA_SHARD_COUNT
    || ![1, 2].includes(derivative.attempt)
    || !object(derivative.geometryAccounting)
  ) throw new Error("public derivative manifest layout is unsupported");

  const sourceEntries = [derivative.preview, ...derivative.high];
  const facts = [];
  const sourceFiles = new Set();
  for (let index = 0; index < sourceEntries.length; index += 1) {
    const source = sourceEntries[index];
    const file = safeBasename(source.file, index === 0 ? "preview.file" : `high[${index - 1}].file`);
    if (sourceFiles.has(file)) throw new Error(`reviewed derivative repeats ${file}`);
    sourceFiles.add(file);
    const pathname = join(assetDir, file);
    const info = await lstat(pathname);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${file} must be a regular file`);
    const inspected = await inspectReviewedAnonymousGlb(pathname, {
      maxBytes: index === 0 ? EXL50U_GA_MAX_PREVIEW_BYTES : EXL50U_GA_MAX_SHARD_BYTES - 1,
      maxDecodedBytes: index === 0
        ? EXL50U_GA_MAX_PREVIEW_DECODED_BYTES
        : EXL50U_GA_MAX_SHARD_DECODED_BYTES,
    });
    assertDerivativeFact(source, inspected, file);
    facts.push({ ...inspected, source: pathname });
  }
  const preview = {
    ...facts[0],
    filename: `device.preview.${facts[0].sha256}.meshopt.glb`,
  };
  const shards = facts.slice(1).map((fact, offset) => ({
    ...fact,
    filename: `anonymous-shard-${String(offset + 1).padStart(2, "0")}.${fact.sha256}.high.meshopt.glb`,
  }));
  if (preview.bytes + shards.reduce((sum, shard) => sum + shard.bytes, 0) > EXL50U_GA_MAX_TOTAL_BYTES) {
    throw new Error("reviewed EXL-50U public derivative exceeds 300 MiB");
  }
  const template = JSON.parse(await readFile(TEMPLATE_PATH, "utf8"));
  const manifest = projectDeviceManifest({
    template,
    asOf: options.asOf,
    preview,
    shards,
    derivationEvidence: derivative.derivationEvidence,
    attempt: derivative.attempt,
    geometryAccounting: derivative.geometryAccounting,
    reviewCandidate: options.reviewCandidate === true,
  });

  const parent = resolve(dirname(output));
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, `.${basename(output)}.partial-`));
  try {
    for (const asset of [preview, ...shards]) {
      const destination = join(temporary, asset.filename);
      await copyFile(asset.source, destination);
      const copiedBytes = await readFile(destination);
      const copiedContainer = parseGlbJson(copiedBytes);
      if (
        (await stat(destination)).size !== asset.bytes
        || await sha256File(destination) !== asset.sha256
        || copiedContainer.jsonSha256 !== asset.containerJsonSha256
        || copiedContainer.binSha256 !== asset.containerBinSha256
      ) {
        throw new Error(`copied asset changed: ${asset.filename}`);
      }
    }
    await writeFile(join(temporary, "model-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await writeFile(
      join(temporary, "PUBLICATION-NOTICE.md"),
      EXL50U_GA_PUBLICATION_NOTICE,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(`${JSON.stringify({
    status: options.reviewCandidate === true ? "REVIEW_CANDIDATE_PROJECTED" : "PROJECTED",
    id: EXL50U_GA_BUNDLE_ID,
    fileCount: 21,
    totalBytes: preview.bytes + shards.reduce((sum, shard) => sum + shard.bytes, 0),
  })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(`project-exl50u-general-assembly-manifest: ${error.message}`);
    process.exitCode = 1;
  });
}
