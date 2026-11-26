import { chrome, esc, toast, copyText, lineHref, lineMessageHref } from "./common.js?v=20261126l";
import { SERVICES, SERVICE_ORDER, money } from "./services.js?v=20261126l";
import { getSettings, listOpenSlots, createBooking, submitPayment, slotLabel } from "./db.js?v=20261126l";

chrome("book", { cta: false });

const $ = s => document.querySelector(s);
const stage = $("#stage");
const STEP_NAMES = ["選擇服務", "預約前必讀", "填寫資料", "選擇時段", "確認送出"];

let settings = {};
let slots = null; // 開放的時段（延遲載入）
const DRAFT = "yura_booking_draft";

const state = {
  step: 0, service: "", plan: "", method: "", addons: new Set(), values: {},
  customer: { email: "" },
  agreed: [], picks: [], noFit: false, customTimes: "", final: false, code: ""
};

// ---- 草稿（重新整理不會不見）----
function saveDraft() {
  try { sessionStorage.setItem(DRAFT, JSON.stringify({ ...state, addons: [...state.addons] })); } catch {}
}
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT));
    if (d && !d.code) Object.assign(state, d, { addons: new Set(d.addons || []) });
  } catch {}
}
function clearDraft() { try { sessionStorage.removeItem(DRAFT); } catch {} }

const svc = () => SERVICES[state.service];
const planObj = () => svc()?.plans.find(p => p.key === state.plan);
const hasSlotStep = () => svc() && svc().slot !== "none";
const visAddons = () => svc().addons.filter(a => !a.showIf || a.showIf(state));
const chosenAddons = () => visAddons().filter(a => state.addons.has(a.key));
const total = () => (planObj()?.price || 0) + chosenAddons().reduce((n, a) => n + a.price, 0);
const visibleFields = () => svc().fields.filter(f => !f.showIf || f.showIf(state));
const SPECIES = ["貓", "狗", "其他"], SEXES = ["♂ 公", "♀ 母"];
const petsField = () => visibleFields().find(f => f.type === "pets");
const petList = () => { const f = petsField(); if (!f) return []; const n = f.count(state); state.pets ||= [];
  while (state.pets.length < n) state.pets.push({ name: "", species: "貓", sex: "", info: "" });
  return state.pets.slice(0, n); };
const petText = p => [p.species, p.sex.replace(/^[♂♀]\s*/, ""), p.info].filter(Boolean).join("・");

function go(step) {
  if (step === 3 && !hasSlotStep()) step = state.step < 3 ? 4 : 2;
  state.step = step;
  saveDraft();
  render();
  document.getElementById("wizard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function header() {
  const s = svc();
  const steps = hasSlotStep() || !s ? STEP_NAMES : STEP_NAMES.filter((_, i) => i !== 3);
  const idx = steps.indexOf(STEP_NAMES[state.step]);
  $("#wzKicker").textContent = s ? `${s.icon} ${s.name}` : "線上預約";
  $("#wzTitle").textContent = state.step === 5 ? "預約已送出" : STEP_NAMES[state.step];
  $("#wzProgress").innerHTML = state.step === 5 ? "" : steps.map((_, i) => `<span class="${i <= idx ? "on" : ""}"></span>`).join("");
  $("#wzStepLabel").textContent = state.step === 5 ? "" : `第 ${idx + 1} / ${steps.length} 步`;
}

function navBtns(backTo, nextLabel = "下一步", nextId = "next") {
  return `<div class="wiz-nav">
    ${backTo !== null ? `<button class="btn ghost" type="button" data-go="${backTo}">← 上一步</button>` : ""}
    <button class="btn primary" type="button" id="${nextId}">${nextLabel}</button>
  </div>`;
}
function bindBack() { stage.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(+b.dataset.go)); }

