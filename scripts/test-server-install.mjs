import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { gzipSync } from 'node:zlib'
const require = createRequire(import.meta.url)
const tar = require('tar-stream')
const { zipSync } = require('fflate')
const { target, extract, install, resolveServer } = require('../src/server-install.cjs')

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gox-installer-test-'))
try {
  assert.equal(target('win32','arm64').binary,'gox.exe')
  assert.equal(target('darwin','x64').arch,'amd64')
  assert.throws(() => target('linux','ia32'))
  const pack = tar.pack()
  const chunks = []
  const done = new Promise((resolve,reject) => { pack.on('data',c=>chunks.push(c));pack.on('end',resolve);pack.on('error',reject) })
  pack.entry({name:'gox',mode:0o755},'test binary')
  pack.finalize()
  await done
  const archive = gzipSync(Buffer.concat(chunks))
  assert.equal((await extract(archive,target('linux','x64'))).toString(),'test binary')
  assert.equal((await extract(Buffer.from(zipSync({'gox.exe':Buffer.from('windows binary')})),target('win32','x64'))).toString(),'windows binary')
  await assert.rejects(extract(Buffer.from(zipSync({'../gox.exe':Buffer.from('bad')})),target('win32','x64')))
  const name='gox_1.0.0_linux_amd64.tar.gz'
  const base='https://github.com/gox-lang/server/releases/download/v1.0.0/'
  const release={tag_name:'v1.0.0',assets:[name,'checksums.sha256'].map(name=>({name,browser_download_url:base+name}))}
  let calls=0
  const get=async url=>{
    calls++
    if(url.endsWith('/latest'))return Buffer.from(JSON.stringify(release))
    if(url.endsWith('checksums.sha256'))return Buffer.from(`${crypto.createHash('sha256').update(archive).digest('hex')}  ${name}\n`)
    return archive
  }
  const directory=path.join(root,'managed')
  const options={directory,info:target('linux','x64'),get,probe:async ()=>'v1.0.0',searchPath:''}
  const installed=await resolveServer('gox',options)
  assert.equal(await fs.readFile(installed,'utf8'),'test binary')
  assert.equal(JSON.parse(await fs.readFile(installed+'.managed.json','utf8')).manager,'gox-tools')
  assert.equal(calls,3)
  await resolveServer('gox',options)
  assert.equal(calls,3,'existing installation must work offline')
  await assert.rejects(resolveServer('/missing/gox',{...options,probe:async()=>{throw Error('missing')}}))
  assert.equal(calls,3,'explicit invalid path must not cause installation')
  const external=path.join(root,'external');await fs.mkdir(external);await fs.writeFile(path.join(external,'gox'),'existing')
  assert.equal(await resolveServer('gox',{...options,searchPath:external}),path.join(external,'gox'))
  assert.equal(calls,3,'external installation must not trigger download')
  const corrupt=path.join(root,'corrupt')
  await assert.rejects(install({...options,directory:corrupt,get:async url=>url.endsWith('.tar.gz')?Buffer.from('damaged'):get(url)}),/checksum mismatch/)
  await assert.rejects(fs.stat(path.join(corrupt,'gox')))
  await assert.rejects(fs.stat(path.join(corrupt,'.install-lock')))
  const wrong=path.join(root,'wrong')
  await assert.rejects(install({...options,directory:wrong,probe:async ()=>'v9.9.9'}),/version does not match/)
  await assert.rejects(fs.stat(path.join(wrong,'gox')))
  const abort=new AbortController();abort.abort()
  await assert.rejects(install({...options,directory:path.join(root,'cancelled'),signal:abort.signal}))
  console.log('GOX installer platform, checksum, extraction, existing installation and failure tests passed')
} finally {await fs.rm(root,{recursive:true,force:true})}
