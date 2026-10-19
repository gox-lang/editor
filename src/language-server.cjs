function languageServerCommand(vscode) {
  const configured = vscode.workspace
    .getConfiguration("gox.languageServer")
    .get("path", "gox")
  return typeof configured === "string" && configured.trim() ? configured.trim() : "gox"
}

function languageServerOptions(vscode, executablePath) {
  const command = executablePath || languageServerCommand(vscode)
  const documentUri = vscode.window?.activeTextEditor?.document?.uri
  const documentFolder = documentUri && vscode.workspace.getWorkspaceFolder?.(documentUri)
  const cwd = (documentFolder || vscode.workspace.workspaceFolders?.[0])?.uri.fsPath
  const options = cwd ? { cwd } : undefined
  const executable = { command, args: ["ls"], options: { ...options, env: { ...process.env, GOX_LSP_AUTO_UPDATE: "1" } } }
  return { run: executable, debug: executable }
}

function workspaceFileWatchers(vscode) {
  const frameworks = "{react,preact,solid,vue,svelte}"
  return [
    vscode.workspace.createFileSystemWatcher("**/*.{gox,go}"),
    vscode.workspace.createFileSystemWatcher("**/{go.mod,go.sum,go.work}"),
    // Client framework installation state can change from an external
    // `gox client add/remove` command while a GOX document stays untouched.
    vscode.workspace.createFileSystemWatcher(`**/client/${frameworks}`, false, true, false),
    vscode.workspace.createFileSystemWatcher(`**/client/${frameworks}/package.json`),
    vscode.workspace.createFileSystemWatcher(`**/client/${frameworks}/node_modules`, false, true, false),
    // Watch only supported client source extensions so dependency churn under
    // node_modules does not flood the language server with file events.
    vscode.workspace.createFileSystemWatcher("**/client/{react,preact,solid}/**/*.{jsx,tsx}"),
    vscode.workspace.createFileSystemWatcher("**/client/vue/**/*.vue"),
    vscode.workspace.createFileSystemWatcher("**/client/svelte/**/*.svelte")
  ]
}

function languageClientOptions(fileEvents) {
  return {
    documentSelector: [{ scheme: "file", language: "gox" }],
    synchronize: {
      configurationSection: "gox",
      fileEvents
    }
  }
}

function createLanguageClient(vscode, LanguageClient, fileEvents = workspaceFileWatchers(vscode), executablePath) {
  return new LanguageClient(
    "goxLanguageServer",
    "GOX Language Server",
    languageServerOptions(vscode, executablePath),
    languageClientOptions(fileEvents)
  )
}

module.exports = {
  createLanguageClient,
  languageClientOptions,
  languageServerCommand,
  languageServerOptions,
  workspaceFileWatchers
}
