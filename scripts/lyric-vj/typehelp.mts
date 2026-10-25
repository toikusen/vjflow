// What each kinetic move, lyric layout and line motion means, in the planner's words: read by typeplan.mts (the
// director's prompt) and origins.mts (the technique audit).
import { MORE } from '../../src/app/lyric-vj/render/kinetic-more';

export const FX_HELP: Record<string, string> = {
  wall: '歌詞牆：背景滿滿這段的詞，一列一列往左右飄（主歌詞前面的底）',
  ring: '環形排字：詞排成兩圈繞著人物轉',
  tunnel: '文字隧道：詞從畫面深處飛出來',
  bars: '聲波直條：橫跨中間的音量條隨拍跳',
  stack: '重複堆疊：同一個詞一行行重複，空心殘影從兩側滑入',
  split: '斜切分割：斜線把畫面切開，一半填強調色',
  rays: '集中線：從人物放射出去的速度線',
  boxes: '方框隧道：方框一層層往內縮',
  grid: '分格重複：三格並排，同一張人物圖在格子裡重複',
  dots: '網點：漸層網點加一個超大的空心字',
  ...Object.fromEntries(
    Object.entries(MORE).map(([id, m]) => [
      id,
      m.help + (m.flows ? `［方向：原本 ${m.native ?? 'ltr'}，可改 ${m.flows.join('/')}］` : '') + (m.styles ? `［風格：${m.styles.map((x, i) => `${i} ${x}`).join('；')}］` : ''),
    ]),
  ),
};
// the lyric layouts a flat print can use (the interface ones need their own screens: chat, notify, input)
export const TEMPLATES: Record<string, string> = {
  vertical: '直排（日文縱書，敘事、抒情）', stair: '階梯橫排（兩三行錯開）', quiet: '安靜小字（低語、獨白）', punch: '重拳大字（一個詞滿版，副歌爆發）',
  typewriter: '打字機逐字（內心、訊息、回憶）', handwrite: '手寫筆順（私密、溫柔）', scatter: '散落（字散在畫面，混亂、熱鬧）', 'beat-cut': '逐詞踩拍硬切（快歌、排比）',
  stack: '多行堆疊上推（情緒遞進）', array: '整齊陣列（重複句、口號）', couplet: '對句（上下兩句呼應）', quote: '引號台詞（說出口的話）',
  orbit: '弧形環繞（時間、輪迴）', ribbon: '緞帶飄過（流動、風）', tunnel: '隧道深處飛出（衝刺、時間）',
};
export const SIDED = new Set(['vertical', 'stair', 'quiet', 'typewriter', 'handwrite']);
export const ENTER_HELP: Record<string, string> = { pop: '彈出', slam: '重擊落下', wipe: '擦入', fade: '淡入', cut: '直接出現', ink: '墨水描邊再填滿', flap: '翻牌', slot: '拉霸轉輪', focus: '模糊對焦', rise: '浮起', dash: '高速滑入急停', drop: '從上方掉下來彈兩下', zoom: '從鏡頭前縮小到位', gather: '散字聚合成形', spin: '旋轉彈出', prelight: '先淡淡顯示整句、唱到才點亮', spread: '字距由緊展開', swing: '像吊著的牌子晃進來', decode: '亂碼閃爍後逐字解碼（訊號、記憶、看不清的心意）', slice: '上下兩半從左右滑入拼合（衝突、重組）', flip: '從側面翻轉過來（翻轉、改變主意）', stretch: '拉長再彈回原形（跳躍、活潑、驚訝）', shuffle: '字先站錯位置、再互相換回原位（混亂、重新排列、打亂的心）', settle: '劇烈顫抖著出現、慢慢穩下來（緊張、不安、鼓起勇氣）', flicker: '像霓虹燈管閃兩下才亮起（夜晚、城市、壞掉的燈）', squash: '從上方掉下來、彈三下，落地時壓扁（重量、可愛、落定）', windup: '先往後縮一下蓄力、再衝到位置抖一抖（衝刺、出發、下定決心）', karaoke: '整句先淡淡顯示，一顆小球照唱的速度在字上跳、跳到哪亮到哪（一起唱、童謠、合唱）' };
export const EXIT_HELP: Record<string, string> = { burst: '炸開', fade: '淡出', rise: '往上飄走', cut: '直接消失', glitch: '故障切片', slash: '刀斬', drop: '重力掉出畫面', shrink: '縮小後退', dash: '高速滑出', dust: '化成粒子飄散', spin: '旋轉縮小', zoom: '穿過鏡頭放大消失', melt: '融化往下流', scramble: '逐字碎成亂碼消失（斷訊、忘記）', split: '從中間切開上下滑走（分離、決裂）', domino: '字像骨牌一樣一個接一個往右倒下（連鎖、崩塌、一個接一個）', pixel: '字變成越來越粗的方塊再消失（數位、遊戲、記憶模糊）', shatter: '字像玻璃一樣裂開、碎片飛散掉落（心碎、打破、崩壞；開心的歌不要用）' };
export const IDLE_HELP: Record<string, string> = { still: '完全靜止', drift: '慢慢往右上漂', push: '慢慢推近', wave: '水波起伏', float: '每個字各自漂浮', shake: '緊張地顫抖', boil: '像定格動畫一樣每秒八次喀喀微動（手作、拼貼、黏土動畫感）', hop: '字一個接一個輪流往上跳（開心、蹦跳、童趣）', thump: '整句跟著歌的速度像心跳一樣「咚咚」跳兩下（心動、緊張、喜歡你）' };
export const EMPH_HELP: Record<string, string> = { scale: '放大', color: '換強調色', glow: '發光', shake: '震動', hollow: '空心字', face: '換對比字體', mark: '螢光筆底線', symbol: '旁邊加小符號', liquid: '字裡注水', strike: '劃線塗銷（否定）', revise: '校對改寫：劃掉這個詞、下面畫插入符號 ^（「不是X而是Y」「〜じゃなくて」、改口；X 用 revise、Y 用第二個強調）', box: '色塊底襯反白', hold: '字後拉出一條波浪尾巴（唱很長的長音、あーー）', echo: '字後面疊幾層空心殘影往斜後方展開（回音、重複、餘韻、迴盪）', weight: '唱到時字越變越粗（越來越大聲、情緒加重、下定決心）', shine: '一道光從字上斜斜掃過（閃耀、亮晶晶、高級感、偶像）', faces: '字先快速換過幾種字體再定在自己的字體（變化多端、混亂、喊口號、千變萬化）' };
