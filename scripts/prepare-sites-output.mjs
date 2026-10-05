import {
  cpSync,
  existsSync,
  rmSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = path.join(project, 'packages/app/dist');
const output = path.join(project, 'dist');
if (!existsSync(path.join(built, 'index.html'))) throw new Error('Run pnpm build first.');
// Only this project's generated publication directory is replaced.
rmSync(output, { recursive: true, force: true });
cpSync(built, output, { recursive: true });
// The runtime loads byte-identical WASM chunks. Keep the original in regular
// Vite output for existing codec/benchmark contracts; omit it from Sites only.
rmSync(path.join(output, 'wasm/ffmpeg-0.12.10/ffmpeg-core.wasm'));
const sources = path.join(output, 'licenses/sources');
const manifest = JSON.parse(readFileSync(path.join(sources, 'manifest.json'), 'utf8'));
for (const source of manifest.sources) {
  const file = path.join(sources, source.archive);
  if (statSync(file).size <= 25 * 1024 * 1024) continue;
  const bytes = readFileSync(file);
  source.parts = [];
  for (let start = 0, i = 1; start < bytes.length; start += 16 * 1024 * 1024, i++) {
    const name = `${source.archive}.part${i}`;
    const part = bytes.subarray(start, start + 16 * 1024 * 1024);
    writeFileSync(path.join(sources, name), part);
    source.parts.push({ file: name, bytes: part.length });
  }
  rmSync(file);
}
writeFileSync(path.join(sources, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  path.join(sources, 'join-sources.py'),
  "from pathlib import Path\nimport json, hashlib\nroot = Path(__file__).resolve().parent\nfor entry in json.loads((root / 'manifest.json').read_text())['sources']:\n    if 'parts' in entry:\n        data = b''.join((root / part['file']).read_bytes() for part in entry['parts'])\n        assert hashlib.sha256(data).hexdigest() == entry['sha256']\n        (root / entry['archive']).write_bytes(data)\n",
);
const checksums = [];
function verify(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) verify(file);
    else if (!entry.isFile() || statSync(file).size > 25 * 1024 * 1024) {
      throw new Error(`Unsupported hosting asset: ${file}`);
    } else if (file !== path.join(output, 'SHA256SUMS')) {
      checksums.push(
        `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ./${path.relative(output, file).split(path.sep).join('/')}\n`,
      );
    }
  }
}
verify(output);
writeFileSync(path.join(output, 'SHA256SUMS'), checksums.sort().join(''));
console.log('Prepared dist/ for Sites publication.');
