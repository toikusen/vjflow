# 歌詞 VJ 第 0 階段（微型切片）實作計畫

設計：`docs/superpowers/specs/2026-10-02-lyric-vj-templates-design.md`
範圍：indigo 第一次副歌約 20 秒；模板 `punch`、`frame-split`；1 張插畫、1 段 Veo 影片；人聲版＋伴奏版 MP4。

順序以「最快看到畫面」為原則：先用手寫企劃打通渲染，再接導演、素材、審查。

| # | 工作 | 產出 | 驗證 |
|---|---|---|---|
| 1 | 工具：`three`、`@anthropic-ai/sdk`、`@google/genai`、`playwright`、`tsx`、`esbuild` | package.json | `npx tsx -e` 可匯入 app 的音訊分析 |
| 2 | 歌曲準備 `scripts/lyric-vj/song.ts`：ffmpeg 解碼 → `analyzeAudio` → 強拍；歌詞 LRCLIB synced → 人聲軌驗證（失敗則用提供的 LRC）；伴奏偏移量測 → `song.json` | `song.json` | 單元測試：強拍、歌詞驗證、偏移 |
| 3 | 企劃 v3 型別＋驗證／修正 `src/app/lyric-vj/treatment.ts` | 型別、`validateTreatment` | 單元測試：未知 cue、越界強調、參數夾限、鏡頭吸附與鋪滿 |
| 4 | 渲染器：Three.js 正交場景、字形貼圖、`punch`、`frame-split`、背景圖層（靜圖／影片幀）、後製（bloom、顆粒、色差、閃光）、`renderAt(t)` 非同步、自動量測 | `render.html` | 手寫企劃截圖逐幀檢查 |
| 5 | 渲染驅動 `scripts/lyric-vj/render.ts`：靜態伺服器＋Playwright＋ffmpeg；兩版音軌 `adelay`；偏移檢查；`metrics.json` | MP4 ×2 | 偏移 ≤ 15 ms、量測全過 |
| 6 | 導演 `scripts/lyric-vj/direct.ts`（Claude Opus 5.5，JSON schema，fallbacks default）：時間軸＋模板目錄＋資料庫參考 → 企劃 v3 → 驗證，失敗回饋重試 ≤ 2 | `treatment.json` | 驗證通過 |
| 7 | 素材 `scripts/lyric-vj/assets.ts`：風格錨點插畫（Flash Image 2K）→ Veo 3.1 Fast 8 秒 → ffmpeg 拆幀；雜湊快取；費用上限 | `assets/` | 圖與幀數正確 |
| 8 | 審查 `scripts/lyric-vj/review.ts`：關鍵畫面＋幀序列＋參考畫面 → Claude 看圖 → 只改參數／cue 樣式 | `review.json` | 修改通過驗證 |
| 9 | 跑完整流程（indigo 69–90 秒）並回報 | MP4、metrics、成本 | 人工驗收 |
