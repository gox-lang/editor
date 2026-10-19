import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const files = [
  "package.json",
  "language-configuration.json",
  "syntaxes/gox.tmLanguage.json",
  "snippets/gox.json",
  "themes/gox-dark-color-theme.json",
  "themes/gox-light-color-theme.json",
  ".vscode/launch.json",
  ".vscode/tasks.json"
]

for (const file of files) {
  const source = await readFile(resolve(root, file), "utf8")
  JSON.parse(source)
}

const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
const lockfile = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"))
const languageClientManifest = JSON.parse(
  await readFile(resolve(root, "node_modules/vscode-languageclient/package.json"), "utf8")
)
const languageConfiguration = JSON.parse(
  await readFile(resolve(root, "language-configuration.json"), "utf8")
)
const language = manifest.contributes?.languages?.find(value => value.id === "gox")
const grammar = manifest.contributes?.grammars?.find(value => value.language === "gox")

if (manifest.icon !== "images/icon.png") {
  throw new Error("package.json does not register the GOX extension icon")
}
const icon = await readFile(resolve(root, manifest.icon))
const pngSignature = "89504e470d0a1a0a"
if (icon.subarray(0, 8).toString("hex") !== pngSignature) {
  throw new Error("GOX extension icon must be a PNG image")
}
if (icon.readUInt32BE(16) !== 256 || icon.readUInt32BE(20) !== 256) {
  throw new Error("GOX extension icon must be 256 by 256 pixels")
}
if (![4, 6].includes(icon[25])) {
  throw new Error("GOX extension icon must contain an alpha channel")
}

const launchConfiguration = JSON.parse(
  await readFile(resolve(root, ".vscode/launch.json"), "utf8")
)
if (launchConfiguration.configurations?.[0]?.preLaunchTask !== "npm: build") {
  throw new Error("Extension Development Host must build the bundled runtime before launch")
}
const taskConfiguration = JSON.parse(
  await readFile(resolve(root, ".vscode/tasks.json"), "utf8")
)
const buildTask = taskConfiguration.tasks?.find(task => task.label === "npm: build")
if (buildTask?.type !== "npm" || buildTask?.script !== "build") {
  throw new Error("Extension build task must run the portable npm build script")
}

if (manifest.main !== "./dist/extension.cjs" || !manifest.activationEvents?.includes("onLanguage:gox")) {
  throw new Error("package.json does not activate the GOX extension runtime")
}

const declaredLanguageClient = manifest.dependencies?.["vscode-languageclient"]
const lockedLanguageClient = lockfile.packages?.["node_modules/vscode-languageclient"]?.version
if (
  declaredLanguageClient !== "10.1.0" ||
  lockedLanguageClient !== declaredLanguageClient ||
  languageClientManifest.version !== declaredLanguageClient
) {
  throw new Error("vscode-languageclient must be consistently installed at 10.1.0")
}

if (
  manifest.engines?.vscode !== "^1.91.0" ||
  languageClientManifest.engines?.vscode !== "^1.91.0"
) {
  throw new Error("GOX Tools must require the VS Code version supported by vscode-languageclient")
}

const restartCommand = manifest.contributes?.commands?.find(
  command => command.command === "gox.restartLanguageServer"
)
if (restartCommand?.title !== "Restart Language Server" || restartCommand?.category !== "GOX") {
  throw new Error("package.json does not register the GOX language-server restart command")
}

if (manifest.contributes?.configuration?.properties?.["gox.inlayHints.visibility.enabled"]?.default !== true) {
  throw new Error("package.json does not register GOX visibility inlay hints")
}

if (manifest.contributes?.configurationDefaults?.["[gox]"]?.["editor.bracketPairColorization.enabled"] !== false) {
  throw new Error("VS Code bracket-pair coloring must be disabled for GOX")
}
if (manifest.contributes?.configurationDefaults?.["[gox]"]?.["editor.quickSuggestions"]?.strings !== "on") {
  throw new Error("GOX must request completion suggestions inside import strings")
}

if (!language?.extensions?.includes(".gox")) {
  throw new Error("package.json does not register the .gox extension")
}

if (languageConfiguration.brackets?.some(([open, close]) => open === "{" && close === "}")) {
  throw new Error("curly braces must use TextMate colors instead of VS Code bracket levels")
}

if (!languageConfiguration.autoClosingPairs?.some(pair => pair.open === "{" && pair.close === "}")) {
  throw new Error("curly-brace autoclosing must remain enabled")
}

if (!languageConfiguration.autoClosingPairs?.some(pair => pair.open === "{{" && pair.close === "}}")) {
  throw new Error("GOX template-expression autoclosing must remain enabled")
}

