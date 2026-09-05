#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { isDirectExecution } from "./direct-execution.mjs";

export function assertSingleExactHeader(headerDump, headerName, expectedValue) {
  if (typeof headerDump !== "string") throw new TypeError("HTTP header dump must be a string.");
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(headerName ?? "")) {
    throw new Error("HTTP header name is invalid.");
  }
  if (
    typeof expectedValue !== "string"
    || expectedValue.length === 0
    || /[\r\n]/u.test(expectedValue)
  ) throw new Error("Expected HTTP header value is invalid.");

  const normalizedName = headerName.toLowerCase();
  const values = headerDump.split(/\r?\n/u).flatMap((line) => {
    const separator = line.indexOf(":");
    if (separator < 1 || line.slice(0, separator).toLowerCase() !== normalizedName) return [];
    return [line.slice(separator + 1).trim()];
  });
  if (values.length !== 1 || values[0] !== expectedValue) {
    throw new Error(
      `${headerName} must occur exactly once with value ${JSON.stringify(expectedValue)}; `
      + `observed ${JSON.stringify(values)}.`,
    );
  }
  return values[0];
}

async function main() {
  const [headerPath, headerName, expectedValue, ...rest] = process.argv.slice(2);
  if (!headerPath || !headerName || expectedValue === undefined || rest.length > 0) {
    throw new Error("Usage: verify-http-headers.mjs HEADER_DUMP HEADER_NAME EXPECTED_VALUE");
  }
  assertSingleExactHeader(await readFile(resolve(headerPath), "utf8"), headerName, expectedValue);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
