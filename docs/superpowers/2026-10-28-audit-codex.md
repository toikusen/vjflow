已稽核 `f90c189~1..3e19439`：72 個提交、102 個檔案，涵蓋後端、製作流程、前端及測試。以下包含兩項沿用程式的既有缺陷，已明確標示。全程未寫檔、未呼叫付費 API、未接觸正式服務或測試者資料。

## Critical

1. **錯誤的 Range 標頭可使後端程序退出〔既有缺陷〕**  
   位置：[server.mts:50](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/server.mts:50)、[server.mts:606](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/server.mts:606)。  
   **情境：**已登入使用者對可讀取的影音或風格圖片送出 `Range: bytes=1-0`。程式先寫入 206 標頭，再因非法區間拋出 `ERR_OUT_OF_RANGE`；外層錯誤處理再次寫標頭，又拋出 `ERR_HTTP_HEADERS_SENT`。非同步 HTTP callback 的 rejection 無人處理，在 Node 預設行為下會終止服務，影響所有使用者。新增的圖片路由也沿用此 helper。  
   **修正：**送出標頭前驗證區間及檔案大小，不合法回傳 416；處理串流錯誤，且已送出標頭時不得再次呼叫 JSON 回應。  
   **信心：confirmed**；以實際 Node HTTP 物件、不開啟監聽的方式重現兩層例外。

## Important

2. **保險絲觸發後，仍可能標記成功並扣款**  
   位置：[queue.mts:152](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/queue.mts:152)、[queue.mts:178](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/queue.mts:178)。  
   **情境：**最後一段成本輸出超過上限，但子程序已正常結束，終止訊號來不及改變 exit code。`close(0)` 完全忽略 `fused`，將工作設為 `done` 並清除錯誤。已重現價格 $2.5、成本 $6、`fused=true`，最終仍扣 $2.5。  
   **修正：**終態判定優先處理 `fused`，強制失敗且收費為 0；觸發時立即持久化，最後未換行的成本輸出也須檢查。  
   **信心：confirmed**；執行實際 queue 邏輯，僅替換程序與檔案 I/O。

3. **「移除圖片」可能沒有可見變更，卻成功收取 $1**  
   位置：[fix-apply.mts:38](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/fix-apply.mts:38)、[typeplan.mts:538](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/typeplan.mts:538)。  
   **情境：**修正程式將所有 cuts 都當成曾經顯示，渲染端卻會跳過間隔不足的 cuts。最小案例：切鏡位於 0、1、4 秒，最小間隔為 4 秒；1 秒的圖片根本沒出現，4 秒起已無圖片。標記 4.5–5 秒仍得到 `removed=1`，繞過「沒有可移除圖片」檢查，重新輸出並收費。  
   **修正：**共用實際切鏡落點與圖片可見性判定；只有實際顯示的圖層被移除才算修正成功。補上跳過切鏡的回歸案例。  
   **信心：confirmed**；純函式最小案例已重現。

4. **重試會把未完成的 MP4 當成成品並扣款〔既有續跑缺陷〕**  
   位置：[make.sh:63](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/make.sh:63)、[render.mts:322](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/render.mts:322)。  
   **情境：**ffmpeg 直接寫入正式檔名；合併音訊時若程序被終止，可能留下不完整 MP4。重試只檢查符合檔名的檔案是否存在，便略過渲染、複製檔案並回報成功。新的 run 資料夾仍沿用此判定。  
   **修正：**渲染至暫存檔，完成驗證後才原子更名；續跑依成功標記與完整性驗證判斷，不能只看檔名存在。  
   **信心：confirmed**；已確認寫入與續跑路徑，未實跑渲染。

5. **「換一個方向」實際要求模型保留上一版方向**  
   位置：[server.mts:478](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/server.mts:478)、[brief.mts:92](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/brief.mts:92)。  
   **情境：**adjust 與 redo 都傳入上一版 `from`，腳本因此都加入 `--previous`。redo 沒有調整意見，卻收到「這是調整」「沒有要求改的設計語言、字型、色調、故事都保留」。使用者付 $2.5 後，系統指令與介面承諾的「完全不同概念」相反。  
   **修正：**明確傳遞決策類型；redo 使用重新構思的指令，上一版只供避免重複，不能套用調整保留規則。  
   **信心：confirmed**；已核對前後端並重現產出的提示文字。

