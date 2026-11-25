import { isDemo } from "./db.js?v=20261126d";
import { CONFIG } from "./config.js?v=20261126d";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function chrome(active, { cta = true } = {}) {
  const links = [
    ["index.html", "服務總覽", "home"],
    ["about.html", "認識 Yura", "about"],
    ["illustration.html", "似顏繪", "illustration", "hide-sm"]
  ];
  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.innerHTML = `<div class="nav-in">
    <a class="nav-brand" href="index.html"><small>寵物溝通師</small>Yura</a>
    ${links.map(([h, t, k, c = ""]) => `<a class="nl ${c} ${k === active ? "on" : ""}" href="${h}">${t}</a>`).join("")}
    ${cta ? `<a class="btn primary" href="book.html">立即預約</a>` : ""}
  </div>`;
  document.body.prepend(nav);
  if (isDemo && !CONFIG.lineMode) {
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = `示範模式：資料只存在這台裝置的瀏覽器裡，尚未連接正式資料庫。設定方式見 <a href="https://github.com/yura-pet/yura-pet/blob/main/SETUP.md" target="_blank" rel="noopener">SETUP.md</a>`;
    document.body.prepend(bar);
  }
  const f = document.createElement("footer");
  f.className = "footer";
  f.innerHTML = `<div><a href="index.html">服務總覽</a>·<a href="about.html">認識 Yura</a>·<a href="illustration.html">似顏繪</a>·<a href="book.html">線上預約</a>·<a href="https://www.instagram.com/yura_vvvvvv/" target="_blank" rel="noopener">Instagram</a></div>© Yura Pet Communication`;
  (document.querySelector(".wrap") || document.body).append(f);
}

let tt;
export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.append(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(tt);
  tt = setTimeout(() => el.classList.remove("show"), 2600);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.append(t); t.focus(); t.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    t.remove(); return ok;
  }
}

// LINE 連結：有網址用網址，只有 ID 就組成加好友連結
export function lineHref(s) {
  if (s.lineUrl) return s.lineUrl;
  if (s.lineId) return "https://line.me/R/ti/p/" + encodeURIComponent(s.lineId.startsWith("@") ? s.lineId : "@" + s.lineId);
  return "";
}

// 開啟 LINE 官方帳號聊天室，並自動帶入要傳的文字（需要 LINE ID，例如 @yura）
export function lineMessageHref(s, text) {
  if (!s.lineId) return "";
  const id = s.lineId.startsWith("@") ? s.lineId : "@" + s.lineId;
  return `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(text)}`;
}
