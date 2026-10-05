import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  openSync,
  closeSync,
  writeSync,
  mkdirSync,
  renameSync,
  createReadStream,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Script } from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = path.join(root, 'tmp/portable-app');
const publicDir = path.join(root, 'packages/app/public');
// Keep the large standalone export outside the Codex source workspace.
const projectDirectory = path.dirname(root);
const exportDirectory = path.resolve(
  projectDirectory,
  '..',
  `${path.basename(projectDirectory)}-离线成品`,
);
const output = path.resolve(process.argv[2] || path.join(exportDirectory, 'PicForge.html'));
const relativeOutput = path.relative(projectDirectory, output);
assert(
  relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput),
  'Keep the large HTML outside the source workspace; use the sibling offline export directory.',
);
mkdirSync(path.dirname(output), { recursive: true });
const temporaryOutput = output + '.partial';
const python = process.env.PICFORGE_PYTHON || 'python';
const sourceArchive = path.join(root, 'tmp/portable-source.tar.gz');
execFileSync(python, [path.join(root, 'scripts/portable-source-archive.py'), sourceArchive], {
  cwd: root,
  stdio: 'inherit',
});

const runtime = readFileSync(path.join(root, 'scripts/portable-runtime.js'), 'utf8');
const embedded = [];
function add(key, bytes, mime, worker = false, compress = false) {
  embedded.push({
    key,
    mime,
    worker,
    gzip: compress,
    data: (compress ? gzipSync(bytes, { level: 9 }) : bytes).toString('base64'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const assetDir = path.join(built, 'assets');
const files = readdirSync(assetDir);
const main = files.find((name) => /^index-.*\.js$/.test(name));
assert(main, 'Missing single entry bundle');
function rewrite(code) {
  return code.replace(
    /new URL\((['"`])(\/assets\/[^'"`]+)\1,\s*(?:``\s*\+\s*)?import\.meta\.url\)/g,
    (_match, _quote, asset) => `globalThis.__pfAssetUrl(${JSON.stringify(asset)})`,
  );
}
for (const file of files.filter((name) => name.endsWith('.js') && name !== main)) {
  const code = rewrite(readFileSync(path.join(assetDir, file), 'utf8')).replaceAll(
    'import.meta.url',
    'self.location.href',
  );
  new Script(code);
  assert(
    !/(?:from|import\()\s*['"]\.?\/[^'"]+\.js['"]/.test(code),
    `Unbundled worker import: ${file}`,
  );
  add('/assets/' + file, Buffer.from(code), 'text/javascript', true);
}
for (const name of [
  'mozjpeg_enc.wasm',
  'webp_enc.wasm',
  'webp_enc_simd.wasm',
  'avif_enc.wasm',
  'oxipng.wasm',
]) {
  add(
    '/wasm/' + name,
    readFileSync(path.join(publicDir, 'wasm', name)),
    'application/wasm',
    false,
    true,
  );
}
const heif = '/wasm/heif-1.23.4-de265-1.1.1/';
let heifJs = readFileSync(path.join(publicDir, heif.slice(1), 'libheif.mjs'), 'utf8');
heifJs = heifJs.replace(
  /new URL\(["']libheif\.wasm["'],\s*import\.meta\.url\)\.href/g,
  `globalThis.__pfAssetUrl('${heif}libheif.wasm')`,
);
heifJs = heifJs
  .replaceAll('import.meta.url', 'self.location.href')
  .replace(/export default libheif;?/, 'globalThis.__pfHeif = libheif;');
new Script(heifJs);
add(heif + 'libheif.mjs', Buffer.from(heifJs), 'text/javascript');
add(
  heif + 'libheif.wasm',
  readFileSync(path.join(publicDir, heif.slice(1), 'libheif.wasm')),
  'application/wasm',
  false,
  true,
);
const ffmpeg = '/wasm/ffmpeg-0.12.10/';
let coreJs = readFileSync(path.join(publicDir, ffmpeg.slice(1), 'ffmpeg-core.js'), 'utf8');
coreJs = coreJs.replace(
  /new URL\(["']ffmpeg-core\.wasm["'],\s*import\.meta\.url\)\.href/g,
  `globalThis.__pfAssetUrl('${ffmpeg}ffmpeg-core.wasm')`,
);
coreJs = coreJs
  .replaceAll('import.meta.url', 'self.location.href')
  .replace(/export default createFFmpegCore;?/, 'globalThis.createFFmpegCore = createFFmpegCore;');
new Script(coreJs);
add(ffmpeg + 'ffmpeg-core.js', Buffer.from(coreJs), 'text/javascript');
const parts = JSON.parse(
  readFileSync(path.join(publicDir, ffmpeg.slice(1), 'ffmpeg-core.parts.json'), 'utf8'),
);
add(ffmpeg + 'ffmpeg-core.parts.json', Buffer.from(JSON.stringify(parts)), 'application/json');
for (const part of parts.parts) {
  add(
    ffmpeg + part.file,
    readFileSync(path.join(publicDir, ffmpeg.slice(1), part.file)),
    'application/wasm',
    false,
    true,
  );
}
const js = rewrite(readFileSync(path.join(assetDir, main), 'utf8'));
assert(!/(?:from|import\()\s*['"]\.?\/[^'"]+\.js['"]/.test(js), 'Unbundled main import');
const css = files
  .filter((name) => name.endsWith('.css'))
  .map((name) => readFileSync(path.join(assetDir, name), 'utf8'))
  .join('\n');
assert(!/url\(["']?\//.test(css), 'External stylesheet asset');
const icon = readFileSync(path.join(publicDir, 'favicon.svg')).toString('base64');
const license =
  readFileSync(path.join(root, 'LICENSE'), 'utf8') +
  '\n\n' +
  readdirSync(path.join(publicDir, 'licenses'))
    .filter((name) => /\.(txt|md)$/.test(name))
    .map((name) => name + '\n' + readFileSync(path.join(publicDir, 'licenses', name), 'utf8'))
    .join('\n\n');
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fd = openSync(temporaryOutput, 'w');
try {
  writeSync(
    fd,
    `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PicForge · 单文件图片工作台</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:; worker-src blob:; connect-src blob: data:; media-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'"><link rel="icon" href="data:image/svg+xml;base64,${icon}"><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><noscript>请启用 JavaScript，以在此 HTML 文件中处理图片。</noscript>`,
  );
  for (let i = 0; i < embedded.length; i++) {
    writeSync(
      fd,
      `<script type="application/octet-stream" id="pf-asset-${i}">${embedded[i].data}</script>`,
    );
  }
  const descriptors = embedded.map(({ data, ...entry }, i) => ({ ...entry, id: 'pf-asset-' + i }));
  const setup = `
${runtime}
const descriptors = ${JSON.stringify(descriptors)};
const resources = {};
function decodeBase64(data) { const binary = atob(data); const bytes = new Uint8Array(binary.length); for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i); return bytes; }
for(const item of descriptors.filter(x=>!x.worker)) {
  const bytes=decodeBase64(document.getElementById(item.id).textContent.trim());
  resources[item.key]={url:URL.createObjectURL(new Blob([bytes],{type:item.gzip?'application/gzip':item.mime})),gzip:item.gzip,mime:item.mime,source:bytes};
}
const workerPrefix=installPortableRuntime.toString()+';\\n'+
  'self.addEventListener("message",function init(e){if(!e.data||!e.data.__pfInit)return;e.stopImmediatePropagation();self.removeEventListener("message",init);const r={};for(const a of e.data.assets){r[a.key]={url:URL.createObjectURL(new Blob([a.bytes],{type:a.gzip?"application/gzip":a.mime})),gzip:a.gzip,mime:a.mime,alias:a.alias};}installPortableRuntime(r);});\\n';
globalThis.__pfWorkerNames=new Map();
for(const item of descriptors.filter(x=>x.worker)) {
  const code=new TextDecoder().decode(decodeBase64(document.getElementById(item.id).textContent.trim()));
  resources[item.key]={url:URL.createObjectURL(new Blob([workerPrefix,code],{type:'text/javascript'})),gzip:false,mime:'text/javascript'};
  globalThis.__pfWorkerNames.set(resources[item.key].url,item.key);
}
installPortableRuntime(resources);
window.addEventListener('pagehide',()=>{for(const item of Object.values(resources)) URL.revokeObjectURL(item.url);},{once:true});
`;
  writeSync(
    fd,
    `<script>${setup.replaceAll('</script', '<\\/script')}</script><script type="module">${js.replaceAll('</script', '<\\/script')}</script>`,
  );
  writeSync(
    fd,
    `<details id="pf-legal" style="margin:12px 20px;font:12px system-ui"><summary>开源许可与对应源码</summary><p>应用基于 DejavuMoe/PicForge，遵循 MIT 许可；编码组件保留各自许可。全部应用源码、编码库源码与构建脚本内置于本文件，可导出并重新构建。此单文件无需服务器或网络，浏览器支持仍决定可处理的输入格式。</p><button id="pf-source-download" type="button">导出对应源码与构建材料</button><pre style="white-space:pre-wrap;max-height:50vh;overflow:auto">${escape(license)}</pre></details>`,
  );
  // The source archive is accompanying material, not a processing resource. No camera fixtures are included.
  writeSync(fd, `<script type="application/octet-stream" id="pf-source">`);
  writeSync(fd, readFileSync(sourceArchive).toString('base64'));
  writeSync(
    fd,
    `</script><script>document.getElementById('pf-source-download').onclick=async()=>{const button=document.getElementById('pf-source-download');button.disabled=true;try{const text=document.getElementById('pf-source').textContent.trim();const parts=[];for(let start=0;start<text.length;start+=1048576){parts.push(decodeBase64(text.slice(start,start+1048576)));if(start%8388608===0)await new Promise(requestAnimationFrame);}const url=URL.createObjectURL(new Blob(parts,{type:'application/gzip'}));const a=document.createElement('a');a.href=url;a.download='PicForge-corresponding-source.tar.gz';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}finally{button.disabled=false;}};</script></body></html>`,
  );
} finally {
  closeSync(fd);
}
writeFileSync(
  path.join(built, 'embedded-manifest.json'),
  JSON.stringify(descriptorsForReport(), null, 2),
);
function descriptorsForReport() {
  return embedded.map(({ key, mime, worker, gzip, sha256 }) => ({
    key,
    mime,
    worker,
    gzip,
    sha256,
  }));
}
const htmlHash = createHash('sha256');
for await (const chunk of createReadStream(temporaryOutput)) htmlHash.update(chunk);
renameSync(temporaryOutput, output);
console.log(`Created standalone HTML: ${output}`);
console.log(`Bytes: ${statSync(output).size}; SHA256: ${htmlHash.digest('hex')}`);
