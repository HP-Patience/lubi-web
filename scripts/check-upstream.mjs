import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../packages/plugin-runtime/',import.meta.url));
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const originalBytes=readFileSync(join(root,'UPSTREAM.json'));
const original=JSON.parse(originalBytes),web=JSON.parse(readFileSync(join(root,'WEB_UI.json'),'utf8'));
assert.equal(sha(originalBytes),web.immutableUpstreamManifestSha256,'The historical upstream manifest itself must not be rewritten.');
assert.equal(web.baselineCommit,'a6c02ea644457cb400153bf208a363fbde4e36c6');
assert.equal(web.approval,'2026-10-18: allow_web_ui_changes; review before deployment');
let unchanged=0,owned=0;
for(const [file,hash] of Object.entries(original.sha256)) {
  const override=web.overrides[file];
  if(override){assert(file.startsWith('src/ui/'),'Only presentation source may be forked');assert.equal(override.originalSha256,hash);assert(override.reason);assert.equal(sha(readFileSync(join(root,file))),override.webSha256,`Unreviewed Web UI change: ${file}`);owned++;}
  else {assert.equal(sha(readFileSync(join(root,file))),hash,`Immutable upstream engine/style changed: ${file}`);unchanged++;}
}
for(const file of Object.keys(web.overrides))assert(original.sha256[file],`Unknown upstream file: ${file}`);
for(const [file,entry] of Object.entries(web.additions)){assert(file.startsWith('src/ui/'));assert(!original.sha256[file]);assert(entry.reason);assert.equal(sha(readFileSync(join(root,file))),entry.webSha256,`Unreviewed Web UI addition: ${file}`);}
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
for(const path of walk(join(root,'src'))){const file=relative(root,path).replaceAll('\\','/');assert(original.sha256[file]||web.additions[file],`Source outside the ownership manifest: ${file}`);}
console.log(`PASS: original manifest preserved; ${unchanged} source/style files byte-identical; ${owned} explicitly Web-owned UI forks; ${Object.keys(web.additions).length} declared UI additions. No native pixel-parity claim.`);
