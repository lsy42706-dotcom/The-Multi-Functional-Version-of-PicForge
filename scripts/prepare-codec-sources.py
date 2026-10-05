"""Download and hash the corresponding sources shipped with the static codecs."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'packages/app/public/licenses/sources'
MANIFEST = OUTPUT / 'manifest.json'
PINNED = {entry['archive']: entry for entry in
          (json.loads(MANIFEST.read_text(encoding='utf-8')).get('sources', [])
           if MANIFEST.exists() else [])}
SOURCES = [
    ('ffmpeg-wasm', 'ffmpegwasm/ffmpeg.wasm', 'v12.15'),
    ('ffmpeg', 'FFmpeg/FFmpeg', 'n5.1.4'),
    ('x264', 'ffmpegwasm/x264', '4-cores'),
    ('x265', 'ffmpegwasm/x265', '3.4'),
    ('libvpx', 'ffmpegwasm/libvpx', 'v1.13.1'),
    ('lame', 'ffmpegwasm/lame', 'master'),
    ('ogg', 'ffmpegwasm/Ogg', 'v1.3.4'),
    ('theora', 'ffmpegwasm/theora', 'v1.1.1'),
    ('opus', 'ffmpegwasm/opus', 'v1.3.1'),
    ('vorbis', 'ffmpegwasm/vorbis', 'v1.3.3'),
    ('zlib', 'ffmpegwasm/zlib', 'v1.2.11'),
    ('libwebp', 'ffmpegwasm/libwebp', 'v1.3.2'),
    ('freetype2', 'ffmpegwasm/freetype2', 'VER-2-10-4'),
    ('fribidi', 'fribidi/fribidi', 'v1.0.9'),
    ('harfbuzz', 'harfbuzz/harfbuzz', '5.2.0'),
    ('libass', 'libass/libass', '0.15.0'),
    ('zimg', 'sekrit-twc/zimg', 'release-3.0.5'),
    ('sdl2', 'libsdl-org/SDL', 'release-2.24.2'),
    ('emscripten-ffmpeg', 'emscripten-core/emscripten', '3.1.40'),
    ('emscripten-heif', 'emscripten-core/emscripten', '3.1.61'),
]

def download(source):
    name, repo, ref = source
    filename = f'{name}-{ref}.tar.gz'
    url = f'https://codeload.github.com/{repo}/tar.gz/{ref}'
    pinned = PINNED.get(filename)
    expected = pinned['sha256'] if pinned and pinned['revision'] == ref else None
    return fetch(name, ref, url, filename, expected)

def fetch(name, ref, url, filename, expected=None):
    target = OUTPUT / filename
    if not target.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'PicForge-source-distribution'})
        with urllib.request.urlopen(req, timeout=120) as response:
            data = response.read()
        target.write_bytes(data)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    if expected and digest != expected:
        raise RuntimeError(f'{filename}: checksum mismatch')
    print(f'{filename}: {target.stat().st_size} bytes', flush=True)
    return {'component': name, 'revision': ref, 'url': url, 'archive': filename,
            'sha256': digest, 'bytes': target.stat().st_size}

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as executor:
        entries = list(executor.map(download, SOURCES))
    for name, version, digest in [
        ('libheif', '1.23.4', 'd0c02b4b0e978f34a1974b6f3eea7975a537bf7a9195ffeea38e7242ff316fdd'),
        ('libde265', '1.1.1', 'fd48a927e94ed74fc7ce8829d222b9d8599fcbfe8b6448ba66705babc56ab219'),
    ]:
        filename = f'{name}-{version}.tar.gz'
        entries.append(fetch(name, version,
            f'https://github.com/strukturag/{name}/releases/download/v{version}/{filename}',
            filename, digest))
    for local in ['scripts/build-heif.py', 'docs/heif-build.md']:
        (OUTPUT / Path(local).name).write_bytes((ROOT / local).read_bytes())
    (OUTPUT / 'manifest.json').write_text(json.dumps({
        'ffmpeg_core': '0.12.10', 'ffmpeg_wasm_release': 'v12.15',
        'sources': entries,
        'build_instructions': 'README.txt',
    }, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
