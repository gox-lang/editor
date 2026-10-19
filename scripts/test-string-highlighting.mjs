import fs from "node:fs"
import path from "node:path"
import oniguruma from "vscode-oniguruma"
import textmate from "vscode-textmate"

const root = path.resolve(import.meta.dirname, "..")
const wasmFile = fs.readFileSync(
  path.join(root, "node_modules/vscode-oniguruma/release/onig.wasm")
)
const wasm = wasmFile.buffer.slice(
  wasmFile.byteOffset,
  wasmFile.byteOffset + wasmFile.byteLength
)
await oniguruma.loadWASM(wasm)

const goStrings = [
 { name: "string.quoted.raw.go", begin: "`", end: "`" },
 { name: "string.quoted.double.go", begin: '"', end: '"', patterns: [{ match: "\\\\.", name: "constant.character.escape.go" }] }
]

const externalGrammars = {
  "source.go": {
    scopeName: "source.go",
    patterns: [
      ...goStrings,
      {
        name: "comment.line.double-slash.go",
        begin: "//",
        end: "$"
      },
      {
        name: "comment.block.go",
        begin: "/\\*",
        end: "\\*/"
      },
      {
        name: "meta.function.go",
        begin: "\\b(func)\\b",
        beginCaptures: { "1": { name: "keyword.declaration.function.go" } },
        end: "(?!)",
        patterns: [
          ...goStrings,
          { match: "\\b(len)\\b", name: "support.function.builtin.go" },
          { match: "[<>]", name: "keyword.operator.comparison.go" },
          { match: "\\b[0-9]+\\b", name: "constant.numeric.go" },
          { match: "\\b[A-Za-z_][A-Za-z0-9_]*\\b", name: "variable.other.go" }
        ]
      },
      { match: "\\b(len)\\b", name: "support.function.builtin.go" },
      { match: "[<>]", name: "keyword.operator.comparison.go" },
      { match: "\\b[0-9]+\\b", name: "constant.numeric.go" },
      { match: "\\b[A-Za-z_][A-Za-z0-9_]*\\b", name: "variable.other.go" }
    ]
  },
  "source.css": {
    scopeName: "source.css",
    patterns: [
      { match: "\\b(color|width)(?=\\s*:)", name: "support.type.property-name.css" },
      { match: "\\b(red|px)\\b", name: "support.constant.property-value.css" }
    ]
  },
  "source.js": {
    scopeName: "source.js",
    patterns: [
      { match: "\\bconsole\\b", name: "support.type.object.console.js" },
      { match: "\\blog\\b", name: "support.function.console.js" }
    ]
  }
}

const registry = new textmate.Registry({
  onigLib: Promise.resolve({
    createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
    createOnigString: value => new oniguruma.OnigString(value)
  }),
  loadGrammar: async scopeName => {
    if (scopeName === "source.gox") {
      const grammarPath = path.join(root, "syntaxes/gox.tmLanguage.json")
      return textmate.parseRawGrammar(fs.readFileSync(grammarPath, "utf8"), grammarPath)
    }
    const grammar = externalGrammars[scopeName]
    return grammar ? textmate.parseRawGrammar(JSON.stringify(grammar), `${scopeName}.json`) : null
  }
})

const grammar = await registry.loadGrammar("source.gox")
function tokenizeSource(source) {
  const sourceTokens = []
  let sourceStack = textmate.INITIAL
  for (const line of source.split(/\r?\n/)) {
    const result = grammar.tokenizeLine(line, sourceStack)
    sourceStack = result.ruleStack
    for (const token of result.tokens) {
      sourceTokens.push({
        text: line.slice(token.startIndex, token.endIndex),
        scopes: token.scopes
      })
    }
  }
  return sourceTokens
}

const rawExample = "func GET() {\n source := `func GET() {\n return <section class=\"demo\">\n <h2>{{ name }}</h2>\n </section>\n}`\n return <main>Real template</main>\n}"
const stringTokens = tokenizeSource(rawExample)
const rawTokens = stringTokens.filter(token => token.scopes.includes("string.quoted.raw.go"))
if (!rawTokens.some(token => token.text.includes("section"))) throw new Error("raw string fixture was not tokenized")
for (const token of rawTokens) {
 if (token.scopes.some(scope => scope.startsWith("entity.name.tag") || scope.startsWith("meta.tag") || scope.includes("embedded.expression.gox") || scope === "text.html.gox")) {
  throw new Error("Template highlighting leaked inside raw Go string: " + JSON.stringify(token))
 }
}
if (!stringTokens.some(token => token.text === "main" && token.scopes.includes("entity.name.tag.html"))) throw new Error("real template lost highlighting after raw string")

console.log("Go string highlighting checks passed")

for (const source of [
 'func demo() { const x = "return <main>{{ name }}</main>" }',
 'var source = `<!DOCTYPE html> <@Menu /> <&Card /> <:if condition={{ ok }}></:if>`'
]) {
 const tokens = tokenizeSource(source)
 if (tokens.some(token => token.scopes.some(scope => scope.startsWith("entity.name.tag") || scope.startsWith("meta.tag") || scope.includes("embedded.expression.gox")))) throw new Error("HTML leaked into Go literal: " + source)
}
const attributeTokens = tokenizeSource('<div title="{{ name }}">Hello</div>')
if (!attributeTokens.some(token => token.text === "{{" && token.scopes.includes("punctuation.section.embedded.begin.gox"))) throw new Error("attribute interpolation stopped working")
