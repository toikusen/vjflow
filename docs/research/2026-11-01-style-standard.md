# 46 種風格標準（2026-11-01 草案）

依據：`docs/superpowers/specs/2026-10-31-free-type-version-design.md` §6.8、`docs/research/2026-11-01-jizura-style-study.md`。本文件是提案，門檻未經校準，尚未改任何程式。

## 0. 核心規則

1. **一種風格是一個世界，不是一組配色。** 先回答「歌詞在這裡是什麼」，再談別的。
2. **風格先於種子。** 換風格造成的差異必須大於換一版。現在相反（0.68 倍，§3.2）。
3. **關池，不加分。** 風格決定允許的零件；重抽只在允許範圍內變化。
4. **免費和付費吃同一份風格資料。** 付費多的是故事、道具、逐句判斷，不是另一套風格。
5. **既有規則全部照舊。** 字永遠可讀、裝飾要有歌詞理由、一個鏡頭一個主角、慢歌不亂動、`docs/research/2026-10-31-visual-finish-bar.md` 十條都要過。

## 1. 每種風格必填欄位

暫名 `StyleWorld`，是我們自己的結構。`*` 為硬性必填，缺一不可上架。

| 欄位 | 內容 | 最低要求 | 防止什麼 |
|---|---|---|---|
| `lyricRole`\* | 歌詞在世界裡是什麼 | 一句話，能回答「字是寫在、亮在、刻在什麼上」 | 字幕貼在背景上 |
| `family`\* | 所屬材質家族（§2.2） | 一個 | 家族內才可共用 |
| `refuses`\* | 這個世界拒絕的東西 | ≥5 項，含零件與視覺手法 | 風格邊界模糊 |
| `type`\* | 日文字、繁中字、拉丁字；字重帶；字距；直橫排；大小對比 | 三語都要有；繁中不可只落到預設黑體 | 繁中歌全同字 |
| `palette`\* | 語意色槽＋多方案 | ≥3 方案；槽位含底、字、次字、強調、板、弱字；殘影色只有該世界真的需要才設（見 §7 規則 10） | 只換紙色 |
| `groundBand`\* | 底的明度帶與翻面規則 | 宣告 dark、mid、light；至少一次段落翻面或說明為何不翻 | 全部米白 |
| `material`\* | 表面、墨或光的行為、邊緣、受光 | 要從物理過程描述，並對應一個引擎 | 平塗色塊 |
| `frameStack`\* | 顆粒、紙、掃描、光暈、暗角、閃爍、晃動；時間殘影預設 0 | 全部給值，不可用全域預設 | 全片同質地 |
| `timeBase`\* | 每秒張數、動作對齊單位（字、語、行、拍） | 必填，連續動畫要寫 `0` | 手作世界動得太數位 |
| `layouts`\* | 專屬版型＋允許的共用版型 | 專屬 ≥3，其中 ≥1 個以世界物件承載歌詞 | 共用版型換色 |
| `motion`\* | 專屬進退場、停留；曲線家族；進退場時長帶 | 進 ≥2、退 ≥2、停留 ≥1 | 全部 fade、still |
| `grounds`\* | 專屬背景 | ≥2，含安靜版 | 紙上小裝飾 |
| `decor`\* | 擁有的裝飾與每鏡預算 | 每項要寫出現理由 | 圓環、印章到處長 |
| `transitions`\* | 句間、段間轉場 | ≥1 專屬，並列出禁用 | 共用轉場 |
| `peak`\* | 世界自己的爆點動作 | 1 個，慢歌版 1 個 | 同一種放射光 |
| `camera` | 允許的鏡頭語法 | 明確列出 | 不該動的世界在動 |
| `levels`\* | 張力 0、1、2 各怎麼演 | 三段都寫；含慢歌規則 | 快歌好看、慢歌崩 |
| `knobs` | 招式範圍覆寫 | 可選 | 每首歌仍有差異 |
| `provenance`\* | 來源標籤、origins 結果、與 JIZURA 最近項及差異 | 每個專屬零件都要 | 抄襲風險 |
| `acceptance`\* | 兩首不同節奏測試歌、最難 20～30 秒時間點 | 依 `lyric-vj-new-style-process` | 只在一首歌成立 |

