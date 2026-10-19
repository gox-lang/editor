const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")

const run = promisify(execFile)
const start = "# >>> GOX Tools PATH >>>"
const end = "# <<< GOX Tools PATH <<<"
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'"
const fishQuote = value => "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"

async function updateFile(file, body) {
  let original = ""
  try { original = await fs.readFile(file, "utf8") } catch (error) { if (error.code !== "ENOENT") throw error }
  const block = `${start}\n${body}\n${end}`
  const from = original.indexOf(start)
  let result
  if (from !== -1) {
    const to = original.indexOf(end, from)
    if (to === -1) throw new Error(`Incomplete GOX PATH block in ${file}.`)
    result = original.slice(0, from) + block + original.slice(to + end.length)
  } else {
    result = original + (original && !original.endsWith("\n") ? "\n" : "") + "\n" + block + "\n"
  }
  if (result === original) return false
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, result, { mode: 0o600 })
  return true
}

// Directory values are passed as environment data, never interpolated into PowerShell.
const windowsScript = `
$ErrorActionPreference = 'Stop'
$directory = $env:GOX_PATH_DIRECTORY
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @($current -split ';' | Where-Object { $_ })
$exists = $false
foreach ($entry in $entries) {
  if ([Environment]::ExpandEnvironmentVariables($entry).TrimEnd('\\') -ieq $directory.TrimEnd('\\')) { $exists = $true }
}
if ($exists) { Write-Output 'unchanged' } else {
  $updated = if ([string]::IsNullOrEmpty($current)) { $directory } else { $current.TrimEnd(';') + ';' + $directory }
  [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
  Write-Output 'changed'
}
`

async function configureUserPath(directory, { platform = process.platform, home = os.homedir(), env = process.env, execute = run } = {}) {
  const paths = platform === "win32" ? path.win32 : path
  if (!paths.isAbsolute(directory) || /[\r\n\0]/.test(directory) || directory.includes(platform === "win32" ? ";" : ":")) {
    throw new Error("GOX installation directory cannot be represented in PATH.")
  }
  if (platform === "win32") {
    const powershell = path.win32.join(env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    const { stdout } = await execute(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(windowsScript, "utf16le").toString("base64")], {
      env: { ...env, GOX_PATH_DIRECTORY: directory }, windowsHide: true, timeout: 15000
    })
    return stdout.trim() === "changed"
  }
  if (!["linux", "darwin"].includes(platform)) throw new Error(`Unsupported shell platform: ${platform}`)
  const literal = quote(directory)
  const body = `case ":$PATH:" in\n  *:${literal}:*) ;;\n  *) export PATH=${literal}:"$PATH" ;;\nesac`
  const zshHome = env.ZDOTDIR && path.isAbsolute(env.ZDOTDIR) ? env.ZDOTDIR : home
  const files = new Set([path.join(home, ".profile"), path.join(home, ".bashrc"), path.join(zshHome, ".zprofile"), path.join(zshHome, ".zshrc")])
  // Bash reads only the first existing login profile; do not create one that
  // would hide an existing .profile or .bash_login.
  for (const name of [".bash_profile", ".bash_login"]) {
    const file = path.join(home, name)
    if (await fs.stat(file).catch(() => undefined)) { files.add(file); break }
  }
  let changed = false
  for (const file of files) changed = await updateFile(file, body) || changed
  const config = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(home, ".config")
  const fishBody = `if not contains -- ${fishQuote(directory)} $PATH\n  set -gx PATH ${fishQuote(directory)} $PATH\nend`
  changed = await updateFile(path.join(config, "fish", "conf.d", "gox-tools.fish"), fishBody) || changed
  return changed
}

async function configureManagedPath(executable, options = {}) {
  let marker
  try { marker = JSON.parse(await fs.readFile(executable + ".managed.json", "utf8")) } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
  if (marker.manager !== "gox-tools") return false
  // Serialize profile changes made by multiple VS Code windows.
  const lock = executable + ".path-lock"
  for (let attempt = 0; ; attempt++) {
    try { await fs.mkdir(lock); break } catch (error) {
      if (error.code !== "EEXIST") throw error
      const stat = await fs.stat(lock).catch(() => undefined)
      if (stat && Date.now() - stat.mtimeMs > 60000) { await fs.rmdir(lock).catch(() => {}); continue }
      if (attempt >= 100) throw new Error("Another GOX PATH setup is running. Restart the language server to retry.")
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  try { return await configureUserPath(path.dirname(executable), options) } finally { await fs.rmdir(lock) }
}

module.exports = { configureUserPath, configureManagedPath }
