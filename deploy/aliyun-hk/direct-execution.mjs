import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isDirectExecution(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try {
    // Node canonicalizes import.meta.url, while argvPath can retain the
    // /srv/fusiondigital/current directory symlink used by release scripts.
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