**數量底線：** 專屬或家族專屬零件 ≥12，其中嚴格專屬 ≥6。JIZURA 的恐怖組是 3 組風格共用 52 個零件，我們不用追數量，但低於這條就回到重灌皮。

## 2. 防塌陷規則

### 2.1 結構規則

1. **專屬零件有鎖：** 別的風格抽不到。比照「綁定氣氛的零件關閉」的效果，寫法要自己做。
2. **允許清單取代加分：** `lineplan-core.ts:698` 的加分式改成先過濾允許池。
3. **共用零件比例上限：** 一首歌裡用共用版型的句子 ≤40%；專屬版型 ≥30%。
4. **種子只在池內動：** 重抽不能跳出 `layouts`、`grounds`、`transitions` 的允許範圍。
5. **語意仍優先：** `fit` 規則保留，但只在允許池內加分，不能把別的世界的零件拉進來。

### 2.2 材質家族

家族共用一個引擎，降低成本。跨家族不共用專屬零件。

| 家族 | 引擎要做的事 | 語言 |
|---|---|---|
| 印刷 print | 色版疊印、網點、錯版、壓印（現有基礎最多） | silkscreen、risograph、dossier、document、screentone、popart、midcentury、swiss、pictogram、brutalist、psychedelic、art-deco、xerox |
| 發光 emissive | 深底、發光體、輝光、燈點、掃描 | neon-stage、terminal、led-board、hologram、stained-glass、idol-live、y2k、cel80s、dark-glitch |
| 水墨 wet | 暈染、飛白、滲透、分層濕邊 | ink-wash、watercolor、aizome、cyanotype、ukiyoe |
| 筆觸 stroke | 路徑逐筆生成、乾筆、針腳、雕刻 | chalkboard、crayon、embroidery、woodcut、notebook、blueprint |
| 疊層 layered | 真實厚度、接觸陰影、視差 | papercut、paper-lantern、chiyogami、scrapbook、claymation、spy-titles、isometric、gothic-lolita |
| 片門 film | 片門晃動、光圈、刮痕 | silent-film，可借給 cel80s、dark-glitch |
| 介面 ui | 歌詞即操作 | phone、gameshow |
| 牆面 wall | 噴霧、滴流、模板 | graffiti |
| 空氣 air | 噴槍漸層、大氣 | citypop |

## 3. 「太像」檢查

原則：**不能只查宣告。** 現有 6 種的宣告偏好配對 Jaccard 中位數 0.14，看起來很分散，實際卻幾乎一樣。

### 3.1 第一級：靜態軸差（CI，免費）

九軸：`lyricRole`、`family`、`groundBand`、type 類別、`timeBase`、曲線家族、轉場家族、`frameStack` 主導項、`peak`。

- 跨家族：≥6 軸不同。
- 同家族：≥4 軸不同，且 `lyricRole` 必須不同。
- 專屬零件不得重複；重複即失敗。

### 3.2 第二級：計畫實測（CI，免費，主要關卡）

做法：5 首歌（快、慢、長句、繁中、日文）× 種子 3 個，每對風格同歌同種子比較。

| 指標 | 現況（6 種） | 提案門檻 |
|---|---|---|
| 同句版型相同比例 | 0.538 | ≤0.20 |
| 同句進場相同比例 | 0.531 | ≤0.20 |
| 同句退場相同比例 | 0.671 | ≤0.30 |
| 同句停留相同比例 | 0.586 | ≤0.35 |
| 版型分布 TVD | 0.169 | ≥0.60 |
| 進場分布 TVD | 0.187 | ≥0.60 |
| 背景集合 Jaccard | 0.78 | ≤0.25 |
| **風格／種子距離比** | 0.68 | ≥2.0 |

