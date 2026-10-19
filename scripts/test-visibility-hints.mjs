import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { scanVisibilityHints, scanClientTemplateHints } = require("../src/visibility-hints.cjs")

const source = `package sample

client Menu react {
    src: "menu/menu.jsx"
}

const MaxUsers = 10
var internalUser = "George"
var internalValue, ExportedValue int

type User struct {
    Name string
    age int
    Email, phone string
}

func Card() {
    var LocalValue = 1
    _ = {{ struct { Value string }{} }}
    <style>.card { color: red; }</style>
}

func (user User) DisplayName() string { return user.Name }
func (user *User) setName(name string) { user.Name = name }

var (
    DefaultUser User
    internalLimit int
)
`

const hints = scanVisibilityHints(source).map(({ label, name, declaration }) => ({ label, name, declaration }))
assert.deepEqual(hints, [
  { label: "exported", name: "MaxUsers", declaration: "const" },
  { label: "exported", name: "ExportedValue", declaration: "var" },
  { label: "exported", name: "User", declaration: "type" },
  { label: "public", name: "Name", declaration: "field" },
  { label: "private", name: "age", declaration: "field" },
  { label: "public", name: "Email", declaration: "field" },
  { label: "private", name: "phone", declaration: "field" },
  { label: "exported", name: "Card", declaration: "func" },
  { label: "public", name: "DisplayName", declaration: "method" },
  { label: "private", name: "setName", declaration: "method" },
  { label: "exported", name: "DefaultUser", declaration: "var" }
])

assert.deepEqual(scanClientTemplateHints(source), [
  {
    label: "template → <@Menu />",
    offset: source.indexOf("client Menu react {") + "client Menu react {".length,
    name: "Menu"
  }
])

console.log("GOX visibility inlay-hint tests passed")
