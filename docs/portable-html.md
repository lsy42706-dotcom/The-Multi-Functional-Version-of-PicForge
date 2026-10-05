# Single HTML edition

The portable edition contains the application, fonts, image codecs, HEIF decoder,
FFmpeg engine, license notices and corresponding app/codec source archives in one
HTML file. It processes files locally without a server, internet connection or
automatic navigation to the hosted website. Browser support and the existing
input limits still apply.

With the workspace dependencies installed, build it from the repository root:

```powershell
python scripts/prepare-codec-sources.py
node packages/app/node_modules/vite/bin/vite.js build --config packages/app/vite.portable.config.mjs
$env:PICFORGE_PYTHON = 'python'
node scripts/build-portable-html.mjs
```

Set `PICFORGE_PYTHON` to the installed Python executable when necessary. The
first command downloads the corresponding codec sources omitted from Git history.
Packaging checks that every archive in the source manifest is present and has the
expected SHA256; it refuses to produce an incomplete source distribution. Source
preparation requires internet access; opening the finished HTML does not. The
default output is `../图片处理-离线成品/PicForge.html` relative to the source
workspace containing `picforge/`. A custom absolute output path may be supplied
as the first argument; it must remain outside that workspace. The generator
finishes a `.partial` file before replacing the delivered HTML, and prints its
size and SHA256 using a streaming read.

Open the finished HTML in an external browser. Do not load the roughly 200 MB
artifact in the Codex file editor, preview panel or built-in browser: a V8 memory
overflow has been reproduced on this machine. Inspect it with file metadata,
streaming hashes or bounded reads. Keep the artifact outside the source workspace.

The portable Vite configuration leaves the hosted build unchanged. It bundles
modules into one entry and standalone classic Blob workers, embeds codec assets,
and disables service-worker registration for the file origin. Workers receive
their own embedded resource URLs; private resource messages are isolated from
the existing processing protocol. A CSP blocks HTTP resource requests. The
included source-download control exports the app, codec sources and build
materials; approved camera test fixtures are excluded from the artifact.
