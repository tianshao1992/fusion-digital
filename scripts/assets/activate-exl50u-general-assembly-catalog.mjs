#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  extractExl50uGeneralAssemblyAssets,
} from "./exl50u-general-assembly-runtime-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_CONTRACT = new URL("./exl50u-general-assembly-catalog-activation-contract.json", import.meta.url);
const FIXED_ACTIVATION_CONTRACT = JSON.parse(readFileSync(DEFAULT_CONTRACT, "utf8"));
const FIXED_ACTIVE_CARD = FIXED_ACTIVATION_CONTRACT.replacement;
const DEVICE_ID = "exl50u-general-assembly-20260630";
const MANIFEST_ENDPOINT = "/models/exl50u-general-assembly-v1/model-manifest.json";
const FORBIDDEN_ACTIVATION_COPY = [
  /ASSETS\s+PENDING/iu,
  /无(?:可加载)?\s*GLB|no\s+(?:loadable\s+)?GLB/iu,
  /八(?:个)?(?:公开)?(?:通用)?系统|8\s*个(?:公开)?(?:通用)?系统/iu,
  /共同原点|common[- ]origin/iu,
  /metadata-only|assets-pending|pipeline-ready-assets-pending/iu,
];

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textLeaves(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => textLeaves(item, output));
  else if (object(value)) Object.values(value).forEach((item) => textLeaves(item, output));
  return output;
}

export function validateExl50uGeneralAssemblyActivatedCard(card) {
  const stale = textLeaves(card).find((value) => FORBIDDEN_ACTIVATION_COPY.some((pattern) => pattern.test(value)));
  if (stale) throw new Error(`EXL-50U catalog activation retains stale pipeline copy: ${stale}`);
  if (
    !object(card)
    || card.id !== DEVICE_ID
    || card.availability !== "online-public-simplified"
    || card.delivery !== "public-static"
    || card.viewer?.mode !== "real-3d"
    || card.viewer?.manifestEndpoint !== MANIFEST_ENDPOINT
    || card.viewer?.turntableManifestEndpoint !== null
    || card.viewer?.overlayEligible !== false
    || !Array.isArray(card.facts)
    || card.facts.length < 3
    || !Array.isArray(card.physicsOverlays)
    || card.physicsOverlays.length !== 0
    || card.diagnosticWorkspace !== null
    || !isDeepStrictEqual(card, FIXED_ACTIVE_CARD)
  ) {
    throw new Error("EXL-50U general-assembly catalog card is not the exact active real-3d contract");
  }
  return card;
}

export function activateExl50uGeneralAssemblyCatalog({ catalog, manifest, activationContract }) {
  if (
    manifest?.access?.classification !== "PUBLIC"
    || manifest?.access?.redistributionAllowed !== true
    || manifest?.access?.engineeringUseAllowed !== false
  ) throw new Error("EXL-50U catalog activation requires a public redistributable non-engineering manifest");
  extractExl50uGeneralAssemblyAssets(manifest);
  if (
    !object(catalog)
    || !Array.isArray(catalog.devices)
    || catalog.devices.filter((device) => device?.id === DEVICE_ID).length !== 1
    || !object(activationContract)
    || !isDeepStrictEqual(activationContract, FIXED_ACTIVATION_CONTRACT)
  ) throw new Error("EXL-50U catalog activation inputs are incomplete or ambiguous");
  const replacement = structuredClone(activationContract.replacement);
  validateExl50uGeneralAssemblyActivatedCard(replacement);
  const candidate = structuredClone(catalog);
  candidate.asOf = manifest.asOf;
  candidate.devices = candidate.devices.map((device) => device.id === DEVICE_ID ? replacement : device);
  validateExl50uGeneralAssemblyActivatedCard(candidate.devices.find((device) => device.id === DEVICE_ID));
  return candidate;
}

function parseArguments(argv) {
  const options = { contract: fileURLToPath(DEFAULT_CONTRACT) };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!["--catalog", "--manifest", "--contract", "--output"].includes(token)) {
      throw new Error(`Unknown option: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    options[token.slice(2)] = resolve(value);
    index += 1;
  }
  for (const key of ["catalog", "manifest", "output"]) if (!options[key]) throw new Error(`Missing --${key}`);
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [catalog, manifest, activationContract] = await Promise.all([
    readFile(options.catalog, "utf8").then(JSON.parse),
    readFile(options.manifest, "utf8").then(JSON.parse),
    readFile(options.contract, "utf8").then(JSON.parse),
  ]);
  const candidate = activateExl50uGeneralAssemblyCatalog({ catalog, manifest, activationContract });
  await writeFile(options.output, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`Wrote reviewed catalog activation candidate: ${options.output}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    console.error(`activate-exl50u-general-assembly-catalog: ${error.message}`);
    process.exitCode = 1;
  });
}
