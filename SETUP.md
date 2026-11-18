# Yura 寵物溝通預約系統｜設定說明

網站部署在 GitHub Pages（免費），預約資料存在 Firebase（Google 的免費資料庫）。
**還沒設定 Firebase 前，網站是「示範模式」**：可以完整操作，但資料只存在你自己的瀏覽器裡，客人送出的預約你看不到。

## 網站頁面

| 頁面 | 網址 | 用途 |
|---|---|---|
| 服務總覽（首頁） | `/yura-pet/` | 介紹服務、教育客人、引導預約 |
| 線上預約 | `/yura-pet/book.html` | 選服務 → 必讀重點 → 填資料 → 選時段 → 送出 |
| 似顏繪 | `/yura-pet/illustration.html` | 作品集＋委託（原 yura-illustration 網站內容） |
| 查詢預約 | `/yura-pet/status.html` | 客人用 8 碼編號看進度、付款資訊 |
| **後台** | `/yura-pet/admin.html` | 你自己用：管理預約、開放時段、網站設定 |

單一服務也可以直接分享連結，例如：`book.html?service=general`、`book.html?service=deceased`、`book.html?service=search`、`book.html?service=illustration`。

---

## 一、建立 Firebase（約 10 分鐘，只要做一次）

1. 到 <https://console.firebase.google.com/> 用 Google 帳號登入 → **新增專案**（名稱例如 `yura-booking`，Google Analytics 可以關掉）。
2. 左側 **建構 → Authentication** → 開始使用 → 登入方式選 **電子郵件/密碼** → 啟用 → 儲存。
   再到 **Users** 分頁 → **新增使用者**，輸入你要登入後台的 Email 和密碼。
3. 左側 **建構 → Firestore Database** → 建立資料庫 → 位置選 `asia-east1（台灣）` → 選「以正式版模式啟動」。
4. Firestore 的 **規則** 分頁：把本專案的 [`firestore.rules`](firestore.rules) 整個貼上，
   **把裡面的 `yura@example.com` 改成第 2 步建立的 Email**，按「發布」。
5. 點左上角齒輪 **專案設定** → 往下「你的應用程式」→ 點 `</>`（網頁）→ 取個名字 → 註冊。
   畫面會出現一段 `firebaseConfig = { apiKey: "...", ... }`。
6. 打開本專案的 [`assets/js/config.js`](assets/js/config.js)，把那 6 個值貼到 `firebase: { ... }` 裡面，存檔推上 GitHub。
7. Authentication → **設定 → 授權網域** → 新增 `yura-pet.github.io`。

> `apiKey` 放在網頁裡是正常的，Firebase 的安全是靠第 4 步的規則保護，不是靠隱藏 key。

完成後頁面上方的黃色「示範模式」提示就會消失。

## 二、第一次進後台要做的事

打開 `admin.html` 登入，然後：

1. **網站設定**：填上 LINE 連結（或 LINE ID）、付款資訊（銀行帳號等）→ 儲存。
2. **時段管理**：選日期範圍、星期、時間（例如 `14:00, 20:00`）→ 新增時段。客人就能直接選。

## 三、日常使用流程

1. 客人送出預約 → 後台「待確認」出現一筆（後台開著時可以按「開啟新預約通知」）。
   客人也會回 LINE 跟你說預約編號並傳照片。
2. 點開那筆預約 → 「確認時段」選客人的第一或第二志願 → 狀態自動變「待付款」→ 儲存。
   另一個沒用到的志願時段會自動釋出給別人。
3. 客人在「查詢預約」頁會看到付款資訊。確認收款後把狀態改成「預約成功」。
4. 服務結束後改成「已完成」。取消的話改成「已取消」，時段會自動釋出。

## 四、要修改內容

- **價格、方案、必讀重點、表單欄位**：都在 [`assets/js/services.js`](assets/js/services.js)
- **首頁文字**：[`index.html`](index.html)
- **似顏繪頁**：[`illustration.html`](illustration.html)，圖片在 `images/illustration/`
- **公告、LINE、付款資訊、暫停預約**：後台「網站設定」直接改，不用動程式

## 五、注意事項

- 毛孩照片請客人回 LINE 傳（Firebase 免費方案不含檔案儲存）。
- 免費額度（每天 5 萬次讀取、2 萬次寫入）對個人預約系統綽綽有餘。
- 預約編號是 8 碼亂數，只有知道編號的人才查得到那一筆；預約列表只有管理員帳號看得到。
