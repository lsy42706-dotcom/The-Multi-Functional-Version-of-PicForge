"""Accompany the single HTML with its app/codec sources, without camera fixtures."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tarfile

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve()
source_directory = root / 'packages/app/public/licenses/sources'
manifest = json.loads((source_directory / 'manifest.json').read_text(encoding='utf-8'))
for entry in manifest['sources']:
    filename = entry['archive']
    if Path(filename).name != filename:
        raise RuntimeError('Invalid codec source archive path')
    source = source_directory / filename
    if not source.is_file():
        raise RuntimeError(f'Missing {filename}; run python scripts/prepare-codec-sources.py')
    with source.open('rb') as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != entry['sha256']:
        raise RuntimeError(f'{filename}: source checksum mismatch')
paths = subprocess.check_output([
    'git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'
], cwd=root).decode('utf-8').split('\0')
paths += [str(p.relative_to(root)).replace('\\', '/') for p in
          source_directory.glob('*.tar.gz')]
with tarfile.open(output, 'w:gz', compresslevel=1) as archive:
    for relative in sorted(set(filter(None, paths))):
        if relative.startswith(('sample/', 'docs/assets/')):
            continue
        source = root / relative
        if source.is_file():
            archive.add(source, arcname='PicForge-source/' + relative)
print('Accompanying source archive:', output.stat().st_size, 'bytes')