if (grammar?.scopeName !== "source.gox") {
  throw new Error("package.json does not register source.gox")
}

if (grammar.embeddedLanguages && Object.keys(grammar.embeddedLanguages).length > 0) {
  throw new Error("GOX style/script scopes must remain syntax-only and must not activate embedded-language editor features")
}

const grammarSource = await readFile(resolve(root, grammar.path), "utf8")
const grammarDefinition = JSON.parse(grammarSource)
if (!grammarDefinition.injections?.["L:source.gox -comment -string -meta.embedded.block.css.gox -meta.embedded.block.javascript.gox"]) {
  throw new Error("GOX template rules are not injected into Go contexts")
}

const theme = manifest.contributes?.themes?.find(value => value.label === "GOX Dark")
if (theme?.path !== "./themes/gox-dark-color-theme.json") {
  throw new Error("package.json does not register GOX Dark")
}

const themeDefinition = JSON.parse(await readFile(resolve(root, theme.path), "utf8"))
if (themeDefinition.name !== "GOX Dark") {
  throw new Error("GOX Dark theme name is inconsistent")
}
const lightTheme = manifest.contributes?.themes?.find(value => value.label === "GOX Light")
if (lightTheme?.uiTheme !== "vs" || lightTheme?.path !== "./themes/gox-light-color-theme.json") {
  throw new Error("package.json does not register GOX Light")
}
const lightThemeDefinition = JSON.parse(await readFile(resolve(root, lightTheme.path), "utf8"))
if (lightThemeDefinition.name !== "GOX Light" || lightThemeDefinition.type !== "light") {
  throw new Error("GOX Light theme metadata is inconsistent")
}
const semanticColors = themeDefinition.semanticTokenColors
const requiredSemanticColors = {
  "goxTag:gox": "#FF4FA3",
  "goxAttribute:gox": "#3EAD99",
  "goxAttributeValue:gox": "#D98E5F",
  "goxClientFramework:gox": "#5DC9E2"
}
for (const [selector, color] of Object.entries(requiredSemanticColors)) {
  if (semanticColors?.[selector] !== color) {
    throw new Error(`GOX semantic token ${selector} must use ${color}`)
  }
}
for (const selector of ["goxModuleKeyword:gox", "goxClientKeyword:gox", "goxDirective:gox", "goxComponent:gox", "goxClient:gox"]) {
  if (!semanticColors?.[selector]?.foreground) {
    throw new Error(`GOX semantic token ${selector} is not styled`)
  }
}

const semanticScopeContribution = manifest.contributes?.semanticTokenScopes?.find(
  contribution => contribution.language === "gox"
)
const requiredFallbackScopes = {
  goxTag: "entity.name.tag",
  goxAttribute: "entity.other.attribute-name",
  goxAttributeValue: "string.quoted",
  goxDirective: "keyword.control",
  goxComponent: "entity.name.function",
  goxClient: "entity.name.class"
}
for (const [token, scope] of Object.entries(requiredFallbackScopes)) {
  if (!semanticScopeContribution?.scopes?.[token]?.includes(scope)) {
    throw new Error(`GOX semantic token ${token} does not inherit external theme scope ${scope}`)
  }
}

const themeScopes = themeDefinition.tokenColors.flatMap(rule =>
  Array.isArray(rule.scope) ? rule.scope : [rule.scope]
)
for (const scope of [
  "entity.name.tag.js.jsx",
  "entity.name.tag.tsx",
  "entity.other.attribute-name.js.jsx",
  "entity.other.attribute-name.tsx",
  "punctuation.definition.tag.begin.js.jsx",
  "punctuation.definition.tag.begin.tsx",
  "entity.name.tag.vue",
  "entity.name.tag.svelte",
  "entity.name.tag.block.any.html",
  "entity.name.tag.script.html",
  "entity.name.tag.template.html",
  "entity.name.tag.style.html",
  "entity.other.attribute-name.directive.vue",
  "keyword.control.svelte",
  "entity.other.attribute-name.class.css",
  "support.type.property-name.css",
  "support.function.misc.css",
  "keyword.other.unit.css"
]) {
  if (!themeScopes.includes(scope)) {
    throw new Error(`GOX Dark does not style ${scope}`)
  }
  const lightThemeScopes = lightThemeDefinition.tokenColors.flatMap(rule =>
    Array.isArray(rule.scope) ? rule.scope : [rule.scope]
  )
  if (!lightThemeScopes.includes(scope)) {
    throw new Error(`GOX Light does not style ${scope}`)
  }
}

console.log("GOX Tools configuration is valid")