風格／種子距離比＝不同風格的平均 TVD ÷ 同風格不同種子的平均 TVD，取版型、進場、退場、停留四項（0.156 ÷ 0.230）。

**有效性條件：** 這組檢查必須判定現有 6 種彼此「太像」。現況確實全部失敗，所以方向對。門檻數值要等批次 1 再校準。

### 3.3 第三級：去色比對（本機，免費）

重灌皮的定義就是「只有顏色不同」，所以直接拿掉顏色測。

1. **灰階比對：** 同歌同種子同時間 24 格，灰階後比字框位置、字面積比、墨面積、邊緣密度。
2. **換色測試：** A 風格套 B 的配色重算，和 B 比；仍要判得出是不同風格。
3. **動作曲線：** 取每句抵達前後的畫面差異能量曲線，比形狀，不比亮度。

試跑注意：邊緣 SSIM 在縮圖上分不開（同歌 0.57、0.77；跨歌 0.55～0.63），不可單獨當關卡。要改用全尺寸逐格與上述特徵，門檻待校準。

### 3.4 第四級：人眼盲測（每批一次）

把同批與最近鄰的灰階連續格打亂，由業主分辨。分不出來的那對視為太像。AI 審查不取代這一步，既有經驗是 AI 分數高不等於使用者喜歡。

## 4. 46 種分級

類別：**A** 可純程式做；**B** 原本靠場景圖或照片，需重新設計；**C** 可能塌陷到別的語言。可複選。

欄位：最近鄰分數是語言文字層的估計（版型 0.35、圖層 0.35、字型 0.15、配色 0.15，46 種中位數 0.23），會有誤判，例如 woodcut 與 gothic-lolita。只用來提示，不是結論。

