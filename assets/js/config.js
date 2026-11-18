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

  // 後台還沒設定前的預設值（之後可以在後台「網站設定」修改）
  defaults: {
    lineUrl: "",            // 例：https://lin.ee/xxxxxxx 或 https://line.me/R/ti/p/@xxxx
    lineId: "",             // 例：@yura-pet
    bookingOpen: true,
    closedMessage: "目前暫停開放線上預約，請先到 LINE 詢問 🙏",
    announcement: "",
    paymentInfo: "時間確認後，我會在 LINE 提供付款資訊。完成全額付款後，才視為預約成功 ✨"
  }
};
