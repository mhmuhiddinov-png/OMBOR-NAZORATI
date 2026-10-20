/**
 * Ombor nazorati — Google Sheets ⇄ Firestore sinxronizatsiyasi (Mijozlar, Agentlar)
 *
 * Qanday ishlaydi
 *  • Jadvalda o‘zgartirilgan qator → Firestore (clients / agents). O‘zgarish qilingan zahoti (onEdit)
 *    va har 5 daqiqada.
 *  • Ilovada (Chiqim / Mijozlar bo‘limi) qo‘shilgan yoki o‘zgartirilgan mijoz → jadvalga, 5 daqiqa ichida.
 *  • Jadvaldan o‘chirilgan qator ilovadan O‘CHIRILMAYDI: u «jadvalda yo‘q» deb belgilanadi (inSheet:false),
 *    eski yuk xatlari va hisobotlarda saqlanib qoladi.
 *  • Hech qanday parol yoki kalit kerak emas: skript sizning Google hisobingiz nomidan ishlaydi,
 *    shuning uchun bu hisob Firebase loyihasining egasi (Owner) bo‘lishi kerak.
 *
 * O‘rnatish: README bo‘limiga qarang (Kengaytmalar → Apps Script, appsscript.json, «Ombor» menyusi).
 */
var PROJECT_ID = 'ombor-nazorati-eaedc';
var DOCS = 'projects/' + PROJECT_ID + '/databases/(default)/documents';
var BASE = 'https://firestore.googleapis.com/v1/' + DOCS;
var STATE_TAB = '_sync';

var TABLES = [
  { key: 'clients', tab: 'Mijozlar', coll: 'clients',
    cols: ['code', 'name', 'agent', 'market', 'addrs', 'phone', 'note'], status: 7, id: 8, hash: 9, width: 10,
    header: ['Kod', 'Mijoz nomi', 'Agent', 'Bozor', 'Yukni qabul qilish manzillari (; bilan)', 'Telefon', 'Izoh', 'Holat', 'ID', 'Hash'],
    idFor: function (o) { return o.code ? 'k' + idOf_(o.code) : 'c-' + (idOf_(o.name) || shortHash_(o.name)); } },
  { key: 'agents', tab: 'Agentlar', coll: 'agents',
    cols: ['name', 'short', 'market', 'phone'], status: 4, id: 5, hash: 6, width: 7,
    header: ['Agent (F.I.Sh.)', 'Qisqa ism', 'Bozor', 'Telefon', 'Holat', 'ID', 'Hash'],
    idFor: function (o) { return 'a-' + (idOf_(o.name) || shortHash_(o.name)); } }
];

/* ---------- menu & triggers ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Ombor')
    .addItem('Hozir sinxronlash', 'syncNow')
    .addItem('To‘liq sinxronlash (hammasini tekshirish)', 'syncFull')
    .addSeparator()
    .addItem('Avtomatik yangilashni yoqish', 'installTriggers')
    .addItem('Avtomatik yangilashni o‘chirish', 'removeTriggers')
    .addToUi();
}

function installTriggers() {
  removeTriggers();
  var ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('onEditSync').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(5).create();
  var r = sync_(true);
  ss.toast('Avtomatik yangilash yoqildi. ' + r, 'Ombor', 8);
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['onEditSync', 'syncNow'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
}

function onEditSync(e) {
  var name = e && e.range && e.range.getSheet().getName();
  if (name && !TABLES.some(function (t) { return t.tab === name; })) return;
  sync_(false, true);
}
function syncNow() { var r = sync_(false); try { SpreadsheetApp.getActive().toast(r, 'Ombor', 5); } catch (e) {} return r; }
function syncFull() { var r = sync_(true); try { SpreadsheetApp.getActive().toast(r, 'Ombor', 8); } catch (e) {} return r; }

/* ---------- main ---------- */
function sync_(full, quiet) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(quiet ? 1000 : 25000)) return 'Boshqa sinxron ishlayapti — keyinroq.';
  try {
    var props = PropertiesService.getScriptProperties();
    var start = Date.now(), out = [], stats = {};
    TABLES.forEach(function (t) {
      var since = full ? 0 : +(props.getProperty('last_' + t.key) || 0);
      var r = syncTable_(t, since, start);
      props.setProperty('last_' + t.key, String(start));
      stats[t.key] = r.rows;
      out.push(t.tab + ': ' + r.up + ' → ilova, ' + r.down + ' → jadval, ' + r.added + ' yangi, ' + r.gone + ' jadvalda yo‘q');
    });
    commit_([fsWrite_('settings/sync', { at: start, by: 'Google Sheets',
      clients: stats.clients || 0, agents: stats.agents || 0,
      url: SpreadsheetApp.getActive().getUrl() }, ['at', 'by', 'clients', 'agents', 'url'])]);
    return out.join(' · ');
  } catch (err) {
    console.error(err);
    return 'Xato: ' + (err && err.message || err);
  } finally {
    lock.releaseLock();
  }
}

