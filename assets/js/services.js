// 服務項目、方案、必讀重點與表單欄位
// 改價格或改文字只要改這個檔案就可以了。

// 套組方案（溝通＋似顏繪）的 key 都以 -art 結尾
export const isBundle = key => /-art$/.test(key || "");
// 套組價 = 溝通價 + 這個金額；劃掉的原價 = 溝通價 + ART_ALONE（單獨委託手繪 NT$1,500）；有 bundlePrice 的方案直接用那個價錢
const BUNDLE_EXTRA = 1000;
const ART_ALONE = 1500;
function withBundles(plans, skip = []) {
  const out = plans.map(p => ({ ...p }));
  out.forEach(p => delete p.bundlePrice);
  // 套組不重複顯示一般說明

  plans.filter(p => !skip.includes(p.key)).forEach(p => out.push({
    key: p.key + "-art", label: p.label + "＋似顏繪", meta: (p.meta ? p.meta + "・" : "") + "手繪似顏繪含框含運",
    price: p.bundlePrice || p.price + BUNDLE_EXTRA, orig: p.price + ART_ALONE, bundle: true,
    includes: [...(p.includes || []), "手繪似顏繪（含框含運）"]
  }));
  return out;
}

const ART_FIELDS = [
  { key: "artFrame", label: "似顏繪畫框款式", type: "select", required: true,
    options: ["大一點的框｜壓克力胡桃木", "小一點的框｜玻璃胡桃木", "小一點的框｜玻璃原木色"],
    image: "images/illustration/frame-options.jpg",
    imageNote: "上排中間：小框・玻璃胡桃木｜上排左右：小框・玻璃原木色｜下排三個：大框・壓克力胡桃木",
    hint: "手繪似顏繪含畫框與運費，完成後寄送實體作品。會依照片與 Yura 的畫風創作，交稿後即結案，不提供修改。",
    showIf: s => isBundle(s.plan) }
];

// 加時（10 或 15 分鐘，只能選一個）
const EXT_ADDONS = [
  { key: "ext10", group: "ext", label: "加時 10 分鐘", price: 500, hint: "想多聊一點，延長 10 分鐘。" },
  { key: "ext15", group: "ext", label: "加時 15 分鐘", price: 700, hint: "想多聊一點，延長 15 分鐘。" }
];