| 語言 | 狀態 | 類別 | 依據 | 最近鄰（分數） | JIZURA 近似 | 區隔做法（歌詞角色＋手法） |
|---|---|---|---|---|---|---|
| silkscreen 絲網海報 | proven | A | 照片可省 | document .42 | 紙質風格 | 歌詞是最後一道墨；刮刀刷版，換段整組換墨不動構圖 |
| risograph 孔版印刷 | proven | A、C | 照片可省 | pictogram .49 | 紙質、新聞紙風格 | 透明墨相乘出第三色，爆點才補最後一版 |
| dossier 網點檔案 | proven | A | 道具原靠圖，要改程式畫 | blueprint .50 | 黑塗文件版型 | 歌詞是案件編號條目，線索線貫穿全片；不用黑塗當主手法 |
| swiss 瑞士網格 | candidate | A | 無圖 | brutalist .47 | 文字 PV 組 | 12 欄網格硬規則，動作只落在格點 |
| terminal 終端機 | candidate | A | 無照片 | led-board .56 | 終端風格 | 歌詞是操作過程，劇情用連線、傳送表現；不走 HUD |
| cel80s 80 年代賽璐璐 | shelved | B、C | 全幅照片；只有圓與放射 | neon-stage .45 | 80s 合成風格 | 歌詞是錄影帶片頭字幕，噴槍分層＋磁帶瑕疵；避開透視格線 |
| gameshow 節奏綜藝 | candidate | A、C | 無照片 | idol-live .60 | 警示黃風格 | 歌詞是題目與判定，每段有計分規則 |
| ukiyoe 浮世繪 | candidate | B、C | scenes＋照片 | ink-wash .62 | 和風零件 | 分版平塗＋霞帶，橫向捲軸運鏡；海浪是爆點，不做圖案鋪滿 |
| papercut 剪紙 | candidate | B | scenes＋照片 | ink-wash .51 | 摺紙版型 | 鏤空才有細節，背光透字 |
| crayon 蠟筆繪本 | candidate | B、C | scenes＋拍立得 | watercolor .66 | 手帖風格 | 歌詞是孩子畫的繪本一頁，水彩排斥蠟筆顯色 |
| neon-stage 霓虹舞台 | shelved | A | 照片帶要移除，需輝光引擎 | y2k .52 | 80s 合成風格 | 真實燈管招牌：管路、接線、熄燈狀態；一兩色 |
| art-deco 裝飾藝術 | shelved | A、C | 只有放射 | stained-glass .50 | 金夜風格 | 中軸對稱開合，金只當細線；不做粒子閃光 |
| blueprint 藍圖 | candidate | A、C | 照片可省 | dossier .50 | 同名風格但內容不同 | 歌詞是施工標註，依繪圖順序畫；名稱相同，畫面不可走斜帶拼貼 |
| ink-wash 水墨 | shelved | B、C | scenes；等墨質引擎 | ukiyoe .62 | 墨與朱風格 | 繁中書法節奏：一筆一字配演唱氣口，留白為主，朱印不當預設 |
| stained-glass 彩繪玻璃 | shelved | B | scenes；太單調 | art-deco .50 | 無 | 光隨時間掃過，字由透光顯現 |
| spy-titles 諜報片頭 | proven | B | 驗證歌靠剪紙場景 | pictogram .48 | 無 | 字幕構成布景，剪影穿過字 |
| pictogram 圖形卡 | proven | A、C | 無圖 | isometric .61 | 幾何拼貼風格 | 節拍閃卡逐拍翻面，一色五調 |
| watercolor 水彩手帳 | shelved | B、C | scenes；等顏料質地 | crayon .66 | 手帖風格 | 濕邊與疊色，紙白是光；與 crayon 同家族要明顯分開 |
| hologram 全像介面 | shelved | A、C | 程式註解已認定與 terminal 重複 | terminal .47 | 暗色 HUD 風格 | 線框物件掃描鎖定，資訊引線；不做儀表盤 |
| silent-film 默片 | candidate | B | 全幅照片 | art-deco .45 | 片痕效果 | 歌詞全是插卡字幕，單色分段染色，光圈收合 |
| woodcut 木刻版畫 | candidate | B | scenes，無照片 | gothic-lolita .51（誤判） | 無 | 字是刻掉的白，刀痕逐刀出現 |
| midcentury 世紀中卡通 | candidate | A | 無照片 | embroidery .46（誤判） | 無 | 色塊偏離輪廓，局部有限動畫 |
| paper-lantern 紙雕燈 | candidate | B、C | scenes | cyanotype .51 | 燈籠版型 | 六到九層視差，暖光呼吸；字是層間的剪影，不做單顆燈籠 |
| screentone 漫畫網點 | candidate | B | scenes，無照片 | embroidery .40（誤判） | 無 | 歌詞是台詞格，分鏡節奏，最強一格獨佔 |
| chiyogami 千代紙 | candidate | B、C | scenes | embroidery .56 | 和風圖案 | 花紋紙摺疊構圖，字在摺面上 |
| aizome 藍染 | shelved | B、C | scenes＋照片；無靛藍感 | cyanotype .65 | 無 | 滲開與留白紋，布料飄動 |
| citypop City Pop | shelved | A | 等噴槍質地；波紋誤用 | woodcut .45（誤判） | 夕陽漸層風格 | 白天度假光影，字停留很久 |
| y2k Y2K | candidate | A、C | 無照片 | gameshow .56 | 蒸氣波、糖果風格 | 鍍鉻和塑膠高光，明亮飽和底；不走紫粉懷舊 |
| gothic-lolita 哥德蘿莉 | candidate | A | 無照片 | woodcut .51（誤判） | 無 | 精裝暗黑童話書，字在雕花書頁上；不做恐怖 |
| embroidery 刺繡 | candidate | B、C | scenes | crayon .63 | 無 | 所有圖形由有方向的針腳構成，字一針一針繡 |
| chalkboard 粉筆黑板 | candidate | B | scenes，無照片 | crayon .52 | 無 | 擦掉重寫是核心動作，粉筆灰 |
| cyanotype 藍曬 | shelved | B、C | scenes；只有淡藍 | aizome .65 | 無 | 物件曝光留下剪影，閃白換畫面 |
| claymation 黏土動畫 | shelved | B | 全幅照片＋scenes；最難 | psychedelic .47 | 無 | 字是黏土條，壓扁回彈；需真實厚度 |
| scrapbook 剪貼簿 | candidate | B、C | 拍立得是主體 | crayon .55 | 牛皮紙風格 | 無照片時歌詞寫在手撕紙與標籤，翻頁換段 |
| phone 手機介面 | candidate | A | 只留訊息附圖 | risograph .29 | 無 | 已有獨立路線，歌詞即訊息 |
| popart 美式普普漫畫 | candidate | A、C | 無照片 | brutalist .47 | 無 | 大點網＋原色＋對話框 |
| notebook 筆記本 | candidate | A、C | 無照片 | scrapbook .50 | 手帖、便箋 | 只有紙與筆，塗改與圈字 |
| brutalist 龐克海報 | candidate | A、C | 無照片 | dark-glitch .51 | 警示風格 | 滿版吼字，影印破壞感；禁用發光 |
| document 物件版面 | candidate | A、C | 無照片 | dossier .45 | 票券、籤版型 | 整首寫在一件物件上，版面來自物件規則 |
| graffiti 街頭噴漆 | candidate | A | 無照片 | pictogram .44（誤判） | 無 | 噴霧邊與滴流，每段多一層 |
| psychedelic 70 年代迷幻 | candidate | A | 無照片 | claymation .47（誤判） | 無 | 液態波紋帶動字形，暖色褪色 |
| led-board LED 看板 | candidate | A、C | 無照片 | terminal .56 | 點陣版型 | 公告與倒數，暗燈點可見；不用字元 |
| xerox 影印拼貼 | candidate | B、C | 全幅照片是本質 | brutalist .45 | 無 | 無照片時改影印歌詞本身：拖影、爆白 |
| isometric 等角空間 | candidate | A、C | 無照片 | pictogram .61 | 無 | 字貼牆面和地板，只有三個方向線 |
| idol-live 偶像 Live | candidate | A、C | 無照片 | gameshow .60 | 無 | 主唱與 Call 兩軌 |
| dark-glitch 黑紅故障 | shelved | A、C | 程式註解已認定與 terminal、y2k 重複 | brutalist .51 | 酸性、恐怖錄影風格 | 見 §5 問題 1 |

