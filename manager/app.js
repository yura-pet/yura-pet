/* Yura 預約管理系統 */
(() => {
"use strict";

// ================= 選項（要改選項就改這裡） =================
const SOURCES  = ["官方LINE", "IG", "介紹"];
const CHANNELS = ["官方LINE", "IG"];
const METHODS  = ["文字", "語音", "視訊"];
const SERVICES = [
  "一般溝通｜單寵", "一般溝通｜多寵（2 隻）", "一般溝通｜三寵（3 隻）", "一般溝通｜緊急",
  "套組｜一般溝通單寵＋似顏繪", "套組｜一般溝通雙寵＋似顏繪", "套組｜一般溝通三寵＋似顏繪",
  "離世溝通", "離世溝通＋超度", "確認轉世（炁絡筆／打聖杯）",
  "套組｜離世溝通＋似顏繪", "套組｜離世溝通＋超度＋似顏繪",
  "找寵｜奇門遁甲方案", "找寵｜寵物溝通", "找寵｜生死測算",
  "套組｜找寵溝通＋似顏繪", "套組｜奇門遁甲＋似顏繪",
  "似顏繪｜手繪", "其他"
];
const STATUS = { booked: "已預約", done: "已完成", cancelled: "已取消" };
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

// ================= 資料層 =================
const PW_KEY = "yura_mgr_pw", LOCAL_KEY = "yura_mgr_local", CACHE_KEY = "yura_mgr_cache";
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
let mode = "cloud"; // cloud | local
let password = ls.get(PW_KEY) || sessionStorage.getItem(PW_KEY) || "";
let DB = { bookings: [], customers: [] };

async function api(method, path, body) {
  const r = await fetch("/api/" + path, {
    method, headers: { "content-type": "application/json", authorization: "Bearer " + password },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error((data && data.error) || ("HTTP " + r.status)); e.status = r.status; e.noApi = !data; throw e; }
  return data;
}
function persistLocal() { if (mode === "local") ls.set(LOCAL_KEY, JSON.stringify(DB)); else ls.set(CACHE_KEY, JSON.stringify(DB)); }
function setSync(t) { $("#syncState").textContent = t; }

async function loadAll() {
  if (mode === "local") { try { DB = JSON.parse(ls.get(LOCAL_KEY)) || DB; } catch {} render(); return; }
  setSync("同步中…");
  const d = await api("GET", "data");
  DB = { bookings: d.bookings || [], customers: d.customers || [] };
  persistLocal(); render();
  setSync("已同步 " + nowHM());
}
async function put(kind, item) {
  const list = DB[kind], i = list.findIndex(x => x.id === item.id);
  item.updatedAt = Date.now();
  if (i >= 0) list[i] = item; else list.push(item);
  persistLocal(); render();
  if (mode === "cloud") {
    setSync("儲存中…");
    try { await api("PUT", `${kind}/${item.id}`, item); setSync("已同步 " + nowHM()); }
    catch (e) { setSync("⚠️ 儲存失敗"); toast("儲存到雲端失敗：" + e.message); throw e; }
  }
}
async function del(kind, id) {
  DB[kind] = DB[kind].filter(x => x.id !== id);
  persistLocal(); render();
  if (mode === "cloud") {
    try { await api("DELETE", `${kind}/${id}`); setSync("已同步 " + nowHM()); }
    catch (e) { toast("刪除失敗：" + e.message); loadAll(); }
  }
}

// ================= 啟動 / 登入 =================
async function boot() {
  try {
    if (location.protocol === "file:") throw Object.assign(new Error("file"), { noApi: true });
    await api("GET", "ping");
    mode = "cloud";
  } catch (e) {
    if (e.status === 401) return showLogin(password ? "密碼錯誤，請重新輸入" : "");
    if (e.noApi || e.status === 404 || e.name === "TypeError") { mode = "local"; }
    else return showLogin(e.message);
  }
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  const bar = $("#modeBar");
  if (mode === "local") {
    bar.innerHTML = "目前是「本機模式」：資料只存在這台裝置的瀏覽器。部署到 Netlify 後就能多裝置同步（見 README）。";
    bar.classList.remove("hidden");
    setSync("本機模式");
    $("#mLogout").classList.add("hidden");
  } else {
    try { const c = JSON.parse(ls.get(CACHE_KEY)); if (c) { DB = c; render(); } } catch {}
  }
  try { await loadAll(); } catch (e) { setSync("⚠️ 無法同步"); toast("讀取資料失敗：" + e.message); render(); }
}
function showLogin(msg) {
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  $("#loginErr").textContent = msg || "";
  setTimeout(() => $("#pw").focus(), 50);
}
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  password = $("#pw").value;
  ls.del(PW_KEY); sessionStorage.removeItem(PW_KEY);
  if ($("#remember").checked) ls.set(PW_KEY, password); else sessionStorage.setItem(PW_KEY, password);
  $("#loginErr").textContent = "登入中…";
  boot();
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
  $("#dl_customers").innerHTML = DB.customers.map(c => `<option value="${esc(c.name)}">`).join("");
}

function bookingLine(b) {
  const p = pay(b);
  return [b.service, b.method, b.channel && "於" + b.channel].filter(Boolean).join("・") + ` <span class="badge ${p.st}">${p.label}</span>` +
    (b.status !== "booked" ? ` <span class="badge st-${b.status}">${STATUS[b.status]}</span>` : "");
}

function renderToday() {
  const t = todayStr(), now = nowHM();
  $("#todayLabel").textContent = `${dLabel(t)}`;
  const list = DB.bookings.filter(b => b.date === t).sort(byTime);
  const live = list.filter(active);
  const nextB = live.find(b => b.time >= now && b.status === "booked");
  $("#todaySum").textContent = live.length ? `共 ${live.length} 個預約` : "";
  $("#todayList").innerHTML = list.length ? list.map(b => `
    <button type="button" class="tcard ${b === nextB ? "next" : ""} ${b.time < now && b !== nextB ? "past" : ""} ${b.status === "cancelled" ? "cancelled" : ""}" data-bk="${b.id}">
      <div class="tt">${esc(b.time)}</div>
      <div class="ti"><b>${esc(b.pet)}｜${esc(custName(b))}</b><span>${esc(b.service)}${b.method ? "・" + esc(b.method) : ""}</span>
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
  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i === 35 && d.getMonth() !== m) break;
    const s = ymd(d);
    const list = (map[s] || []).sort(byTime);
    const n = list.filter(active).length;
    const show = list.slice(0, 3);
    html += `<button type="button" class="day ${d.getMonth() !== m ? "out" : ""} ${s === t ? "today" : ""} ${s === selDay ? "sel" : ""}" data-day="${s}">
      <div class="dn"><span>${d.getDate()}</span>${n ? `<em>${n}</em>` : ""}</div>
      ${show.map(b => `<div class="chip st-${b.status} ${active(b) && pay(b).st !== "paid" ? "unpaid" : ""}"><b>${esc(b.time)}</b><span>${esc(b.pet)}</span></div>`).join("")}
      ${list.length > 3 ? `<div class="more">+${list.length - 3}</div>` : ""}
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
  const list = DB.bookings.filter(b => b.status === "booked" && b.date > t && b.date <= end).sort(byTime);
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
  $("#breakdowns").innerHTML = group("預約項目", b => b.service) + group("客人來源", b => b.source) + group("溝通方式", b => b.method) + group("溝通地點", b => b.channel)
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
  $("#f_service").innerHTML = opts(SERVICES, x.service, "請選擇");
  fillDateSelects(x.date);
  $("#f_time").innerHTML = opts(TIMES, x.time, "請選擇時間");
  $("#f_status").innerHTML = Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? "selected" : ""}>${v}</option>`).join("");
  $("#f_channel").innerHTML = opts(CHANNELS, x.channel, "請選擇");
  $("#f_method").innerHTML = opts(METHODS, x.method, "請選擇");
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
    source: $("#f_source").value, channel: $("#f_channel").value, method: $("#f_method").value,
    date: formDate(), time: $("#f_time").value, status: $("#f_status").value,
    ...p, paidAt: pay(p).st === "paid" ? (bkDlg.dataset.paidAt || todayStr()) : "", note: $("#f_note").value.trim()
  };
  const conflict = DB.bookings.find(x => x.id !== b.id && active(x) && b.status !== "cancelled" && x.date === b.date && x.time === b.time);
  if (conflict && !confirm(`${dLabel(b.date)} ${b.time} 已經有「${conflict.pet}｜${custName(conflict)}」的預約，還是要儲存嗎？`)) return;
  bkDlg.close();
  try {
    if (isNew) await put("customers", c);
    await put("bookings", b);
    selDay = b.date;
    const d = parseYmd(b.date); view = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    toast(isNew ? "已儲存，並建立新客人 ✨" : "已儲存 ✨");
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

// ================= 事件 =================
document.addEventListener("click", e => {
  const pa = e.target.closest("[data-payall]"); if (pa) { e.stopPropagation(); return quickPayAll(pa.dataset.payall); }
  const bk = e.target.closest("[data-bk]"); if (bk) { const b = DB.bookings.find(x => x.id === bk.dataset.bk); if (b) { if (custDlg.open) custDlg.close(); openBooking(b); } return; }
  const cu = e.target.closest("[data-cust]"); if (cu) { const c = DB.customers.find(x => x.id === cu.dataset.cust); if (c) openCustomer(c); return; }
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
  ["day", "customers", "stats"].forEach(k => $("#tab-" + k).classList.toggle("hidden", k !== t));
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
$("#mLogout").onclick = () => { ls.del(PW_KEY); sessionStorage.removeItem(PW_KEY); password = ""; ls.del(CACHE_KEY); location.reload(); };
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
    if (!confirm(`匯入 ${d.customers.length} 位客人、${d.bookings.length} 筆預約？（相同的資料會被覆蓋）`)) return;
    if (mode === "cloud") { await api("POST", "import", d); await loadAll(); }
    else { for (const k of ["bookings", "customers"]) d[k].forEach(x => { const i = DB[k].findIndex(y => y.id === x.id); i >= 0 ? DB[k][i] = x : DB[k].push(x); }); persistLocal(); render(); }
    toast("匯入完成");
  } catch (err) { toast("匯入失敗：" + err.message); }
};

// 多裝置：回到畫面或每 2 分鐘自動同步
document.addEventListener("visibilitychange", () => { if (!document.hidden && mode === "cloud" && password && !bkDlg.open && !custDlg.open) loadAll().catch(() => {}); });
setInterval(() => { if (!document.hidden && mode === "cloud" && !bkDlg.open && !custDlg.open) loadAll().catch(() => {}); }, 120000);
setInterval(renderToday, 60000);

boot();
})();
