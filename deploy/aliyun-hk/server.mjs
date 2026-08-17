import { resolve } from "node:path";
import { startProdServer } from "vinext/server/prod-server";

const PUBLIC_ANONYMOUS_MODE = "public-anonymous";

if (process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE !== PUBLIC_ANONYMOUS_MODE) {
  throw new Error(
    "Refusing to start: NEXT_PUBLIC_FUSIONDIGITAL_MODE must be public-anonymous",
  );
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

// Deliberately bind only to loopback. Nginx is the public trust boundary and
// removes identity-shaped headers before requests can reach vinext.
await startProdServer({
  host: "127.0.0.1",
  port,
  outDir: resolve(process.cwd(), "dist"),
});
