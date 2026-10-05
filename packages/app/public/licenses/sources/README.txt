Corresponding source for PicForge's separately served codec engines

All source archives, original component licenses, build scripts and checksums
are supplied here. manifest.json identifies every download and its SHA-256.
Sources are available without an account at the same site as the binaries.
For large archives, download the ordered .part files listed in manifest.json
and join them byte-for-byte with join-sources.py (Python 3), or concatenate
part1 followed by part2. The original archive SHA-256 validates the result.
The application is MIT; the codec libraries retain their own licenses.

FFmpeg core 0.12.10:
The correct upstream build release is ffmpegwasm/ffmpeg.wasm v12.15, whose
packages/core version is 0.12.10. The v0.12.10 tag instead describes core 0.12.6.
Extract ffmpeg-wasm-v12.15.tar.gz for Dockerfile, Makefile, build/*.sh,
src/bind and src/fftools. All the external component source trees named by
that Dockerfile are supplied alongside it. For a single-thread release build,
use Emscripten 3.1.40, Docker Buildx and make prd. Production flags are
FFMPEG_ST=yes and EXTRA_CFLAGS='-O3 -msimd128'. Unmodified core binaries come
from the pinned @ffmpeg/core 0.12.10 npm package. Downloaded source trees carry
their original COPYING/LICENSE files. Emscripten 3.1.40 and its SDL2 2.24.2
port sources are included as well.

HEIF / HEVC decoder:
libheif-1.23.4.tar.gz and libde265-1.1.1.tar.gz match the exact SHA-256 pins
in /wasm/heif-1.23.4-de265-1.1.1/build-manifest.json. build-heif.py and
heif-build.md reproduce the supplied HEVC-only, single-thread ES module with
Emscripten 3.1.61. That toolchain's sources are included. The JavaScript
module and WASM are separate files under /wasm/ and may be replaced by a
modified compatible build without rebuilding the MIT application.

The application source, including wrapper patches and static URL mappings,
is available at:
https://github.com/lsy42706-dotcom/The-Multi-Functional-Version-of-PicForge

Upstream application attribution:
https://github.com/DejavuMoe/PicForge
