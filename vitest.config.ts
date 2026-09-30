import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig, which the app code uses
    // throughout. Without it the test runner cannot follow an import the
    // compiler resolves fine.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resolves "server-only" itself (to a module that throws in a
      // client bundle); tests run on the server, so it is the empty one.
      "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "pipelines/**/src/**/*.test.ts"],
    environment: "node",
  },
});
