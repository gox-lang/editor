const identifier = String.raw`[\p{L}_][\p{L}\p{N}_]*`
const exportedName = name => /^\p{Lu}/u.test(name)

function maskNonCode(source) {
  const chars = source.split("")
  const result = source.split("")
  let state = "code"

  for (let index = 0; index < chars.length; index++) {
    const current = chars[index]
    const next = chars[index + 1]
    const rest = chars.slice(index, index + 4).join("")
    const preserve = current === "\n" || current === "\r"

    if (state === "line-comment") {
      if (current === "\n") state = "code"
      else result[index] = " "
      continue
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        result[index] = result[index + 1] = " "
        index++
        state = "code"
      } else if (!preserve) result[index] = " "
      continue
    }
    if (state === "html-comment") {
      if (rest.startsWith("-->")) {
        result[index] = result[index + 1] = result[index + 2] = " "
        index += 2
        state = "code"
      } else if (!preserve) result[index] = " "
      continue
    }
    if (["double", "single", "raw"].includes(state)) {
      const delimiter = state === "double" ? '"' : state === "single" ? "'" : "`"
      if (current === "\\" && state !== "raw" && next !== undefined) {
        result[index] = result[index + 1] = " "
        index++
      } else {
        if (!preserve) result[index] = " "
        if (current === delimiter) state = "code"
      }
      continue
    }

    if (current === "/" && next === "/") {
      result[index] = result[index + 1] = " "
      index++
      state = "line-comment"
    } else if (current === "/" && next === "*") {
      result[index] = result[index + 1] = " "
      index++
      state = "block-comment"
    } else if (rest.startsWith("<!--")) {
      result[index] = result[index + 1] = result[index + 2] = result[index + 3] = " "
      index += 3
      state = "html-comment"
    } else if (current === '"') {
      result[index] = " "
      state = "double"
    } else if (current === "'") {
      result[index] = " "
      state = "single"
    } else if (current === "`") {
      result[index] = " "
      state = "raw"
    }
  }
  return result.join("")
}

function scanVisibilityHints(source) {
  const masked = maskNonCode(source)
  const lines = masked.split(/(?<=\n)/)
  const hints = []
  const structs = []
  let offset = 0
  let braceDepth = 0
  let declarationGroup = null

  const add = (label, at, name, declaration) => hints.push({ label, offset: at, name, declaration })

  for (const line of lines) {
    const depthAtStart = braceDepth
    const topFunction = new RegExp(`^(\\s*)func\\s*(?:\\(([^)]*)\\)\\s*)?(${identifier})\\s*\\(`, "u").exec(line)
    const topType = new RegExp(`^(\\s*)type\\s+(${identifier})\\b`, "u").exec(line)
    const topValues = new RegExp(`^(\\s*)(var|const)\\s+(${identifier}(?:\\s*,\\s*${identifier})*)\\b`, "u").exec(line)
    const groupStart = /^(\s*)(var|const|type)\s*\(\s*(?:\r?\n)?$/.exec(line)

    if (depthAtStart === 0 && topFunction) {
      const [, leading, receiver, name] = topFunction
      if (receiver !== undefined) {
        add(exportedName(name) ? "public" : "private", offset + leading.length, name, "method")
      } else if (exportedName(name)) {
        add("exported", offset + leading.length, name, "func")
      }
    }
    if (depthAtStart === 0 && topType && exportedName(topType[2])) {
      add("exported", offset + topType[1].length, topType[2], "type")
    }
    if (depthAtStart === 0 && topValues) {
      const names = [...topValues[3].matchAll(new RegExp(identifier, "gu"))]
      const keywordOffset = offset + topValues[1].length
      for (const match of names) {
        if (!exportedName(match[0])) continue
        const at = names.length === 1
          ? keywordOffset
          : offset + topValues.index + topValues[0].indexOf(topValues[3]) + match.index
        add("exported", at, match[0], topValues[2])
      }
    }

    if (depthAtStart === 0 && groupStart) declarationGroup = groupStart[2]
    else if (depthAtStart === 0 && declarationGroup && /^\s*\)/.test(line)) declarationGroup = null
    else if (depthAtStart === 0 && declarationGroup) {
      const spec = new RegExp(`^(\\s*)(${identifier}(?:\\s*,\\s*${identifier})*)\\b`, "u").exec(line)
      if (spec) {
        for (const match of spec[2].matchAll(new RegExp(identifier, "gu"))) {
          if (exportedName(match[0])) add("exported", offset + spec[1].length + match.index, match[0], declarationGroup)
        }
      }
    }

    const namedStruct = new RegExp(`^\\s*type\\s+(${identifier})\\s+struct\\s*\\{`, "u").exec(line)
    const groupedStruct = declarationGroup === "type"
      ? new RegExp(`^\\s*(${identifier})\\s+struct\\s*\\{`, "u").exec(line)
      : null
    if (depthAtStart === 0 && (namedStruct || groupedStruct)) {
      const opening = line.indexOf("{", (namedStruct || groupedStruct).index)
      structs.push({ depth: depthAtStart + 1, openingOffset: offset + opening })
    }

    const activeStruct = structs.at(-1)
    if (activeStruct && depthAtStart === activeStruct.depth && !/^\s*}/.test(line)) {
      const field = new RegExp(`^(\\s*)(${identifier}(?:\\s*,\\s*${identifier})*)\\s*(?::\\s*|\\s+)(?=\\S)`, "u").exec(line)
      if (field) {
        const names = [...field[2].matchAll(new RegExp(identifier, "gu"))]
        for (const match of names) {
          const name = match[0]
          if (name !== "_") add(exportedName(name) ? "public" : "private", offset + field[1].length + match.index, name, "field")
        }
      }
    }

    for (const char of line) {
      if (char === "{") braceDepth++
      else if (char === "}") braceDepth = Math.max(0, braceDepth - 1)
    }
    while (structs.length && braceDepth < structs.at(-1).depth) structs.pop()
    offset += line.length
  }

  return hints
}

function scanClientTemplateHints(source) {
  const masked = maskNonCode(source)
  const lines = masked.split(/(?<=\n)/)
  const hints = []
  let offset = 0
  let braceDepth = 0

  for (const line of lines) {
    const declaration = new RegExp(`^\\s*client\\s+(${identifier})\\s+${identifier}\\s*\\{`, "u").exec(line)
    if (braceDepth === 0 && declaration) {
      const lineEnd = line.replace(/[\r\n]+$/u, "").length
      hints.push({
        label: `template → <@${declaration[1]} />`,
        offset: offset + lineEnd,
        name: declaration[1]
      })
    }

    for (const char of line) {
      if (char === "{") braceDepth++
      else if (char === "}") braceDepth = Math.max(0, braceDepth - 1)
    }
    offset += line.length
  }

  return hints
}

module.exports = { maskNonCode, scanVisibilityHints, scanClientTemplateHints }
