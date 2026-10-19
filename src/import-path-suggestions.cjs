function importPathStringAt(source, offset) {
  if (typeof source !== "string" || offset < 0 || offset > source.length) return false

  const lineStart = source.lastIndexOf("\n", offset - 1) + 1
  const lineBefore = source.slice(lineStart, offset)
  if ((lineBefore.match(/"/g) || []).length % 2 === 0) return false

  const quote = lineBefore.lastIndexOf('"')
  const before = lineBefore.slice(0, quote).trim()
  if (/^import(?:\s+[A-Za-z_][A-Za-z0-9_]*)?$/.test(before)) return true

  if (before !== "" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(before)) return false
  const opening = source.lastIndexOf("import (", lineStart)
  return opening >= 0 && source.lastIndexOf(")", lineStart) < opening
}

function registerImportPathSuggestionTrigger(vscode) {
  let pending = false
  return vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId !== "gox" || event.contentChanges.length === 0) return
    if (pending) return
    pending = true
    setTimeout(() => {
      pending = false
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.document.uri.toString() !== event.document.uri.toString()) return
      const offset = editor.document.offsetAt(editor.selection.active)
      if (!importPathStringAt(editor.document.getText(), offset)) return
      void vscode.commands.executeCommand("editor.action.triggerSuggest")
    // LanguageClient synchronizes didChange asynchronously. Waiting briefly
    // ensures the completion request observes the document revision that
    // contains the newly typed path character.
    }, 75)
  })
}

module.exports = { importPathStringAt, registerImportPathSuggestionTrigger }
