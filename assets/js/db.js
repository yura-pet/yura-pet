// 資料存取層
// - 有填 Firebase 設定：可預約時段照「Yura 預約管理」後台的設定，客人送出的預約會直接存進後台
// - 沒填：照 config.js 的固定時段，預約只透過 LINE 傳送
import { CONFIG } from "./config.js?v=20261126d";

export const isLive = !!(CONFIG.firebase && CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
export const isDemo = !isLive;

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
let _fb = null;
async function fb() {
  if (_fb) return _fb;
  const [app, fs] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-firestore.js")]);
  const a = app.getApps().length ? app.getApp() : app.initializeApp(CONFIG.firebase);
  _fb = { fs, db: fs.getFirestore(a) };
  if (globalThis.__FB_EMULATOR__ && !globalThis.__FB_EMU_ON__) { globalThis.__FB_EMU_ON__ = 1; fs.connectFirestoreEmulator(_fb.db, "127.0.0.1", 8080); } // 只在本機測試時使用
  return _fb;
}

// ---------- 共用工具 ----------
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, x => ALPHA[x % ALPHA.length]).join("");
}
// 台灣時間 → 毫秒
export function slotAt(date, time) { return new Date(`${date}T${time}:00+08:00`).getTime(); }
const WD = ["日", "一", "二", "三", "四", "五", "六"];
export function slotLabel(s) {
  const d = new Date(s.at + 8 * 3600e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）${s.time}`;
}
const twToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
export const takenId = (date, time) => `${date}_${time}`;

// config.js 的固定時段（沒接後台時使用）
export const timesFor = date => {
  const wd = new Date(date + "T00:00:00Z").getUTCDay(); const o = CONFIG.defaults.weekdayOverride || {};
  return o[wd] || ((wd === 0 || wd === 6) ? CONFIG.defaults.weekendTimes : CONFIG.defaults.weekdayTimes);
};

// ---------- 公開：網站設定 ----------
export async function getSettings() { return { ...CONFIG.defaults }; }

// ---------- 公開：可預約時段 ----------
const DAYS_AHEAD = 75; // 開放約 2 個半月內的日期

async function liveRules() {
  const { fs, db } = await fb();
  const [cfgSnap, takenSnap] = await Promise.all([
    fs.getDoc(fs.doc(db, "settings", "config01")),
    fs.getDocs(fs.query(fs.collection(db, "taken"), fs.where("date", ">=", twToday())))
  ]);
  const c = cfgSnap.exists() ? cfgSnap.data() : null;
  const taken = new Set(takenSnap.docs.map(d => d.id));
  return { c, taken };
}

export async function listOpenSlots() {
  const now = Date.now() + 2 * 3600e3; // 2 小時內的時段不開放
  let c = null, taken = new Set();
  if (isLive) {
    try { ({ c, taken } = await liveRules()); }
    catch (e) { console.warn("讀不到後台時段，改用固定時段", e); }
  }
  // 後台有設定：完全照後台；還沒設定：用 config.js
  const full = c ? (c.full || {}) : (CONFIG.defaults.fullSlots || {}), hidden = c ? {} : (CONFIG.defaults.hiddenSlots || {});
  const out = [];
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const date = new Date(Date.now() + 8 * 3600e3 + i * 86400e3).toISOString().slice(0, 10);
    let times;
    if (c) {
      if ((c.closed || {})[date]) continue;
      const wd = new Date(date + "T00:00:00Z").getUTCDay();
      times = [...new Set([...((c.weekly || {})[wd] || []), ...((c.extra || {})[date] || [])])]
        .filter(t => !((c.blocked || {})[date] || []).includes(t));
    } else times = timesFor(date);
    for (const time of [...times].sort()) {
      if ((hidden[date] || []).includes(time)) continue;
      const at = slotAt(date, time);
      if (at <= now) continue;
      const isFull = taken.has(takenId(date, time)) || (full[date] || []).includes(time);
      out.push({ id: date.replace(/-/g, "") + time.replace(":", ""), date, time, at, status: isFull ? "full" : "open" });
    }
  }
  return out;
}

// ---------- 公開：送出預約 ----------
// data.slots = [{date,time}, …]（第一個是第一志願）
export async function createBooking(data) {
  const code = newCode();
  if (!isLive) return code; // 沒接後台：只傳 LINE
  const { fs, db } = await fb();
  const pick = (data.slots || [])[0];
  if (pick) {
    const t = await fs.getDoc(fs.doc(db, "taken", takenId(pick.date, pick.time)));
    if (t.exists()) throw new Error("SLOT_TAKEN");
  }
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const lines = (data.fields || []).slice(0, 40).map(f => `${s(f.label, 60)}：${s(f.value, 1500)}`);
  const second = (data.slots || [])[1];
  const ext = (data.addons || []).find(a => /^ext\d+$/.test(a.key));
  const note = [
    "【網站預約】", ...lines,
    second ? `第二志願：${second.date} ${second.time}` : "",
    data.customTimes ? `自己提供的時間：${s(data.customTimes, 500)}` : "",
    (data.addons || []).length ? `加購：${data.addons.map(a => s(a.label, 60)).join("、")}` : "",
    `預估金額：NT$${Number(data.total || 0).toLocaleString("en-US")}`,
    data.customer && data.customer.heard ? `怎麼知道 Yura：${s(data.customer.heard, 30)}` : "",
    data.customer && data.customer.email ? `Email：${s(data.customer.email, 200)}` : ""
  ].filter(Boolean).join("\n").slice(0, 6000);
  const owner = ((data.fields || []).find(f => f.key === "ownerName") || {}).value || "";
  const booking = {
    web: true, status: "pending", createdAt: Date.now(), updatedAt: Date.now(),
    customerName: s(owner || (data.customer || {}).email || "網站預約", 100), contact: s((data.customer || {}).email, 200),
    pet: s(data.petName, 200) || "（未填）",
    service: `${s(data.serviceName, 40)}｜${s(data.planLabel, 80)}`,
    source: s((data.customer || {}).heard, 30) || "網站預約", channel: "官方LINE", method: s(data.method, 20), ext: ext ? ext.key.replace("ext", "") : "",
    date: pick ? pick.date : twToday(), time: pick ? pick.time : "待安排",
    total: null, deposit: null, depositPaid: false, balancePaid: false, paidAt: "", note
  };
  const ref = fs.doc(fs.collection(db, "bookings"));
  const batch = fs.writeBatch(db);
  if (pick) {
    booking.takenKey = takenId(pick.date, pick.time);
    batch.set(fs.doc(db, "taken", booking.takenKey), { date: pick.date, time: pick.time, createdAt: Date.now() });
  }
  batch.set(ref, { ...booking, id: ref.id });
  try { await batch.commit(); }
  catch (e) {
    // 時段剛好被別人搶先 → 規則會拒絕
    if (pick) { const t = await fs.getDoc(fs.doc(db, "taken", booking.takenKey)).catch(() => null); if (t && t.exists()) throw new Error("SLOT_TAKEN"); }
    throw e;
  }
  return ref.id; // 給「我已匯款」用
}

// ---------- 公開：客人填寫匯款資料 ----------
export async function submitPayment(bookingId, payer, last5, amount) {
  if (!isLive || !bookingId) return false;
  const { fs, db } = await fb();
  await fs.setDoc(fs.doc(db, "payments", bookingId), {
    bookingId, payer: String(payer).trim().slice(0, 50), last5: String(last5).trim(), amount: Number(amount) || 0, createdAt: Date.now()
  });
  return true;
}