6. **歌詞時間儲存存在競態，可在製作開始後覆寫時間**  
   位置：[server.mts:381](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/server.mts:381)。  
   **情境：**`PUT cues` 在等待 request body 前就讀取 timeline 並檢查工作狀態。另一個分頁可在等待期間接受概念、開始使用舊時間製作；原 PUT 隨後仍寫入新時間並回報成功。使用者看到儲存成功，付費成品卻使用舊時間。  
   **修正：**讀完 body 後重新讀取 timeline、檢查活動工作與版本，再同步完成寫入；過期版本回傳 409。  
   **信心：confirmed**；已確認 `await` 前後的檢查與寫入順序。

7. **管理者的風格上架／下架設定沒有完整控制自動選風格**  
   位置：[server.mts:204](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/server.mts:204)、[direct.mts:86](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/direct.mts:86)。  
   **情境：**後端只傳動態候選清單，導演仍無條件加入硬編碼 `PROVEN_LANGUAGES`。將原有風格下架後，自動模式仍能選它；反過來，把原本不在常數內的候選升為正式風格，會使它從候選清單消失，也不在正式常數內，自動模式便無法選到。  
   **修正：**傳入完整的執行當下風格清單及等級，以資料庫狀態決定允許集合。  
   **信心：confirmed**；已核對清單生成並重現下架風格仍在允許集合。

8. **hybrid 製作沒有保留使用者已接受的畫風要求**  
   位置：[make.sh:51](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/make.sh:51)、[keyframes.mts:191](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/keyframes.mts:191)、[cutout.mts:478](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/cutout.mts:478)。  
   **情境：**使用者要求水彩等畫風並接受概念，支付 hybrid 尾款後，腳本沒有傳入 keyframes 支援的 `--style`／參考圖參數，因而不設定 `board.userStyle`。cutout 隨後固定使用平面海報指令，甚至指定 `no painterly texture`，可能與已接受的概念相反。  
   **修正：**將已接受概念的具體畫風、配色與參考圖快照傳至後續生成階段，並一致套用。  
   **信心：likely（推論）**；參數遺漏與提示分支已確認，實際成品偏差未呼叫付費生成驗證。

9. **多層重試會漏算成功概念，突破每版本三次限制**  
   位置：[store.mts:82](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/store.mts:82)、[make.ts:28](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/make.ts:28)。  
   **情境：**原工作失敗 → 自動重試失敗 → 管理者重試成功。前後端只檢查第一層 `retryOf`，將整串視為全部失敗，成功概念的使用次數竟為 0，後續可超出三次上限。  
   **修正：**沿 `retryOf` 遞迴歸回根工作，每個重試鏈計一次；只有整串全部失敗才不計入。  
   **信心：confirmed**；上述鏈的實際計算結果為 0。

10. **不同版本的已付費待決概念被隱藏，無法自由選擇接受**  
    位置：[beta.ts:177](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/beta.ts:177)、[song.page.html:89](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/song.page.html:89)。  
    **情境：**先完成純文字概念，再完成圖像概念，後端允許兩者同時待決，前端卻只顯示最新一個。切換製作表單的版本不會切換概念卡；舊版本還會顯示「有概念沒決定」，卻沒有直接操作入口。  
    **修正：**按版本列出或切換所有待決概念，讓每個已付款概念都可獨立檢視與接受。  
    **信心：confirmed**；以兩個不同版本的待決工作重現。

11. **依介面引導修改歌詞時間，會遺失尚未送出的回報**  
    位置：[report-form.component.html:115](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/report-form.component.html:115)、[report-form.component.ts:104](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/report-form.component.ts:104)。  
    **情境：**使用者標記多個問題、填好建議，再點「先到歌詞時間改好」。這是同頁導覽，而草稿只存在元件 signals；修改完成返回歌曲頁後，標記與文字沒有還原。  
    **修正：**離開前將草稿依歌曲／工作 ID 儲存於 sessionStorage，返回後還原，成功送出才清除。  
    **信心：confirmed**；已確認導覽方式與草稿生命週期。

