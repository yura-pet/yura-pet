# Yura 預約系統｜設定說明

整套系統都放在 GitHub Pages（免費、更新不限次數），資料存在 **Firebase**（Google 的免費資料庫）。

| 頁面 | 網址 | 誰用 |
|---|---|---|
| 服務總覽（首頁） | https://yura-pet.github.io/yura-pet/ | 客人 |
| 線上預約 | https://yura-pet.github.io/yura-pet/book.html | 客人 |
| **預約管理後台** | **https://yura-pet.github.io/yura-pet/manager/** | 你 |

設定好 Firebase 之後：
- 客人在網站送出預約 → **馬上出現在後台**最上面的「🔔 待確認的網站預約」，也照樣傳到 LINE
- 客人選得到的時間 = 後台「⏰ 時段」的設定（每週固定時段、公休、加開、封鎖）
- 已經被預約的時段會自動顯示「已約滿」，兩個人不會約到同一個時間

---

## 一、建立 Firebase（約 10 分鐘，只要做一次）

1. 到 <https://console.firebase.google.com/> 用 Google 帳號登入 → **建立專案**（名稱例如 `yura-booking`，Google Analytics 關掉）
2. **Authentication** → 開始使用 → 登入方式選 **電子郵件/密碼** → 啟用 → 儲存
   - **Users** 分頁 → **新增使用者**：輸入你要登入後台的 Email 和密碼
   - **Settings → 授權網域** → 新增 `yura-pet.github.io`
3. **Firestore Database** → 建立資料庫 → 位置選 `asia-east1（台灣）` → 以正式版模式啟動
4. Firestore 的 **規則** 分頁：把 [`firestore.rules`](firestore.rules) 整個貼上，
   **把 `yura@example.com` 改成第 2 步的 Email** → 發布
5. 專案設定（齒輪）→ 你的應用程式 → 點 `</>` 新增網頁應用程式 → 會出現 `firebaseConfig`
6. 把那 6 個值貼進 [`assets/js/config.js`](assets/js/config.js) 的 `firebase: { … }`

> `apiKey` 放在網頁裡是正常的，資料是靠第 4 步的規則保護。

## 二、從舊的 Netlify 後台搬資料

1. 打開舊後台 https://endearing-taiyaki-794709.netlify.app/ → 右上角「⋯」→ **下載備份**
2. 打開新後台 → 登入 → 右上角「⋯」→ **匯入備份** → 選剛剛下載的檔案

## 三、日常使用

- **⏰ 時段**：設定每週固定開放時段
- **📅 預約 → 點月曆日期**：設為公休、本日加開時段、本日封鎖時段
- **🔔 待確認的網站預約**：點開 → 確認時間、填金額 → 狀態改「已預約」
  客人取消就改「已取消」，那個時段會自動重新開放
- 手機加到主畫面：Safari「分享 → 加入主畫面」／Chrome「⋮ → 加到主畫面」
