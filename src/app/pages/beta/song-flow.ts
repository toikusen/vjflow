// What the song page's instant flow keeps and says; the page shows it, nothing here touches the server.

/** The style and version a person last had on a song, so a return to the page finds the same picture. */
export interface FlowPick { styleId: string; seed?: number }

export const songAudioUrl = (id: string) => `/beta/songs/${id}/audio/mix`;
export const songTimingUrl = (id: string) => `/beta/songs/${id}/timing`;
const key = (id: string) => `song-flow:${id}`;

/** The stored pick, or none; storage may be off or hold anything. */
export function loadPick(id: string, store: Pick<Storage, 'getItem'> = localStorage): FlowPick | undefined {
  try {
    const p = JSON.parse(store.getItem(key(id)) ?? 'null') as Partial<FlowPick> | null;
    return p && typeof p.styleId === 'string' ? { styleId: p.styleId, ...(typeof p.seed === 'number' ? { seed: p.seed } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

export function savePick(id: string, pick: FlowPick, store: Pick<Storage, 'setItem'> = localStorage) {
  try {
    store.setItem(key(id), JSON.stringify(pick));
  } catch {
    // a full or closed store loses only the place the person was at
  }
}

/** A failed read of the song, in the person's words: their login, or the song itself. */
export function readProblem(status: number): string {
  if (status === 401) return '登入已失效，請重新開啟邀請連結。';
  if (status === 404) return '找不到這首歌。';
  if (status === 409) return '這首歌還在準備中，好了才能做影片。';
  return `讀不到這首歌（HTTP ${status}），請稍後再試。`;
}

/** The line under 歌詞時間 while a song waits for its check: what it opens for the owner, plainly the check for anyone else. */
export const timingCallout = (mine: boolean) => (mine ? '歌詞時間已自動對好，請檢查後確認，就能免費做影片。' : '歌詞時間已自動對好，請檢查後確認，才能開始製作。');

/** The line beside the way to the paid versions; a concept already paid for and waiting is what the person came back for. */
export const paidLine = (pending: number) => (pending > 0 ? `有 ${pending} 個付費概念等你決定。` : '付費版由導演依歌詞設計，1080p，可加插圖或故事，完成後可回報修正。');
