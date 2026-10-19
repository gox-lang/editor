import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  createLanguageClient,
  languageClientOptions,
  languageServerCommand,
  languageServerOptions,
  workspaceFileWatchers
} = require("../src/language-server.cjs")
const { LanguageClientLifecycle } = require("../src/language-client-lifecycle.cjs")
const { importPathStringAt } = require("../src/import-path-suggestions.cjs")

for (const source of [
  `module page\nimport "@"\n`,
  `module page\nimport (\n  "bil"\n)\n`,
  `module page\nimport (\n  register "gox-editor-test/bi"\n)\n`,
  `module page\nimport (\n  menu "@menu.gox"\n)\n`
]) {
  const offset = source.lastIndexOf('"')
  assert.equal(importPathStringAt(source, offset), true, source)
}
assert.equal(importPathStringAt(`module page\nfunc Build() { value := "bil" }\n`, 40), false)
assert.equal(importPathStringAt(`module page\nimport (\n  billing\n)\n`, 31), false)

function mockVSCode(path = "gox", workspacePath = "/workspace/George") {
  const documentUri = { fsPath: `${workspacePath}/pages/index.gox` }
  const fileSystemWatchers = []
  const vscode = {
    window: { activeTextEditor: workspacePath ? { document: { uri: documentUri } } : undefined },
    workspace: {
      workspaceFolders: workspacePath ? [{ uri: { fsPath: workspacePath } }] : [],
      getWorkspaceFolder(uri) {
        assert.equal(uri, documentUri)
        return workspacePath ? { uri: { fsPath: workspacePath } } : undefined
      },
      getConfiguration(section) {
        assert.equal(section, "gox.languageServer")
        return { get: (name, fallback) => name === "path" ? path : fallback }
      },
      createFileSystemWatcher(pattern, ignoreCreate, ignoreChange, ignoreDelete) {
        const watcher = { pattern, ignoreCreate, ignoreChange, ignoreDelete }
        fileSystemWatchers.push(watcher)
        return watcher
      }
    }
  }
  return { ...vscode, fileSystemWatchers }
}

assert.equal(languageServerCommand(mockVSCode()), "gox")
assert.equal(languageServerCommand(mockVSCode("  /opt/gox/bin/gox  ")), "/opt/gox/bin/gox")
assert.equal(languageServerCommand(mockVSCode("")), "gox")

assert.deepEqual(languageServerOptions(mockVSCode()), {
  run: { command: "gox", args: ["ls"], options: { cwd: "/workspace/George", env: { ...process.env, GOX_LSP_AUTO_UPDATE: "1" } } },
  debug: { command: "gox", args: ["ls"], options: { cwd: "/workspace/George", env: { ...process.env, GOX_LSP_AUTO_UPDATE: "1" } } }
})

const optionsVSCode = mockVSCode()
const fileEvents = workspaceFileWatchers(optionsVSCode)
const options = languageClientOptions(fileEvents)
assert.deepEqual(options.documentSelector, [{ scheme: "file", language: "gox" }])
assert.equal(options.synchronize.configurationSection, "gox")
assert.equal(options.synchronize.fileEvents, fileEvents)
assert.deepEqual(optionsVSCode.fileSystemWatchers.map(watcher => watcher.pattern), [
  "**/*.{gox,go}",
  "**/{go.mod,go.sum,go.work}",
  "**/client/{react,preact,solid,vue,svelte}",
  "**/client/{react,preact,solid,vue,svelte}/package.json",
  "**/client/{react,preact,solid,vue,svelte}/node_modules",
  "**/client/{react,preact,solid}/**/*.{jsx,tsx}",
  "**/client/vue/**/*.vue",
  "**/client/svelte/**/*.svelte"
])
assert.deepEqual(optionsVSCode.fileSystemWatchers[2], {
  pattern: "**/client/{react,preact,solid,vue,svelte}",
  ignoreCreate: false,
  ignoreChange: true,
  ignoreDelete: false
})
assert.deepEqual(optionsVSCode.fileSystemWatchers[4], {
  pattern: "**/client/{react,preact,solid,vue,svelte}/node_modules",
  ignoreCreate: false,
  ignoreChange: true,
  ignoreDelete: false
})

class FakeLanguageClient {
  constructor(...args) {
    this.args = args
  }
}

const clientVSCode = mockVSCode()
const clientFileEvents = workspaceFileWatchers(clientVSCode)
const client = createLanguageClient(clientVSCode, FakeLanguageClient, clientFileEvents)
assert.equal(client.args[0], "goxLanguageServer")
assert.equal(client.args[1], "GOX Language Server")
assert.deepEqual(client.args[2], languageServerOptions(clientVSCode))
assert.equal(client.args[3].synchronize.fileEvents, clientFileEvents)

const calls = []
const runtimeClient = {
  async start() { calls.push("start") },
  async restart() { calls.push("restart") },
  async stop() { calls.push("stop") }
}
const lifecycle = new LanguageClientLifecycle(() => runtimeClient)
assert.equal(await lifecycle.start(), runtimeClient)
assert.equal(await lifecycle.start(), runtimeClient)
assert.equal(await lifecycle.restart(), runtimeClient)
await lifecycle.stop()
await lifecycle.stop()
assert.deepEqual(calls, ["start", "restart", "stop"])

let attempts = 0
const retryLifecycle = new LanguageClientLifecycle(() => ({
  async start() {
    attempts++
    if (attempts === 1) throw new Error("start failed")
  },
  async restart() {},
  async stop() {}
}))
await assert.rejects(retryLifecycle.start(), /start failed/)
await retryLifecycle.start()
assert.equal(attempts, 2)

let releaseStart
const orderedCalls = []
const orderedLifecycle = new LanguageClientLifecycle(() => ({
  async start() {
    orderedCalls.push("start")
    await new Promise(resolve => { releaseStart = resolve })
    orderedCalls.push("started")
  },
  async restart() {},
  async stop() { orderedCalls.push("stop") }
}))
const starting = orderedLifecycle.start()
const stopping = orderedLifecycle.stop()
await new Promise(resolve => setImmediate(resolve))
assert.deepEqual(orderedCalls, ["start"])
releaseStart()
await Promise.all([starting, stopping])
assert.deepEqual(orderedCalls, ["start", "started", "stop"])

console.log("GOX language-server client tests passed")