function syncTable_(t, since, now) {
  var sh = sheet_(t);
  var last = sh.getLastRow();
  var data = last > 1 ? sh.getRange(2, 1, last - 1, t.width).getValues() : [];
  var changed = fetchChanged_(t.coll, since);          // docs changed in the app since last run
  var prev = readState_(t.key);                        // IDs that were in the sheet last time
  var writes = [], seen = {}, res = { up: 0, down: 0, added: 0, gone: 0, rows: 0 };
  var idCells = [], hashCells = [], rowCells = [];

  data.forEach(function (row, i) {
    var o = rowObj_(t, row);
    if (!o.name) return;
    var id = String(row[t.id] || '').trim() || t.idFor(o);
    if (seen[id]) { id = id + '-' + (i + 2); }          // duplicate name in sheet → separate record
    seen[id] = true; res.rows++;
    if (!row[t.id]) idCells.push([i, id]);
    var h = hashObj_(t, o), stored = String(row[t.hash] || '');
    var doc = changed[id];
    if (h !== stored) {                                  // edited in the sheet (or first run)
      if (doc) o = merge_(t, o, doc, !stored);
      writes.push(fsWrite_(t.coll + '/' + id, Object.assign({}, o, { inSheet: true, upd: now }), t.cols.concat(['inSheet', 'upd'])));
      var h2 = hashObj_(t, o);
      if (h2 !== h) rowCells.push([i, o]);
      hashCells.push([i, h2]); res.up++;
    } else if (doc) {                                    // edited in the app
      var d = docObj_(t, doc), dh = hashObj_(t, d);
      if (dh !== stored) { rowCells.push([i, d]); hashCells.push([i, dh]); res.down++; }
      if (doc.inSheet !== true) writes.push(fsWrite_(t.coll + '/' + id, { inSheet: true }, ['inSheet']));
    }
  });

  // rows deleted from the sheet → keep the record, mark it
  Object.keys(prev).forEach(function (id) {
    if (!seen[id]) { writes.push(fsWrite_(t.coll + '/' + id, { inSheet: false, sheetGone: now }, ['inSheet', 'sheetGone'])); res.gone++; }
  });

  // records created in the app that the sheet has never had → append
  var append = [];
  Object.keys(changed).forEach(function (id) {
    var doc = changed[id];
    if (seen[id] || prev[id] || doc.inSheet === false || !doc.name) return;
    var d = docObj_(t, doc), r = objRow_(t, d);
    r[t.status] = doc.src === 'app' ? 'Ilovada qo‘shilgan' : '';
    r[t.id] = id; r[t.hash] = hashObj_(t, d);
    append.push(r); seen[id] = true; res.added++; res.rows++;
    writes.push(fsWrite_(t.coll + '/' + id, { inSheet: true }, ['inSheet']));
  });

  // write back to the sheet
  idCells.forEach(function (c) { sh.getRange(c[0] + 2, t.id + 1).setValue(c[1]); });
  hashCells.forEach(function (c) { sh.getRange(c[0] + 2, t.hash + 1).setValue(c[1]); });
  rowCells.forEach(function (c) {
    var r = objRow_(t, c[1]);
    sh.getRange(c[0] + 2, 1, 1, t.cols.length).setValues([r.slice(0, t.cols.length)]);
  });
  if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, t.width).setValues(append);

  commit_(writes);
  writeState_(t.key, Object.keys(seen));
  return res;
}

/* first run: keep what the app already knows (blank sheet cells, extra addresses) */
function merge_(t, o, doc, firstTime) {
  var d = docObj_(t, doc), r = Object.assign({}, o);
  if (r.addrs) r.addrs = uniq_((o.addrs || []).concat(d.addrs || []));
  if (firstTime) t.cols.forEach(function (k) { if (k !== 'addrs' && !r[k] && d[k]) r[k] = d[k]; });
  return r;
}