// ---------- Step 0 選擇服務 ----------
function stepService() {
  if (!settings.bookingOpen) {
    const h = lineHref(settings);
    stage.innerHTML = `<div class="note warn">${esc(settings.closedMessage)}</div>
      ${h ? `<div class="row-btns"><a class="btn line" href="${h}" target="_blank" rel="noopener">到 LINE 詢問</a></div>` : ""}`;
    return;
  }
  stage.innerHTML = `
    <a class="who-strip" href="about.html"><img src="images/yura-avatar.jpg" alt="Yura"><div><b>寵物溝通師 Yura・毛孩調解委員</b><span>專長改善行為問題｜400+ 場溝通、200+ 件行為問題。認識我 →</span></div></a>
    <p>依照毛孩目前的狀況選擇：</p>
    <div class="svc-grid">${SERVICE_ORDER.map(k => {
      const s = SERVICES[k];
      return `<button type="button" class="svc ${state.service === k ? "sel" : ""}" data-k="${k}">
        <div class="kicker">${esc(s.kicker)}</div>
        <div class="nm"><span class="ic">${s.icon}</span> ${esc(s.name)}</div>
        <div class="ds">${esc(s.short)}</div>
        <div class="pr">${money(Math.min(...s.plans.map(p => p.price)))} 起</div>
      </button>`;
    }).join("")}</div>
    <div class="note">毛孩在身邊 → 一般溝通；已離世 → 離世溝通；走失失聯 → 找寵服務。不確定的話也可以先到 LINE 詢問。</div>`;
  stage.querySelectorAll(".svc").forEach(b => b.onclick = () => {
    if (state.service !== b.dataset.k) {
      Object.assign(state, { service: b.dataset.k, plan: "", method: "", addons: new Set(), agreed: [], picks: [], noFit: false });
      const s = svc();
      if (s.plans.length === 1) state.plan = s.plans[0].key;
    }
    go(1);
  });
}

// ---------- Step 1 必讀 ----------
function stepMust() {
  const s = svc();
  const ext = s.detailUrl.startsWith("http");
  stage.innerHTML = `
    <p>為了讓這次的服務真的幫得上你，請花一分鐘看完以下重點，<b>每一條都勾選</b>才能繼續。</p>
    <div class="must">${s.mustKnow.map((t, i) => `
      <label class="choice"><input type="checkbox" data-i="${i}" ${state.agreed[i] ? "checked" : ""}>
      <span class="c-main"><span class="c-t">${esc(t)}</span></span></label>`).join("")}
    </div>
    <div class="note">想看完整內容（溝通方式、常見問題、注意事項）：
      <a href="${s.detailUrl}" target="_blank">${esc(s.name)}${s.key === "illustration" ? "作品" : s.key === "search" ? "事前說明書" : "詳細說明書"} ↗</a>
    </div>
    <div class="row-btns" style="justify-content:flex-start"><button type="button" class="btn small ghost" id="allOk">全部都看過了，全選</button></div>
    ${navBtns(0, "我了解了，下一步")}`;
  const next = $("#next");
  const sync = () => {
    const boxes = [...stage.querySelectorAll(".must input")];
    state.agreed = boxes.map(b => b.checked);
    next.disabled = !boxes.every(b => b.checked);
    saveDraft();
  };
  stage.querySelectorAll(".must input").forEach(b => b.onchange = sync);
  $("#allOk").onclick = () => { stage.querySelectorAll(".must input").forEach(b => b.checked = true); sync(); };
  sync();
  next.onclick = () => go(2);
  bindBack();
}

