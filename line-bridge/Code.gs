/**
 * Yura｜LINE@ 訊息 → 預約管理後台
 * 客人在 LINE 官方帳號傳的文字和照片，會自動存進 Firebase（後台的「💬 LINE」）
 *
 * 設定方式（照 Claude 的步驟做）：
 *   1. 專案設定 → 指令碼屬性：
 *        LINE_TOKEN = LINE Developers 的 Channel access token（長期）
 *        HOOK_KEY   = 一串密碼（要跟 LINE Webhook 網址後面的 ?key= 一樣）
 *   2. 執行一次 setup 函式，允許權限
 *   3. 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取權：所有人）
 */
var PROJECT = 'yura-booking';
var FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/';
var MAX_PHOTO = 700000; // 存進後台的照片大小上限（太大的只存在雲端硬碟）

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

// ---- LINE 會把訊息送到這裡 ----
function doPost(e) {
  try {
    if (!prop('HOOK_KEY') || !e || !e.parameter || e.parameter.key !== prop('HOOK_KEY')) return out({ ok: false });
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    (body.events || []).forEach(function (ev) { try { handle(ev); } catch (err) { console.error(err); } });
  } catch (err) { console.error(err); }
  return out({ ok: true });
}
function doGet() { return out({ ok: true, service: 'Yura LINE bridge' }); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handle(ev) {
  if (ev.type !== 'message' || !ev.source || ev.source.type !== 'user') return;
  var uid = ev.source.userId, m = ev.message, ts = ev.timestamp || Date.now();
  var profile = getProfile(uid);
  var msg = { userId: uid, type: m.type, ts: ts, createdAt: Date.now(), name: profile.displayName || '' };

  if (m.type === 'text') msg.text = String(m.text || '').slice(0, 5000);
  else if (m.type === 'image') {
    var blob = lineContent(m.id, false);
    if (blob) {
      var file = saveToDrive(blob, profile.displayName || uid, ts);
      msg.driveUrl = file.getUrl();
      var small = lineContent(m.id, true) || blob; // 縮圖
      var bytes = small.getBytes();
      var data = 'data:' + (small.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(bytes);
      if (data.length < MAX_PHOTO * 1.4) {
        var pid = 'line_' + m.id;
        fsSet('photos/' + pid, { lineUserId: uid, data: data, createdAt: Date.now(), lineMsgId: m.id });
        msg.photoId = pid;
      }
    }
    msg.text = '［照片］';
  } else if (m.type === 'sticker') msg.text = '［貼圖］';
  else if (m.type === 'video') msg.text = '［影片］';
  else if (m.type === 'audio') msg.text = '［語音］';
  else if (m.type === 'file') msg.text = '［檔案］' + (m.fileName || '');
  else if (m.type === 'location') msg.text = '［位置］' + (m.address || '');
  else msg.text = '［' + m.type + '］';

  fsSet('lineMessages/' + m.id, msg);
  // 從客人貼的預約資料抓 Email，用來對應後台的客人
  var em = (msg.text || '').match(/Email[：:]\s*([^\s]+@[^\s]+)/);
  var user = { name: profile.displayName || '', picture: profile.pictureUrl || '', lastAt: ts, lastText: (msg.text || '').slice(0, 80) };
  if (em) user.email = em[1].toLowerCase();
  fsUpdate('lineUsers/' + uid, user);
}

// ---- LINE API ----
function getProfile(uid) {
  try {
    var r = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + uid, { headers: { Authorization: 'Bearer ' + prop('LINE_TOKEN') }, muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : {};
  } catch (e) { return {}; }
}
function lineContent(id, preview) {
  var url = 'https://api-data.line.me/v2/bot/message/' + id + '/content' + (preview ? '/preview' : '');
  var r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + prop('LINE_TOKEN') }, muteHttpExceptions: true });
  return r.getResponseCode() === 200 ? r.getBlob() : null;
}

// ---- Google 雲端硬碟（原圖備份，只有你看得到）----
function saveToDrive(blob, who, ts) {
  var root = folder_(DriveApp.getRootFolder(), 'Yura LINE 照片');
  var sub = folder_(root, String(who).replace(/[\\/]/g, '_'));
  var d = Utilities.formatDate(new Date(ts), 'Asia/Taipei', 'yyyyMMdd_HHmmss');
  return sub.createFile(blob.setName(d + '.jpg'));
}
function folder_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

// ---- Firestore（用你的 Google 帳號權限寫入）----
function fsSet(path, obj) { return fsWrite(path, obj, null); }
function fsUpdate(path, obj) { return fsWrite(path, obj, Object.keys(obj)); }
function fsWrite(path, obj, mask) {
  var url = FS + path + (mask ? '?' + mask.map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&') : '');
  var r = UrlFetchApp.fetch(url, {
    method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT },
    payload: JSON.stringify({ fields: toFields(obj) })
  });
  if (r.getResponseCode() >= 300) throw new Error('Firestore ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  return r;
}
function toFields(o) {
  var f = {};
  Object.keys(o).forEach(function (k) {
    var v = o[k];
    if (v === null || v === undefined) f[k] = { nullValue: null };
    else if (typeof v === 'number') f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === 'boolean') f[k] = { booleanValue: v };
    else f[k] = { stringValue: String(v) };
  });
  return f;
}

// ---- 第一次設定時執行：測試能不能寫進後台 ----
function setup() {
  if (!prop('LINE_TOKEN')) throw new Error('還沒設定指令碼屬性 LINE_TOKEN');
  if (!prop('HOOK_KEY')) throw new Error('還沒設定指令碼屬性 HOOK_KEY');
  folder_(DriveApp.getRootFolder(), 'Yura LINE 照片');
  fsUpdate('lineUsers/_test', { name: '連線測試（可以刪除）', lastAt: Date.now(), lastText: '設定成功 🎉' });
  Logger.log('✅ 設定成功！可以去部署了');
}
