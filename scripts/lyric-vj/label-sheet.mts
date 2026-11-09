// The owner's answer sheet for the labelling clips (label-clips.mts writes it next to the clips): three questions per
// sample (Codex 2026-11-10 phase 4 §5), the table to fill, how long it takes. It names no world, verdict or version.

/** Minutes per sample the sheet promises: one or two plays of a ~4 s clip, a look at two stills, three answers. */
export const MIN_PER_SAMPLE = 0.75;

/** The sheet as markdown (繁體中文). `final: false` puts the do-not-label-yet notice on top. */
export function answerSheet(ids: string[], o: { final: boolean; done: number; total: number }): string {
  const minutes = Math.round(ids.length * MIN_PER_SAMPLE);
  return [
    '# 構圖標記（2026-11-10）',
    '',
    ...(o.final ? [] : [
      '> **注意：目前請先不要標記。** 這批片段還不是最終版：排程規則（Q1／Q2 共同仲裁）正在改，改完後會用新規則重新抽樣、重新產出全部片段。',
      `> 現在資料夾裡只有驗證流程用的少量片段（${o.done}／${o.total}）。等這一行消失、片段補齊後再開始。`,
      '',
    ]),
    '## 要做什麼',
    '',
    `共 ${ids.length} 個樣本（\`clips/\` 裡的 \`s001.mp4\`…）。每個樣本有一段含聲音的短片（約 3–7 秒），以及兩張穩定畫面：\`_1.png\` 是較早的、\`_2.png\` 是較晚的。`,
    '片段裡沒有任何標註，檔名也不透露是哪個風格、哪個版本或系統怎麼判斷。請照順序、照當下看到的作答，不用回頭比對其他樣本。',
    '',
    `預計時間：約 ${minutes} 分鐘（每個樣本 30–60 秒）。可以分兩、三次做；同一次內請不要中途改前面的答案。`,
    '',
    '## 每個樣本三題',
    '',
    '**① 片段中間，畫面是否明確變成另一個穩定的閱讀構圖？** 填 `是`、`否` 或 `不確定`。',
    '- 「構圖」指字在哪裡讀、字與底的大小關係、字站在什麼載體上、鏡頭怎麼取景。',
    '- 只換了歌詞（同一位置換下一句）、只換墨色或底色、只換紋理、只是輕微晃動或漂移，都算 `否`。',
    '- **`不確定` 一律當作不通過**（不算一次構圖變化）。真的看不出來就填不確定，不要猜。',
    '',
    '**② 如果①是「是」：變的是哪一項？** 從 `座位`（字換到畫面另一個閱讀位置）、`尺度關係`（字與字、字與畫面的大小關係明顯改變）、`載體`（字底下的紙、牌、框、氣球等換了或重組）、`取景`（鏡頭推近、拉遠、換角度）中選；同時有多項就用 `/` 分隔。①不是「是」就留白。',
    '',
    '**③ 整段片段中，有沒有閱讀或載體的硬傷？** 例如字被切掉、字與圖重疊看不清、字掉出載體、載體破碎或殘留空殼、字閃爍。沒有就填 `無`；有就填 **秒數（片段內的秒數）＋一句描述**，例如 `2.3 秒 第二行被框線切過`。',
    '',
    '## 怎麼交',
    '',
    '填同資料夾的 `答題表.csv`（Excel、Numbers 都能開，存回 CSV）。每列一個樣本：`樣本, Q1, Q2, Q3, 備註`。備註可留白。',
    '',
    '| 樣本 | Q1 | Q2 | Q3 | 備註 |',
    '|---|---|---|---|---|',
    ...ids.slice(0, 3).map((id) => `| ${id} |  |  |  |  |`),
    '| …（完整清單在 `答題表.csv`） |  |  |  |  |',
    '',
  ].join('\n');
}
