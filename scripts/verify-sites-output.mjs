import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const engine = path.join(root, 'wasm/ffmpeg-0.12.10');
const manifest = JSON.parse(readFileSync(path.join(engine, 'ffmpeg-core.parts.json'), 'utf8'));
const wasm = Buffer.concat(
  manifest.parts.map((part) => readFileSync(path.join(engine, part.file))),
);
assert.deepEqual(wasm, readFileSync('packages/app/dist/wasm/ffmpeg-0.12.10/ffmpeg-core.wasm'));
const directory = path.join(root, 'licenses/sources');
const sources = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
for (const source of sources.sources) {
  const bytes = source.parts
    ? Buffer.concat(source.parts.map((part) => readFileSync(path.join(directory, part.file))))
    : readFileSync(path.join(directory, source.archive));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.archive);
}
console.log('Verified byte-identical engine and all corresponding-source archives.');
for (const line of readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
  const [digest, file] = line.split('  ./');
  assert.equal(
    createHash('sha256')
      .update(readFileSync(path.join(root, file)))
      .digest('hex'),
    digest,
    file,
  );
}
console.log('Verified published asset checksums.');
