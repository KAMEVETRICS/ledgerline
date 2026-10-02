/** @type {import("esbuild-wasm").BuildOptions} */
export const buildOptions = {
  entryPoints: ["src/main.tsx"],
  bundle: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  outdir: "www/build",
  logLevel: "info",
};
