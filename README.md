# GOX Tools

The official GOX extension for Visual Studio Code. Write Go code, HTML templates, and components in `.gox` files, with completion, diagnostics, and navigation directly in your editor.

GOX Tools automatically sets up GOX and its language server so you can get started without installing Go separately.

## Installation

Install **GOX Tools**, published by **gox-lang**, from the VS Code Extensions panel or [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=gox-lang.gox-tools).

You can also install it from a terminal:

```sh
code --install-extension gox-lang.gox-tools
```

Requires **Visual Studio Code 1.91 or later** and a trusted workspace. The initial download of GOX and its tools requires an internet connection.

## Getting started

1. Open your project folder in VS Code.
2. Open a `.gox` file. GOX Tools automatically prepares and starts the language server.
3. Start writing: completion, diagnostics, and navigation become available once the initial setup finishes.

If you do not have a project yet, open a **new integrated terminal** after GOX finishes installing and run:

```sh
gox createproject my-app
cd my-app
gox run
```

To explore an application with interactive examples, create the demo project:

```sh
gox createproject my-demo --demo
cd my-demo
gox run
```

## Tools for writing GOX

- **Syntax highlighting** for Go, HTML, embedded expressions, template directives, and components.
- **Completion** for symbols, struct fields, and imports, including suggestions from the GOX SDK.
- **Diagnostics** to identify problems as you work.
- **Navigation** between symbols and from Client Component declarations to their source files.
- **Formatting and import organization** through the editor's built-in actions.
- **Snippets** for common code structures.
- **Visibility and Client Component hints** that do not modify your source files.

The language server is part of the GOX executable and runs through `gox ls`. The extension starts it and connects it to the editor automatically.

## GOX Dark and GOX Light themes

The extension includes **GOX Dark** and **GOX Light**, with colors that distinguish Go code, templates, and components.

Select either theme using **Preferences: Color Theme** in the Command Palette. You can also keep using your preferred theme.

## GOX installation and updates

GOX Tools looks for `gox` in `PATH` to provide the CLI. A custom `gox.languageServer.path` selects the executable used by the editor independently; it does not prevent installation of the official CLI when it is missing. If it cannot find an installation, it downloads the latest stable [GOX Server release](https://github.com/gox-lang/server/releases) for your system and verifies its SHA-256 checksum and executable version before using it.

Automatic installations are stored in a user directory and do not require administrator permissions. The extension configures your user PATH so `gox` is available in new terminals both inside and outside VS Code. On Linux and macOS, it adds a marked, repeatable block to Bash and Zsh startup files and a Fish configuration file. On Windows, it updates the user PATH; restart your terminal application to pick up the change. GOX remains installed if you uninstall the extension.

The language server prepares the Go version it needs. You do not need to install or configure Go manually to use it.

For installations managed by GOX Tools, the language server checks for updates every 24 hours. When a newer stable release is available, it installs the update in the background and the extension restarts the language server. Running applications continue using their current version.

External installations receive an update notice. You can also update GOX manually:

```sh
gox update
```

When running an application with `gox run`, GOX checks for updates and recommends this command when appropriate; it does not automatically update the executable from the running application.

## Supported systems

Official binaries are available for **x64 and ARM64**.

| System | Support |
| --- | --- |
| Linux | Editing and GOX application development. |
| macOS | Editing and GOX application development. |
| Windows | Native CLI and language server. Use VS Code connected to WSL to run applications. |

Go does not support native plugins on Windows. With WSL, your project and tools run on Linux.

In remote workspaces, GOX Tools installs and runs GOX on the extension host, alongside your project.

## Settings

Search for **GOX** in VS Code Settings to configure these options:

| Setting | Purpose | Default |
| --- | --- | --- |
| `gox.languageServer.path` | GOX executable used by the language server. Set an absolute path to select a specific installation. | `gox` |
| `gox.inlayHints.visibility.enabled` | Show `exported`, `public`, and `private` hints on declarations. | `true` |
| `gox.inlayHints.clientTemplate.enabled` | Show how to use a `client` declaration in a template. | `true` |

Changing the executable path automatically restarts the language server. An invalid custom path produces an error so you can correct it.

To restart it manually, run **GOX: Restart Language Server** from the Command Palette.

## Help

If completion is unavailable, check that the file's language mode is **GOX**, the workspace is trusted, and the initial setup has finished. If you configured a custom executable, verify its path and restart the language server.

Report problems in the [GOX Tools repository](https://github.com/gox-lang/editor/issues). Include your VS Code, GOX Tools, and GOX versions, your operating system, and steps to reproduce the issue.

- [GOX website](https://gox-lang.dev)
- [GOX Server](https://github.com/gox-lang/server)
- [GOX SDK](https://github.com/gox-lang/gox)
- [Demo project](https://github.com/gox-lang/demo)

## Contributing and security

Bug reports and proposals are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution policy and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

[MIT](LICENSE), copyright 2026 Javier Marquez.
