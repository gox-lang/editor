const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const crypto = require("node:crypto")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")
const { gunzipSync } = require("node:zlib")
const { unzipSync } = require("fflate")
const tar = require("tar-stream")
const run = promisify(execFile)
const latest = "https://api.github.com/repos/gox-lang/server/releases/latest"
const limit = 256 * 1024 * 1024

function target(platform = process.platform, arch = process.arch) {
  const system = { linux: "linux", darwin: "darwin", win32: "windows" }[platform]
  const cpu = { x64: "amd64", arm64: "arm64" }[arch]
  if (!system || !cpu) throw new Error(`GOX is not available for ${platform}/${arch}.`)
  return { system, arch: cpu, binary: system === "windows" ? "gox.exe" : "gox", suffix: system === "windows" ? ".zip" : ".tar.gz" }
}

function installDirectory() {
  const base = process.platform === "win32"
    ? (process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"))
    : (process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : (process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")))
  return path.join(base, "gox", "bin")
}

async function version(executable) {
  const { stdout } = await run(executable, ["version"], { timeout: 15000, windowsHide: true, maxBuffer: 65536 })
  const match = /^GOX Server (\S+)\s*$/.exec(stdout)
  if (!match) throw new Error("The selected executable is not GOX.")
  return match[1]
}

async function download(url, max, signal) {
  if (!url.startsWith("https://")) throw new Error("GOX downloads require HTTPS.")
  const response = await fetch(url, { headers: { "User-Agent": "gox-tools" }, signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(300000)]) })
  if (!response.ok) throw new Error(`GOX download failed (HTTP ${response.status}).`)
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > max) throw new Error("GOX download exceeds the size limit.")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function extract(archive, info) {
  if (info.suffix === ".zip") {
    const files = unzipSync(archive, { filter: entry => entry.name === info.binary && entry.originalSize > 0 && entry.originalSize <= limit })
    if (!files[info.binary]) throw new Error("GOX executable is missing from the package.")
    return Buffer.from(files[info.binary])
  }
  const unpack = tar.extract()
  let binary
  const completed = new Promise((resolve, reject) => {
    unpack.on("error", reject)
    unpack.on("entry", (header, stream, next) => {
      if (header.name !== info.binary) { stream.resume(); stream.on("end", next); return }
      if (binary || header.type !== "file" || header.size <= 0 || header.size > limit) { unpack.destroy(new Error("Invalid GOX executable in package.")); stream.resume(); return }
      const chunks = []
      stream.on("data", chunk => chunks.push(chunk))
      stream.on("end", () => { binary = Buffer.concat(chunks); next() })
      stream.on("error", reject)
    })
    unpack.on("finish", () => binary ? resolve(binary) : reject(new Error("GOX executable is missing from the package.")))
  })
  unpack.end(gunzipSync(archive, { maxOutputLength: limit }))
  return completed
}

async function install({ directory = installDirectory(), info = target(), signal, report = () => {}, get = download, probe = version } = {}) {
  await fs.mkdir(directory, { recursive: true })
  const executable = path.join(directory, info.binary)
  const lock = path.join(directory, ".install-lock")
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    try { await fs.mkdir(lock); break } catch (error) {
      if (error.code !== "EEXIST") throw error
      const stat = await fs.stat(lock).catch(() => undefined)
      if (stat && Date.now() - stat.mtimeMs > 3600000) { await fs.rmdir(lock).catch(() => {}); continue }
      if (attempt >= 300) throw new Error("Another GOX installation is still running. Retry shortly.")
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  let staging
  try {
    if (await fs.stat(executable).catch(() => undefined)) { await probe(executable); return executable }
    report("Finding the latest stable GOX release…")
    const release = JSON.parse((await get(latest, 2 * 1024 * 1024, signal)).toString())
    if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name) || release.draft || release.prerelease) throw new Error("No stable GOX release is available.")
    const name = `gox_${release.tag_name.slice(1)}_${info.system}_${info.arch}${info.suffix}`
    function asset(name) {
      const expected = `https://github.com/gox-lang/server/releases/download/${release.tag_name}/${name}`
      const found = release.assets?.find(asset => asset.name === name)
      if (!found || found.browser_download_url !== expected) throw new Error(`Official release asset unavailable: ${name}`)
      return expected
    }
    const checksums = (await get(asset("checksums.sha256"), 1024 * 1024, signal)).toString()
    const lines = checksums.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(fields => fields.length === 2 && fields[1] === name)
    if (lines.length !== 1 || !/^[a-f\d]{64}$/i.test(lines[0][0])) throw new Error("Invalid GOX release checksum manifest.")
    report(`Downloading GOX ${release.tag_name}…`)
    const archive = await get(asset(name), limit, signal)
    if (crypto.createHash("sha256").update(archive).digest("hex") !== lines[0][0].toLowerCase()) throw new Error("GOX package checksum mismatch.")
    const binary = await extract(archive, info)
    staging = await fs.mkdtemp(path.join(directory, ".install-"))
    const candidate = path.join(staging, info.binary)
    await fs.writeFile(candidate, binary, { mode: 0o755 })
    signal?.throwIfAborted()
    if (await probe(candidate) !== release.tag_name) throw new Error("Downloaded GOX version does not match the release.")
    await fs.writeFile(executable + ".managed.json", JSON.stringify({ manager: "gox-tools" }), { mode: 0o600 })
    await fs.rename(candidate, executable)
    report("GOX installed.")
    return executable
  } finally {
    if (staging) await fs.rm(staging, { recursive: true, force: true })
    await fs.rmdir(lock)
  }
}

async function resolveServer(configured, options = {}) {
  const probe = options.probe || version
  const info = options.info || target()
  const directory = options.directory || installDirectory()
  if (configured && configured !== "gox") { await probe(configured); return configured }
  for (const dir of (options.searchPath ?? process.env.PATH ?? "").split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue
    const candidate = path.join(dir, info.binary)
    if (!await fs.stat(candidate).catch(() => undefined)) continue
    await probe(candidate)
    return candidate
  }
  return install({ ...options, info, directory })
}
module.exports = { target, installDirectory, version, extract, install, resolveServer }
