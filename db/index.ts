import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type D1Binding = NonNullable<Cloudflare.Env["DB"]>;
export type FusionDatabase = ReturnType<typeof createDatabase>;

function requireD1Binding(): D1Binding {
  const binding = (globalThis as typeof globalThis & {
    __FUSIONDIGITAL_DB__?: D1Binding;
  }).__FUSIONDIGITAL_DB__;
  if (!binding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return binding;
}

function createDatabase(binding: D1Binding) {
  return drizzle(binding, { schema });
}

export function getDb(): FusionDatabase {
  return createDatabase(requireD1Binding());
}

/** Escape hatch for atomic D1 prepared statements that Drizzle cannot express. */
export function getD1(): D1Binding {
  return requireD1Binding();
}