// ---------- Step 2 資料 ----------
function fieldHtml(f) {
  const v = state.values[f.key] ?? "";
  const id = "f_" + f.key;
  const req = f.required ? '<span class="req">*</span>' : "";
  if (f.type === "pets") return petList().map((p, i) => `
    <div class="pet-box full">
      <label class="lbl" for="pet_${i}">寵物 ${i + 1} 名字<span class="req">*</span></label>
      <input type="text" id="pet_${i}" data-pet="${i}" data-pp="name" value="${esc(p.name)}" placeholder="例如：豆豆">
      <div class="seg-row">${SPECIES.map(o => `<button type="button" class="seg-btn ${p.species === o ? "on" : ""}" data-pet="${i}" data-pp="species" data-v="${o}">${o}</button>`).join("")}</div>
      <div class="seg-row two">${SEXES.map(o => `<button type="button" class="seg-btn ${p.sex === o ? "on" : ""}" data-pet="${i}" data-pp="sex" data-v="${o}">${o}</button>`).join("")}</div>
      <input type="text" data-pet="${i}" data-pp="info" value="${esc(p.info)}" placeholder="品種、年齡（選填），例：米克斯・5 歲">
    </div>`).join("");
  if (f.type === "note") return `<div class="note full" style="margin-top:14px">${esc(f.text)}</div>`;
  let input;
  if (f.type === "multi") {
    const picked = String(v).split("、").filter(Boolean);
    input = `<div class="choices inline" data-mf="${f.key}">${f.options.map(o => `<label class="choice"><input type="checkbox" value="${esc(o)}" ${picked.includes(o) ? "checked" : ""}><span class="c-main"><span class="c-t" style="font-weight:400;font-size:15px">${esc(o)}</span></span></label>`).join("")}</div>`;
    return `<div class="field full"><div class="lbl">${esc(f.label)}${req}</div>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}</div>`;
  }
  if (f.type === "textarea") input = `<textarea id="${id}" data-f="${f.key}" placeholder="${esc(f.placeholder || "")}">${esc(v)}</textarea>`;
  else if (f.type === "select") input = `<select id="${id}" data-f="${f.key}"><option value="">請選擇</option>${f.options.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else input = `<input type="text" id="${id}" data-f="${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder || "")}">`;
  const full = f.type === "textarea" || f.hint || f.image ? "full" : "";
  const img = f.image ? `<img class="field-img" src="${esc(f.image)}" alt="${esc(f.label)}實拍照" loading="lazy">${f.imageNote ? `<div class="hint">${esc(f.imageNote)}</div>` : ""}` : "";
  return `<div class="field ${full}"><label for="${id}">${esc(f.label)}${req}</label>${img}${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}</div>`;
}

function planChoice(p) {
  return `<label class="choice ${p.bundle ? "bundle" : ""}"><input type="radio" name="plan" value="${p.key}" ${state.plan === p.key ? "checked" : ""}>
    <span class="c-main"><span class="c-t">${esc(p.label)}</span><span class="c-m">　${esc(p.meta || "")}</span>${p.desc ? `<span class="c-d">${esc(p.desc)}</span>` : ""}${p.includes ? `<span class="c-inc"><span class="c-inc-t">包含</span>${p.includes.map(i => `<span>✓ ${esc(i)}</span>`).join("")}</span>` : ""}</span>
    <span class="c-p">${p.orig ? `<s class="orig">${money(p.orig)}</s>` : ""}${money(p.price)}${p.orig ? `<span class="save">省 ${money(p.orig - p.price)}</span>` : ""}</span></label>`;
}
function planGroups(s) {
  const solo = s.plans.filter(p => !p.bundle), combo = s.plans.filter(p => p.bundle);
  const note = s.planNote ? `<div class="note" style="margin:4px 0 8px">${esc(s.planNote)}</div>` : "";
  if (!combo.length) return note + `<div class="choices">${solo.map(planChoice).join("")}</div>`;
  return note + `<div class="plan-group"><div class="pg-title">${s.key === "search" ? "找寵方案" : "只要溝通"}</div><div class="choices">${solo.map(planChoice).join("")}</div></div>
    <div class="plan-group combo"><div class="pg-title">🎨 溝通＋似顏繪套組 <span class="pg-tag">比分開買便宜</span></div>
    <div class="pg-desc">溝通完，把毛孩的樣子一起畫下來。手繪似顏繪，含畫框、含運費。</div>
    <div class="choices">${combo.map(planChoice).join("")}</div></div>`;
}

const heardText = () => state.customer.heard === "朋友介紹" && (state.customer.ref || "").trim()
  ? `朋友介紹｜${state.customer.ref.trim().slice(0, 40)}` : (state.customer.heard || "");

function stepDetails() {
  const s = svc();
  if (s.plans.length === 1 && !state.plan) state.plan = s.plans[0].key;
  stage.innerHTML = `
    <div class="lbl">方案<span class="req">*</span></div>
    <div id="plans">${planGroups(s)}</div>
    ${s.methods ? `<div class="field"><div class="lbl">溝通方式<span class="req">*</span></div>
      <div class="choices inline">${s.methods.map(m => `<label class="choice"><input type="radio" name="method" value="${esc(m)}" ${state.method === m ? "checked" : ""}><span class="c-main"><span class="c-t">${esc(m)}</span></span></label>`).join("")}</div>
      ${s.methodHint ? `<div class="hint">${esc(s.methodHint)}</div>` : ""}</div>` : ""}
    ${visAddons().length ? `<div class="field"><div class="lbl">加購（可不選）</div>
      <div class="choices">${visAddons().map(a => `<label class="choice"><input type="checkbox" name="addon" value="${a.key}" ${state.addons.has(a.key) ? "checked" : ""}>
      <span class="c-main"><span class="c-t">${esc(a.label)}</span>${a.hint ? `<br><span class="c-m">${esc(a.hint)}</span>` : ""}</span><span class="c-p">+${money(a.price)}</span></label>`).join("")}</div></div>` : ""}
    <h3 style="margin-top:24px">毛孩資料</h3>
    <div class="form-grid" id="fields"></div>
    <h3 style="margin-top:24px">聯絡方式</h3>
    <div class="form-grid">
      <div class="field full"><label for="c_heard">你是怎麼知道 Yura 的？<span class="req">*</span></label>
        <select id="c_heard"><option value="">請選擇</option><option ${state.customer.heard === "Instagram" ? "selected" : ""}>Instagram</option><option ${state.customer.heard === "Threads" ? "selected" : ""}>Threads</option><option ${state.customer.heard === "Luna 老師介紹" ? "selected" : ""}>Luna 老師介紹</option><option ${state.customer.heard === "朋友介紹" ? "selected" : ""}>朋友介紹</option></select></div>
      <div class="field full ${state.customer.heard === "朋友介紹" ? "" : "hidden"}" id="refBox"><label for="c_ref">介紹你來的朋友是誰？<span class="req">*</span></label>
        <input type="text" id="c_ref" value="${esc(state.customer.ref || "")}" placeholder="朋友的名字或 IG 帳號"></div>
      <div class="field full"><label for="c_email">Email<span class="req">*</span></label><input type="email" id="c_email" value="${esc(state.customer.email || "")}" autocomplete="email" inputmode="email" placeholder="example@gmail.com">
        <div class="hint">萬一 LINE 聯絡不上，我還能用 Email 找到你。</div></div>
    </div>
    <div class="note">📷 需要準備：${s.prepare.map(esc).join("；")}</div>
    <div class="note" id="sumLine"></div>
    ${navBtns(1)}`;

  const drawFields = () => {
    const box = $("#fields");
    // 保留目前輸入的值
    box.querySelectorAll("[data-f]").forEach(el => state.values[el.dataset.f] = el.value);
    box.innerHTML = visibleFields().map(fieldHtml).join("");
    box.querySelectorAll("[data-f]").forEach(el => {
      el.oninput = () => { state.values[el.dataset.f] = el.value; el.classList.remove("invalid"); saveDraft(); };
      if (el.tagName === "SELECT") el.onchange = () => { state.values[el.dataset.f] = el.value; saveDraft(); drawFields(); };
    });
    box.querySelectorAll("[data-mf]").forEach(g => g.onchange = () => {
      state.values[g.dataset.mf] = [...g.querySelectorAll("input:checked")].map(i => i.value).join("、"); saveDraft();
    });
    box.querySelectorAll("input[data-pet]").forEach(el => el.oninput = () => { state.pets[+el.dataset.pet][el.dataset.pp] = el.value; el.classList.remove("invalid"); saveDraft(); });
    box.querySelectorAll("button[data-pet]").forEach(el => el.onclick = () => {
      const pet = state.pets[+el.dataset.pet], k = el.dataset.pp;
      pet[k] = (k === "sex" && pet[k] === el.dataset.v) ? "" : el.dataset.v; saveDraft();
      el.parentElement.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("on", b.dataset.v === pet[k]));
    });
  };
  const drawSum = () => { $("#sumLine").innerHTML = planObj() ? `預估金額：<b class="emph">${money(total())}</b>　<span class="muted">（實際金額以 Yura 確認為準）</span>` : "請先選擇方案"; };

  stage.querySelectorAll("input[name=plan]").forEach(r => r.onchange = () => {
    $("#fields").querySelectorAll("[data-f]").forEach(el => state.values[el.dataset.f] = el.value);
    state.plan = r.value;
    svc().addons.forEach(a => { if (a.showIf && !a.showIf(state)) state.addons.delete(a.key); });
    saveDraft(); const y = scrollY; stepDetails(); scrollTo(0, y);
  });
  stage.querySelectorAll("input[name=method]").forEach(r => r.onchange = () => { state.method = r.value; saveDraft(); });
  stage.querySelectorAll("input[name=addon]").forEach(r => r.onchange = () => {
    const a = s.addons.find(x => x.key === r.value);
    if (r.checked && a && a.group) s.addons.filter(x => x.group === a.group && x.key !== a.key).forEach(x => {
      state.addons.delete(x.key); const el = stage.querySelector(`input[name=addon][value="${x.key}"]`); if (el) el.checked = false; });
    r.checked ? state.addons.add(r.value) : state.addons.delete(r.value); saveDraft(); drawFields(); drawSum(); });
  $("#c_heard").onchange = e => { state.customer.heard = e.target.value; e.target.classList.remove("invalid"); $("#refBox").classList.toggle("hidden", e.target.value !== "朋友介紹"); saveDraft(); };
  $("#c_ref").oninput = e => { state.customer.ref = e.target.value; e.target.classList.remove("invalid"); saveDraft(); };
  $("#c_email").oninput = e => { state.customer.email = e.target.value; e.target.classList.remove("invalid"); saveDraft(); };
  drawFields(); drawSum();

  $("#next").onclick = () => {
    const problems = [];
    if (!state.plan) problems.push(["#plans", "請選擇方案"]);
    if (s.methods && !state.method) problems.push([".choices.inline", "請選擇溝通方式"]);
    for (const f of visibleFields()) if (f.required && !String(state.values[f.key] || "").trim()) problems.push(["#f_" + f.key, `請填寫「${f.label}」`]);
    petList().forEach((p, i) => { if (!p.name.trim()) problems.push(["#pet_" + i, `請填寫寵物 ${i + 1} 的名字`]); });
    if (!state.customer.heard) problems.push(["#c_heard", "請選擇你是怎麼知道 Yura 的"]);
    else if (state.customer.heard === "朋友介紹" && !(state.customer.ref || "").trim()) problems.push(["#c_ref", "請填寫介紹你來的朋友"]);
    const em = (state.customer.email || "").trim();
    if (!em) problems.push(["#c_email", "請填寫 Email"]);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) problems.push(["#c_email", "Email 格式好像不對，請再確認一下"]);
    if (problems.length) {
      problems.forEach(([sel]) => { const el = $(sel); el && el.classList.add("invalid"); });
      const first = $(problems[0][0]);
      first && first.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(problems[0][1]);
      return;
    }
    go(3);
  };
  bindBack();
}

// ---------- Step 3 時段 ----------
async function stepSlots() {
  const s = svc();
  if (slots === null) {
    stage.innerHTML = `<p class="muted">正在讀取可預約時段…</p>`;
    try { slots = await listOpenSlots(); } catch (e) { console.warn(e); slots = []; }
  }
  // 移除已經不存在的選擇
  state.picks = state.picks.filter(id => slots.some(x => x.id === id && x.status !== "full")).slice(0, 1);
  const byDay = {};
  slots.forEach(x => (byDay[x.date] ||= []).push(x));
  const required = s.slot === "required";
  const none = slots.length === 0;
  state.noFit = false; state.customTimes = ""; // 只能選後台開放的時段

  stage.innerHTML = `
    ${s.slotHint ? `<div class="note">${esc(s.slotHint)}</div>` : ""}
    ${none ? `<div class="note">目前的時段都約滿了，請到 LINE 詢問下一次開放的時間 🙏</div>` : `
      <p><b>先點日期，再選時段。</b></p>
      <div class="cal" id="cal"></div>
      <div id="dayTimes"></div>
      <div id="pickSum"></div>`}
    ${navBtns(2)}`;

  // ---- 日曆 ----
  const WDN = ["日", "一", "二", "三", "四", "五", "六"];
  const days = Object.keys(byDay).sort();
  const openDays = days.filter(d => byDay[d].some(x => x.status !== "full"));
  const months = [...new Set(days.map(d => d.slice(0, 7)))];
  if (!none) {
    if (!state.calDay || !byDay[state.calDay]) state.calDay = state.picks.length ? slots.find(x => x.id === state.picks[0]).date : (openDays[0] || days[0]);
    if (!state.calMonth || !months.includes(state.calMonth)) state.calMonth = state.calDay.slice(0, 7);
  }
  const dayHasPick = d => state.picks.some(id => slots.find(x => x.id === id)?.date === d);
  const drawCal = () => {
    const [y, m] = state.calMonth.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mi = months.indexOf(state.calMonth);
    let cells = "";
    for (let i = 0; i < first; i++) cells += `<span class="cd empty"></span>`;
    for (let d = 1; d <= n; d++) {
      const key = `${state.calMonth}-${String(d).padStart(2, "0")}`, list = byDay[key];
      const nOpen = list ? list.filter(x => x.status !== "full").length : 0;
      const wd = (first + d - 1) % 7;
      cells += list
        ? `<button type="button" class="cd open ${nOpen ? "" : "fullday"} ${key === state.calDay ? "sel" : ""} ${dayHasPick(key) ? "picked" : ""} ${wd === 0 || wd === 6 ? "we" : ""}" data-day="${key}"><b>${d}</b><i>${nOpen ? nOpen + " 個時段" : "約滿"}</i></button>`
        : `<span class="cd off"><b>${d}</b></span>`;
    }
    $("#cal").innerHTML = `<div class="cal-h">
        <button type="button" class="cal-nav" data-mv="-1" ${mi <= 0 ? "disabled" : ""} aria-label="上個月">‹</button>
        <b>${y} 年 ${m} 月</b>
        <button type="button" class="cal-nav" data-mv="1" ${mi >= months.length - 1 ? "disabled" : ""} aria-label="下個月">›</button></div>
      <div class="cal-w">${WDN.map(w => `<span>${w}</span>`).join("")}</div>
      <div class="cal-g">${cells}</div>`;
    $("#cal").querySelectorAll("[data-mv]").forEach(bt => bt.onclick = () => {
      state.calMonth = months[mi + +bt.dataset.mv]; const inMonth = days.find(d => d.startsWith(state.calMonth));
      if (!state.calDay?.startsWith(state.calMonth)) state.calDay = openDays.find(d => d.startsWith(state.calMonth)) || inMonth; saveDraft(); drawAll();
    });
    $("#cal").querySelectorAll("[data-day]").forEach(bt => bt.onclick = () => { state.calDay = bt.dataset.day; saveDraft(); drawAll();
      $("#dayTimes").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
  };
  const drawTimes = () => {
    const list = byDay[state.calDay] || [];
    $("#dayTimes").innerHTML = list.length ? `<div class="slot-day"><h4>${esc(slotLabel(list[0]).split("）")[0])}）${list.some(x => x.status !== "full") ? "可以選的時段" : "已全部約滿"}</h4>
      <div class="slot-list">${list.map(x => { const i = state.picks.indexOf(x.id);
        if (x.status === "full") return `<button type="button" class="slot full" disabled>${esc(x.time)}<span class="tag">已約滿</span></button>`;
        return `<button type="button" class="slot ${i === 0 ? "p1" : ""}" data-id="${x.id}">${esc(x.time)}</button>`; }).join("")}</div></div>` : "";
    $("#dayTimes").querySelectorAll(".slot:not(.full)").forEach(bt => bt.onclick = () => {
      const id = bt.dataset.id, i = state.picks.indexOf(id);
      state.picks = i >= 0 ? [] : [id];
      saveDraft(); drawAll();
    });
  };
  const drawSum = () => {
    $("#pickSum").innerHTML = state.picks.length ? `<div class="pick-sum">${state.picks.map((id, i) => `<div><span class="pk p1">你選的時間</span>${esc(slotLabel(slots.find(x => x.id === id)))}<button type="button" class="pk-x" data-rm="${id}" aria-label="取消">✕</button></div>`).join("")}</div>` : "";
    $("#pickSum").querySelectorAll("[data-rm]").forEach(bt => bt.onclick = () => { state.picks = state.picks.filter(x => x !== bt.dataset.rm); saveDraft(); drawAll(); });
  };
  const drawAll = () => { if (none) return; drawCal(); drawTimes(); drawSum(); };
  drawAll();

  $("#next").onclick = () => {
    if (!state.picks.length) return toast(none ? "目前時段都約滿了，請到 LINE 詢問 🙏" : "請先點日期，再選一個時段");
    go(4);
  };
  bindBack();
}

// ---------- Step 4 確認 ----------
function rows() {
  const s = svc(), p = planObj();
  const r = [["服務", s.name], ["方案", `${p.label}${p.meta ? "（" + p.meta + "）" : ""}`]];
  if (state.method) r.push(["溝通方式", state.method]);
  const ad = chosenAddons();
  if (ad.length) r.push(["加購", ad.map(a => `${a.label} +${money(a.price)}`).join("\n")]);
  visibleFields().forEach(f => {
    if (f.type === "pets") { petList().forEach((p, i) => r.push([`寵物 ${i + 1}`, `${p.name.trim()}${petText(p) ? "（" + petText(p) + "）" : ""}`])); return; }
    const v = String(state.values[f.key] || "").trim(); if (v) r.push([f.label.replace(/^\d+\.\s*/, ""), v]);
  });
  if (state.customer.heard) r.push(["怎麼知道 Yura", heardText()]);
  r.push(["Email", (state.customer.email || "").trim()]);
  if (hasSlotStep()) {
    r.push(["預約時段", state.picks.slice(0, 1).map(id => slotLabel(slots.find(x => x.id === id))).join("")]);
  }
  return r;
}

function stepConfirm() {
  const r = rows();
  stage.innerHTML = `
    <p>請確認以下資料，送出後就會傳到 Yura 的後台。</p>
    <div class="summary">${r.map(([k, v]) => `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}
      <div class="row total"><div class="k">預估金額</div><div class="v">${money(total())}</div></div></div>
    <label class="choice" style="margin-top:16px"><input type="checkbox" id="final" ${state.final ? "checked" : ""}>
      <span class="c-main"><span class="c-t" style="font-weight:400">我是毛孩的主要照顧者，也了解「完成全額付款，才算預約成功」。</span></span></label>
    ${navBtns(hasSlotStep() ? 3 : 2, "送出預約", "submit")}`;
  const sub = $("#submit");
  const f = $("#final");
  sub.disabled = !f.checked;
  f.onchange = () => { state.final = f.checked; sub.disabled = !f.checked; saveDraft(); };
  sub.onclick = submit;
  bindBack();
}

async function submit() {
  const sub = $("#submit");
  sub.disabled = true; sub.innerHTML = '<span class="spinner"></span> 送出中…';
  const s = svc(), p = planObj();
  const data = {
    service: s.key, serviceName: s.name, plan: p.key, planLabel: `${p.label}${p.meta ? "（" + p.meta + "）" : ""}`,
    price: p.price, total: total(),
    addons: chosenAddons().map(a => ({ key: a.key, label: a.label, price: a.price })),
    method: state.method || "",
    petName: (petsField() ? petList().map(p => p.name.trim()).join("、") : String(state.values.petName || "").trim()).slice(0, 200),
    fields: [
      ...petList().map((p, i) => ({ key: "pet" + (i + 1), label: `寵物 ${i + 1}`, value: `${p.name.trim()}${petText(p) ? "（" + petText(p) + "）" : ""}`.slice(0, 300) })),
      ...visibleFields().filter(f => f.type !== "pets").map(f => ({ key: f.key, label: f.label, value: String(state.values[f.key] || "").trim().slice(0, 3000) }))
    ].filter(x => x.value),
    customer: { name: String(state.values.ownerName || "").trim().slice(0, 100), email: (state.customer.email || "").trim().slice(0, 200), heard: heardText() },
    slotIds: hasSlotStep() ? [...state.picks] : [],
    slots: hasSlotStep() ? state.picks.map(id => slots.find(y => y.id === id)).filter(Boolean).map(x => ({ date: x.date, time: x.time })) : [],
    slotLabels: hasSlotStep() ? state.picks.map(id => slotLabel(slots.find(x => x.id === id))) : [],
    customTimes: hasSlotStep() && state.noFit ? state.customTimes.trim().slice(0, 1000) : "",
    agreed: true
  };
  try {
    state.code = await createBooking(data);
    state.summary = rows();
    clearDraft();
    go(5);
  } catch (e) {
    console.error(e);
    if (e.message === "SLOT_TAKEN") {
      toast("你選的時段剛好被別人預約了，請重新選擇 🙏");
      slots = null; state.picks = [];
      go(3);
    } else {
      toast("送出失敗，請稍後再試，或直接到 LINE 告訴我");
      sub.disabled = false; sub.textContent = "送出預約";
    }
  }
}

// ---------- Step 5 完成 ----------
function bankHtml() {
  const b = settings.bank;
  if (!b || !b.account) return "";
  return `<div class="pay-box">
    <h3>💳 匯款資訊</h3>
    <div class="pay-row"><span>銀行</span><b>${esc(b.name)}（${esc(b.code)}）</b></div>
    <div class="pay-row"><span>帳號</span><b class="acct">${esc(b.account)}</b><button class="btn small" id="copyAcct" type="button">複製帳號</button></div>
    <div class="pay-row"><span>金額</span><b class="emph">${money(total())}</b></div>
    ${b.richart ? `<a class="btn primary" href="${esc(b.richart)}" target="_blank" rel="noopener">用 Richart App 轉帳（自動帶入帳號）</a>` : ""}
    <div class="pay-form" id="payForm">
      <b>匯款完成後，請填寫：</b>
      <div class="form-grid">
        <div class="field"><label for="p_name">匯款人姓名<span class="req">*</span></label><input type="text" id="p_name" autocomplete="name" placeholder="帳戶的名字"></div>
        <div class="field"><label for="p_last5">帳號後五碼<span class="req">*</span></label><input type="text" id="p_last5" inputmode="numeric" maxlength="5" placeholder="例：12345"></div>
      </div>
      <button class="btn primary big" id="payDone" type="button">我已匯款，通知 Yura</button>
    </div>
    <div class="note hidden" id="payOk">✅ 已經通知 Yura 了，確認收款後就預約成功 ✨</div>
  </div>`;
}

function stepDone() {
  const text = ["【Yura 線上預約】", "", ...state.summary.map(([k, v]) => `${k}：${v}`), `預估金額：${money(total())}`, "", "毛孩照片會另外傳送。"].join("\n");
  const h = lineHref(settings);
  const send = lineMessageHref(settings, text);
  stage.innerHTML = `
    <p class="center">已經收到你的預約了，謝謝你 ✨</p>
    <div class="note warn"><b>最後一步：</b>${send
      ? "按下面的「傳到 LINE」，LINE 會自動打開並幫你填好預約資料，<b>直接按送出</b>就可以了。接著再<b>傳毛孩照片</b>給我。"
      : "請按下面的按鈕複製預約資料，回到 LINE 貼給我，並且<b>一起傳毛孩照片</b>。"}</div>
    <div class="row-btns">
      ${send ? `<a class="btn line big" href="${send}" target="_blank" rel="noopener">📩 傳到 LINE</a>` : ""}
      <button class="btn ${send ? "" : "primary big"}" id="copy" type="button">${send ? "LINE 沒有自動填好？改用複製" : "複製預約資料"}</button>
      ${!send && h ? `<a class="btn line big" href="${h}" target="_blank" rel="noopener">開啟 LINE</a>` : ""}
    </div>
    ${bankHtml()}
    <div class="note">📷 記得準備：${svc().prepare.map(esc).join("；")}</div>
    <div class="row-btns"><a class="btn ghost" href="index.html">回到首頁</a></div>`;
  const pd = $("#payDone");
  if (pd) pd.onclick = async () => {
    const name = $("#p_name").value.trim(), l5 = $("#p_last5").value.trim();
    if (!name) { $("#p_name").classList.add("invalid"); return toast("請填寫匯款人姓名"); }
    if (!/^\d{5}$/.test(l5)) { $("#p_last5").classList.add("invalid"); return toast("帳號後五碼請填 5 個數字"); }
    pd.disabled = true; pd.innerHTML = '<span class="spinner"></span> 送出中…';
    try { await submitPayment(state.code, name, l5, total()); } catch (e) { console.warn(e); }
    const msg = `【已匯款】\n寵物：${String(state.values.petName || (state.pets || []).map(p => p.name).join("、") || "")}\n金額：${money(total())}\n匯款人：${name}\n帳號後五碼：${l5}`;
    $("#payForm").classList.add("hidden"); $("#payOk").classList.remove("hidden");
    const href = lineMessageHref(settings, msg);
    $("#payOk").innerHTML = `✅ 已經記錄好了！${href ? `再按這裡<a class="btn line small" href="${href}" target="_blank" rel="noopener">📩 傳到 LINE 告訴 Yura</a>，` : ""}確認收款後就預約成功 ✨`;
  };
  const ca = $("#copyAcct");
  if (ca) ca.onclick = async () => toast(await copyText(settings.bank.account) ? "帳號已複製 ✨" : "複製失敗，請手動輸入帳號");
  $("#copy").onclick = async () => {
    const ok = await copyText(text);
    toast(ok ? "已複製 ✨ 回到 LINE 直接貼上就可以了" : "複製失敗，請截圖這個畫面傳給我");
  };
}

function render() {
  header();
  [stepService, stepMust, stepDetails, stepSlots, stepConfirm, stepDone][state.step]();
}

(async () => {
  loadDraft();
  settings = await getSettings();
  const q = new URLSearchParams(location.search).get("service");
  if (q && SERVICES[q] && state.service !== q) {
    Object.assign(state, { service: q, step: 1, plan: "", method: "", addons: new Set(), agreed: [], picks: [], noFit: false });
  }
  const pl = new URLSearchParams(location.search).get("plan");
  if (pl && svc()?.plans.some(p => p.key === pl)) state.plan = pl;
  if (!settings.bookingOpen) state.step = 0;
  if (state.step >= 1 && !svc()) state.step = 0;
  if (state.step === 5) state.step = 0;
  if (state.step === 4 && hasSlotStep()) {
    try { slots = await listOpenSlots(); } catch { slots = []; }
    const before = state.picks.length;
    state.picks = state.picks.filter(id => slots.some(x => x.id === id));
    if (state.picks.length !== before) state.step = 3;
  }
  render();
})();
