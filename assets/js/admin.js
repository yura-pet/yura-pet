import { chrome, esc, toast, copyText } from "./common.js";
import { SERVICES, SERVICE_ORDER, STATUS, money } from "./services.js";
import { isDemo, onAdmin, adminLogin, adminLogout, watchBookings, watchSlots, adminWrite, getSettings, saveSettings, slotAt, slotLabel, fmtCode, resetDemo } from "./db.js";

chrome("admin", { cta: false });
const $ = s => document.querySelector(s);
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const SLOT_ST = { open: ["開放", "ok"], held: ["客人已選", "new"], booked: ["已預約", "done"], closed: ["關閉", "off"] };

let bookings = [], slots = [], unsubs = [];
let filter = { status: "active", service: "", q: "" };
let openIds = new Set();
let lastNewCount = null;

// ---------------- 登入 ----------------
onAdmin(user => {
  unsubs.forEach(u => u()); unsubs = [];
  $("#loginCard").classList.toggle("hidden", !!user);
  $("#app").classList.toggle("hidden", !user);
  if (!user) {
    if (isDemo) $("#loginMsg").textContent = "示範模式：隨便輸入 Email 與密碼就能登入。";
    return;
  }
  $("#who").textContent = user.email || "";
  start();
});
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  const b = $("#loginBtn"); b.disabled = true;
  try { await adminLogin($("#em").value.trim(), $("#pw").value); if (isDemo) location.reload(); }
  catch (err) { console.warn(err); $("#loginMsg").textContent = "登入失敗：請確認 Email 與密碼。"; }
  b.disabled = false;
};
$("#logout").onclick = async () => { await adminLogout(); if (isDemo) location.reload(); };

function showErr(e) {
  console.error(e);
  const el = $("#err");
  el.textContent = e && e.code === "permission-denied"
    ? "這個帳號沒有後台權限。請確認 Firestore 規則裡的管理員 Email 是否正確（見 SETUP.md）。"
    : "讀取資料失敗：" + (e?.message || e);
  el.classList.remove("hidden");
}

function start() {
  unsubs.push(watchBookings(b => { bookings = b; onBookings(); }, showErr));
  unsubs.push(watchSlots(s => { slots = s; renderSlots(); renderBookings(); }, showErr));
  loadSettings();
}

// ---------------- 分頁 ----------------
document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === t));
  ["bookings", "slots", "settings"].forEach(k => $("#tab-" + k).classList.toggle("hidden", k !== t.dataset.tab));
});

// ---------------- 通知 ----------------
$("#notifyBtn").onclick = async () => {
  if (!("Notification" in window)) return toast("這個瀏覽器不支援通知");
  const p = await Notification.requestPermission();
  toast(p === "granted" ? "已開啟：後台開著時，有新預約會跳通知" : "通知沒有被允許");
};
function onBookings() {
  const n = bookings.filter(b => b.status === "new").length;
  if (lastNewCount !== null && n > lastNewCount) {
    toast("🔔 有新的預約！");
    try { if (Notification.permission === "granted") new Notification("Yura 有新的預約", { body: "打開後台查看" }); } catch {}
  }
  lastNewCount = n;
  document.title = (n ? `(${n}) ` : "") + "Yura｜預約後台";
  const c = $("#newCnt"); c.textContent = n; c.classList.toggle("hidden", !n);
  renderBookings();
}

// ---------------- 預約列表 ----------------
$("#fService").innerHTML += SERVICE_ORDER.map(k => `<option value="${k}">${SERVICES[k].name}</option>`).join("");
$("#fService").onchange = e => { filter.service = e.target.value; renderBookings(); };
$("#fSearch").oninput = e => { filter.q = e.target.value.trim().toLowerCase(); renderBookings(); };