export const SERVICES = {
  general: {
    key: "general",
    kicker: "01｜毛孩在身邊",
    name: "一般寵物溝通",
    icon: "🐾",
    short: "想了解毛孩的情緒、需求、想法，或某些行為背後的原因。",
    detailUrl: "guide-general.html",
    slot: "required",
    plans: withBundles([
      { key: "single", label: "單寵溝通（1 隻）", meta: "20 分鐘", price: 1680, includes: ["溝通 20 分鐘", "提供錄音或文字紀錄"] },
      { key: "double", label: "多寵溝通（2 隻）", meta: "30 分鐘", price: 2380, includes: ["2 隻・共 30 分鐘", "提供錄音或文字紀錄"] },
      { key: "triple", label: "三寵溝通（3 隻）", meta: "40 分鐘", price: 3080, includes: ["3 隻・共 40 分鐘", "提供錄音或文字紀錄"] }
    ]),
    methods: ["視訊", "照片＋語音", "照片＋文字"],
    methodHint: "視訊與語音都會提供錄音紀錄；文字適合想慢慢閱讀、反覆查看的人。",
    addons: [
      ...EXT_ADDONS,
      { key: "urgent", label: "緊急溝通", price: 1000, hint: "需要盡快安排時使用。" }
    ],
    mustKnow: [
      "溝通是「理解與協調」，不是控制或命令；毛孩不一定會立刻變乖，後續仍需要主人一起配合調整。",
      "健康相關問題，我能接收到的是牠的主觀感受，不等同醫療診斷，仍需要搭配獸醫評估。",
      "必須由毛孩的「主要照顧者」本人預約；非主要照顧者因涉及隱私，一律不接。",
      "需完成「全額付款」才算預約成功；當天取消或未出席，不提供退款與兌換。"
    ],
    fields: [
      { key: "pets", type: "pets", label: "毛孩資料",
        count: s => ({ single: 1, double: 2, triple: 3 })[(s.plan || "single").replace(/-art$/, "")] || 1 },
      { key: "questions", label: "想詢問的內容", type: "textarea", required: true,
        placeholder: "建議 5～8 題，把最重要的放在前面", hint: "最重要的問題放前面，讓時間留給真正在意的事。" },
      { key: "message", label: "想對牠說的話", type: "textarea", placeholder: "可以留空" },
      ...ART_FIELDS
    ],
    prepare: ["毛孩正面清晰照片（送出後回 LINE 傳給我）"]
  },

  deceased: {
    key: "deceased",
    kicker: "02｜毛孩已經離世",
    name: "離世寵物溝通",
    icon: "🕊️",
    short: "想把還放在心裡的話說完，理解、傳達，好好告別。",
    detailUrl: "guide-deceased.html",
    slot: "required",
    plans: withBundles([
      { key: "basic", label: "離世溝通", meta: "30 分鐘", price: 2200, bundlePrice: 3000,
        includes: ["離世溝通 30 分鐘", "提供錄音或文字紀錄"] },
      { key: "salvation", label: "離世溝通＋超度", meta: "離世溝通＋超度科儀", price: 7200, bundlePrice: 8000,
        includes: ["離世溝通 30 分鐘", "超度科儀＋儀式照片", "超度後的轉世推算"] }
    ]),
    methods: ["照片＋視訊", "照片＋語音", "照片＋文字"],
    methodHint: "視訊與語音都會同步錄音並提供錄音紀錄。",
    addons: [
      ...EXT_ADDONS,
      { key: "rebirth", label: "炁絡筆裁示／動物兵馬打聖杯確認轉世", price: 666,
        hint: "想確認目前的毛孩是不是前一隻回來了。需配合道長時間。" }
    ],
    mustKnow: [
      "離世後記憶會逐漸模糊，這是正常的。請不要用生前細節反覆驗證我有沒有連上——如果一定需要這樣驗證，建議先不要預約。",
      "只有超度後才能準確推算轉世；溝通時可以問牠意願；不能約定投胎轉世或託夢（因為這不是我能決定的，也不是牠能決定的，這牽扯到因果關係）。",
      "離世溝通的目的是理解、傳達與告別，不是隨時找牠聊天的管道。",
      "超度、確認轉世等服務需配合道長時間，會等比較久；一旦開始進行就不能反悔、不退款。",
      "必須由主要照顧者預約。需完成全額付款才算預約成功；當天取消或未出席不退款、不兌換。",
      "預約前，請一定要先看完下方的「離世寵物溝通詳細說明書」。每個方案內容不同，看完才知道自己適合選哪一個。"
    ],
    fields: [
      { key: "petName", label: "毛孩名字", type: "text", required: true },
      { key: "petInfo", label: "品種與年齡", type: "text", placeholder: "例：柴犬・離世時 12 歲" },
      { key: "passedTime", label: "離世時間", type: "text", required: true, placeholder: "例：2026 年 9 月初",
        hint: "選超度的話，請盡量寫到日期與時間，例如 2026/09/03 晚上 10 點。" },
      { key: "ceremony", label: "火化與法事是否已完成", type: "select", required: true,
        options: ["已完成", "尚未完成", "不確定"],
        hint: "如果最想了解的是轉世相關問題，建議在火化與法事完成之後再溝通，資訊會更完整穩定。" },
      { key: "questions", label: "想詢問的內容", type: "textarea", required: true, placeholder: "最重要的問題請放在前面" },
      { key: "salvationNote", type: "note", showIf: s => ["salvation", "salvation-art"].includes(s.plan),
        text: "🕯️ 超度需要飼主的資料：老師會依照這些資料進行事前確認與儀式準備。資料只會用在這次的超度。另外請在 LINE 傳一張飼主的照片。" },
      { key: "ownerName", label: "飼主姓名", type: "text", required: true, showIf: s => ["salvation", "salvation-art"].includes(s.plan) },
      { key: "ownerBirth", label: "飼主國曆出生日期、時間", type: "text", required: true, placeholder: "例：1990/05/20 早上 8 點（時間不知道可填不確定）", showIf: s => ["salvation", "salvation-art"].includes(s.plan) },
      { key: "ownerBirthPlace", label: "飼主出生地", type: "text", required: true, placeholder: "例：台中市", showIf: s => ["salvation", "salvation-art"].includes(s.plan) },
      { key: "ownerAddress", label: "飼主目前居住地址", type: "text", required: true, showIf: s => ["salvation", "salvation-art"].includes(s.plan) },
      { key: "message", label: "想對牠說的話", type: "textarea",
        placeholder: "想念、感謝、道歉、遺憾…都可以交給我傳達",
        hint: "建議在溝通前先寫一封懺悔信給牠，不用很長，真實就好。" },
      ...ART_FIELDS
    ],
    prepare: ["清楚、能辨識毛孩樣貌的照片（送出後回 LINE 傳給我）", "一封想對牠說的懺悔信（建議）", "選超度的話：飼主的照片"]
  },

  search: {
    key: "search",
    kicker: "03｜走失・失聯",
    name: "找寵服務",
    icon: "🧭",
    short: "毛孩走失、失聯，或想確認牠現在的狀態與方向。",
    detailUrl: "guide-search.html",
    slot: "optional",
    slotHint: "生死測算統一在晚上 9:00 打聖杯。",
    planNote: "💡 找寵前，建議先確認毛孩的生死。知道生死之後，接下來會想做的事常常不一樣：有人會選擇放下，也有人反而更想把牠找回來。所以第一次來，多數人會先從生死測算開始。",
    plans: withBundles([
      { key: "qimen", label: "奇門遁甲找寵方案（主推）", meta: "三項一起進行", price: 5000,
        includes: ["生死測算", "奇門遁甲找寵報告", "單次溝通 1 次"] },
      { key: "comm", label: "單次溝通", meta: "不論生死", price: 1680,
        includes: ["溝通 1 次：位置、周圍環境、身心狀態"] },
      { key: "life", label: "生死測算", meta: "統一晚上 9:00 打聖杯", price: 666,
        includes: ["打聖杯確認生死"] }
    ], ["life"]),
    addons: [],
    mustKnow: [
      "預約前，請一定要先看完下方的「找寵服務事前說明書」。每個方案內容不同，看完才知道自己適合選哪一個。",
      "找寵服務提供的是搜尋輔助資訊與方向，不保證一定尋回。",
      "毛孩會持續移動，溝通與卦象看到的是當下資訊，不是 GPS 精準定位。",
      "請一定要同步實際搜尋：外出尋找、張貼協尋、詢問附近住戶店家、調閱監視器。",
      "生死測算統一晚上 9:00 打聖杯；奇門遁甲需配合道長時間，完成時間無法固定。",
      "全額付款後才會開始；服務開始後因已投入作業，不接受中途取消、不退款。"
    ],
    fields: [
      { key: "petName", label: "動物名字", type: "text", required: true },
      { key: "petInfo", label: "品種與年齡", type: "text", required: true, placeholder: "例：米克斯貓・3 歲" },
      { key: "chip", label: "有沒有晶片", type: "select", options: ["有", "沒有", "不確定"], required: true },
      { key: "health", label: "健康狀況", type: "select", options: ["健康", "有慢性病或需要吃藥", "年紀比較大", "受傷或身體不舒服", "不確定"] },
      { key: "lostTime", label: "走失的日期時間", type: "text", required: true, placeholder: "例：11/16 晚上 10 點左右" },
      { key: "lostPlace", label: "走失地點", type: "text", required: true, placeholder: "盡量寫到路名或附近地標" },
      { key: "howLost", label: "怎麼走丟的", type: "textarea", required: true, placeholder: "例：開門拿外送時從門縫跑出去" },
      { key: "lastSeen", label: "最後一次確定看到牠", type: "textarea", required: true, placeholder: "時間、地點、當時的樣子" },
      { key: "searched", label: "已經做過哪些搜尋（可複選）", type: "multi",
        options: ["附近找過", "張貼協尋海報", "社群發文（IG、FB、Threads）", "協尋社團／網站", "詢問附近住戶、店家", "調閱監視器", "通報收容所／動保處", "還沒開始找"] },
      { key: "ownerNote", type: "note", showIf: s => ["qimen", "life", "qimen-art"].includes(s.plan),
        text: "🔮 為什麼需要主人的資料？奇門遁甲與生死卦都需要「占卦」。占卦要先知道你是誰：在卦象裡，毛孩就像是你的財產，所以要用主人的姓名、出生年月日與時間，才能起卦、做奇門遁甲。資料只會用在這次的測算。" },
      { key: "ownerName", label: "主人姓名", type: "text", required: true, showIf: s => ["qimen", "life", "qimen-art"].includes(s.plan) },
      { key: "ownerBirth", label: "主人出生年月日、時間", type: "text", required: true, placeholder: "例：1990/05/20 早上 8 點（時間不知道可填不確定）",
        showIf: s => ["qimen", "life", "qimen-art"].includes(s.plan) },
      { key: "ownerGender", label: "主人性別", type: "select", options: ["女", "男"], required: true, showIf: s => ["qimen", "life", "qimen-art"].includes(s.plan) },
      { key: "ownerCity", label: "主人目前居住的城市", type: "text", required: true, placeholder: "例：台中市", showIf: s => ["qimen", "life", "qimen-art"].includes(s.plan) },
      ...ART_FIELDS
    ],
    prepare: ["毛孩近期照片兩張（正面一張、全身一張）", "主人的自拍照（奇門遁甲、生死測算需要）", "以上照片請在送出後傳到 LINE 給我"]
  },

  illustration: {
    key: "illustration",
    kicker: "04｜溝通 × 似顏繪",
    name: "似顏繪委託",
    icon: "🎨",
    short: "把毛孩的樣子溫柔留下來。不只貓狗，特寵也可以（除了蟑螂）。",
    detailUrl: "illustration.html",
    slot: "none",
    plans: [
      { key: "hand", label: "手繪似顏繪", meta: "含畫框・含運費・寄送實體作品", price: 1500 }
    ],
    addons: [],
    mustKnow: [
      "所有插畫皆需完成付款後，才正式進入排單；完成時間依排單量而定，接單時會告知。",
      "作品會依照片與 Yura 的畫風創作，完成交稿後即結案，不提供修改。請確認能接受我的畫風再委託。",
      "若有指定日期、送禮或特殊需求，請務必在付款前提出。"
    ],
    fields: [
      { key: "petName", label: "毛孩名字", type: "text", required: true },
      { key: "petInfo", label: "毛孩種類", type: "text", placeholder: "例：玄鳳鸚鵡、比熊、倉鼠…" },
      { key: "frame", label: "畫框款式（手繪）", type: "select", required: true,
        options: ["大一點的框｜壓克力胡桃木", "小一點的框｜玻璃胡桃木", "小一點的框｜玻璃原木色"],
        image: "images/illustration/frame-options.jpg",
        imageNote: "上排中間：小框・玻璃胡桃木｜上排左右：小框・玻璃原木色｜下排三個：大框・壓克力胡桃木" },
      { key: "dueDate", label: "是否有指定完成日期", type: "text", placeholder: "沒有可填「無」" },
      { key: "note", label: "其他需求", type: "textarea", placeholder: "送禮、特殊構圖…可以留空" }
    ],
    prepare: ["光線清楚、五官看得清楚、毛色接近真實的照片，可以多給幾張不同角度（送出後回 LINE 傳給我）"]
  }
};

export const SERVICE_ORDER = ["general", "deceased", "search", "illustration"];

export const STATUS = {
  new:       { label: "待確認",        tone: "new",   desc: "已收到你的預約，Yura 會盡快回覆可安排的時間。" },
  confirmed: { label: "已排時段・待付款", tone: "warn",  desc: "時間已經幫你保留，完成全額付款後即預約成功。" },
  paid:      { label: "預約成功",      tone: "ok",    desc: "已完成付款，預約成功 ✨ 到時候見！" },
  done:      { label: "已完成",        tone: "done",  desc: "這次的服務已經完成，謝謝你。" },
  cancelled: { label: "已取消",        tone: "off",   desc: "這筆預約已取消，如有疑問請回 LINE 詢問。" }
};

export const money = n => "NT$" + Number(n || 0).toLocaleString("en-US");
