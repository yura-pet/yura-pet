// 服務項目、方案、必讀重點與表單欄位
// 改價格或改文字只要改這個檔案就可以了。

const ART_FIELDS = [
  { key: "artFormat", label: "似顏繪形式", type: "select", options: ["手繪（含畫框、含運，寄送實體作品）", "電繪（提供電子檔）"], required: true,
    showIf: s => s.addons.has("art") },
  { key: "artFrame", label: "畫框款式（手繪）", type: "select", required: true,
    options: ["大一點的框｜壓克力胡桃木", "小一點的框｜玻璃胡桃木", "小一點的框｜玻璃原木色"],
    hint: "畫框款式可以在「似顏繪」頁面看實拍照。",
    showIf: s => s.addons.has("art") && (s.values.artFormat || "").startsWith("手繪") }
];

const ART_ADDON = { key: "art", label: "加購似顏繪（溝通後加購價）", price: 1200,
  hint: "把這次溝通的感受與毛孩的模樣一起留下來。" };

export const SERVICES = {
  general: {
    key: "general",
    kicker: "01｜毛孩在身邊",
    name: "一般寵物溝通",
    icon: "🐾",
    short: "想了解毛孩的情緒、需求、想法，或某些行為背後的原因。",
    detailUrl: "https://yura-pet.github.io/yura-pet-general/",
    slot: "required",
    plans: [
      { key: "single", label: "單寵溝通（1 隻）", meta: "20 分鐘", price: 1680 },
      { key: "double", label: "多寵溝通（2 隻）", meta: "30 分鐘", price: 2380 },
      { key: "triple", label: "三寵溝通（3 隻）", meta: "40 分鐘", price: 3080 }
    ],
    methods: ["視訊", "照片＋語音", "照片＋文字"],
    methodHint: "視訊與語音都會提供錄音紀錄；文字適合想慢慢閱讀、反覆查看的人。",
    addons: [
      { key: "urgent", label: "緊急溝通", price: 1000, hint: "需要盡快安排時使用。" },
      ART_ADDON
    ],
    mustKnow: [
      "溝通是「理解與協調」，不是控制或命令；毛孩不一定會立刻變乖，後續仍需要主人一起配合調整。",
      "健康相關問題，我能接收到的是牠的主觀感受，不等同醫療診斷，仍需要搭配獸醫評估。",
      "必須由毛孩的「主要照顧者」本人預約；非主要照顧者因涉及隱私，一律不接。",
      "時間確認後需完成「全額付款」才算預約成功；當天取消或未出席，不提供退款與兌換。"
    ],
    fields: [
      { key: "petName", label: "毛孩名字", type: "text", required: true, placeholder: "多寵請填寫每一隻的名字" },
      { key: "petInfo", label: "品種與年齡", type: "text", required: true, placeholder: "例：米克斯貓・5 歲" },
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
    detailUrl: "https://yura-pet.github.io/-yura-pet-deceased/",
    slot: "required",
    plans: [
      { key: "basic", label: "離世溝通", meta: "30 分鐘", price: 2200 },
      { key: "salvation", label: "離世溝通＋超度", meta: "含超度後的轉世推算", price: 7200 }
    ],
    methods: ["照片＋視訊", "照片＋語音", "照片＋文字"],
    methodHint: "視訊與語音都會同步錄音並提供錄音紀錄。",
    addons: [
      { key: "rebirth", label: "炁絡筆裁示／動物兵馬打聖杯確認轉世", price: 666,
        hint: "想確認目前的毛孩是不是前一隻回來了。需配合道長時間。" },
      ART_ADDON
    ],
    mustKnow: [
      "離世後記憶會逐漸模糊，這是正常的。請不要用生前細節反覆驗證我有沒有連上——如果一定需要這樣驗證，建議先不要預約。",
      "轉世方向與福報的確切資訊，需在超度之後才能準確推算；溝通中提到的轉世內容僅供參考。",
      "離世溝通的目的是理解、傳達與告別，不是隨時找牠聊天的管道。",
      "超度、確認轉世等服務需配合道長時間，會等比較久；一旦開始進行就不能反悔、不退款。",
      "必須由主要照顧者預約。時間確認後需完成全額付款才算預約成功；當天取消或未出席不退款、不兌換。"
    ],
    fields: [
      { key: "petName", label: "毛孩名字", type: "text", required: true },
      { key: "petInfo", label: "品種與年齡", type: "text", placeholder: "例：柴犬・離世時 12 歲" },
      { key: "passedTime", label: "離世時間", type: "text", required: true, placeholder: "例：2026 年 9 月初" },
      { key: "ceremony", label: "火化與法事是否已完成", type: "select", required: true,
        options: ["已完成", "尚未完成", "不確定"],
        hint: "如果最想了解的是轉世相關問題，建議在火化與法事完成之後再溝通，資訊會更完整穩定。" },
      { key: "questions", label: "想詢問的內容", type: "textarea", required: true, placeholder: "最重要的問題請放在前面" },
      { key: "message", label: "想對牠說的話", type: "textarea",
        placeholder: "想念、感謝、道歉、遺憾…都可以交給我傳達",
        hint: "建議在溝通前先寫一封懺悔信給牠，不用很長，真實就好。" },
      ...ART_FIELDS
    ],
    prepare: ["清楚、能辨識毛孩樣貌的照片（送出後回 LINE 傳給我）", "一封想對牠說的懺悔信（建議）"]
  },

  search: {
    key: "search",
    kicker: "03｜走失・失聯",
    name: "找寵服務",
    icon: "🧭",
    short: "毛孩走失、失聯，或想確認牠現在的狀態與方向。",
    detailUrl: "https://yura-pet.github.io/-yura-pet-search/",
    slot: "optional",
    slotHint: "找寵通常比較急，可以不選時段，我會盡快安排；生死測算統一在晚上 9:00 打聖杯。",
    plans: [
      { key: "qimen", label: "奇門遁甲找寵方案（主推）", meta: "生死測算＋奇門遁甲報告＋溝通 1 次", price: 5000 },
      { key: "comm", label: "寵物溝通", meta: "走失未超過 1 天，或已使用奇門方案", price: 1680 },
      { key: "life", label: "生死測算", meta: "統一晚上 9:00 打聖杯", price: 666 }
    ],
    addons: [ART_ADDON],
    mustKnow: [
      "找寵服務提供的是搜尋輔助資訊與方向，不保證一定尋回。",
      "毛孩會持續移動，溝通與卦象看到的是當下資訊，不是 GPS 精準定位。",
      "請一定要同步實際搜尋：外出尋找、張貼協尋、詢問附近住戶店家、調閱監視器。",
      "生死測算統一晚上 9:00 打聖杯；奇門遁甲需配合道長時間，完成時間無法固定。",
      "全額付款後才會開始；服務開始後因已投入作業，不接受中途取消、不退款。"
    ],
    fields: [
      { key: "petName", label: "1. 動物名字", type: "text", required: true },
      { key: "petInfo", label: "2. 品種與年齡", type: "text", required: true },
      { key: "chip", label: "3. 有沒有晶片", type: "select", options: ["有", "無", "不確定"], required: true },
      { key: "health", label: "4. 健康狀況", type: "text" },
      { key: "lostTime", label: "5. 走失的日期時間，到現在多久了", type: "text", required: true },
      { key: "lostPlace", label: "6. 走失地點", type: "text", required: true },
      { key: "howLost", label: "7. 怎麼走丟的", type: "textarea", required: true },
      { key: "lastSeen", label: "8. 最後一次確定看到牠", type: "text", required: true },
      { key: "searched", label: "9. 已經做過哪些搜尋", type: "textarea" },
      { key: "ownerName", label: "10. 主人姓名", type: "text", required: true },
      { key: "ownerBirth", label: "11. 主人出生年月日、時間", type: "text", required: true, placeholder: "例：1990/05/20 早上 8 點（不知道時間可填不確定）" },
      { key: "ownerGender", label: "12. 主人性別", type: "select", options: ["女", "男", "其他"], required: true },
      { key: "ownerCity", label: "13. 主人目前在哪個城市", type: "text", required: true },
      ...ART_FIELDS
    ],
    prepare: ["毛孩近期照片兩張（正面一張、全身一張）", "主人的自拍照", "以上照片請在送出後回 LINE 傳給我"]
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
      { key: "hand", label: "手繪似顏繪", meta: "含畫框・含運費・寄送實體作品", price: 1680 },
      { key: "digital", label: "電繪似顏繪", meta: "高相似度・提供電子檔", price: 1500 },
      { key: "addon-hand", label: "溝通後加購｜手繪", meta: "已預約 Yura 寵物溝通", price: 1200 },
      { key: "addon-digital", label: "溝通後加購｜電繪", meta: "已預約 Yura 寵物溝通", price: 1200 }
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
        hint: "畫框實拍照在「似顏繪」頁面。",
        showIf: s => s.plan === "hand" || s.plan === "addon-hand" },
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
