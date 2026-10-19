const vscode = require("vscode")
const { scanVisibilityHints, scanClientTemplateHints } = require("./visibility-hints.cjs")
const { createLanguageClient, workspaceFileWatchers, languageServerCommand } = require("./language-server.cjs")
const { LanguageClientLifecycle } = require("./language-client-lifecycle.cjs")

const { resolveServer } = require("./server-install.cjs")
const path = require("node:path")

let installationController
let prepareServer
let languageClientLifecycle

async function activate(context) {
  const provider = vscode.languages.registerInlayHintsProvider({ language: "gox" }, {
    provideInlayHints(document, range) {
      const enabled = vscode.workspace
        .getConfiguration("gox.inlayHints.visibility", document.uri)
        .get("enabled", true)
      const clientTemplatesEnabled = vscode.workspace
        .getConfiguration("gox.inlayHints.clientTemplate", document.uri)
        .get("enabled", true)

      const source = document.getText()
      const visibilityHints = enabled ? scanVisibilityHints(source) : []
      const clientTemplateHints = clientTemplatesEnabled
        ? scanClientTemplateHints(source).map(item => ({ ...item, declaration: "client-template" }))
        : []

      return [...visibilityHints, ...clientTemplateHints]
        .map(item => {
          const position = document.positionAt(item.offset)
          if (!range.contains(position)) return null
          const isClientTemplate = item.declaration === "client-template"
          const hint = new vscode.InlayHint(
            position,
            item.label,
            isClientTemplate ? vscode.InlayHintKind.Parameter : vscode.InlayHintKind.Type
          )
          hint.paddingLeft = isClientTemplate
          hint.paddingRight = true
          hint.tooltip = isClientTemplate
            ? `Use client ${item.name} in a template as <@${item.name} />.`
            : item.label === "exported"
            ? `Top-level ${item.declaration} ${item.name} is exported.`
            : item.declaration === "method"
              ? `Method ${item.name} is ${item.label}.`
              : `Struct field ${item.name} is ${item.label}.`
          return hint
        })
        .filter(Boolean)
    }
  })

  context.subscriptions.push(provider)

  let executablePath
  prepareServer = async () => {
    executablePath = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Preparing GOX", cancellable: true
    }, async (progress, token) => {
      const controller = new AbortController()
      installationController = controller
      const subscription = token.onCancellationRequested(() => controller.abort())
      try {
        return await resolveServer(languageServerCommand(vscode), {
          signal: controller.signal,
          report: message => progress.report({ message })
        })
      } finally {
        subscription.dispose()
        if (installationController === controller) installationController = undefined
      }
    })
    context.environmentVariableCollection.clear()
    if (path.isAbsolute(executablePath)) {
      context.environmentVariableCollection.prepend("PATH", path.dirname(executablePath) + path.delimiter)
    }
  }

  const { LanguageClient } = require("vscode-languageclient/node")
  const fileEvents = workspaceFileWatchers(vscode)
  context.subscriptions.push(...fileEvents)
  languageClientLifecycle = new LanguageClientLifecycle(
    () => {
      const client = createLanguageClient(vscode, LanguageClient, fileEvents, executablePath)
      context.subscriptions.push(client.onNotification("gox/updateReady", () => {
        void restartLanguageClient(false)
      }))
      return client
    }
  )

  context.subscriptions.push(vscode.commands.registerCommand(
    "gox.restartLanguageServer",
    () => restartLanguageClient(true)
  ))
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration("gox.languageServer.path")) {
      void restartLanguageClient(false)
    }
  }))
  context.subscriptions.push({
    dispose() {
      installationController?.abort()
      void stopLanguageClient()
    }
  })
  await restartLanguageClient(false)
}

async function stopLanguageClient() {
  const lifecycle = languageClientLifecycle
  languageClientLifecycle = undefined
  if (lifecycle) await lifecycle.stop()
}

async function restartLanguageClient(showSuccess) {
  const lifecycle = languageClientLifecycle
  if (!lifecycle) return
  try {
    if (prepareServer) await prepareServer()
    if (languageClientLifecycle !== lifecycle) return
    await lifecycle.stop()
    await lifecycle.start()
    if (showSuccess) {
      void vscode.window.showInformationMessage("GOX Language Server restarted.")
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const retry = await vscode.window.showErrorMessage(`GOX could not start: ${detail}`, "Retry")
    if (retry === "Retry") void restartLanguageClient(false)
  }
}

async function deactivate() {
  installationController?.abort()
  await stopLanguageClient()
}

module.exports = { activate, deactivate }
