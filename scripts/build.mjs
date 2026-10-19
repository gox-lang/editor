import { build } from "esbuild"
import { mkdir, rm } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
await rm(resolve(root, "dist"), { recursive: true, force: true })
await mkdir(resolve(root, "dist"), { recursive: true })
await build({
  absWorkingDir: root,
  entryPoints: ["src/extension.cjs"],
  outfile: "dist/extension.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: false,
  legalComments: "eof"
})
console.log("GOX Tools runtime bundled")
