/* Yura 預約管理系統 */
(() => {
"use strict";

// ================= 選項（要改選項就改這裡） =================
const SOURCES  = ["官方LINE", "IG", "介紹", "網站預約"];
const CHANNELS = ["官方LINE", "IG"];
const METHODS  = ["文字", "語音", "視訊"];
// 加時（價錢給你參考，總金額請自己填）
const EXTS = { "": "不加時", "10": "加時 10 分鐘（NT$500）", "15": "加時 15 分鐘（NT$700）", "20": "加時 20 分鐘（舊）" };
const SERVICES = [
  "一般溝通｜單寵", "一般溝通｜多寵（2 隻）", "一般溝通｜三寵（3 隻）", "一般溝通｜緊急",
  "套組｜一般溝通單寵＋似顏繪", "套組｜一般溝通雙寵＋似顏繪", "套組｜一般溝通三寵＋似顏繪",
  "離世溝通", "離世溝通＋超度", "確認轉世（炁絡筆／打聖杯）",
  "套組｜離世溝通＋似顏繪", "套組｜離世溝通＋超度＋似顏繪",
  "找寵｜奇門遁甲方案", "找寵｜寵物溝通", "找寵｜生死測算",
  "套組｜找寵溝通＋似顏繪", "套組｜奇門遁甲＋似顏繪",
  "似顏繪｜手繪", "其他"
];
const STATUS = { pending: "待確認", booked: "已預約", done: "已完成", cancelled: "已取消" };
const WD5 = ["11:00", "14:00", "15:00", "19:00", "20:00"], WE2 = ["19:00", "20:00"];
const DEFAULT_CFG = { id: "config01", weekly: { 0: WE2, 1: WD5, 2: WD5, 3: WD5, 4: WD5, 5: ["15:00", "19:00", "20:00"], 6: WE2 }, closed: {}, extra: {}, blocked: {} };
const ART_STATUS = { queue: "排單中", drawing: "繪製中", ready: "完成待寄出", shipped: "已寄出" };
const ART_ORDER = ["queue", "drawing", "ready", "shipped"];
const FRAMES = ["大一點的框｜壓克力胡桃木", "小一點的框｜玻璃胡桃木", "小一點的框｜玻璃原木色"];
const TIMES = []; for (let m = 10 * 60; m <= 24 * 60; m += 30) TIMES.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const WD = ["日", "一", "二", "三", "四", "五", "六"];

// ================= 小工具 =================
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dLabel = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; };
const money = n => "NT$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const num = v => (v === "" || v === null || v === undefined || isNaN(+v)) ? null : +v;
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : (Date.now().toString(36) + Math.random().toString(36).slice(2))).slice(0, 20);
const opts = (arr, sel, empty) => (empty !== undefined ? `<option value="">${empty}</option>` : "") + arr.map(v => `<option ${v === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400); }

// ================= 付款計算 =================
function pay(b) {
  const total = num(b.total), dep = num(b.deposit) || 0;
  const balance = total === null ? null : Math.max(total - dep, 0);
  const received = (b.depositPaid ? dep : 0) + (b.balancePaid && balance !== null ? balance : 0);
  let st = "none", label = "未付款";
  if (total === null) { st = "noprice"; label = "未填金額"; }
  else if ((b.balancePaid || balance === 0) && (dep === 0 || b.depositPaid)) { st = "paid"; label = "已付清"; }
  else if (b.depositPaid && dep > 0) { st = "dep"; label = "已付訂金"; }
  return { total, dep, balance, received, outstanding: total === null ? 0 : Math.max(total - received, 0), st, label };
}

// ================= 資料層（Firebase） =================
const CACHE_KEY = "yura_mgr_cache", LOCAL_KEY = "yura_mgr_local";
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
let mode = "cloud"; // cloud（Firebase）| local（還沒設定 Firebase：資料只在這台裝置）
let DB = { bookings: [], customers: [], arts: [], settings: [] };
const fixDB = () => { DB.bookings ||= []; DB.customers ||= []; DB.arts ||= []; DB.settings ||= []; };
const KINDS = ["bookings", "customers", "arts", "settings"];
const FBV = "https://www.gstatic.com/firebasejs/10.12.2/";
let F = null; // { fs, db, auth, au }

async function firebase() {
  if (F) return F;
  const { CONFIG } = await import("../assets/js/config.js?v=" + Date.now().toString(36).slice(0, 6));
  if (!CONFIG.firebase || !CONFIG.firebase.apiKey) return null;
  const [app, fs, auth] = await Promise.all([import(FBV + "firebase-app.js"), import(FBV + "firebase-firestore.js"), import(FBV + "firebase-auth.js")]);
  const a = app.getApps().length ? app.getApp() : app.initializeApp(CONFIG.firebase);
  F = { fs, db: fs.getFirestore(a), auth, au: auth.getAuth(a) };
  if (window.__FB_EMULATOR__) { fs.connectFirestoreEmulator(F.db, "127.0.0.1", 8080); auth.connectAuthEmulator(F.au, "http://127.0.0.1:9099", { disableWarnings: true }); } // 只在本機測試時使用
  return F;
}
const clean = o => JSON.parse(JSON.stringify(o)); // 拿掉 undefined
function persistLocal() { ls.set(mode === "local" ? LOCAL_KEY : CACHE_KEY, JSON.stringify(DB)); }
function setSync(t) { $("#syncState").textContent = t; }

// 被預約走的時段 → taken/日期_時間（給預約網站看，沒有客人資料）
const isTimeStr = x => /^\d{2}:\d{2}$/.test(x || "");
const takenKeyOf = b => (["booked", "pending"].includes(b.status) && /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") && isTimeStr(b.time)) ? `${b.date}_${b.time}` : "";
async function syncTaken(prevKey, b) {
  if (mode !== "cloud") return;
  const { fs, db } = F, key = takenKeyOf(b);
  if (prevKey && prevKey !== key && !DB.bookings.some(x => x.id !== b.id && takenKeyOf(x) === prevKey))
    await fs.deleteDoc(fs.doc(db, "taken", prevKey)).catch(() => {});
  if (key) await fs.setDoc(fs.doc(db, "taken", key), { date: b.date, time: b.time, createdAt: Date.now() });
}

async function loadAll() {
  if (mode === "local") { try { DB = JSON.parse(ls.get(LOCAL_KEY)) || DB; } catch {} fixDB(); render(); return; }
  setSync("同步中…");
  const { fs, db } = F;
  const snaps = await Promise.all(KINDS.map(k => fs.getDocs(fs.collection(db, k))));
  KINDS.forEach((k, i) => DB[k] = snaps[i].docs.map(d => ({ ...d.data(), id: d.id })));
  persistLocal(); render();
  setSync("已同步 " + nowHM());
  cleanupTaken().catch(() => {});
}
// 清掉沒有對應預約的「已預約時段」（例如客人送出失敗、預約被刪掉）
async function cleanupTaken() {
  const { fs, db } = F;
  const snap = await fs.getDocs(fs.query(fs.collection(db, "taken"), fs.where("date", ">=", todayStr())));
  const live = new Set(DB.bookings.map(takenKeyOf).filter(Boolean));
  for (const d of snap.docs) if (!live.has(d.id) && Date.now() - (d.data().createdAt || 0) > 30 * 60e3) await fs.deleteDoc(d.ref).catch(() => {});
  for (const k of live) if (!snap.docs.some(d => d.id === k)) { const [date, time] = k.split("_"); await fs.setDoc(fs.doc(db, "taken", k), { date, time, createdAt: Date.now() }).catch(() => {}); }
}
async function put(kind, item) {
  const list = DB[kind], i = list.findIndex(x => x.id === item.id);
  const prevKey = kind === "bookings" && i >= 0 ? takenKeyOf(list[i]) : "";
  item.updatedAt = Date.now();
  if (kind === "bookings") item.takenKey = takenKeyOf(item);
  if (i >= 0) list[i] = item; else list.push(item);
  persistLocal(); render();
  if (mode === "cloud") {
    setSync("儲存中…");
    try {
      await F.fs.setDoc(F.fs.doc(F.db, kind, item.id), clean(item));
      if (kind === "bookings") await syncTaken(prevKey, item);
      setSync("已同步 " + nowHM());
    } catch (e) { setSync("⚠️ 儲存失敗"); toast("儲存到雲端失敗：" + e.message); throw e; }
  }
}
async function del(kind, id) {
  const old = DB[kind].find(x => x.id === id);
  DB[kind] = DB[kind].filter(x => x.id !== id);
  persistLocal(); render();
  if (mode === "cloud") {
    try {
      await F.fs.deleteDoc(F.fs.doc(F.db, kind, id));
      if (kind === "bookings" && old) await syncTaken(takenKeyOf(old), { ...old, status: "cancelled" });
      setSync("已同步 " + nowHM());
    } catch (e) { toast("刪除失敗：" + e.message); loadAll(); }
  }
}
async function importAll(d) {
  for (const k of ["customers", "arts", "bookings", "settings"]) for (const item of d[k] || []) {
    if (!item || !item.id) continue;
    if (k === "bookings") item.takenKey = takenKeyOf(item);
    if (mode === "cloud") await F.fs.setDoc(F.fs.doc(F.db, k, item.id), clean(item));
    const i = DB[k].findIndex(x => x.id === item.id); i >= 0 ? DB[k][i] = item : DB[k].push(item);
  }
  if (mode === "cloud") await loadAll(); else { persistLocal(); render(); }
}

// ================= 啟動 / 登入 =================
let unsubLive = null;
async function boot() {
  let ok = null;
  try { ok = await firebase(); } catch (e) { console.warn(e); }
  if (!ok) {
    mode = "local";
    $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
    const bar = $("#modeBar");
    bar.innerHTML = "目前是「本機模式」：還沒設定 Firebase，資料只存在這台裝置的瀏覽器。";
    bar.classList.remove("hidden"); setSync("本機模式"); $("#mLogout").classList.add("hidden");
    return loadAll();
  }
  F.auth.onAuthStateChanged(F.au, async user => {
    if (!user) { if (unsubLive) unsubLive(); return showLogin(""); }
    $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
    $("#who") && ($("#who").textContent = user.email || "");
    try { const c = JSON.parse(ls.get(CACHE_KEY)); if (c) { DB = c; fixDB(); render(); } } catch {}
    try { await loadAll(); }
    catch (e) {
      setSync("⚠️ 無法同步");
      toast(e.code === "permission-denied" ? "這個帳號沒有權限：請確認 Firebase 規則裡的 Email" : "讀取資料失敗：" + e.message);
      render();
    }
    // 客人從網站預約時，即時出現
    if (unsubLive) unsubLive();
    let first = true;
    unsubLive = F.fs.onSnapshot(F.fs.collection(F.db, "bookings"), snap => {
      if (first) { first = false; return; }
      const fresh = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      const newOnes = fresh.filter(b => b.status === "pending" && !DB.bookings.some(x => x.id === b.id));
      DB.bookings = fresh; persistLocal();
      if (!bkDlg.open && !custDlg.open && !$("#artDlg").open) render();
      if (newOnes.length) toast(`🔔 有 ${newOnes.length} 筆新的網站預約！`);
    }, () => {});
  });
}
function showLogin(msg) {
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  $("#loginErr").textContent = msg || "";
  setTimeout(() => ($("#em").value ? $("#pw") : $("#em")).focus(), 50);
}
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  $("#loginErr").textContent = "登入中…";
  try {
    await firebase();
    await F.auth.setPersistence(F.au, $("#remember").checked ? F.auth.browserLocalPersistence : F.auth.browserSessionPersistence);
    await F.auth.signInWithEmailAndPassword(F.au, $("#em").value.trim(), $("#pw").value);
  } catch (err) {
    console.warn(err);
    $("#loginErr").textContent = /invalid|wrong|not-found|credential/.test(err.code || "") ? "Email 或密碼不對，請再試一次" : "登入失敗：" + (err.code || err.message);
  }
};

// ================= 狀態 =================
let view = new Date(); view.setDate(1);
let selDay = todayStr();
let tab = "day";

const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
const custOf = b => DB.customers.find(c => c.id === b.customerId);
const custName = b => (custOf(b) || {}).name || b.customerName || "（未知客人）";
const active = b => b.status !== "cancelled";

function custStats(c) {
  const list = DB.bookings.filter(b => b.customerId === c.id).sort(byTime);
  const t = todayStr();
  const visited = list.filter(b => b.status === "done" || (b.status === "booked" && b.date < t));
  const spent = list.filter(active).reduce((n, b) => n + pay(b).received, 0);
  const next = list.find(b => b.status === "booked" && b.date >= t);
  const pets = [...new Set(list.map(b => b.pet).filter(Boolean))];
  return { list, visits: visited.length, last: visited.length ? visited[visited.length - 1].date : "", spent, next, pets, total: list.filter(active).length };
}

// ================= 畫面 =================
function render() {
  renderToday(); renderCal(); renderDay(); renderUpcoming(); renderUnpaid();
  if (tab === "customers") renderCustomers();
  if (tab === "stats") renderStats();
  renderArts();
  renderPending();
  renderDayCtl();
  if (tab === "slots") renderSlots();
  $("#dl_customers").innerHTML = DB.customers.map(c => `<option value="${esc(c.name)}">`).join("");
}

// 溝通總長度（方案分鐘＋加時）
function minutesOf(b) {
  const sv = b.service || "";
  const m = sv.match(/(\d+)\s*分鐘/);
  let base = m ? +m[1] : /三寵|3 隻/.test(sv) ? 40 : /多寵|雙寵|2 隻/.test(sv) ? 30 : /離世/.test(sv) ? 30 : /單寵|單次溝通|一般溝通/.test(sv) ? 20 : 0;
  return base ? base + (+b.ext || 0) : 0;
}
const hasArt = b => /似顏繪/.test(b.service || "");
const durTag = b => { const n = minutesOf(b); return [n ? `⏱ ${n} 分鐘` : "", hasArt(b) ? "🎨 似顏繪" : ""].filter(Boolean).join("・"); };
function bookingLine(b) {
  const p = pay(b);
  return [durTag(b), b.service, b.ext ? `加時 ${b.ext} 分` : "", b.method, b.channel && "於" + b.channel].filter(Boolean).join("・") + ` <span class="badge ${p.st}">${p.label}</span>` +
    (b.status !== "booked" ? ` <span class="badge st-${b.status}">${STATUS[b.status]}</span>` : "");
}

function renderToday() {
  const t = todayStr(), now = nowHM();
  $("#todayLabel").textContent = `${dLabel(t)}`;
  const list = DB.bookings.filter(b => b.date === t).sort(byTime);
  const live = list.filter(active);
  const nextB = live.find(b => b.time >= now && b.status === "booked");
  const artsToday = DB.arts.filter(a => a.due === t && a.status !== "shipped" && a.status !== "ready").length;
  $("#todaySum").textContent = [live.length ? `共 ${live.length} 個預約` : "", artsToday ? `🎨 今天要完成 ${artsToday} 幅` : ""].filter(Boolean).join("・");
  $("#todayList").innerHTML = list.length ? list.map(b => `
    <button type="button" class="tcard ${b === nextB ? "next" : ""} ${b.time < now && b !== nextB ? "past" : ""} ${b.status === "cancelled" ? "cancelled" : ""}" data-bk="${b.id}">
      <div class="tt">${esc(b.time)}</div>
      <div class="ti"><b>${esc(b.pet)}｜${esc(custName(b))}</b><span>${esc(b.service)}${b.method ? "・" + esc(b.method) : ""}</span>
      <span>${esc(durTag(b))}</span>
      <span>${b === nextB ? "⏰ 下一個" : ""} ${pay(b).label}</span></div>
    </button>`).join("") : `<div class="empty">今天沒有預約，好好休息 ☕</div>`;
}

function renderCal() {
  const y = view.getFullYear(), m = view.getMonth();
  $("#monthLabel").textContent = `${y} 年 ${m + 1} 月`;
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  const t = todayStr();
  const map = {};
  DB.bookings.forEach(b => (map[b.date] ||= []).push(b));
  const artMap = {};
  DB.arts.filter(a => a.due && a.status !== "shipped").forEach(a => (artMap[a.due] ||= []).push(a));
  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i === 35 && d.getMonth() !== m) break;
    const s = ymd(d);
    const list = (map[s] || []).sort(byTime);
    const n = list.filter(active).length;
    const show = list.slice(0, 3);
    const isClosed = dayTimes(s).closed;
    html += `<button type="button" class="day ${d.getMonth() !== m ? "out" : ""} ${s === t ? "today" : ""} ${s === selDay ? "sel" : ""} ${isClosed ? "closed" : ""}" data-day="${s}">
      <div class="dn"><span>${d.getDate()}</span>${isClosed ? `<i>休</i>` : ""}${n ? `<em>${n}</em>` : ""}</div>
      ${show.map(b => `<div class="chip st-${b.status} ${active(b) && pay(b).st !== "paid" ? "unpaid" : ""}"><b>${esc(b.time)}</b><span>${esc(b.pet)}</span></div>`).join("")}
      ${list.length > 3 ? `<div class="more">+${list.length - 3}</div>` : ""}
      ${(artMap[s] || []).slice(0, 2).map(a => `<div class="chip art"><b>🎨</b><span>${esc(a.pet)}</span></div>`).join("")}
    </button>`;
  }
  $("#calGrid").innerHTML = html;
}

function rowHtml(b, showDate) {
  const p = pay(b);
  return `<div class="row" data-bk="${b.id}">
    <div class="when">${esc(b.time)}${showDate ? `<small>${dLabel(b.date)}</small>` : ""}</div>
    <div class="who"><b>${esc(b.pet)}｜${esc(custName(b))}</b><span class="tag">${esc(b.source || "")}</span><div>${bookingLine(b)}</div></div>
    <div class="amt">${p.total !== null ? money(p.total) : ""}${active(b) && p.st !== "paid" && p.total !== null ? `<br><button class="btn small paid" type="button" data-payall="${b.id}">付清</button>` : ""}</div>
  </div>`;
}

function renderDay() {
  $("#dayTitle").textContent = `${dLabel(selDay)} 的預約` + (selDay === todayStr() ? "（今天）" : "");
  const list = DB.bookings.filter(b => b.date === selDay).sort(byTime);
  $("#dayList").innerHTML = list.length ? list.map(b => rowHtml(b, false)).join("") : `<div class="empty">這天還沒有預約</div>`;
}
function renderUpcoming() {
  const t = todayStr(), end = ymd(new Date(Date.now() + 14 * 86400e3));
  const list = DB.bookings.filter(b => ["booked", "pending"].includes(b.status) && b.date > t && b.date <= end).sort(byTime);
  $("#upList").innerHTML = list.length ? list.map(b => rowHtml(b, true)).join("") : `<div class="empty">接下來兩週沒有預約</div>`;
}
function renderUnpaid() {
  const list = DB.bookings.filter(b => active(b) && pay(b).outstanding > 0).sort(byTime);
  $("#unpaidSum").textContent = list.length ? `共 ${money(list.reduce((n, b) => n + pay(b).outstanding, 0))}` : "";
  $("#unpaidList").innerHTML = list.length ? list.map(b => rowHtml(b, true).replace(`${money(pay(b).total)}`, `未收 <b>${money(pay(b).outstanding)}</b>`)).join("") : `<div class="empty">款項都收齊了 🎉</div>`;
}

function renderCustomers() {
  const q = $("#custSearch").value.trim().toLowerCase();
  const sort = $("#custSort").value;
  let rows = DB.customers.map(c => ({ c, s: custStats(c) }));
  if (q) rows = rows.filter(({ c, s }) => [c.name, c.contact, c.note, ...s.pets].join(" ").toLowerCase().includes(q));
  const cmp = { recent: (a, b) => (b.s.last || b.s.next?.date || "").localeCompare(a.s.last || a.s.next?.date || ""), visits: (a, b) => b.s.visits - a.s.visits, spent: (a, b) => b.s.spent - a.s.spent, name: (a, b) => a.c.name.localeCompare(b.c.name, "zh-Hant") }[sort];
  rows.sort(cmp);
  $("#custCount").textContent = `${DB.customers.length} 位`;
  $("#custList").innerHTML = rows.length ? rows.map(({ c, s }) => `
    <div class="crow" data-cust="${c.id}">
      <div class="avatar">${esc((c.name || "?").slice(0, 1))}</div>
      <div class="cn"><b>${esc(c.name)}</b><span class="tag">${esc(c.source || "")}</span>
        <div>🐾 ${esc(s.pets.join("、") || "—")}</div>
        <div>${s.last ? "上次：" + dLabel(s.last) : "還沒來過"}${s.next ? "・下次：" + dLabel(s.next.date) + " " + s.next.time : ""}・累計 ${money(s.spent)}</div></div>
      <div class="visits"><b>${s.visits}</b><span>來過次數</span></div>
    </div>`).join("") : `<div class="empty">${q ? "找不到符合的客人" : "還沒有客人資料，新增預約時會自動建立"}</div>`;
}

// ---- 統計 ----
let statRange = "month";
function fillStatMonth() {
  const sel = $("#statMonth"), now = new Date(), cur = sel.value;
  const items = [];
  if (statRange === "month") for (let i = -3; i < 24; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); items.push([`${d.getFullYear()}-${pad(d.getMonth() + 1)}`, `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`]); }
  if (statRange === "year") for (let i = 0; i < 6; i++) items.push([String(now.getFullYear() - i), `${now.getFullYear() - i} 年`]);
  sel.innerHTML = items.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  sel.classList.toggle("hidden", statRange === "all");
  const def = statRange === "month" ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}` : String(now.getFullYear());
  sel.value = items.some(x => x[0] === cur) ? cur : def;
}
function renderStats() {
  const key = $("#statMonth").value;
  const inRange = b => statRange === "all" || b.date.startsWith(key);
  const all = DB.bookings.filter(inRange);
  const list = all.filter(active);
  const P = list.map(pay);
  const sum = f => P.reduce((n, p) => n + f(p), 0);
  const firstDate = {};
  DB.bookings.filter(active).sort(byTime).forEach(b => { if (b.customerId && !firstDate[b.customerId]) firstDate[b.customerId] = b.date; });
  const custs = [...new Set(list.map(b => b.customerId))];
  const newC = custs.filter(id => firstDate[id] && inRange({ date: firstDate[id] })).length;
  const depRecv = list.reduce((n, b) => n + (b.depositPaid ? (num(b.deposit) || 0) : 0), 0);
  $("#statCards").innerHTML = [
    ["y", "預約數", list.length + " 筆", `已完成 ${list.filter(b => b.status === "done").length}・取消 ${all.length - list.length}`],
    ["b", "應收總額", money(sum(p => p.total || 0)), list.some(b => num(b.total) === null) ? `${list.filter(b => num(b.total) === null).length} 筆未填金額` : ""],
    ["g", "已收金額", money(sum(p => p.received)), `訂金 ${money(depRecv)}・尾款 ${money(sum(p => p.received) - depRecv)}`],
    ["r", "未收金額", money(sum(p => p.outstanding)), `${P.filter(p => p.outstanding > 0).length} 筆`],
    ["p", "客人數", custs.length + " 位", `新客 ${newC}・回頭客 ${custs.length - newC}`],
    ["y", "平均客單價", money(list.length ? sum(p => p.total || 0) / Math.max(P.filter(p => p.total !== null).length, 1) : 0), ""]
  ].map(([c, l, v, sub]) => `<div class="sc ${c}"><span>${l}</span><b>${v}</b>${sub ? `<span>${sub}</span>` : ""}</div>`).join("");

  const group = (title, keyFn) => {
    const g = {};
    list.forEach(b => { const k = keyFn(b) || "未填"; (g[k] ||= { n: 0, amt: 0 }); g[k].n++; g[k].amt += pay(b).total || 0; });
    const arr = Object.entries(g).sort((a, b) => b[1].n - a[1].n);
    const max = Math.max(1, ...arr.map(x => x[1].n));
    return `<div class="bd"><h4>${title}</h4>${arr.length ? arr.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><span class="v">${v.n} 筆・${money(v.amt)}</span><div class="tr"><div class="fill" style="width:${v.n / max * 100}%"></div></div></div>`).join("") : `<div class="muted small">沒有資料</div>`}</div>`;
  };
  $("#breakdowns").innerHTML = group("預約項目", b => b.service) + group("客人來源", b => b.source) + group("溝通方式", b => b.method) + group("加時", b => b.ext ? `加時 ${b.ext} 分鐘` : "不加時") + group("溝通地點", b => b.channel)
    + (statRange !== "month" ? group("每月預約", b => b.date.slice(0, 7)) : "");
}

// ================= 預約表單 =================
let editing = null;
const bkDlg = $("#bkDlg");
function fillDateSelects(dateStr) {
  const d = parseYmd(dateStr), y0 = new Date().getFullYear();
  const years = []; for (let y = Math.min(y0 - 3, d.getFullYear()); y <= Math.max(y0 + 2, d.getFullYear()); y++) years.push(y);
  $("#f_y").innerHTML = years.map(y => `<option value="${y}" ${y === d.getFullYear() ? "selected" : ""}>${y} 年</option>`).join("");
  $("#f_m").innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i === d.getMonth() ? "selected" : ""}>${i + 1} 月</option>`).join("");
  fillDays(d.getDate());
}
function fillDays(keep) {
  const y = +$("#f_y").value, m = +$("#f_m").value, n = new Date(y, m, 0).getDate();
  const cur = Math.min(keep || +$("#f_d").value || 1, n);
  $("#f_d").innerHTML = Array.from({ length: n }, (_, i) => { const wd = WD[new Date(y, m - 1, i + 1).getDay()]; return `<option value="${i + 1}" ${i + 1 === cur ? "selected" : ""}>${i + 1} 日（${wd}）</option>`; }).join("");
}
$("#f_y").onchange = () => fillDays(); $("#f_m").onchange = () => fillDays();
const formDate = () => `${$("#f_y").value}-${pad($("#f_m").value)}-${pad($("#f_d").value)}`;

