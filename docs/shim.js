/* Ombor nazorati — Firebase adapter.
   The app was first written for claude.ai, where it called window.claude.use("db" | "user" | "downloads").
   This file provides the same small API on top of Firebase (Firestore + Auth), so the app code stays the same. */
(function(){
  "use strict";
  const cfg = window.OMBOR_FIREBASE_CONFIG;
  const DOMAIN = "ombor.local";             // phone numbers become logins like 998901234567@ombor.local (no e-mail is sent)
  let app, fs, auth, ready, readyResolve, me = null, signup = null;
  ready = new Promise(r => readyResolve = r);

  const ERR = {"not-found":"invalid_argument","permission-denied":"invalid_argument","invalid-argument":"invalid_argument",
               "resource-exhausted":"resource_exhausted","unauthenticated":"revoked","unavailable":"unavailable"};
  const wrapErr = e => { const o = new Error((e && e.message) || String(e)); o.code = ERR[e && e.code] || (e && e.code) || "unknown"; o.fb = e; return o; };
  const guard = p => p.catch(e => { throw wrapErr(e); });

  /* ---------- db: Firestore with the claude.ai db call shape ---------- */
  const dsnap = s => ({ id: s.id, exists: s.exists, data: () => s.exists ? s.data() : undefined });
  const qsnap = s => ({ docs: s.docs.map(dsnap), size: s.size, empty: s.empty });
  /* lot items are patched one pack at a time ({items:{N:{s:"s",...}}}); Firestore update() would replace the whole
     items map, so nested item fields are written as dotted paths (items.N.s) and the other packs stay untouched */
  const plain = v => v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
  function flatItems(d){
    if (!plain(d) || !plain(d.items)) return d;
    const o = {};
    for (const k in d) if (k !== "items") o[k] = d[k];
    (function walk(pre, v){ for (const k in v) { const x = v[k]; if (plain(x) && Object.keys(x).length) walk(pre + "." + k, x); else o[pre + "." + k] = x; } })("items", d.items);
    return o;
  }
  function docRef(path){
    const r = fs.doc(path);
    return {
      path, id: r.id,
      get: () => guard(r.get().then(dsnap)),
      set: d => guard(r.set(d)),
      update: d => guard(r.update(flatItems(d))),
      delete: () => guard(r.delete()),
      onSnapshot: (next, err) => r.onSnapshot(s => next(dsnap(s)), e => err && err(wrapErr(e))),
      collection: p => collRef(path + "/" + p)
    };
  }
  function query(q, path){
    return {
      path,
      where: (f, op, v) => query(q.where(f, op, v), path),
      orderBy: (f, dir) => query(q.orderBy(f, dir || "asc"), path),
      limit: n => query(q.limit(n), path),
      get: () => guard(q.get().then(qsnap)),
      onSnapshot: (next, err) => q.onSnapshot(s => next(qsnap(s)), e => err && err(wrapErr(e)))
    };
  }
  function collRef(path){ const c = fs.collection(path); return Object.assign(query(c, path), { doc: id => docRef(path + "/" + id) }); }
  const db = { doc: docRef, collection: collRef };

  /* ---------- user ---------- */
  const avatar = name => { const t = String(name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" rx="28" fill="#c2551d"/><text x="28" y="35" font-family="Arial" font-size="22" fill="#fff" text-anchor="middle">${t.replace(/[<&>]/g,"")}</text></svg>`); };
  const user = {
    me: async () => me,
    id: async () => me && me.id,
    isOwner: () => !!(me && me.isOwner),
    canEdit: () => !!(me && me.canEdit),
    can: async () => !(me && me.blocked),
    profiles: async ids => { const out = {}; await Promise.all((ids || []).map(async id => { try { const s = await fs.doc("staff/" + id).get(); out[id] = { name: s.exists ? (s.data().name || "") : "" }; } catch (e) { out[id] = { name: "" }; } })); return out; }
  };

  /* ---------- downloads: a normal browser download ---------- */
  const downloads = { save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename || "fayl"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } };

  window.claude = { use: async name => { await ready; if (!me) return null;
    return name === "db" ? db : name === "user" ? user : name === "downloads" ? downloads : null; } };

  /* ---------- sign-in screen ---------- */
  const phoneLogin = p => String(p || "").replace(/\D/g, "") + "@" + DOMAIN;
  const $ = id => document.getElementById(id);
  function show(on){ $("authBox").hidden = !on; document.querySelector(".wrap").hidden = on; const bb = $("botbar"); if (bb) bb.hidden = on; }
  function msg(t){ $("auMsg").textContent = t || ""; }
  const AUTH_ERR = {"auth/invalid-credential":"Telefon yoki parol noto‘g‘ri.","auth/wrong-password":"Telefon yoki parol noto‘g‘ri.","auth/user-not-found":"Bunday foydalanuvchi yo‘q — avval ro‘yxatdan o‘ting.",
    "auth/email-already-in-use":"Bu telefon raqami allaqachon ro‘yxatdan o‘tgan — «Kirish» ni bosing.","auth/weak-password":"Parol kamida 6 belgi bo‘lsin.","auth/too-many-requests":"Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.","auth/network-request-failed":"Internet aloqasini tekshiring."};
  const authErr = e => AUTH_ERR[e && e.code] || ("Xatolik: " + ((e && e.message) || e));

  async function loadMe(u){
    // owner = the first account that ever signed in (meta/owner is written once)
    const ownRef = fs.doc("meta/owner");
    let own = await ownRef.get();
    if (!own.exists) { try { await ownRef.set({ uid: u.uid, at: Date.now() }); own = await ownRef.get(); } catch (e) { own = await ownRef.get(); } }
    const [st, rl, bl] = await Promise.all([fs.doc("staff/" + u.uid).get(), fs.doc("roles/" + u.uid).get(), fs.doc("blocked/" + u.uid).get()]);
    const isOwner = own.exists && own.data().uid === u.uid;
    const role = rl.exists ? rl.data().role : null;
    const name = (st.exists && st.data().name) || u.displayName || "";
    me = { id: u.uid, name, avatarUrl: avatar(name), isOwner, role, canEdit: isOwner || role === "admin", blocked: bl.exists, staff: st.exists ? st.data() : null };
  }

  /* signed in, but Boshqaruv has not approved the account yet: the data stays closed (firestore.rules) */
  function showPending(u){
    show(true); $("auForm").hidden = true; const box = $("auPend"); box.hidden = false;
    const st = me.staff;
    box.innerHTML = `<h1>Ombor nazorati</h1>
      <div class="banner info">${st ? `<b>${esc(st.name)}</b>, ro‘yxatdan o‘tdingiz. Boshqaruv rolingizni tasdiqlashi kutilmoqda.` : "Arizangiz topilmadi — ismingiz va kerakli rolni yuboring."}</div>
      ${st ? "" : `<label class="fld">F.I.Sh.<input id="pdName" maxlength="80" value="${esc(u.displayName || "")}"></label>
      <label class="fld">Kerakli rol<select id="pdRole"><option value="warehouse">Omborchi</option><option value="production">Ishlab chiqarish</option><option value="manager">Menejer</option><option value="viewer">Kuzatuvchi</option></select></label>
      <button type="button" class="primary" id="pdSend">Arizani yuborish</button>`}
      <div class="btns"><button type="button" id="pdReload">Tasdiqlandimi? Tekshirish</button><button type="button" class="link" id="pdOut">Chiqish</button></div>
      <p class="note" id="pdMsg"></p>`;
    $("pdReload").onclick = () => location.reload();
    $("pdOut").onclick = () => auth.signOut();
    if ($("pdSend")) $("pdSend").onclick = async () => { const name = $("pdName").value.trim(); if (name.length < 3) { $("pdMsg").textContent = "F.I.Sh.ni to‘liq yozing."; return; }
      try { const now = Date.now(); await fs.doc("staff/" + u.uid).set({ name, want: $("pdRole").value, lvl: "member", at: now, upd: now }); await loadMe(u); showPending(u); } catch (e) { $("pdMsg").textContent = "Yuborib bo‘lmadi: " + (e.message || e); } };
  }
  const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function boot(){
    if (!cfg || !cfg.apiKey || /YOUR_/.test(cfg.apiKey)) {
      show(true); $("auForm").hidden = true;
      $("auMsg").innerHTML = "Firebase sozlanmagan: <b>public/firebase-config.js</b> fayliga Firebase loyihangiz ma’lumotlarini yozing (README’ga qarang).";
      readyResolve(); return;
    }
    app = firebase.initializeApp(cfg);
    fs = firebase.firestore();
    try { fs.settings({ ignoreUndefinedProperties: true, merge: true }); } catch (e) {}
    try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
    auth = firebase.auth();
    let started = false;
    auth.onAuthStateChanged(async u => {
      if (!u) { me = null; show(true); if (started) location.reload(); return; }
      if (signup) { try { await signup; } catch (e) {} }
      try { await loadMe(u); } catch (e) { msg("Ma’lumotlarni yuklab bo‘lmadi: " + (e.message || e)); return; }
      if (!me.isOwner && !me.role) { showPending(u); return; }
      show(false);
      if (!started) { started = true; readyResolve(); if (window.omborStart) window.omborStart(); }
    });

    let mode = "in";
    const setMode = m => { mode = m; $("auName").parentElement.hidden = m !== "up"; $("auRole").parentElement.hidden = m !== "up"; $("auPass2").parentElement.hidden = m !== "up";
      $("auGo").textContent = m === "up" ? "Ro‘yxatdan o‘tish" : "Kirish"; $("auTabIn").setAttribute("aria-pressed", m === "in"); $("auTabUp").setAttribute("aria-pressed", m === "up"); msg(""); };
    $("auTabIn").onclick = () => setMode("in"); $("auTabUp").onclick = () => setMode("up"); setMode("in");
    $("auForm").onsubmit = async e => { e.preventDefault();
      const ph = $("auPhone").value.replace(/[^\d+]/g, ""), pw = $("auPass").value;
      if (!/^\+?\d{9,15}$/.test(ph)) { msg("Telefon raqamini to‘liq yozing, masalan +998901234567."); return; }
      if (pw.length < 6) { msg("Parol kamida 6 belgi bo‘lsin."); return; }
      $("auGo").disabled = true; msg(mode === "up" ? "Ro‘yxatdan o‘tilmoqda…" : "Kirilmoqda…");
      try {
        if (mode === "up") {
          let done; signup = new Promise(r => done = r);
          try {
          const name = $("auName").value.trim();
          if (name.length < 3) { msg("F.I.Sh.ni to‘liq yozing."); $("auGo").disabled = false; done(); signup = null; return; }
          if (pw !== $("auPass2").value) { msg("Parollar bir xil emas."); $("auGo").disabled = false; done(); signup = null; return; }
          const cred = await auth.createUserWithEmailAndPassword(phoneLogin(ph), pw);
          await cred.user.updateProfile({ displayName: name }).catch(() => {});
          const now = Date.now();
          await fs.doc("phones/" + cred.user.uid).set({ phone: ph, upd: now });
          await fs.doc("staff/" + cred.user.uid).set({ name, want: $("auRole").value, lvl: "member", at: now, upd: now });
          } finally { done(); signup = null; }
        } else {
          await auth.signInWithEmailAndPassword(phoneLogin(ph), pw);
        }
      } catch (er) { msg(authErr(er)); }
      $("auGo").disabled = false;
    };
    $("auForgot").onclick = () => msg("Parolni unutgan bo‘lsangiz, Super admin Firebase konsolida (Authentication → Users) parolingizni tiklaydi yoki hisobingizni o‘chirib, qayta ro‘yxatdan o‘tishingizga ruxsat beradi.");
    window.omborSignOut = () => auth.signOut();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
