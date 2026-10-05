/** Reassemble the pinned engine from self-hosted files below hosting asset limits. */
export async function loadFFmpegAsset(origin: string, signal?: AbortSignal) {
  const directory = new URL('/wasm/ffmpeg-0.12.10/', origin);
  const response = await fetch(new URL('ffmpeg-core.parts.json', directory), { signal });
  if (!response.ok) throw new Error('engineFailed');
  const manifest = (await response.json()) as {
    bytes: number;
    parts: { file: string; bytes: number }[];
  };
  if (
    manifest.bytes !== 32_232_419 ||
    manifest.parts?.length !== 2 ||
    manifest.parts.some(
      (part, i) =>
        part.file !== `ffmpeg-core.wasm.part${i + 1}` ||
        !Number.isInteger(part.bytes) ||
        part.bytes <= 0 ||
        part.bytes > 16 * 1024 * 1024,
    ) ||
    manifest.parts.reduce((sum, part) => sum + part.bytes, 0) !== manifest.bytes
  )
    throw new Error('engineFailed');
  const parts: ArrayBuffer[] = [];
  for (const part of manifest.parts) {
    const result = await fetch(new URL(part.file, directory), { signal });
    if (!result.ok) throw new Error('engineFailed');
    const bytes = await result.arrayBuffer();
    signal?.throwIfAborted();
    if (bytes.byteLength !== part.bytes) throw new Error('engineFailed');
    parts.push(bytes);
  }
  signal?.throwIfAborted();
  const url = URL.createObjectURL(new Blob(parts, { type: 'application/wasm' }));
  return { url, dispose: () => URL.revokeObjectURL(url) };
}
