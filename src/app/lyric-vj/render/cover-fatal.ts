// Which renders a subject cover fails (render.mts): pure, so the node render script reads it without the renderer.

/**
 * Whether a subject cover fails the render: only where the seat design guarantees the subject room (the video stage's
 * sprite clips, a frames asset) or when asked (`--cover-fatal`); other tiers log it (a grid ignores rooms by design).
 */
export const coverFatal = (asked: boolean, assets: Record<string, { frames?: unknown; [k: string]: unknown }>) => asked || Object.entries(assets).some(([id, a]) => id.startsWith('spr:') && !!a.frames);
