// 資料存取層：有 Firebase 設定就用 Firebase，沒有就用「示範模式」（瀏覽器 localStorage）
import { CONFIG } from "./config.js";

export const isDemo = !(CONFIG.firebase && CONFIG.firebase.apiKey && CONFIG.firebase.projectId);

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
let _fb = null;
async function fb() {
  if (_fb) return _fb;
  const [app, fs, auth] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-firestore.js"),
    import(FB + "firebase-auth.js")
  ]);
  const a = app.initializeApp(CONFIG.firebase);
  _fb = { fs, auth, db: fs.getFirestore(a), au: auth.getAuth(a) };
  return _fb;
}

// ---------- 共用工具 ----------
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, x => ALPHA[x % ALPHA.length]).join("");
}
export const fmtCode = c => (c || "").replace(/^(.{4})(.{4})$/, "$1-$2");
export const normCode = c => (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// 台灣時間 → 毫秒
export function slotAt(date, time) { return new Date(`${date}T${time}:00+08:00`).getTime(); }
const WD = ["日", "一", "二", "三", "四", "五", "六"];
export function slotLabel(s) {
  const d = new Date(s.at + 8 * 3600e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）${s.time}`;
}
const toMs = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);

// ---------- 示範模式 ----------
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("yura_demo_" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("yura_demo_" + k, JSON.stringify(v)); } catch {} window.dispatchEvent(new Event("yura-demo-change")); }
};
const SEED_VERSION = 6;
export const timesFor = date => { const wd = new Date(date + "T00:00:00Z").getUTCDay(); const o = CONFIG.defaults.weekdayOverride || {};
  return o[wd] || ((wd === 0 || wd === 6) ? CONFIG.defaults.weekendTimes : CONFIG.defaults.weekdayTimes); };
function demoSeedSlots() {
  if (LS.get("seeded", 0) === SEED_VERSION) return;
  // 保留客人已經選走的時段，其他依照每天固定時段重新產生
  const slots = Object.fromEntries(Object.entries(LS.get("slots", {})).filter(([, s]) => s.status !== "open"));
  const now = Date.now();
  for (let i = 0; i <= 75; i++) {
    const d = new Date(now + i * 86400e3 + 8 * 3600e3);
    const date = d.toISOString().slice(0, 10);
    for (const time of timesFor(date)) {
      if (Object.values(slots).some(s => s.date === date && s.time === time)) continue;
      slots[newCode()] = { date, time, at: slotAt(date, time), status: "open" };
    }
  }
  LS.set("slots", slots);
  LS.set("seeded", SEED_VERSION);
}
function onDemo(cb) {
  const h = () => cb();
  window.addEventListener("yura-demo-change", h);
  window.addEventListener("storage", h);
  h();
  return () => { window.removeEventListener("yura-demo-change", h); window.removeEventListener("storage", h); };
}

// ---------- 公開：網站設定 ----------
export async function getSettings() {
  let s = {};
  try {
    if (isDemo) s = LS.get("settings", {});
    else {
      const { fs, db } = await fb();
      const snap = await fs.getDoc(fs.doc(db, "settings", "public"));
      s = snap.exists() ? snap.data() : {};
    }
  } catch (e) { console.warn("settings", e); }
  return { ...CONFIG.defaults, ...s };
}

// ---------- 公開：可預約時段 ----------
// ---------- 後台（Netlify）連線 ----------
let remote = null; // 讀到後台設定時 = { byId: {slotId: {date,time}} }
async function fetchJSON(url, opts = {}, ms = 6000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); const d = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, data: d }; }
  finally { clearTimeout(t); }
}
async function remoteSlots(now) {
  if (!CONFIG.managerApi) return null;
  try {
    const r = await fetchJSON(CONFIG.managerApi + "/availability");
    if (!r.ok || !r.data || !r.data.weekly) return null;
    const { weekly, closed = {}, extra = {}, blocked = {}, taken = [] } = r.data;
    const takenSet = new Set(taken), out = [], byId = {};
    for (let i = 0; i <= 75; i++) {
      const date = new Date(Date.now() + 8 * 3600e3 + i * 86400e3).toISOString().slice(0, 10);
      if (closed[date]) continue;
      const wd = new Date(date + "T00:00:00Z").getUTCDay();
      const times = [...new Set([...(weekly[wd] || []), ...(extra[date] || [])])].sort();
      for (const time of times) {
        if ((blocked[date] || []).includes(time) || takenSet.has(date + " " + time)) continue;
        const at = slotAt(date, time); if (at <= now) continue;
        const id = date.replace(/-/g, "") + time.replace(":", "");
        out.push({ id, date, time, at, status: "open" }); byId[id] = { date, time };
      }
    }
    remote = { byId };
    return out;
  } catch (e) { console.warn("後台連不上，改用固定時段", e); return null; }
}

export async function listOpenSlots() {
  const now = Date.now() + 2 * 3600e3; // 2 小時內的時段不開放
  const r = await remoteSlots(now);
  if (r) return r;
  remote = null;
  let arr = [];
  if (isDemo) {
    demoSeedSlots();
    arr = Object.entries(LS.get("slots", {})).map(([id, s]) => ({ id, ...s }));
  } else {
    const { fs, db } = await fb();
    const q = fs.query(fs.collection(db, "slots"), fs.where("status", "==", "open"));
    const snap = await fs.getDocs(q);
    arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const full = CONFIG.defaults.fullSlots || {};
  return arr.filter(s => s.status === "open" && s.at > now)
    .map(s => (full[s.date] || []).includes(s.time) ? { ...s, status: "full" } : s)
    .sort((a, b) => a.at - b.at);
}

// ---------- 公開：送出預約 ----------
export async function createBooking(data) {
  const code = newCode();
  const slotIds = data.slotIds || [];
  if (remote && CONFIG.managerApi) {
    const ownerName = ((data.fields || []).find(f => f.key === "ownerName") || {}).value || "";
    const body = { ...data, picks: slotIds.map(id => remote.byId[id]).filter(Boolean), email: (data.customer || {}).email || "", ownerName };
    let r = null;
    try { r = await fetchJSON(CONFIG.managerApi + "/booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 10000); }
    catch (e) { console.warn("送到後台失敗，只傳 LINE", e); }
    if (r && r.status === 409) throw new Error("SLOT_TAKEN");
    return code;
  }
  if (isDemo) {
    const slots = LS.get("slots", {});
    for (const id of slotIds) if (!slots[id] || slots[id].status !== "open") throw new Error("SLOT_TAKEN");
    for (const id of slotIds) slots[id].status = "held";
    const bookings = LS.get("bookings", {});
    bookings[code] = { ...data, status: "new", createdAt: Date.now() };
    LS.set("slots", slots);
    LS.set("bookings", bookings);
    return code;
  }
  const { fs, db } = await fb();
  await fs.runTransaction(db, async tx => {
    const refs = slotIds.map(id => fs.doc(db, "slots", id));
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    if (snaps.some(s => !s.exists() || s.data().status !== "open")) throw new Error("SLOT_TAKEN");
    tx.set(fs.doc(db, "bookings", code), { ...data, status: "new", createdAt: fs.serverTimestamp() });
    refs.forEach(r => tx.update(r, { status: "held" }));
  });
  return code;
}

// ---------- 公開：查詢預約 ----------
export async function getBooking(code) {
  code = normCode(code);
  if (!/^[A-Z0-9]{8}$/.test(code)) return null;
  if (isDemo) {
    const b = LS.get("bookings", {})[code];
    return b ? { id: code, ...b } : null;
  }
  const { fs, db } = await fb();
  try {
    const snap = await fs.getDoc(fs.doc(db, "bookings", code));
    return snap.exists() ? { id: code, ...snap.data(), createdAt: toMs(snap.data().createdAt) } : null;
  } catch (e) { console.warn(e); return null; }
}

// =====================================================
//  後台（需要登入）
// =====================================================
export function onAdmin(cb) {
  if (isDemo) { queueMicrotask(() => cb(LS.get("demoAdmin", false) ? { email: "示範管理員" } : null)); return () => {}; }
  let unsub = () => {};
  fb().then(({ auth, au }) => { unsub = auth.onAuthStateChanged(au, u => cb(u)); });
  return () => unsub();
}
export async function adminLogin(email, pw) {
  if (isDemo) { LS.set("demoAdmin", true); return; }
  const { auth, au } = await fb();
  await auth.signInWithEmailAndPassword(au, email, pw);
}
export async function adminLogout() {
  if (isDemo) { LS.set("demoAdmin", false); return; }
  const { auth, au } = await fb();
  await auth.signOut(au);
}

export function watchBookings(cb, onErr) {
  if (isDemo) return onDemo(() => cb(Object.entries(LS.get("bookings", {})).map(([id, b]) => ({ id, ...b })).sort((a, b) => b.createdAt - a.createdAt)));
  let unsub = () => {};
  fb().then(({ fs, db }) => {
    const q = fs.query(fs.collection(db, "bookings"), fs.orderBy("createdAt", "desc"), fs.limit(500));
    unsub = fs.onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: toMs(d.data().createdAt) || Date.now() }))), onErr);
  });
  return () => unsub();
}

export function watchSlots(cb, onErr) {
  if (isDemo) { demoSeedSlots(); return onDemo(() => cb(Object.entries(LS.get("slots", {})).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.at - b.at))); }
  let unsub = () => {};
  fb().then(({ fs, db }) => {
    const q = fs.query(fs.collection(db, "slots"), fs.where("at", ">=", Date.now() - 14 * 86400e3));
    unsub = fs.onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at)), onErr);
  });
  return () => unsub();
}

// 一次更新多筆：{ bookings: {id: patch}, slots: {id: patch|null(刪除)} , newSlots: [..] }
export async function adminWrite({ bookings = {}, slots = {}, newSlots = [], deleteBookings = [] }) {
  if (isDemo) {
    const B = LS.get("bookings", {}), S = LS.get("slots", {});
    for (const [id, p] of Object.entries(bookings)) if (B[id]) B[id] = { ...B[id], ...p, updatedAt: Date.now() };
    for (const id of deleteBookings) delete B[id];
    for (const [id, p] of Object.entries(slots)) { if (p === null) delete S[id]; else if (S[id]) S[id] = { ...S[id], ...p }; }
    for (const s of newSlots) S[newCode()] = s;
    LS.set("bookings", B); LS.set("slots", S);
    return;
  }
  const { fs, db } = await fb();
  const ops = [];
  for (const [id, p] of Object.entries(bookings)) ops.push(b => b.update(fs.doc(db, "bookings", id), { ...p, updatedAt: fs.serverTimestamp() }));
  for (const id of deleteBookings) ops.push(b => b.delete(fs.doc(db, "bookings", id)));
  for (const [id, p] of Object.entries(slots)) ops.push(b => p === null ? b.delete(fs.doc(db, "slots", id)) : b.update(fs.doc(db, "slots", id), p));
  for (const s of newSlots) ops.push(b => b.set(fs.doc(fs.collection(db, "slots")), s));
  for (let i = 0; i < ops.length; i += 450) {
    const batch = fs.writeBatch(db);
    ops.slice(i, i + 450).forEach(op => op(batch));
    await batch.commit();
  }
}

export async function saveSettings(s) {
  if (isDemo) { LS.set("settings", s); return; }
  const { fs, db } = await fb();
  await fs.setDoc(fs.doc(db, "settings", "public"), s, { merge: true });
}

export function resetDemo() {
  ["slots", "bookings", "settings", "seeded", "demoAdmin"].forEach(k => localStorage.removeItem("yura_demo_" + k));
  window.dispatchEvent(new Event("yura-demo-change"));
}