function openBooking(b, preset = {}) {
  editing = b ? { ...b } : null;
  const x = b || { date: preset.date || selDay, time: "", status: "booked", source: "", channel: "", method: "", ...preset };
  $("#bkTitle").textContent = b ? "編輯預約" : "新增預約";
  $("#f_customer").value = b ? custName(b) : (preset.customerName || "");
  $("#f_source").innerHTML = opts(SOURCES, x.source, "請選擇");
  $("#f_pet").value = x.pet || "";
  const withCur = (list, v) => (v && !list.includes(v) ? [v, ...list] : list); // 網站預約的項目名稱也能顯示
  $("#f_service").innerHTML = opts(withCur(SERVICES, x.service), x.service, "請選擇");
  fillDateSelects(x.date);
  $("#f_time").innerHTML = opts(TIMES, x.time, x.time === "待安排" ? "待安排（請選擇時間）" : "請選擇時間");
  $("#f_status").innerHTML = Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? "selected" : ""}>${v}</option>`).join("");
  $("#f_channel").innerHTML = opts(CHANNELS, x.channel, "請選擇");
  $("#f_method").innerHTML = opts(withCur(METHODS, x.method), x.method, "請選擇");
  $("#f_ext").innerHTML = Object.entries(EXTS).map(([k, v]) => `<option value="${k}" ${String(x.ext || "") === k ? "selected" : ""}>${v}</option>`).join("");
  $("#extHint").textContent = "";
  $("#f_total").value = x.total ?? "";
  $("#f_deposit").value = x.deposit ?? "";
  $("#f_depositPaid").checked = !!x.depositPaid;
  $("#f_balancePaid").checked = !!x.balancePaid;
  $("#f_note").value = x.note || "";
  $("#bkDel").classList.toggle("hidden", !b);
  bkDlg.dataset.paidAt = x.paidAt || "";
  onCustomerInput(); updatePay();
  bkDlg.showModal();
  if (!b) setTimeout(() => $("#f_customer").focus(), 50);
}
function formPay() {
  return { total: num($("#f_total").value), deposit: num($("#f_deposit").value), depositPaid: $("#f_depositPaid").checked, balancePaid: $("#f_balancePaid").checked };
}
function updatePay() {
  const p = pay(formPay());
  $("#balanceOut").textContent = p.balance === null ? "—（先填總金額）" : money(p.balance);
  const bd = $("#payBadge"); bd.className = "badge " + p.st; bd.textContent = p.label;
  $("#paidAtOut").textContent = bkDlg.dataset.paidAt ? `付清日期：${dLabel(bkDlg.dataset.paidAt)}` : "";
}
["#f_total", "#f_deposit"].forEach(s => $(s).oninput = updatePay);
$("#f_ext").onchange = () => { const v = $("#f_ext").value;
  $("#extHint").textContent = v ? `記得把加時的 NT$${({ "10": 500, "15": 700, "20": 900 })[v]} 算進總金額` : ""; };
["#f_depositPaid", "#f_balancePaid"].forEach(s => $(s).onchange = updatePay);
$("#payAll").onclick = () => {
  if (num($("#f_total").value) === null) {
    const v = prompt("請輸入總金額（客人付清的金額）");
    if (v === null || num(v) === null) return;
    $("#f_total").value = num(v);
  }
  $("#f_depositPaid").checked = (num($("#f_deposit").value) || 0) > 0;
  $("#f_balancePaid").checked = true;
  bkDlg.dataset.paidAt = todayStr();
  updatePay(); toast("已標記付清 ✔ 記得按儲存");
};

function findCustomerByName(name) { const n = name.trim(); return DB.customers.find(c => c.name.trim() === n); }
function onCustomerInput() {
  const c = findCustomerByName($("#f_customer").value);
  const h = $("#custHint");
  if (c) {
    const s = custStats(c);
    h.textContent = `✔ 老客人・來過 ${s.visits} 次`;
    if (!$("#f_source").value && c.source) $("#f_source").value = c.source;
    $("#dl_pets").innerHTML = s.pets.map(p => `<option value="${esc(p)}">`).join("");
  } else {
    h.textContent = $("#f_customer").value.trim() ? "＋ 新客人，儲存時自動建立客人資料" : "";
    $("#dl_pets").innerHTML = "";
  }
}
$("#f_customer").oninput = onCustomerInput;

$("#bkForm").onsubmit = async e => {
  e.preventDefault();
  const name = $("#f_customer").value.trim();
  if (!name || !$("#f_pet").value.trim() || !$("#f_service").value || !$("#f_time").value || !$("#f_source").value) return toast("請填寫有 * 的欄位");
  let c = findCustomerByName(name);
  const isNew = !c;
  if (!c) c = { id: uid(), name, source: $("#f_source").value, contact: "", note: "", createdAt: Date.now() };
  const p = formPay();
  const b = {
    ...(editing || { id: uid(), createdAt: Date.now() }),
    customerId: c.id, customerName: name, pet: $("#f_pet").value.trim(), service: $("#f_service").value,
    source: $("#f_source").value, channel: $("#f_channel").value, method: $("#f_method").value, ext: $("#f_ext").value,
    date: formDate(), time: $("#f_time").value, status: $("#f_status").value,
    ...p, paidAt: pay(p).st === "paid" ? (bkDlg.dataset.paidAt || todayStr()) : "", note: $("#f_note").value.trim()
  };
  const conflict = DB.bookings.find(x => x.id !== b.id && active(x) && b.status !== "cancelled" && x.date === b.date && x.time === b.time);
  if (conflict && !confirm(`${dLabel(b.date)} ${b.time} 已經有「${conflict.pet}｜${custName(conflict)}」的預約，還是要儲存嗎？`)) return;
  bkDlg.close();
  try {
    if (isNew) await put("customers", c);
    await put("bookings", b);
    let artAdded = false;
    if (b.service.includes("似顏繪") && b.status !== "cancelled" && !DB.arts.some(a => a.bookingId === b.id)) {
      await put("arts", { id: uid(), bookingId: b.id, customerId: c.id, customerName: name, pet: b.pet, status: "queue", frame: "", due: "", photos: false, address: "", tracking: "", note: "", createdAt: Date.now() });
      artAdded = true;
    }
    selDay = b.date;
    const d = parseYmd(b.date); view = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    toast((isNew ? "已儲存，並建立新客人 ✨" : "已儲存 ✨") + (artAdded ? "　🎨 已加進似顏繪排程" : ""));
  } catch {}
};
$("#bkDel").onclick = async () => {
  if (!editing || !confirm(`確定要刪除「${editing.pet}」${dLabel(editing.date)} ${editing.time} 的預約嗎？\n（如果只是客人取消，建議把狀態改成「已取消」）`)) return;
  bkDlg.close(); await del("bookings", editing.id); toast("已刪除");
};

async function quickPayAll(id) {
  const b = DB.bookings.find(x => x.id === id); if (!b) return;
  const nb = { ...b };
  if (num(nb.total) === null) { const v = prompt("請輸入總金額"); if (v === null || num(v) === null) return; nb.total = num(v); }
  const p0 = pay(nb);
  if (!confirm(`「${nb.pet}」標記為已付清？\n總金額 ${money(nb.total)}（尚未收 ${money(p0.outstanding)}）`)) return;
  nb.depositPaid = (num(nb.deposit) || 0) > 0; nb.balancePaid = true; nb.paidAt = todayStr();
  try { await put("bookings", nb); toast("已付清 ✔"); } catch {}
}

// ================= 客人表單 =================
let editingCust = null;
const custDlg = $("#custDlg");
function openCustomer(c) {
  editingCust = c;
  const s = custStats(c);
  $("#custTitle").textContent = c.name;
  $("#custStats").innerHTML = [["p", "來過次數", s.visits + " 次"], ["b", "預約總數", s.total + " 筆"], ["g", "累計付款", money(s.spent)], ["y", "下次預約", s.next ? `${dLabel(s.next.date)} ${s.next.time}` : "—"]]
    .map(([k, l, v]) => `<div class="sc ${k}"><span>${l}</span><b>${v}</b></div>`).join("");
  $("#c_name").value = c.name; $("#c_source").innerHTML = opts(SOURCES, c.source, "請選擇");
  $("#c_contact").value = c.contact || ""; $("#c_note").value = c.note || "";
  $("#custHistory").innerHTML = s.list.length ? [...s.list].reverse().map(b => rowHtml(b, true)).join("") : `<div class="empty">還沒有預約紀錄</div>`;
  custDlg.showModal();
}
$("#custForm").onsubmit = async e => {
  e.preventDefault();
  const name = $("#c_name").value.trim(); if (!name) return;
  const dup = DB.customers.find(x => x.id !== editingCust.id && x.name.trim() === name);
  if (dup) return toast("已經有同名的客人了，請換個名字（例如加上寵物名）");
  custDlg.close();
  try { await put("customers", { ...editingCust, name, source: $("#c_source").value, contact: $("#c_contact").value.trim(), note: $("#c_note").value.trim() }); toast("客人資料已儲存"); } catch {}
};
$("#custDel").onclick = async () => {
  const n = DB.bookings.filter(b => b.customerId === editingCust.id).length;
  if (n) return toast(`這位客人還有 ${n} 筆預約，請先刪除預約紀錄`);
  if (!confirm(`刪除客人「${editingCust.name}」？`)) return;
  custDlg.close(); await del("customers", editingCust.id); toast("已刪除");
};
$("#custBook").onclick = () => { custDlg.close(); openBooking(null, { customerName: editingCust.name, source: editingCust.source, date: selDay }); };

// ================= 時段設定 =================
const cfg = () => DB.settings[0] ? { ...DEFAULT_CFG, ...DB.settings[0] } : { ...DEFAULT_CFG };
const sortT = a => [...new Set(a)].sort();
const isTime = x => /^\d{2}:\d{2}$/.test(x || "");
// 某一天：固定時段、加開、封鎖、公休、已被預約
function dayTimes(date) {
  const c = cfg(), wd = parseYmd(date).getDay();
  const base = (c.weekly[wd] || []).slice();
  const extra = (c.extra[date] || []).filter(x => !base.includes(x));
  const blocked = c.blocked[date] || [];
  const closed = !!c.closed[date];
  const taken = DB.bookings.filter(b => b.date === date && ["booked", "pending"].includes(b.status) && isTime(b.time)).map(b => b.time);
  const open = closed ? [] : sortT([...base, ...extra]).filter(x => !blocked.includes(x) && !taken.includes(x));
  return { base, extra, blocked, closed, taken, open };
}
async function saveCfg(next, msg) {
  const c = { ...cfg(), ...next, id: "config01" };
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v && (!Array.isArray(v) || v.length)));
  c.closed = clean(c.closed); c.extra = clean(c.extra); c.blocked = clean(c.blocked);
  try { await put("settings", c); toast(msg || "時段已更新 ✨"); $("#slotSaved").textContent = "已儲存 " + nowHM(); } catch {}
}
const timeSelect = (attrs, exclude = [], label = "＋ 加時段") =>
  `<select class="tadd" ${attrs}><option value="">${label}</option>${TIMES.filter(t => !exclude.includes(t)).map(t => `<option>${t}</option>`).join("")}</select>`;

function renderSlots() {
  const c = cfg(), order = [1, 2, 3, 4, 5, 6, 0];
  $("#weekly").innerHTML = order.map(wd => `<div class="wk-row"><b>週${WD[wd]}</b><div class="tchips">
    ${(c.weekly[wd] || []).map(t => `<span class="tchip">${t}<button type="button" data-wkdel="${wd}|${t}" aria-label="刪除">✕</button></span>`).join("")}
    ${timeSelect(`data-wkadd="${wd}"`, c.weekly[wd] || [])}
    ${(c.weekly[wd] || []).length ? "" : `<span class="muted small">公休</span>`}</div></div>`).join("");
  $("#weekly").querySelectorAll("[data-wkdel]").forEach(b => b.onclick = () => {
    const [wd, t] = b.dataset.wkdel.split("|"); const w = { ...cfg().weekly }; w[wd] = (w[wd] || []).filter(x => x !== t);
    saveCfg({ weekly: w }, `週${WD[wd]} 已移除 ${t}`);
  });
  $("#weekly").querySelectorAll("[data-wkadd]").forEach(sel => sel.onchange = () => {
    if (!sel.value) return; const wd = sel.dataset.wkadd; const w = { ...cfg().weekly }; w[wd] = sortT([...(w[wd] || []), sel.value]);
    saveCfg({ weekly: w }, `週${WD[wd]} 已加開 ${sel.value}`);
  });
  const t = todayStr();
  const dates = [...new Set([...Object.keys(c.closed), ...Object.keys(c.extra), ...Object.keys(c.blocked)])].filter(d => d >= t).sort();
  $("#specialList").innerHTML = dates.length ? dates.map(d => {
    const x = dayTimes(d);
    const parts = [x.closed ? "🚫 公休" : "", x.extra.length ? `＋加開 ${x.extra.join("、")}` : "", x.blocked.length ? `封鎖 ${x.blocked.join("、")}` : ""].filter(Boolean);
    return `<div class="sp-row" data-goday="${d}"><b>${dLabel(d)}</b><span>${parts.join("｜")}</span></div>`;
  }).join("") : `<div class="empty">沒有特別設定，全部照每週固定時段</div>`;
}

function renderDayCtl() {
  const box = $("#dayCtl"); if (!box) return;
  const x = dayTimes(selDay), past = selDay < todayStr();
  if (past) { box.innerHTML = ""; return; }
  const c = cfg();
  const openTxt = x.closed ? "" : (x.open.length ? `客人可以選：${x.open.join("、")}` : "這天沒有可預約的時段");
  box.innerHTML = `
    <div class="dc-top">
      ${x.closed ? `<button class="btn small" type="button" id="dcOpen">↩ 取消公休</button>` : `<button class="btn small off" type="button" id="dcClose">🚫 設為公休</button>`}
      <span class="muted small">${esc(openTxt)}</span>
    </div>
    ${x.closed ? `<div class="closed-note">這天是公休，客人看不到任何時段。</div>` : `
    <div class="dc-box">
      <h4>這天的固定時段（週${WD[parseYmd(selDay).getDay()]}）</h4>
      <div class="tchips">${x.base.length ? x.base.map(t => `<span class="tchip ${x.blocked.includes(t) ? "block" : ""} ${x.taken.includes(t) ? "taken" : ""}">${t}${x.taken.includes(t) ? "・已約" : ""}</span>`).join("") : `<span class="muted small">沒有固定時段</span>`}</div>
    </div>
    <div class="dc-box extra">
      <h4>＋ 本日加開時段（除了固定時段之外，額外多開放的時間）</h4>
      <div class="tchips">${x.extra.map(t => `<span class="tchip extra">${t}<button type="button" data-exdel="${t}" aria-label="取消加開">✕</button></span>`).join("")}
        ${timeSelect('id="dcExtra"', [...x.base, ...x.extra], "＋ 加開時段")}</div>
    </div>
    <div class="dc-box block">
      <h4>🚫 本日封鎖時段（臨時抽掉單一時段，其他時段照常開放）</h4>
      <div class="tchips">${x.blocked.map(t => `<span class="tchip block">${t}<button type="button" data-bldel="${t}" aria-label="取消封鎖">✕</button></span>`).join("")}
        ${x.base.filter(t => !x.blocked.includes(t)).length ? `<select class="tadd" id="dcBlock"><option value="">＋ 封鎖時段</option>${x.base.filter(t => !x.blocked.includes(t)).map(t => `<option>${t}</option>`).join("")}</select>` : ""}</div>
    </div>`}`;
  const d = selDay;
  const set = (k, v) => { const o = { ...c[k] }; o[d] = v; return { [k]: o }; };
  $("#dcClose") && ($("#dcClose").onclick = () => saveCfg(set("closed", true), `${dLabel(d)} 設為公休`));
  $("#dcOpen") && ($("#dcOpen").onclick = () => saveCfg(set("closed", false), `${dLabel(d)} 已取消公休`));
  $("#dcExtra") && ($("#dcExtra").onchange = e => e.target.value && saveCfg(set("extra", sortT([...(c.extra[d] || []), e.target.value])), `${dLabel(d)} 加開 ${e.target.value}`));
  $("#dcBlock") && ($("#dcBlock").onchange = e => e.target.value && saveCfg(set("blocked", sortT([...(c.blocked[d] || []), e.target.value])), `${dLabel(d)} 封鎖 ${e.target.value}`));
  box.querySelectorAll("[data-exdel]").forEach(b => b.onclick = () => saveCfg(set("extra", (c.extra[d] || []).filter(t => t !== b.dataset.exdel)), "已取消加開"));
  box.querySelectorAll("[data-bldel]").forEach(b => b.onclick = () => saveCfg(set("blocked", (c.blocked[d] || []).filter(t => t !== b.dataset.bldel)), "已取消封鎖"));
}

// ================= 網站預約（待確認） =================
function renderPending() {
  const list = DB.bookings.filter(b => b.status === "pending").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  $("#pendingPanel").classList.toggle("hidden", !list.length);
  $("#pendingCnt").textContent = list.length ? `${list.length} 筆` : "";
  $("#pendingList").innerHTML = list.map(b => rowHtml(b, true)).join("");
  const tb = document.querySelector('.tab[data-tab="day"]');
  if (tb) { let c = tb.querySelector(".tab-cnt"); if (!c) { c = document.createElement("span"); c.className = "tab-cnt alert"; tb.append(c); }
    c.textContent = list.length; c.classList.toggle("hidden", !list.length); }
}

// ================= 似顏繪排程 =================
function dueInfo(a) {
  if (!a.due) return { text: "完成日未定", cls: "" };
  const days = Math.round((parseYmd(a.due) - parseYmd(todayStr())) / 86400e3);
  if (a.status === "shipped") return { text: `完成日 ${dLabel(a.due)}`, cls: "" };
  if (days < 0) return { text: `已超過 ${-days} 天（${dLabel(a.due)}）`, cls: "late" };
  if (days === 0) return { text: `今天要完成（${dLabel(a.due)}）`, cls: "soon" };
  return { text: `還有 ${days} 天（${dLabel(a.due)}）`, cls: days <= 3 ? "soon" : "" };
}
function renderArts() {
  const open = DB.arts.filter(a => a.status !== "shipped").length;
  const c = $("#artCnt"); c.textContent = open; c.classList.toggle("hidden", !open);
  if (tab !== "arts") return;
  $("#artSum").innerHTML = ART_ORDER.map(k => `<span>${ART_STATUS[k]}<b>${DB.arts.filter(a => a.status === k).length}</b></span>`).join("");
  const sortDue = (x, y) => (x.due || "9999").localeCompare(y.due || "9999");
  $("#artBoard").innerHTML = ART_ORDER.map((k, i) => {
    let list = DB.arts.filter(a => a.status === k).sort(sortDue);
    if (k === "shipped") list = list.sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).slice(0, 12);
    return `<div class="art-col"><h4>${ART_STATUS[k]} <em>${DB.arts.filter(a => a.status === k).length}</em></h4>
      ${list.map(a => { const d = dueInfo(a); return `<div class="acard" data-art="${a.id}">
        <b>🎨 ${esc(a.pet)}｜${esc(a.customerName)}</b>
        <div class="due ${d.cls}">${d.text}</div>
        <div class="meta">${esc(a.frame || "畫框未選")}${a.photos ? "・✔ 照片已收到" : "・照片還沒收到"}</div>
        ${a.tracking ? `<div class="meta">物流：${esc(a.tracking)}</div>` : ""}
        <div class="acts">${i > 0 ? `<button class="btn" type="button" data-artmove="${a.id}" data-dir="-1">←</button>` : ""}${i < ART_ORDER.length - 1 ? `<button class="btn soft" type="button" data-artmove="${a.id}" data-dir="1">${ART_STATUS[ART_ORDER[i + 1]]} →</button>` : ""}</div>
      </div>`; }).join("") || `<div class="empty">沒有</div>`}
    </div>`;
  }).join("");
}
let editingArt = null;
const artDlg = $("#artDlg");
function fillArtDate(due) {
  const y0 = new Date().getFullYear(), d = due ? parseYmd(due) : null;
  $("#a_y").innerHTML = `<option value="">未定</option>` + [y0 - 1, y0, y0 + 1, y0 + 2].map(y => `<option value="${y}" ${d && d.getFullYear() === y ? "selected" : ""}>${y} 年</option>`).join("");
  $("#a_m").innerHTML = `<option value="">月</option>` + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${d && d.getMonth() === i ? "selected" : ""}>${i + 1} 月</option>`).join("");
  fillArtDays(d ? d.getDate() : 0);
}
function fillArtDays(keep) {
  const y = +$("#a_y").value, m = +$("#a_m").value;
  if (!y || !m) { $("#a_d").innerHTML = `<option value="">日</option>`; return; }
  const n = new Date(y, m, 0).getDate(), cur = Math.min(keep || +$("#a_d").value || 0, n);
  $("#a_d").innerHTML = `<option value="">日</option>` + Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${i + 1 === cur ? "selected" : ""}>${i + 1} 日（${WD[new Date(y, m - 1, i + 1).getDay()]}）</option>`).join("");
}
$("#a_y").onchange = () => fillArtDays(); $("#a_m").onchange = () => fillArtDays();
function openArt(a, preset = {}) {
  editingArt = a ? { ...a } : null;
  const x = a || { status: "queue", ...preset };
  $("#artTitle").textContent = a ? `🎨 ${a.pet} 的似顏繪` : "新增似顏繪";
  $("#a_customer").value = x.customerName || ""; $("#a_pet").value = x.pet || "";
  $("#a_status").innerHTML = ART_ORDER.map(k => `<option value="${k}" ${k === x.status ? "selected" : ""}>${ART_STATUS[k]}</option>`).join("");
  $("#a_frame").innerHTML = opts(FRAMES, x.frame, "還沒選");
  fillArtDate(x.due || "");
  $("#a_photos").checked = !!x.photos;
  $("#a_address").value = x.address || ""; $("#a_tracking").value = x.tracking || ""; $("#a_note").value = x.note || "";
  const bk = x.bookingId && DB.bookings.find(b => b.id === x.bookingId);
  $("#a_from").textContent = bk ? `來自預約：${dLabel(bk.date)} ${bk.time}｜${bk.service}` : "";
  $("#artDel").classList.toggle("hidden", !a);
  artDlg.showModal();
}
$("#artForm").onsubmit = async e => {
  e.preventDefault();
  const name = $("#a_customer").value.trim(), pet = $("#a_pet").value.trim();
  if (!name || !pet) return toast("請填寫客人和寵物名字");
  const y = $("#a_y").value, m = $("#a_m").value, d = $("#a_d").value;
  if ((y || m || d) && !(y && m && d)) return toast("預計完成日請選完整的年、月、日，或都選「未定」");
  const c = findCustomerByName(name);
  const a = { ...(editingArt || { id: uid(), createdAt: Date.now() }), customerName: name, customerId: c ? c.id : (editingArt && editingArt.customerId) || "",
    pet, status: $("#a_status").value, frame: $("#a_frame").value, due: y ? `${y}-${pad(m)}-${pad(d)}` : "",
    photos: $("#a_photos").checked, address: $("#a_address").value.trim(), tracking: $("#a_tracking").value.trim(), note: $("#a_note").value.trim() };
  artDlg.close();
  try { await put("arts", a); toast("似顏繪排程已儲存 🎨"); } catch {}
};
$("#artDel").onclick = async () => {
  if (!editingArt || !confirm(`刪除「${editingArt.pet}」的似顏繪排程？`)) return;
  artDlg.close(); await del("arts", editingArt.id); toast("已刪除");
};
$("#artAdd").onclick = () => openArt(null);
async function moveArt(id, dir) {
  const a = DB.arts.find(x => x.id === id); if (!a) return;
  const i = ART_ORDER.indexOf(a.status) + dir;
  if (i < 0 || i >= ART_ORDER.length) return;
  try { await put("arts", { ...a, status: ART_ORDER[i] }); toast(`「${a.pet}」→ ${ART_STATUS[ART_ORDER[i]]}`); } catch {}
}

// ================= 事件 =================
document.addEventListener("click", e => {
  const am = e.target.closest("[data-artmove]"); if (am) { e.stopPropagation(); return moveArt(am.dataset.artmove, +am.dataset.dir); }
  const ac = e.target.closest("[data-art]"); if (ac) { const a = DB.arts.find(x => x.id === ac.dataset.art); if (a) openArt(a); return; }
  const pa = e.target.closest("[data-payall]"); if (pa) { e.stopPropagation(); return quickPayAll(pa.dataset.payall); }
  const bk = e.target.closest("[data-bk]"); if (bk) { const b = DB.bookings.find(x => x.id === bk.dataset.bk); if (b) { if (custDlg.open) custDlg.close(); openBooking(b); } return; }
  const cu = e.target.closest("[data-cust]"); if (cu) { const c = DB.customers.find(x => x.id === cu.dataset.cust); if (c) openCustomer(c); return; }
  const gd = e.target.closest("[data-goday]");
  if (gd) { selDay = gd.dataset.goday; const dd = parseYmd(selDay); view = new Date(dd.getFullYear(), dd.getMonth(), 1); switchTab("day"); $("#tab-day").scrollIntoView({ behavior: "smooth" }); return; }
  const dy = e.target.closest("[data-day]");
  if (dy) {
    const same = selDay === dy.dataset.day;
    selDay = dy.dataset.day;
    if (tab !== "day") switchTab("day");
    render();
    if (same && !DB.bookings.some(b => b.date === selDay)) openBooking(null, { date: selDay });
    else $("#tab-day").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (e.target.closest("[data-close]")) { e.target.closest("dialog").close(); return; }
  if (!e.target.closest(".menu")) $("#menuPop").classList.add("hidden");
});
$("#addBtn").onclick = () => openBooking(null, { date: selDay });
$("#dayAdd").onclick = () => openBooking(null, { date: selDay });
$("#prevM").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); };
$("#nextM").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); };
$("#goToday").onclick = () => { const d = new Date(); view = new Date(d.getFullYear(), d.getMonth(), 1); selDay = todayStr(); render(); };
function switchTab(t) {
  tab = t;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x.dataset.tab === t));
  ["day", "customers", "arts", "slots", "stats"].forEach(k => $("#tab-" + k).classList.toggle("hidden", k !== t));
  if (t === "stats") fillStatMonth();
  render();
}
document.querySelectorAll(".tab").forEach(x => x.onclick = () => switchTab(x.dataset.tab));
$("#custSearch").oninput = renderCustomers; $("#custSort").onchange = renderCustomers;
$("#statMonth").onchange = renderStats;
document.querySelectorAll("#statRange button").forEach(bt => bt.onclick = () => {
  statRange = bt.dataset.r; document.querySelectorAll("#statRange button").forEach(x => x.classList.toggle("on", x === bt)); fillStatMonth(); renderStats();
});
// 手機左右滑動切換月份
let tx = null;
$("#calGrid").addEventListener("touchstart", e => tx = e.touches[0].clientX, { passive: true });
$("#calGrid").addEventListener("touchend", e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 60) (dx < 0 ? $("#nextM") : $("#prevM")).click(); });

// 選單
$("#menuBtn").onclick = () => $("#menuPop").classList.toggle("hidden");
$("#mRefresh").onclick = () => { $("#menuPop").classList.add("hidden"); loadAll().catch(e => toast(e.message)); };
$("#mLogout").onclick = async () => { ls.del(CACHE_KEY); if (F) await F.auth.signOut(F.au); location.reload(); };
$("#mExport").onclick = () => {
  $("#menuPop").classList.add("hidden");
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `yura-備份-${todayStr()}.json`; a.click();
};
$("#mImport").onclick = () => { $("#menuPop").classList.add("hidden"); $("#importFile").click(); };
$("#importFile").onchange = async e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = "";
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.bookings) || !Array.isArray(d.customers)) throw new Error("檔案格式不對");
    d.arts ||= [];
    if (!confirm(`匯入 ${d.customers.length} 位客人、${d.bookings.length} 筆預約、${d.arts.length} 筆似顏繪？（相同的資料會被覆蓋）`)) return;
    if (true) { await importAll(d); }
    else { for (const k of ["bookings", "customers", "arts"]) (d[k] || []).forEach(x => { const i = DB[k].findIndex(y => y.id === x.id); i >= 0 ? DB[k][i] = x : DB[k].push(x); }); persistLocal(); render(); }
    toast("匯入完成");
  } catch (err) { toast("匯入失敗：" + err.message); }
};

// 多裝置：回到畫面或每 2 分鐘自動同步
document.addEventListener("visibilitychange", () => { if (!document.hidden && mode === "cloud" && F && F.au.currentUser && !bkDlg.open && !custDlg.open && !$("#artDlg").open) loadAll().catch(() => {}); });
setInterval(() => { if (!document.hidden && mode === "cloud" && F && F.au.currentUser && !bkDlg.open && !custDlg.open && !$("#artDlg").open) loadAll().catch(() => {}); }, 120000);
setInterval(renderToday, 60000);

boot();
})();
