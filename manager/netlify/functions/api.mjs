// Yura 預約管理｜雲端資料 API（Netlify Functions + Netlify Blobs）
// 密碼設定在 Netlify 的環境變數 ADMIN_PASSWORD
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
});
const pub = (data, status = 200) => json(data, status, CORS);

function store() {
  if (globalThis.__YURA_MOCK_STORE__) return globalThis.__YURA_MOCK_STORE__; // 本機測試用
  return getStore({ name: "yura-manager", consistency: "strong" });
}

function authorized(req) {
  const pw = process.env.ADMIN_PASSWORD || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!pw || !got) return false;
  const a = Buffer.from(pw), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

const KINDS = { bookings: "b/", customers: "c/", arts: "a/", settings: "s/" };
const SETTINGS_ID = "config01";
// 每週固定時段的預設值（0 = 週日）
const WD5 = ["11:00", "14:00", "15:00", "19:00", "20:00"], WE2 = ["19:00", "20:00"];
const FRI = ["15:00", "19:00", "20:00"]; // 週五 15:00 以後才開放
const DEFAULT_WEEKLY = { 0: WE2, 1: WD5, 2: WD5, 3: WD5, 4: WD5, 5: FRI, 6: WE2 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;
const twToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;

async function listAll(s, prefix) {
  const { blobs } = await s.list({ prefix });
  const items = await Promise.all(blobs.map(x => s.get(x.key, { type: "json" })));
  return items.filter(Boolean);
}

async function getSettings(s) {
  const c = await s.get(KINDS.settings + SETTINGS_ID, { type: "json" });
  return { weekly: DEFAULT_WEEKLY, closed: {}, extra: {}, blocked: {}, ...(c || {}) };
}
const takenSet = list => new Set(list
  .filter(b => ["booked", "pending"].includes(b.status) && DATE_RE.test(b.date || "") && TIME_RE.test(b.time || ""))
  .map(b => b.date + " " + b.time));

// 客人網站：讀取可預約時間（不含任何客人個資）
async function publicAvailability(s) {
  const [cfg, bookings] = await Promise.all([getSettings(s), listAll(s, KINDS.bookings)]);
  const t = twToday();
  const keep = o => Object.fromEntries(Object.entries(o || {}).filter(([d]) => d >= t));
  return { weekly: cfg.weekly, closed: keep(cfg.closed), extra: keep(cfg.extra), blocked: keep(cfg.blocked),
    taken: [...takenSet(bookings)].filter(x => x >= t) };
}

// 客人網站：送出預約 → 後台出現一筆「待確認」
async function publicBooking(s, body) {
  const picks = Array.isArray(body.picks) ? body.picks.slice(0, 2) : [];
  for (const p of picks) if (!(DATE_RE.test(p.date) && TIME_RE.test(p.time))) return pub({ error: "時段格式不對" }, 400);
  const pick = picks[0], second = picks[1];
  const bookings = await listAll(s, KINDS.bookings);
  if (pick && takenSet(bookings).has(pick.date + " " + pick.time)) return pub({ error: "SLOT_TAKEN" }, 409);
  const email = str(body.email, 200), owner = str(body.ownerName, 100);
  const name = owner || email || "網站預約";
  const customers = await listAll(s, KINDS.customers);
  let c = customers.find(x => (x.name || "").trim() === name || (email && x.contact === email));
  if (!c) {
    c = { id: uid(), name, source: "網站預約", contact: email, note: "", createdAt: Date.now() };
    await s.setJSON(KINDS.customers + c.id, c);
  }
  const lines = (Array.isArray(body.fields) ? body.fields : []).slice(0, 40).map(f => `${str(f.label, 60)}：${str(f.value, 1500)}`);
  const addons = Array.isArray(body.addons) ? body.addons : [];
  const note = [
    "【網站預約】", ...lines,
    second ? `第二志願：${second.date} ${second.time}` : "",
    body.customTimes ? `自己提供的時間：${str(body.customTimes, 500)}` : "",
    addons.length ? `加購：${addons.map(a => str(a.label, 60)).join("、")}` : "",
    `預估金額：NT$${Number(body.total || 0).toLocaleString("en-US")}`,
    email ? `Email：${email}` : ""
  ].filter(Boolean).join("\n").slice(0, 6000);
  const b = { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), web: true, status: "pending",
    customerId: c.id, customerName: c.name, pet: str(body.petName, 200) || "（未填）",
    service: `${str(body.serviceName, 40)}｜${str(body.planLabel, 80)}`, source: "網站預約", channel: "官方LINE", method: str(body.method, 20),
    ext: addons.some(a => a.key === "ext15") ? "15" : addons.some(a => a.key === "ext20") ? "20" : addons.some(a => a.key === "ext10") ? "10" : "",
    date: pick ? pick.date : twToday(), time: pick ? pick.time : "待安排",
    total: null, deposit: null, depositPaid: false, balancePaid: false, paidAt: "", note };
  await s.setJSON(KINDS.bookings + b.id, b);
  return pub({ ok: true, id: b.id });
}

export default async (req) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const s = store();

  // ---- 公開給客人網站用（不需要密碼）----
  if (parts[0] === "public") {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (parts[1] === "availability" && req.method === "GET") return pub(await publicAvailability(s));
      if (parts[1] === "booking" && req.method === "POST") {
        const text = await req.text();
        if (text.length > 30000) return pub({ error: "資料太大" }, 413);
        return await publicBooking(s, JSON.parse(text));
      }
      return pub({ error: "not found" }, 404);
    } catch (e) { console.error(e); return pub({ error: "伺服器錯誤" }, 500); }
  }

  if (!process.env.ADMIN_PASSWORD) return json({ error: "尚未在 Netlify 設定 ADMIN_PASSWORD 環境變數" }, 500);
  if (!authorized(req)) return json({ error: "密碼錯誤" }, 401);

  try {
    if (parts[0] === "ping") return json({ ok: true });

    if (parts[0] === "data" && req.method === "GET") {
      const [bookings, customers, arts, settings] = await Promise.all([listAll(s, KINDS.bookings), listAll(s, KINDS.customers), listAll(s, KINDS.arts), getSettings(s)]);
      return json({ bookings, customers, arts, settings: [{ ...settings, id: SETTINGS_ID }] });
    }

    // 匯入備份：{ bookings: [...], customers: [...], arts: [...] }
    if (parts[0] === "import" && req.method === "POST") {
      const body = await req.json();
      let n = 0;
      for (const [kind, prefix] of Object.entries(KINDS)) {
        for (const item of body[kind] || []) {
          if (item && ID_RE.test(item.id || "")) { await s.setJSON(prefix + item.id, item); n++; }
        }
      }
      return json({ ok: true, count: n });
    }

    const prefix = KINDS[parts[0]];
    const id = parts[1];
    if (!prefix || !ID_RE.test(id || "")) return json({ error: "not found" }, 404);

    if (req.method === "PUT") {
      const body = await req.json();
      if (!body || body.id !== id) return json({ error: "id 不一致" }, 400);
      if (JSON.stringify(body).length > 50000) return json({ error: "資料太大" }, 413);
      await s.setJSON(prefix + id, body);
      return json({ ok: true });
    }
    if (req.method === "DELETE") {
      await s.delete(prefix + id);
      return json({ ok: true });
    }
    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "伺服器錯誤：" + (e.message || e) }, 500);
  }
};

export const config = { path: "/api/*" };