12. **「聯絡管理者」只改本機文字，卻宣稱已通知**  
    位置：[song.page.html:69](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/song.page.html:69)、[song.page.html:77](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/song.page.html:77)。  
    **情境：**工作失敗後按聯絡按鈕，只執行 `contacted.set(true)`，沒有送出任何聯絡請求，卻顯示「管理者已收到通知，不用另外聯絡」。目前工作事件處理只寫本地紀錄，程式內沒有對應通知傳送，使用者可能因此停止求助。  
    **修正：**提供實際聯絡管道或建立管理者可處理的求助紀錄；通知未送達前不得宣稱已通知。  
    **信心：confirmed**；按鈕及事件處理路徑均已核對。

## Minor

13. **管理者「需要協助」漏掉等待人工確認的工作**  
    位置：[admin.ts:44](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/admin.ts:44)、[beta.ts:176](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/beta.ts:176)。  
    **情境：**影片因關鍵畫面或歌詞遮擋進入 `status: admin`，使用者必須等待人工放行；但 `needHelp()` 只收失敗狀態，這些工作被歸入結果，KPI 仍可能顯示「0／沒有卡住的歌」。  
    **修正：**把待人工確認工作納入需要協助清單，提供直接放行／檢查入口。  
    **信心：confirmed**；狀態分類路徑明確。

14. **全站額度百分比使用錯誤的分子**  
    位置：[admin.ts:27](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/admin.ts:27)、[store.mts:143](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/scripts/lyric-vj/beta/store.mts:143)。  
    **情境：**「全站已用／總額度」以使用者收費 `spentUsd` 計算，但後端額度限制依平台成本 `platformSpent`。例如失敗工作已花掉大量成本、使用者收費為 0，畫面仍可顯示 0% 額度使用。  
    **修正：**額度使用量與百分比改用 `platformSpentUsd`；使用者收費另列為收入。  
    **信心：confirmed**；前後端計算基準不一致。

15. **管理者歌曲頁停止更新後，不會發現新工作或回報**  
    位置：[admin-song.page.ts:113](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/admin-song.page.ts:113)、[admin-song.page.ts:127](/Users/seitumbp2025/vjflow.worktrees/lyric-editing/src/app/pages/beta/admin-song.page.ts:127)。  
    **情境：**開頁時沒有進行中的工作，輪詢立即返回，之後使用者新送出的工作永遠不會被發現；即使正在輪詢，也只更新 jobs/events，新的回報與 log 清單仍停留在開頁時。  
    **修正：**頁面開啟期間保留低頻更新或使用事件通知；新工作、工作結束及新回報時同步更新相關資料。  
    **信心：confirmed**；更新條件及資料來源已確認。

## Checked and fine:

- 固定價格與一般失敗收費為 0 的計算符合 brief；活動工作的成本預留使用 `max(cost, price)`。上述保險絲終態例外另列。
- 所檢查的歌曲、工作、參考圖、stills、影片與管理端路由具身分／擁有權檢查；一般使用者工作回應未包含管理者成本明細。
- 參考圖、stills 與 logs 的檔名／路徑限制，以及製作指令的 shell 引號處理，未發現可重現的越權讀檔或 shell injection 路徑。
- 新版工作使用獨立 run 資料夾與快照；修正流程保留原版本。
- 間奏預設不放圖片、導演附理由才保留圖片的規則已串入相關生成流程；未將計畫明定保留的跨界切鏡誤列為缺陷。
- 以記憶體內 TypeScript 轉譯執行既有 queue／feedback 測試：**12 通過、0 失敗**。四支 beta shell 腳本的 `bash -n` 通過。
- 未執行完整 Angular／pipeline 測試；390 px 僅檢查模板與 CSS，**沒有完成瀏覽器實測**。以上測試通過不代表前述流程缺陷已被涵蓋。