// Yura 預約管理｜雲端資料 API（Netlify Functions + Netlify Blobs）
// 密碼設定在 Netlify 的環境變數 ADMIN_PASSWORD
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

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

const KINDS = { bookings: "b/", customers: "c/", arts: "a/" };
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;

async function listAll(s, prefix) {
  const { blobs } = await s.list({ prefix });
  const items = await Promise.all(blobs.map(x => s.get(x.key, { type: "json" })));
  return items.filter(Boolean);
}

export default async (req) => {
  if (!process.env.ADMIN_PASSWORD) return json({ error: "尚未在 Netlify 設定 ADMIN_PASSWORD 環境變數" }, 500);
  if (!authorized(req)) return json({ error: "密碼錯誤" }, 401);

  const parts = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const s = store();

  try {
    if (parts[0] === "ping") return json({ ok: true });

    if (parts[0] === "data" && req.method === "GET") {
      const [bookings, customers, arts] = await Promise.all([listAll(s, KINDS.bookings), listAll(s, KINDS.customers), listAll(s, KINDS.arts)]);
      return json({ bookings, customers, arts });
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
