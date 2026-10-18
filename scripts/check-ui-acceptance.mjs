import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('test/ui-acceptance-manifest.json',root),'utf8'));
assert.equal(manifest.version,2);assert.equal(manifest.baselineCommit,'a6c02ea644457cb400153bf208a363fbde4e36c6');
for(const [file,entry] of [...Object.entries(manifest.changed),...Object.entries(manifest.added)]) {
 assert(entry.reason||entry.purpose);assert.equal(createHash('sha256').update(readFileSync(new URL(file,root))).digest('hex'),entry.webSha256,`Acceptance change not declared/pinned: ${file}`);
}
assert.match(readFileSync(new URL('test/native.mjs',root),'utf8'),/require-original-ui/);
assert.match(readFileSync(new URL('scripts/reference-pages.mjs',root),'utf8'),/require-original-ui/);
console.log('PASS: explicit Web acceptance manifest; changed navigation/layout assumptions are declared, historical native reference generation is guarded.');
