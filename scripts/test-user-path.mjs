import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const { configureUserPath, configureManagedPath } = require('../src/user-path.cjs')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gox-user-path-'))
try {
  if (process.platform !== 'win32') {
    const home = path.join(root, 'home')
    const directory = path.join(root, "GOX space ' $never `never`", 'bin')
    await fs.mkdir(home); await fs.mkdir(directory, { recursive: true })
    const executable = path.join(directory, 'gox')
    await fs.writeFile(executable, '#!/bin/sh\nprintf "GOX test binary\\n"\n', { mode: 0o755 })
    await fs.writeFile(path.join(home, '.bash_profile'), '# existing configuration\nexport PRESERVED=yes\n')
    const options = { home, platform: 'linux', env: {} }
    assert.equal(await configureManagedPath(executable, options), false, 'external binaries do not change profiles')
    await fs.writeFile(executable + '.managed.json', JSON.stringify({manager:'gox-tools'}))
    assert.equal(await configureManagedPath(executable, options), true)
    assert.equal(await configureManagedPath(executable, options), false)
    await Promise.all([configureManagedPath(executable, options), configureManagedPath(executable, options)])
    const profile = await fs.readFile(path.join(home, '.bash_profile'), 'utf8')
    assert(profile.startsWith('# existing configuration\nexport PRESERVED=yes\n'))
    assert.equal(profile.split('# >>> GOX Tools PATH >>>').length, 2)
    const output = execFileSync('/bin/bash', ['--noprofile', '--norc', '-c', '. "$1"; . "$1"; gox version; printf "%s" "$PRESERVED"', 'test', path.join(home, '.bash_profile')], {env:{PATH:'/usr/bin:/bin'},encoding:'utf8'})
    assert.equal(output, 'GOX test binary\nyes')
    const interactive = execFileSync('/bin/bash', ['--noprofile', '--rcfile', path.join(home,'.bashrc'), '-ic', 'gox version'], {env:{PATH:'/usr/bin:/bin'},encoding:'utf8',stdio:['ignore','pipe','pipe']})
    assert(interactive.endsWith('GOX test binary\n'))
    assert.equal(await fs.stat(path.join(home,'.bash_login')).catch(()=>null),null)
    const zhome=path.join(root,'zsh'); const config=path.join(root,'config')
    await configureUserPath(directory,{...options,platform:'darwin',env:{ZDOTDIR:zhome,XDG_CONFIG_HOME:config}})
    assert((await fs.readFile(path.join(zhome,'.zshrc'),'utf8')).includes('GOX Tools PATH'))
    assert((await fs.readFile(path.join(config,'fish/conf.d/gox-tools.fish'),'utf8')).includes('set -gx PATH'))
    await assert.rejects(configureUserPath('/bad:path',options), /cannot be represented/)
    await fs.writeFile(path.join(home,'.profile'),'# >>> GOX Tools PATH >>>\nbroken')
    await assert.rejects(configureManagedPath(executable,options),/Incomplete/)
    assert.equal(await fs.stat(executable+'.path-lock').catch(()=>null),null)
  }
  let calls=0
  assert.equal(await configureUserPath('C:\\Users\\Test Name\\GOX\\bin',{platform:'win32',env:{SystemRoot:'C:\\Windows'},execute:async(binary,args,opts)=>{
    calls++
    assert(binary.endsWith('powershell.exe'))
    const script=Buffer.from(args.at(-1),'base64').toString('utf16le')
    assert(script.includes("SetEnvironmentVariable('Path', $updated, 'User')"))
    assert(script.includes('ExpandEnvironmentVariables'))
    assert(!script.includes('Test Name'))
    assert.equal(opts.env.GOX_PATH_DIRECTORY,'C:\\Users\\Test Name\\GOX\\bin')
    return {stdout:'changed\r\n'}
  }}),true)
  assert.equal(calls,1)
  console.log('User PATH persistence, shell execution, quoting, concurrency, preservation and Windows command tests passed')
} finally {await fs.rm(root,{recursive:true,force:true})}