統計：可純程式做 26 種（含 A、C）；需重新設計 20 種（含 B、C）；帶 C 風險共 27 種。

## 5. 給業主的問題（不是決定）

46 種裡**沒有恐怖世界**。`dark-glitch` 和 `gothic-lolita` 都寫明不是恐怖片。

1. `dark-glitch` 要不要改定位成我們自己的恐怖世界？建議方向：歌詞是深夜電台的逐字稿，訊號弱時字被雜訊吃掉，唱到的瞬間才完整。這樣不走手電筒、監視器、降靈盤那條路。
2. `aizome`、`cyanotype`、`blueprint` 三種都是藍白，要保留三種嗎？若保留，blueprint 走線稿、aizome 走布、cyanotype 走曝光。
3. `hologram` 併入 `terminal`，還是保留線框世界？
4. `watercolor` 與 `crayon` 是否合併？
5. `notebook` 與 `scrapbook` 是否合併？
6. `dossier` 與 `document` 是否合併？
7. `gameshow` 與 `idol-live` 都留？兩者字型和版型幾乎相同。
8. `cel80s` 與 `neon-stage` 都留？

## 6. 批次

每批約 8 種，先做和現有紙質印刷最不像的世界。每批都帶至少一個新引擎，並刻意放進一組近鄰配對（例如 terminal 與 led-board、gameshow 與 idol-live），逼它們在同批就拉開，也讓盲測有意義。流程照 `lyric-vj-new-style-process`：先定歌詞角色，做最難 20～30 秒，換第二首歌，再整批出樣。

