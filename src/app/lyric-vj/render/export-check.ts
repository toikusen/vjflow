/** Why this browser cannot export, in the buyer's words; undefined when it can. Apart from export.ts so a page can ask without loading the muxer. */
export function exportBlocker(g: { VideoEncoder?: unknown; AudioEncoder?: unknown; VideoFrame?: unknown } = globalThis as never): string | undefined {
  if (!g.VideoEncoder || !g.VideoFrame) return '這個瀏覽器不支援 WebCodecs，無法直接匯出影片。請改用桌面版 Chrome 或 Edge。';
  return undefined;
}
