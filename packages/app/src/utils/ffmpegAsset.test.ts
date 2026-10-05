import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFFmpegAsset } from './ffmpegAsset';

const manifest = {
  bytes: 32_232_419,
  parts: [
    { file: 'ffmpeg-core.wasm.part1', bytes: 16_777_216 },
    { file: 'ffmpeg-core.wasm.part2', bytes: 15_455_203 },
  ],
};
afterEach(() => vi.restoreAllMocks());
describe('chunked FFmpeg engine loading', () => {
  it('joins parts in order and exposes a disposable WASM blob', async () => {
    const first = new Uint8Array(manifest.parts[0].bytes);
    const second = new Uint8Array(manifest.parts[1].bytes);
    first[0] = 0x00;
    first[1] = 0x61;
    first[first.length - 1] = 17;
    second[0] = 23;
    second[second.length - 1] = 41;
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))
      .mockResolvedValueOnce(new Response(first))
      .mockResolvedValueOnce(new Response(second));
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob;
      return 'blob:test-engine';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const asset = await loadFFmpegAsset('https://example.com');
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(blob!.type).toBe('application/wasm');
    expect(bytes.length).toBe(manifest.bytes);
    expect([bytes[1], bytes[first.length - 1], bytes[first.length], bytes.at(-1)]).toEqual([
      0x61, 17, 23, 41,
    ]);
    asset.dispose();
    expect(revoke).toHaveBeenCalledWith('blob:test-engine');
  });
  it('rejects truncated parts before creating an engine URL', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))
      .mockResolvedValueOnce(new Response(new Uint8Array(4)));
    const create = vi.spyOn(URL, 'createObjectURL');
    await expect(loadFFmpegAsset('https://example.com')).rejects.toThrow('engineFailed');
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects invalid or remote part paths before fetching binaries', async () => {
    const invalid = structuredClone(manifest);
    invalid.parts[0].file = 'https://other.example/engine';
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(invalid)));
    await expect(loadFFmpegAsset('https://example.com')).rejects.toThrow('engineFailed');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves cancellation and does not create a URL after abort', async () => {
    const abort = new AbortController();
    abort.abort();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abort.signal.reason);
    const create = vi.spyOn(URL, 'createObjectURL');
    await expect(loadFFmpegAsset('https://example.com', abort.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(create).not.toHaveBeenCalled();
  });
});
