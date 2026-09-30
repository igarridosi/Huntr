// Bundles the pipeline for Node, one ESM file per entry point:
//   dist/cli.mjs     the command (GitHub Actions, a laptop)
//   dist/azure.mjs   the Azure Functions entry point
// Some dependencies are CommonJS and call require() for Node built-ins,
// which an ESM bundle does not have; the banner gives them one. Others (the
// Azure SDK's ESM build) read import.meta.url, which rules out CommonJS.
// @azure/functions-core stays external: the Functions worker provides it
// at run time, and @azure/functions finds the host through it.
import { build } from "esbuild";

await build({
  entryPoints: { cli: "src/cli.ts", azure: "src/azure.ts" },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  external: ["@azure/functions-core"],
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  logLevel: "info",
});
