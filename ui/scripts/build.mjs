import * as esbuild from "esbuild-wasm";
import { buildOptions } from "./options.mjs";

await esbuild.build({
  ...buildOptions,
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