/* ---------- sheet helpers ---------- */
function sheet_(t) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(t.tab);
  if (!sh) { sh = ss.insertSheet(t.tab); sh.getRange(1, 1, 1, t.width).setValues([t.header]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function rowObj_(t, row) {
  var o = {};
  t.cols.forEach(function (k, j) {
    var v = row[j];
    if (k === 'addrs') o.addrs = uniq_(String(v || '').split(/[;\n]+/));
    else o[k] = String(v == null ? '' : v).trim();
  });
  return o;
}
function objRow_(t, o) {
  var r = new Array(t.width).fill('');
  t.cols.forEach(function (k, j) { r[j] = k === 'addrs' ? (o.addrs || []).join('; ') : (o[k] || ''); });
  // keep text like 'ABC' or =... as text
  return r.map(function (v) { return typeof v === 'string' && /^[=+\-@']/.test(v) ? "'" + v : v; });
}
function docObj_(t, doc) {
  var o = {};
  t.cols.forEach(function (k) { o[k] = k === 'addrs' ? uniq_(doc.addrs || []) : String(doc[k] == null ? '' : doc[k]).trim(); });
  return o;
}
function hashObj_(t, o) {
  var s = JSON.stringify(t.cols.map(function (k) { return k === 'addrs' ? (o.addrs || []).join('|') : (o[k] || ''); }));
  return shortHash_(s);
}
function readState_(key) {
  var sh = SpreadsheetApp.getActive().getSheetByName(STATE_TAB), m = {};
  if (!sh || sh.getLastRow() < 1) return m;
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(function (r) { if (r[0] === key && r[1]) m[r[1]] = true; });
  return m;
}
function writeState_(key, ids) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(STATE_TAB);
  if (!sh) { sh = ss.insertSheet(STATE_TAB); sh.hideSheet(); }
  var keep = sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), 2).getValues().filter(function (r) { return r[0] && r[0] !== key; }) : [];
  var rows = keep.concat(ids.map(function (id) { return [key, id]; }));
  sh.clearContents();
  if (rows.length) sh.getRange(1, 1, rows.length, 2).setValues(rows);
}

/* ---------- Firestore REST ---------- */
function req_(method, url, body) {
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID } };
  if (body) opt.payload = JSON.stringify(body);
  for (var i = 0; i < 4; i++) {
    var r = UrlFetchApp.fetch(url, opt), c = r.getResponseCode();
    if (c < 300) return JSON.parse(r.getContentText() || '{}');
    if (c === 429 || c >= 500) { Utilities.sleep(800 * (i + 1)); continue; }
    if (c === 403) throw new Error('Firebase ruxsat bermadi (403). Bu Google hisobi «' + PROJECT_ID + '» loyihasida Owner/Editor bo‘lishi kerak.');
    throw new Error('Firestore ' + c + ': ' + r.getContentText().slice(0, 300));
  }
  throw new Error('Firestore javob bermadi');
}
function fetchChanged_(coll, since) {
  var m = {};
  if (!since) {                                        // full: list everything
    var tok = '';
    do {
      var r = req_('get', BASE + '/' + coll + '?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
      (r.documents || []).forEach(function (d) { m[d.name.split('/').pop()] = fromFs_(d.fields || {}); });
      tok = r.nextPageToken || '';
    } while (tok);
    return m;
  }
  var res = req_('post', BASE + ':runQuery', { structuredQuery: { from: [{ collectionId: coll }],
    where: { fieldFilter: { field: { fieldPath: 'upd' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(since - 60000) } } } } });
  (res || []).forEach(function (x) { if (x.document) m[x.document.name.split('/').pop()] = fromFs_(x.document.fields || {}); });
  return m;
}
function fsWrite_(path, obj, mask) {
  return { update: { name: DOCS + '/' + path, fields: toFs_(obj) }, updateMask: { fieldPaths: mask } };
}
function commit_(writes) {
  for (var i = 0; i < writes.length; i += 200) req_('post', BASE + ':commit', { writes: writes.slice(i, i + 200) });
}
function toFs_(o) {
  var f = {};
  Object.keys(o).forEach(function (k) { f[k] = val_(o[k]); });
  return f;
}
function val_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val_) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
function fromFs_(fields) {
  var o = {};
  Object.keys(fields).forEach(function (k) { o[k] = unval_(fields[k]); });
  return o;
}
function unval_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unval_);
  if ('mapValue' in v) return fromFs_(v.mapValue.fields || {});
  return null;
}

/* ---------- same name → ID rules as the app (index.html: nrm / idOf) ---------- */
var TR = { 'ў': 'u', 'қ': 'k', 'ғ': 'g', 'ҳ': 'h', 'ё': 'yo', 'ю': 'yu', 'я': 'ya', 'ж': 'j', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ь': '',
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
  'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ы': 'i', 'э': 'e' };
function nrm_(s) {
  var t = String(s || '').toLowerCase().replace(/[‘’ʻʼ`]/g, "'").replace(/o'/g, 'u').replace(/g'/g, 'g').replace(/'/g, '');
  t = t.replace(/[Ѐ-ӿ]/g, function (c) { return c in TR ? TR[c] : c; }).replace(/x/g, 'h').replace(/q/g, 'k');
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}
function idOf_(s) { return nrm_(s).replace(/ /g, '-').slice(0, 60); }
function uniq_(a) {
  var seen = {}, out = [];
  a.forEach(function (x) { x = String(x || '').trim(); var k = nrm_(x).replace(/ /g, ''); if (x && k && !seen[k]) { seen[k] = 1; out.push(x); } });
  return out;
}
function shortHash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s), Utilities.Charset.UTF_8)).slice(0, 12);
}
