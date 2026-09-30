// Bundles the CLI into one ESM file for Node. Some dependencies are
// CommonJS and call require() for Node built-ins, which an ESM bundle does
// not have; the banner gives them one. Others (the Azure SDK's ESM build)
// read import.meta.url, which rules out a CommonJS bundle.
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/cli.mjs",
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  logLevel: "info",
});
