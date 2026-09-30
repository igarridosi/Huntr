// Assembles what gets deployed to the Function App: the bundle, host.json
// and a package.json that points the Functions host at the entry point.
// No node_modules: everything but @azure/functions-core, which the worker
// provides, is in the bundle. The deploy workflow zips this folder.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "deploy");
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "dist"), { recursive: true });
cpSync(path.join(root, "dist", "azure.mjs"), path.join(out, "dist", "azure.mjs"));
cpSync(path.join(root, "host.json"), path.join(out, "host.json"));
writeFileSync(path.join(out, "package.json"), JSON.stringify({ name: "huntr-sec-ingest", private: true, type: "module", main: "dist/azure.mjs" }, null, 2) + "\n");
console.log(`deploy package in ${path.relative(process.cwd(), out) || "."}`);
