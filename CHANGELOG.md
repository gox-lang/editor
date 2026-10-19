# Change Log

## 0.1.5

- Rewrite the README in English with installation, features, settings, and update guidance for users.
- Remove internal development and test workspace instructions from the Marketplace description.
- Align the MIT license copyright with GOX Server and the GOX SDK.

## 0.1.4

- Automatically install official GOX releases for the extension host when GOX is missing.
- Verify package checksums and executable versions before installation.
- Preserve existing installations and configure new VS Code terminal paths.
- Coordinate language-server restarts after managed GOX updates.

## 0.1.3

- Added the GOX language server client and automatic restart support.
- Added syntax highlighting for GOX modules, clients, templates, directives, components, and embedded expressions.
- Added navigation from GOX client declarations to their source files.
- Added visibility and client-template inlay hints.
- Added the GOX Dark and GOX Light color themes.
- Added the official GOX extension icon with a transparent background.
- Added theme coverage for JavaScript, TypeScript, JSX, TSX, HTML, CSS, Vue, and Svelte.
- Added automated validation for the extension manifest, TextMate grammar, themes, hints, and language-server lifecycle.
- Fixed Extension Development Host builds when Node.js is installed through a shell version manager.