| 批 | 主題 | 語言 | 新引擎 |
|---|---|---|---|
| 1 | 暗與光、恐怖、墨 | dark-glitch、neon-stage、terminal、led-board、ink-wash、silent-film、stained-glass、gothic-lolita | 發光、水墨、片門 |
| 2 | 和與手工 | ukiyoe、papercut、paper-lantern、chiyogami、woodcut、chalkboard、aizome、crayon | 疊層、筆觸 |
| 3 | 喧鬧 | popart、gameshow、idol-live、y2k、psychedelic、graffiti、brutalist、citypop | 牆面、空氣 |
| 4 | 科技與物件 | hologram、cel80s、phone、isometric、document、blueprint、cyanotype、xerox | 物件版面 |
| 5 | 私密手作 | notebook、scrapbook、embroidery、watercolor、claymation、midcentury、screentone、art-deco | 厚度、針腳 |
| 6 | 回頭升級已驗證 | silkscreen、risograph、dossier、spy-titles、pictogram、swiss | 無，套用標準 |

第 1 批要順便校準 §3 門檻，所以需要一組已知很近的配對（terminal 與 led-board）。

第 1 批開始前的共通工作：`StyleWorld` 資料結構、允許池、免費路徑保留語言、計畫實測腳本。沒有這四項，新風格仍會塌回共用池。

## 7. 和 JIZURA 的區隔

### 全體規則

1. **零重用：** 不搬程式、著色器、常數表、色值、預設組合、權重表。寫零件時不開 JIZURA 原始碼，從材質的物理過程推導。
2. **MIT：** 若日後真的重用任何程式，必須附上其著作權與授權聲明。我們的計畫是一行都不用，所以目前不需附。
3. **差異放在方法上：** JIZURA 是按字數和權重隨機抽。我們由歌詞意義決定世界事件，並對齊逐字時間。這點它沒有，也最難被說成抄。
4. **配色自訂：** 由各語言既有色票和世界物理來源出發。同語意的顏色若撞近似值，要改掉。
5. **命名自訂：** 不沿用其零件與風格名。`blueprint` 是我們早就有的 ID，但畫面內容要明顯不同。
6. **繁中優先：** 字型、直排、標點行為以繁中為第一測試語言，這也和它以日文為主不同。
7. **每個專屬零件走 origins：** 打來源標籤，沿用 `origin-rules.ts` 的創作者上限；對照 JIZURA 零件名清單，同概念不同手法的要在 `provenance` 寫明差在哪。
8. **避開其標誌性組合：** 手電筒掃字、監視畫面 OSD、降靈盤、尋人啟事、燈籠與暖簾當字框這類高辨識設計不做。傳統紋樣屬公有文化，但不可和它同一用法。
9. **審查：** 每批對照先前輸出觀察 `docs/research/2026-10-31-jizura-frame-observations.md`，有撞到就改或砍。
10. **沿用規格 §5：** 讀對方原始碼與寫零件的人分開，實作者只看我們的標準。預設不用黑底彩邊加顆粒、攝影機 HUD、座標圓、引線註解、條碼計數、歌詞牆、筆畫飛入組字、時間延遲彩色殘影。hologram、dark-glitch、cel80s 最容易踩到，要用別的手法；真要開例外，由業主決定並寫進 `provenance`。
11. **對外說法：** 不宣稱沒看過，內部紀錄如實保存。

### 各語言

見 §4 最後兩欄。

## 8. 未驗證與開放事項

- §3 門檻是提案，未校準；JIZURA 未執行，所以沒有同一指標的對照。
- §4 分數是文字層估計，不是畫面量測。
- 工作量：沒有足夠資料。零件數下限是 276 個嚴格專屬（46 × 6）再加家族零件；若每種 12 個全不共用是 552 個；JIZURA 是 860 個。工時要等第 1 批實測。
- 付費路徑的風格差異未量。
- 恐怖世界是否允許閃爍、突然放大要另訂安全規則，避免光敏風險。
- `free-styles.spec.ts:10-14` 的數量與來源限制，實作時要依 §6.8 改寫。
