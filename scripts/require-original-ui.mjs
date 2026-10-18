// Historical exact-UI tools must never relabel a revised Web UI as an unchanged reference.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../packages/plugin-runtime/',import.meta.url));
const original=JSON.parse(readFileSync(join(root,'UPSTREAM.json'),'utf8'));
for(const [file,hash] of Object.entries(original.sha256)){
 const actual=createHash('sha256').update(readFileSync(join(root,file))).digest('hex');
 if(actual!==hash)throw new Error('Historical original-UI parity does not apply to this approved Web redesign. Use npm run test:browser, test:ui-review and test:layout for current acceptance. Run the historical comparison only on baseline a6c02ea (or the unchanged original plugin); do not regenerate a false original reference from this branch.');
}