const fmtTime = ms => { if (!ms) return ""; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const slotById = id => slots.find(s => s.id === id);

function matches(b) {
  if (filter.status === "active" && !["new", "confirmed", "paid"].includes(b.status)) return false;
  if (!["all", "active"].includes(filter.status) && b.status !== filter.status) return false;
  if (filter.service && b.service !== filter.service) return false;
  if (filter.q) {
    const hay = [b.id, fmtCode(b.id), b.petName, b.customer?.name, b.customer?.email, b.customer?.contact, b.customer?.phone, ...(b.fields || []).map(f => f.value)].join(" ").toLowerCase();
    if (!hay.includes(filter.q)) return false;
  }
  return true;
}

function renderBookings() {
  const cnt = k => bookings.filter(b => b.status === k).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const revenue = bookings.filter(b => ["paid", "done"].includes(b.status) && (b.confirmedAt || b.createdAt) >= monthStart.getTime()).reduce((n, b) => n + Number(b.finalPrice || b.total || 0), 0);
  $("#stats").innerHTML = [
    [cnt("new"), "待確認"], [cnt("confirmed"), "待付款"], [cnt("paid"), "預約成功"], [money(revenue), "本月已付款金額"]
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");

  const up = bookings.filter(b => ["confirmed", "paid"].includes(b.status) && b.confirmedAt && b.confirmedAt > Date.now() - 3 * 3600e3)
    .sort((a, b) => a.confirmedAt - b.confirmedAt).slice(0, 8);
  $("#upcoming").innerHTML = up.length ? up.map(b => `<div class="up"><span class="when">${esc(b.confirmedTime)}</span>
    <span class="badge ${STATUS[b.status].tone}">${STATUS[b.status].label}</span>
    <span>${esc(b.petName)}｜${esc(SERVICES[b.service]?.name || "")}｜${esc(b.customer?.name || "")}</span></div>`).join("")
    : `<p class="muted">目前沒有已排定的預約。</p>`;

  const chips = [["active", "進行中"], ["new", "待確認"], ["confirmed", "待付款"], ["paid", "預約成功"], ["done", "已完成"], ["cancelled", "已取消"], ["all", "全部"]];
  $("#statusChips").innerHTML = chips.map(([k, l]) => {
    const n = k === "all" ? bookings.length : k === "active" ? bookings.filter(b => ["new", "confirmed", "paid"].includes(b.status)).length : cnt(k);
    return `<button class="chip ${filter.status === k ? "on" : ""}" data-s="${k}" type="button">${l} ${n}</button>`;
  }).join("");
  $("#statusChips").querySelectorAll(".chip").forEach(c => c.onclick = () => { filter.status = c.dataset.s; renderBookings(); });

  // 保留正在編輯中的表單，不要因為即時更新被洗掉
  const editing = document.activeElement && document.activeElement.closest(".adm");
  if (editing) return;

  const list = bookings.filter(matches);
  $("#list").innerHTML = list.length ? list.map(cardHtml).join("") : `<div class="empty">沒有符合的預約</div>`;
  $("#list").querySelectorAll("details.bk").forEach(d => {
    d.ontoggle = () => d.open ? openIds.add(d.dataset.id) : openIds.delete(d.dataset.id);
    bindCard(d);
  });
}

function cardHtml(b) {
  const st = STATUS[b.status] || STATUS.new;
  const svc = SERVICES[b.service];
  const want = b.confirmedTime ? `✅ ${b.confirmedTime}` : [...(b.slotLabels || []).map((l, i) => `${i ? "②" : "①"} ${l}`), b.customTimes ? "自填：" + b.customTimes.replace(/\n/g, " ") : ""].filter(Boolean).join("　") || "未指定時段";
  const kv = [
    ["方案", b.planLabel], b.method && ["溝通方式", b.method],
    b.addons?.length && ["加購", b.addons.map(a => `${a.label} +${money(a.price)}`).join("\n")],
    ...(b.fields || []).map(f => [f.label.replace(/^\d+\.\s*/, ""), f.value]),
    b.customer?.name && ["主人", b.customer.name], ["Email", b.customer?.email || b.customer?.contact], b.customer?.phone && ["手機", b.customer.phone],
    ["希望時段", [...(b.slotLabels || []).map((l, i) => `${i ? "第二" : "第一"}志願：${l}`), b.customTimes && "自己提供：\n" + b.customTimes].filter(Boolean).join("\n") || "未指定"],
    ["預估金額", money(b.total)], ["送出時間", fmtTime(b.createdAt)]
  ].filter(Boolean);

  // 可選的確認時段：客人選的 + 其他還開放的
  const own = (b.slotIds || []).map(slotById).filter(Boolean);
  const others = slots.filter(s => s.status === "open" && s.at > Date.now() && !(b.slotIds || []).includes(s.id));
  const cur = b.confirmedSlotId ? slotById(b.confirmedSlotId) : null;
  const opt = (s, pre) => `<option value="${s.id}" ${b.confirmedSlotId === s.id ? "selected" : ""}>${pre}${esc(slotLabel(s))}</option>`;
  return `<details class="bk" data-id="${b.id}" ${openIds.has(b.id) ? "open" : ""}>
    <summary>
      <div><div class="t1">${svc?.icon || ""} ${esc(b.petName)}　<span class="badge ${st.tone}">${st.label}</span></div>
      <div class="t2">${esc(svc?.name || b.service)}｜${esc(b.planLabel || "")}<br>${esc(b.customer?.email || b.customer?.contact || "")}<br>${esc(want)}</div></div>
      <div style="text-align:right"><div class="code">${fmtCode(b.id)}</div><div class="t2">${fmtTime(b.createdAt)}</div><div class="t2"><b>${money(b.finalPrice || b.total)}</b></div></div>
    </summary>
    <div class="bk-body">
      <div class="kv">${kv.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`).join("")}</div>
      <div class="adm">
        <div class="field" style="margin-top:0"><label>狀態</label>
          <select data-k="status">${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${b.status === k ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
        ${svc?.slot !== "none" ? `<div class="field"><label>確認時段</label>
          <select data-k="slot"><option value="">— 不使用開放時段 —</option>
            ${own.length ? `<optgroup label="客人選的">${own.map((s, i) => opt(s, i ? "② " : "① ")).join("")}</optgroup>` : ""}
            ${cur && !own.includes(cur) ? `<optgroup label="目前">${opt(cur, "")}</optgroup>` : ""}
            ${others.length ? `<optgroup label="其他開放時段">${others.map(s => opt(s, "")).join("")}</optgroup>` : ""}
          </select>
          <input type="text" data-k="time" placeholder="或自己填時間，例：11/30（日）20:00" value="${esc(b.confirmedSlotId ? "" : b.confirmedTime || "")}" style="margin-top:6px"></div>` : ""}
        <div class="field"><label>實際金額</label><input type="number" data-k="price" value="${esc(b.finalPrice || b.total || "")}"></div>
        <div class="field"><label>給客人的備註（查詢頁看得到）</label><textarea data-k="pub">${esc(b.publicNote || "")}</textarea></div>
        <div class="field"><label>內部備註（只有你看得到）</label><textarea data-k="note">${esc(b.adminNote || "")}</textarea></div>
        <div class="wiz-nav" style="margin-top:12px">
          <button class="btn small danger" data-a="del" type="button">刪除</button>
          <button class="btn small" data-a="copy" type="button">複製資料</button>
          <button class="btn small primary" data-a="save" type="button">儲存</button>
        </div>
        <p class="hint" style="margin-top:8px">「待付款」時客人在查詢頁會看到付款資訊。選了確認時段，其他志願的時段會自動釋出。取消時所有時段都會釋出。</p>
      </div>
    </div>
  </details>`;
}

function bindCard(d) {
  const b = bookings.find(x => x.id === d.dataset.id);
  const g = k => d.querySelector(`[data-k="${k}"]`);
  const btn = a => d.querySelector(`[data-a="${a}"]`);
  const st = g("status");
  // 選了時段又還是待確認 → 自動改成待付款
  g("slot") && (g("slot").onchange = () => { if (g("slot").value) { g("time").value = ""; if (st.value === "new") st.value = "confirmed"; } });

  btn("save").onclick = async () => {
    const status = st.value;
    const newSlotId = g("slot") ? g("slot").value : "";
    const s = newSlotId ? slotById(newSlotId) : null;
    const confirmedTime = s ? slotLabel(s) : (g("time") ? g("time").value.trim() : "");
    const patch = {
      status, confirmedSlotId: newSlotId, confirmedTime,
      confirmedAt: s ? s.at : (b.confirmedSlotId === newSlotId ? b.confirmedAt || null : null),
      finalPrice: Number(g("price").value) || b.total || 0,
      publicNote: g("pub").value.trim(), adminNote: g("note").value.trim()
    };
    if (["confirmed", "paid"].includes(status) && !confirmedTime && SERVICES[b.service]?.slot === "required" && !confirm("還沒有設定確認時段，確定要儲存嗎？")) return;

    const slotPatch = {};
    const mine = new Set([...(b.slotIds || []), b.confirmedSlotId].filter(Boolean));
    const release = id => { const x = slotById(id); if (x && ["held", "booked"].includes(x.status)) slotPatch[id] = { status: "open" }; };
    if (status === "cancelled") mine.forEach(release);
    else if (status !== "new" && newSlotId) {
      mine.forEach(id => { if (id !== newSlotId) release(id); });
      slotPatch[newSlotId] = { status: "booked" };
    } else if (b.confirmedSlotId && b.confirmedSlotId !== newSlotId) {
      // 取消原本的確認時段
      const x = slotById(b.confirmedSlotId);
      if (x) slotPatch[b.confirmedSlotId] = { status: (b.slotIds || []).includes(b.confirmedSlotId) && status === "new" ? "held" : "open" };
    }
    if (s && !["open", "held"].includes(s.status) && b.confirmedSlotId !== newSlotId) return toast("這個時段已經被別的預約使用了");
    try {
      await adminWrite({ bookings: { [b.id]: patch }, slots: slotPatch });
      document.activeElement?.blur();
      toast("已儲存 ✨");
      renderBookings();
    } catch (e) { showErr(e); toast("儲存失敗"); }
  };
  btn("copy").onclick = async () => {
    const lines = [`【預約 ${fmtCode(b.id)}】`, `服務：${SERVICES[b.service]?.name}｜${b.planLabel}`, b.method && `溝通方式：${b.method}`,
      ...(b.fields || []).map(f => `${f.label.replace(/^\d+\.\s*/, "")}：${f.value}`),
      `Email：${b.customer?.email || b.customer?.contact || ""}`, b.confirmedTime && `確認時間：${b.confirmedTime}`, `金額：${money(b.finalPrice || b.total)}`].filter(Boolean);
    toast(await copyText(lines.join("\n")) ? "已複製" : "複製失敗");
  };
  btn("del").onclick = async () => {
    if (!confirm(`確定要刪除「${b.petName}」這筆預約嗎？刪除後無法復原。`)) return;
    const slotPatch = {};
    [...(b.slotIds || []), b.confirmedSlotId].filter(Boolean).forEach(id => { const x = slotById(id); if (x && ["held", "booked"].includes(x.status)) slotPatch[id] = { status: "open" }; });
    try { await adminWrite({ deleteBookings: [b.id], slots: slotPatch }); toast("已刪除"); } catch (e) { showErr(e); }
  };
}

$("#csv").onclick = () => {
  const keys = new Set();
  bookings.forEach(b => (b.fields || []).forEach(f => keys.add(f.label)));
  const cols = ["預約編號", "狀態", "服務", "方案", "溝通方式", "加購", ...keys, "主人", "Email", "手機", "希望時段", "確認時間", "金額", "內部備註", "送出時間"];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = bookings.filter(matches).map(b => {
    const fm = Object.fromEntries((b.fields || []).map(f => [f.label, f.value]));
    return [fmtCode(b.id), STATUS[b.status]?.label, SERVICES[b.service]?.name, b.planLabel, b.method, (b.addons || []).map(a => a.label).join("、"),
      ...[...keys].map(k => fm[k]), b.customer?.name, b.customer?.email || b.customer?.contact, b.customer?.phone,
      [...(b.slotLabels || []), b.customTimes].filter(Boolean).join(" / "), b.confirmedTime, b.finalPrice || b.total, b.adminNote, fmtTime(b.createdAt)].map(q).join(",");
  });
  const blob = new Blob(["﻿" + [cols.map(q).join(","), ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `yura-bookings-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
};

// ---------------- 時段管理 ----------------
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
$("#sFrom").value = today();
$("#sTo").value = new Date(Date.now() + 8 * 3600e3 + 13 * 86400e3).toISOString().slice(0, 10);
$("#sWd").innerHTML = WD.map((w, i) => `<label><input type="checkbox" value="${i}" checked> ${w}</label>`).join("");

function planSlots() {
  const from = $("#sFrom").value, to = $("#sTo").value;
  const wds = new Set([...$("#sWd").querySelectorAll("input:checked")].map(i => +i.value));
  const times = [...new Set(($("#sTimes").value.match(/\d{1,2}[:：]\d{2}/g) || []).map(t => { const [h, m] = t.split(/[:：]/); return `${h.padStart(2, "0")}:${m}`; }))]
    .filter(t => +t.slice(0, 2) < 24 && +t.slice(3) < 60).sort();
  if (!from || !to || !times.length) return [];
  const out = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z") && out.length < 500; d = new Date(+d + 86400e3)) {
    if (!wds.has(d.getUTCDay())) continue;
    const date = d.toISOString().slice(0, 10);
    for (const time of times) {
      const at = slotAt(date, time);
      if (at < Date.now()) continue;
      if (slots.some(s => s.date === date && s.time === time)) continue;
      out.push({ date, time, at, status: "open" });
    }
  }
  return out;
}
const preview = () => { const n = planSlots().length; $("#sPreview").textContent = n ? `將新增 ${n} 個時段（已存在的會自動略過）` : "請選擇日期並填寫時間"; };
["#sFrom", "#sTo", "#sTimes"].forEach(s => $(s).oninput = preview);
$("#sWd").onchange = preview;
$("#sAdd").onclick = async () => {
  const arr = planSlots();
  if (!arr.length) return toast("沒有要新增的時段");
  try { await adminWrite({ newSlots: arr }); toast(`已新增 ${arr.length} 個時段`); $("#sTimes").value = ""; preview(); } catch (e) { showErr(e); }
};
$("#showPast").onchange = renderSlots;

function renderSlots() {
  const owner = {};
  bookings.forEach(b => { if (b.status === "cancelled") return; [...(b.slotIds || []), b.confirmedSlotId].filter(Boolean).forEach(id => owner[id] = b); });
  const past = $("#showPast").checked;
  const arr = slots.filter(s => past || s.at > Date.now() - 3600e3);
  const byDay = {};
  arr.forEach(s => (byDay[s.date] ||= []).push(s));
  $("#slotList").innerHTML = arr.length ? Object.entries(byDay).map(([d, list]) => `<div class="sday"><h4>${esc(slotLabel(list[0]).split("）")[0])}）</h4><div class="srow">
    ${list.map(s => {
      const [l, tone] = SLOT_ST[s.status] || [s.status, ""];
      const o = owner[s.id];
      return `<div class="sl ${s.status}"><b>${esc(s.time)}</b><span class="badge ${tone}">${l}</span>${o && s.status !== "open" ? `<span class="muted">${esc(o.petName)}</span>` : ""}
        ${s.status === "open" ? `<button class="x" data-close="${s.id}" title="暫時關閉">⏸</button>` : ""}
        ${s.status === "closed" ? `<button class="x" data-open="${s.id}" title="重新開放">▶</button>` : ""}
        ${["open", "closed"].includes(s.status) || !o ? `<button class="x" data-del="${s.id}" title="刪除">✕</button>` : ""}</div>`;
    }).join("")}</div></div>`).join("") : `<div class="empty">還沒有時段，用上面的表單新增吧！</div>`;
  const L = $("#slotList");
  L.querySelectorAll("[data-close]").forEach(b => b.onclick = () => adminWrite({ slots: { [b.dataset.close]: { status: "closed" } } }).catch(showErr));
  L.querySelectorAll("[data-open]").forEach(b => b.onclick = () => adminWrite({ slots: { [b.dataset.open]: { status: "open" } } }).catch(showErr));
  L.querySelectorAll("[data-del]").forEach(b => b.onclick = () => adminWrite({ slots: { [b.dataset.del]: null } }).catch(showErr));
}

// ---------------- 網站設定 ----------------
async function loadSettings() {
  const s = await getSettings();
  $("#st_open").checked = s.bookingOpen !== false;
  $("#st_closed").value = s.closedMessage || "";
  $("#st_lineUrl").value = s.lineUrl || "";
  $("#st_lineId").value = s.lineId || "";
  $("#st_pay").value = s.paymentInfo || "";
  $("#st_ann").value = s.announcement || "";
  $("#demoTools").classList.toggle("hidden", !isDemo);
}
$("#setForm").onsubmit = async e => {
  e.preventDefault();
  try {
    await saveSettings({
      bookingOpen: $("#st_open").checked, closedMessage: $("#st_closed").value.trim(),
      lineUrl: $("#st_lineUrl").value.trim(), lineId: $("#st_lineId").value.trim(),
      paymentInfo: $("#st_pay").value.trim(), announcement: $("#st_ann").value.trim()
    });
    toast("設定已儲存 ✨");
  } catch (err) { showErr(err); }
};
$("#resetDemo").onclick = () => { if (confirm("清除所有示範資料？")) { resetDemo(); location.reload(); } };
