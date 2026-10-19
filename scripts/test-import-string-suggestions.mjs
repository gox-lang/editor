import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
const defaults = manifest.contributes?.configurationDefaults?.["[gox]"]

assert.deepEqual(defaults?.["editor.quickSuggestions"], {
  other: "on",
  comments: "off",
  strings: "on"
})
assert.equal(manifest.scripts?.["test:import-strings"], "node scripts/test-import-string-suggestions.mjs")

console.log("GOX import-string suggestion configuration tests passed")
