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

const externalGrammars = {
  "source.go": {
    scopeName: "source.go",
    patterns: [
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
const fixturePath = path.join(root, "scripts/fixtures/all-syntax.gox")
const lines = fs.readFileSync(fixturePath, "utf8").split(/\r?\n/)
const tokens = []
let stack = textmate.INITIAL

for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
  const line = lines[lineNumber]
  const result = grammar.tokenizeLine(line, stack)
  stack = result.ruleStack
  for (const token of result.tokens) {
    tokens.push({
      line: lineNumber + 1,
      text: line.slice(token.startIndex, token.endIndex),
      scopes: token.scopes
    })
  }
}

function assertToken(text, scope, label = text) {
  const found = tokens.some(token => token.text === text && token.scopes.includes(scope))
  if (!found) throw new Error(`${label} did not emit ${scope}`)
}

assertToken(":spread", "entity.other.attribute-name.directive.gox")
assertToken("<!--", "punctuation.definition.comment.html.gox")
assertToken(" HTML comment ", "comment.block.html.gox")
assertToken("&amp;", "constant.character.entity.html")
assertToken("color", "support.type.property-name.css")
assertToken("width", "support.type.property-name.css", "CSS width")
assertToken("console", "support.type.object.console.js")
assertToken("log", "support.function.console.js")
assertToken("index", "variable.other.go", "for index variable")
assertToken("user", "variable.other.go", "for user variable")
assertToken("@", "punctuation.definition.tag.client.gox")
assertToken("Card", "entity.name.tag.component.gox")

const comparisonLine = tokens.filter(token => token.line === 31)
if (!comparisonLine.some(token => token.text === ">" && token.scopes.includes("keyword.operator.comparison.go"))) {
  throw new Error("comparison > lost its Go operator scope")
}
if (!comparisonLine.some(token => token.text === "}}" && token.scopes.includes("punctuation.section.embedded.end.gox"))) {
  throw new Error("comparison > broke the template expression terminator")
}

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

const commentedTemplateTokens = tokenizeSource(`// return <html><body>{{ name }}</body></html>
/*
return <@Menu hydrate="idle" />
*/`)
const templateScopes = [
  "entity.name.tag.html",
  "entity.name.tag.client.gox",
  "punctuation.section.embedded.begin.gox",
  "punctuation.section.embedded.end.gox"
]
for (const scope of templateScopes) {
  if (commentedTemplateTokens.some(token => token.scopes.includes(scope))) {
    throw new Error(`commented template emitted ${scope}`)
  }
}
if (!commentedTemplateTokens.some(token => token.scopes.includes("comment.line.double-slash.go"))) {
  throw new Error("line-commented template lost its Go comment scope")
}
if (!commentedTemplateTokens.some(token => token.scopes.includes("comment.block.go"))) {
  throw new Error("block-commented template lost its Go comment scope")
}

const grammarDefinition = JSON.parse(
  fs.readFileSync(path.join(root, "syntaxes/gox.tmLanguage.json"), "utf8")
)
const embeddedIsolationSelector =
  "L:source.gox -comment -string -meta.embedded.block.css.gox -meta.embedded.block.javascript.gox"
if (!grammarDefinition.injections?.[embeddedIsolationSelector]) {
  throw new Error("GOX injections must not re-enter embedded CSS or JavaScript blocks")
}
if (grammarDefinition.injections?.["L:source.gox -comment"]) {
  throw new Error("broad GOX injection can steal </style> or </script> from embedded grammars")
}

function assertEmbeddedBlockDoesNotLeak(tag, body = "") {
  const source = `<${tag}>\n${body}\n</${tag}>\nfunc menu() {}`
  const blockTokens = tokenizeSource(source)
  const funcToken = blockTokens.find(token => token.text === "func")
  if (!funcToken?.scopes.includes("keyword.declaration.function.go")) {
    throw new Error(`<${tag}> block leaked into the following Go function declaration`)
  }
  const embeddedScope = tag === "style"
    ? "meta.embedded.block.css.gox"
    : "meta.embedded.block.javascript.gox"
  if (funcToken.scopes.includes(embeddedScope)) {
    throw new Error(`following Go code remained inside ${embeddedScope}`)
  }
}

assertEmbeddedBlockDoesNotLeak("style")
assertEmbeddedBlockDoesNotLeak("style", "    .menu { color: red; }")
assertEmbeddedBlockDoesNotLeak("script")
assertEmbeddedBlockDoesNotLeak("script", "    console.log('menu')")

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
)
const goxGrammarContribution = manifest.contributes?.grammars?.find(
  contribution => contribution.language === "gox" && contribution.scopeName === "source.gox"
)
if (goxGrammarContribution?.embeddedLanguages && Object.keys(goxGrammarContribution.embeddedLanguages).length > 0) {
  throw new Error("style/script must stay syntax-only; embeddedLanguages would activate CSS/JavaScript editor features and snippets")
}

for (const declaration of [
  '<!DOCTYPE html>',
  '<!doctype html>',
  '<!DoCtYpE html\nPUBLIC "identifier>quoted" \'system>quoted\'>'
]) {
  const result = tokenizeSource(`return <>\n${declaration}\n<html></html>\n</>\nfunc page() {}`)
  for (const [text, scope] of [
    ['<!', 'punctuation.definition.tag.begin.html'],
    [declaration.match(/<!([A-Za-z]+)/)[1], 'entity.name.tag.html'],
    ['html', 'entity.other.attribute-name.html'],
    ['>', 'punctuation.definition.tag.end.html']
  ]) {
    if (!result.some(token => token.text === text && token.scopes.includes(scope)
        && token.scopes.includes('meta.tag.sgml.doctype.html'))) {
      throw new Error(`DOCTYPE missing ${scope}: ${declaration}`)
    }
  }
  const followingHTML = result.filter(token => token.text === 'html').slice(-2)
  if (followingHTML.length !== 2 || followingHTML.some(token =>
      !token.scopes.includes('entity.name.tag.html') || token.scopes.includes('meta.tag.sgml.doctype.html'))) {
    throw new Error(`DOCTYPE leaked into following HTML: ${declaration}`)
  }
  if (!result.some(token => token.text === 'func' && token.scopes.includes('keyword.declaration.function.go'))) {
    throw new Error('DOCTYPE affected following Go code')
  }
}
for (const source of ['// <!DOCTYPE html>', '/* <!DOCTYPE html> */', '<!-- <!DOCTYPE html> -->']) {
  if (tokenizeSource(source).some(token => token.scopes.includes('meta.tag.sgml.doctype.html'))) {
    throw new Error('DOCTYPE must remain a comment when commented out')
  }
}

console.log("GOX TextMate tokenization tests passed")
