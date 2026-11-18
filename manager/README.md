# Yura 預約管理系統（自己用的後台）

自己手動登記預約，用月曆看排程、記錄客人來過幾次、管理訂金與尾款、看結算統計。
部署在 **Netlify**，資料存在 Netlify 的雲端（Netlify Blobs），**手機、平板、電腦登入同一組密碼就會看到同樣的資料**。

## 功能

- **今天的預約**：最上方大字顯示今天每個預約的時間，下一個預約會用黃框標出來
- **月曆**：每天的格子直接顯示預約時間（手機上只顯示時間、電腦上會加寵物名），左右滑可以換月份
  - 點一下日期 → 下方顯示那天的預約；在空白日期再點一次 → 直接新增
- **新增預約**：客人名字、從哪預約（官方LINE／IG／介紹）、寵物名字、預約項目、日期（年／月／日下拉選單）、時間（10:00～24:00，每半小時一格的下拉選單）、在哪裡溝通（官方LINE／IG）、溝通方式（文字／語音／視訊）、備註
  - 輸入老客人的名字會自動帶出「來過幾次」和他的寵物名字
  - 新客人儲存時會自動建立客人資料
  - 同一個時段重複預約時會提醒你
- **收款紀錄**：總金額、訂金（已收／未收）、尾款自動計算（已收／未收）
  - 不會自動填價格
  - **「付清」按鈕**：一鍵標記全部收齊（列表上也有快速「付清」按鈕）
- **客人資料**：來過次數、累計付款、上次／下次預約、所有預約紀錄、客人備註，可以搜尋和排序
- **結算統計**：可選「月／年／全部」，顯示預約數、應收、已收（訂金／尾款分開）、未收、新客與回頭客、平均客單價，以及依預約項目、客人來源、溝通方式、溝通地點的分析
- **還沒收齊的款項**：一個清單列出所有還沒收完的錢
- **備份**：右上角「⋯」可以下載備份檔或匯入備份

要改選項（例如新增預約項目），打開 `app.js` 最上面的 `SOURCES`、`CHANNELS`、`METHODS`、`SERVICES` 直接改就好。

---

# 用 Netlify 部署（教學）

> ⚠️ 不能用 Netlify 的「拖曳上傳」（Netlify Drop），那種方式沒有雲端資料功能，只會變成本機模式。
> 請用下面「方法一」連結 GitHub。

## 方法一：連結 GitHub（推薦，之後改程式會自動更新）

### 1. 把程式放上 GitHub
這個資料夾和專案最外層的 `netlify.toml` 要在同一個 GitHub repository 裡（目前就在 `yura-pet/yura-pet`）。
因為是自己用的系統，也可以另外開一個 **Private（私人）** 的 repository 來放，比較安全。

### 2. 在 Netlify 建立網站
1. 到 <https://app.netlify.com/> → 用 **GitHub 帳號登入**
2. 點 **Add new site → Import an existing project**
3. 選 **GitHub** → 授權 → 選你的 repository（例如 `yura-pet`）
4. 設定畫面 Netlify 會自動讀取 `netlify.toml`，應該已經填好：
   - Base directory：`manager`
   - Publish directory：`manager/.`
   - Functions directory：`manager/netlify/functions`
   - Build command：留空
5. 先不要急著按 Deploy，往下找 **Environment variables → Add environment variables**：
   - Key：`ADMIN_PASSWORD`
   - Value：你的登入密碼（請設一組別人猜不到的，例如 `yura-貓咪-2026-xxxx`）
6. 按 **Deploy**，等 1～2 分鐘

> 如果剛剛忘了設密碼：到 **Site configuration → Environment variables** 新增 `ADMIN_PASSWORD`，
> 然後到 **Deploys → Trigger deploy → Deploy site** 重新部署一次，密碼才會生效。

### 3. 打開網站
- 網址會像 `https://隨機名字.netlify.app`
- 想改好記的網址：**Site configuration → Site details → Change site name**，例如改成 `yura-booking` → `https://yura-booking.netlify.app`
- 打開後輸入 `ADMIN_PASSWORD` 的密碼就能用了。頁面上方**沒有**黃色「本機模式」提示，就代表已經連上雲端了。

### 之後要更新
改完程式推上 GitHub，Netlify 會自動重新部署，資料不會不見。

## 方法二：用指令部署（Netlify CLI）

電腦有裝 Node.js 的話：

```bash
npm install -g netlify-cli
cd yura-pet            # 專案最外層（有 netlify.toml 的地方）
netlify login
netlify init           # 建立新網站
netlify env:set ADMIN_PASSWORD "你的密碼"
netlify deploy --prod
```

---

# 多裝置使用

1. 手機、平板、電腦都打開同一個網址，輸入同一組密碼
2. 勾「在這台裝置記住我」，之後打開就不用再輸入密碼
3. 在任何一台新增或修改，其他裝置**切回畫面時就會自動同步**（開著的話每 2 分鐘也會自動更新，也可以按「⋯ → 重新整理資料」）
4. **加到手機桌面，像 App 一樣用：**
   - iPhone：用 Safari 打開 → 下方「分享」按鈕 → **加入主畫面**
   - Android：用 Chrome 打開 → 右上「⋮」→ **加到主畫面**

# 安全與備份

- 資料只有知道密碼的人看得到。如果用別人的電腦，用完請按「⋯ → 登出」
- 要換密碼：Netlify 改 `ADMIN_PASSWORD` → 重新部署 → 每台裝置重新登入
- 建議每個月按「⋯ → 下載備份」存一份到雲端硬碟
- Netlify 免費方案對個人預約系統就夠用了

# 本機試用

直接用瀏覽器打開 `index.html` 也可以操作（本機模式，資料只存在那台電腦的瀏覽器）。
本機模式下載的備份，部署後可以用「匯入備份」搬到雲端。
