// =====================================================
//  Yura 預約系統｜網站設定檔
//  只要把 Firebase 專案的設定貼進下面的 firebase 區塊，
//  網站就會自動從「示範模式」切換成「正式模式」。
//  詳細步驟請看 SETUP.md
// =====================================================
export const CONFIG = {
  // ↓↓↓ 把 Firebase 主控台給你的 firebaseConfig 內容貼在這裡 ↓↓↓
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  // ↑↑↑ 留空 = 示範模式（資料只存在目前這台裝置的瀏覽器裡）↑↑↑

  // true = 還沒接資料庫時，預約資料只透過「傳到 LINE」交給 Yura（不顯示示範模式提示）
  lineMode: true,

  // 後台還沒設定前的預設值（之後可以在後台「網站設定」修改）
  defaults: {
    lineUrl: "https://lin.ee/pYoY3ar",   // LINE 官方帳號加好友連結
    lineId: "@052mhzeh",               // LINE 官方帳號 ID（用來自動帶入預約資料）
    bookingOpen: true,
    // 固定開放的預約時段：平日（一～五）和週末（六、日）
    weekdayTimes: ["11:00", "14:00", "15:00", "19:00", "20:00"],
    weekendTimes: ["19:00", "20:00"],
    closedMessage: "目前暫停開放線上預約，請先到 LINE 詢問 🙏",
    announcement: "",
    paymentInfo: "時間確認後，我會在 LINE 提供付款資訊。完成全額付款後，才視為預約成功 ✨"
  }
};
