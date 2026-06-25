/* =========================================================================
 * campaign-builder.v1.js  —  AIOrigin « new campaign » cockpit widget
 * Published copy for github.com/aioriginrepo/aiorigin-widget-assets@v1
 * Source of truth = campaign-builder-mcpui.ts (server). Edit there, re-extract,
 * publish a NEW tag, bump WIDGET_VERSION in the renderer.
 *
 * Contract: the server emits the markup root <div class="ao-cb" id="ao-campaign">
 * + <script type="application/json" id="cb-ctx">{...CampaignBuilderCtx...}</script>
 * + <script src="campaign-builder.v1.js">. This file reads that JSON and
 * hydrates the whole cockpit. It WRITES NOTHING: « Créer la campagne » posts a
 * single consolidated prompt (sendPrompt / postMessage) for the agent to run
 * the campaign_create (+ discover_qualified_leads / set_campaign_config) chain.
 * ========================================================================= */
(function () {
  "use strict";

  /* ---- read injected context ------------------------------------------ */
  var ctx = {};
  try { ctx = JSON.parse(document.getElementById("cb-ctx").textContent || "{}"); } catch (e) { ctx = {}; }
  var root = document.getElementById("ao-campaign") || document.querySelector(".ao-cb");
  if (!root) return;

  /* ---- canonical step roles (mirror src/lib/sequence/steps.ts) --------- */
  var ROLE_LABELS = ctx.step_roles || {
    opener: "Opener", value: "Valeur", proof: "Preuve",
    angle: "Angle", bump: "Relance", breakup: "Breakup"
  };
  var ROLE_ORDER = ["opener", "value", "proof", "angle", "bump", "breakup"];
  // presets from src/lib/sequence/sequence-policy.ts (PRESETS)
  var PRESETS = ctx.presets || {
    light_3_email: ["opener", "value", "breakup"],
    founder_led_5: ["opener", "value", "proof", "bump", "breakup"],
    deep_7: ["opener", "value", "proof", "angle", "value", "bump", "breakup"]
  };
  var SD = ctx.sequence_defaults || { target_steps: 5, min_steps: 2, max_steps: 7, default_delay_days: 3, booking_duration_minutes: 30 };

  var inh = ctx.inherited || {};
  function inhVal(k) { return (inh[k] && inh[k].value) ? String(inh[k].value) : ""; }

  var DEFAULT_ICP = inhVal("icp_description") ||
    "B2B SaaS & digital-first brands that want to be cited/recommended by AI engines (ChatGPT, Perplexity, Claude, Gemini). Exclude SEO/GEO agencies, consultants and SEO/AEO tool vendors.";
  var DEFAULT_ANGLE = inhVal("angle") ||
    "Open with a real AI-engine query run this morning showing the brand is absent from the answer; quantify who outranked them; offer the prompt-by-prompt breakdown.";
  var DEFAULT_VOICE = inhVal("voice_description") || "";
  var DEFAULT_OBJECTIVE = inhVal("objective") || "Booker un call de 30 min";

  var signalTypes = ctx.signal_types || [];
  var signalFamLabel = {};
  (ctx.signal_families || []).forEach(function (f) { signalFamLabel[f.key] = f.name; });
  // light recency hint by family (UI only; server decides the real recency)
  var FAM_RECENCY = { company_growth: 90, people_moves: 60, buyer_intent: 60, social_activity: 30 };

  var campaigns = ctx.campaigns || [];
  var templates = ctx.templates || [];
  var authored = ctx.authored_models || [];

  /* ---- state ----------------------------------------------------------- */
  function defaultSteps() {
    var roles = PRESETS[(SD.preset || "founder_led_5")] || PRESETS.founder_led_5;
    return roles.map(function (r, i) { return { role: r, delay: i === 0 ? 0 : SD.default_delay_days }; });
  }
  var S = {
    lang: (ctx.default_language === "fr") ? "fr" : "en",
    tone: "vous",
    geo: [],
    personas: [],
    segments: [],
    signals: [],
    objective: DEFAULT_OBJECTIVE,
    angle: DEFAULT_ANGLE,
    voice: DEFAULT_VOICE,
    voiceSource: "workspace",      // workspace | model:<id> | template:<id>
    baseModelId: "",
    templateId: "",
    cloneFrom: "", cloneName: "",
    target: "source", vol: 20, recency: "",
    icp: DEFAULT_ICP,
    steps: defaultSteps(),
    angleEdited: false, voiceEdited: false, nameEdited: false, recencyAuto: true
  };

  /* ---- workspace persona suggestions ----------------------------------- */
  var personaItems = [];
  (function () {
    var p = inhVal("persona");
    if (p) p.split(/[,;]/).forEach(function (x) { x = x.trim(); if (x) personaItems.push(x); });
    ["Founders / CEO", "Marketing leaders", "Growth / Demand gen"].forEach(function (x) {
      if (personaItems.indexOf(x) < 0) personaItems.push(x);
    });
  })();
  var segItems = ["B2B SaaS", "Scale-up financé", "Grand compte / Enterprise", "Université", "Association / ONG", "Secteur public"];
  var geoSugg = ["UK", "Germany", "France", "Spain", "Netherlands", "Europe/UK", "DACH", "Benelux", "Nordics"];
  var objChips = ["Booker un call de 30 min", "Envoyer le rapport échantillon", "Intro douce / awareness"];

  /* ---- helpers --------------------------------------------------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return root.querySelector("#" + id); }
  function primaryGeo() { return S.geo.length ? S.geo[0] : "Multi-geo"; }
  function primaryPersona() { return S.personas.length ? S.personas[0] : "décideurs"; }
  function autoName() { return primaryGeo() + " GEO — " + primaryPersona() + " — " + monthYear(); }
  function monthYear() {
    var m = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var d = new Date(); return m[d.getMonth()] + " " + d.getFullYear();
  }

  function send(prompt) {
    if (!prompt) return;
    if (typeof window.sendPrompt === "function") { try { window.sendPrompt(prompt); return; } catch (e) { } }
    var mid = "ao-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    try { window.parent && window.parent.postMessage({ type: "prompt", payload: { prompt: prompt }, messageId: mid }, "*"); } catch (e) { }
    try { window.parent && window.parent.postMessage({ type: "mcp-ui:prompt", payload: { prompt: prompt }, messageId: mid }, "*"); } catch (e) { }
  }

  /* ---- markup ---------------------------------------------------------- */
  root.innerHTML =
    '<div class="recap"><div class="eyebrow">Campagne à créer</div><div class="rname" id="cb-rname"></div><div class="rline" id="cb-rline"></div></div>' +

    '<div class="sec"><div class="panel"><div class="sec-title"><span>↻ Démarrer depuis une campagne existante</span> <span class="soft">— optionnel</span></div>' +
    '<div class="row"><select id="cb-clone" style="flex:1;min-width:240px"></select><button class="btn" id="cb-clone-apply">Cloner les paramètres ✓</button></div>' +
    '<div class="hint" id="cb-clone-hint">Sélectionne une campagne puis valide : les champs se pré-remplissent avec sa config (ciblage, angle, objectif, cadence). Ajuste ensuite.</div></div></div>' +

    '<div class="sec"><div class="sec-title">Langue d\'envoi</div><div class="row" id="cb-lang"></div></div>' +
    '<div class="sec" id="cb-tone-sec"><div class="sec-title">Ton <span class="soft">— français uniquement</span></div><div class="row" id="cb-tone"></div></div>' +

    '<div class="sec"><div class="sec-title">Géographie <span class="soft">— pays, ville ou région ; plusieurs possibles</span></div>' +
    '<div class="row" id="cb-geo-tags" style="margin-bottom:8px"></div>' +
    '<div class="row"><input type="text" id="cb-geo-in" placeholder="Ex : Germany, London, DACH, Île-de-France…" style="flex:1;min-width:220px"><button class="btn" id="cb-geo-add">Ajouter</button></div>' +
    '<div class="row" id="cb-geo-sugg" style="margin-top:8px"></div></div>' +

    '<div class="sec"><div class="sec-title">Persona(s) ciblé(s) <span class="soft">— plusieurs possibles</span></div>' +
    '<div class="row" id="cb-personas" style="margin-bottom:8px"></div>' +
    '<div class="row"><input type="text" id="cb-persona-in" placeholder="Ajouter un persona (ex : Head of Demand Gen)" style="flex:1;min-width:220px"><button class="btn" id="cb-persona-add">Ajouter</button></div></div>' +

    '<div class="sec"><div class="sec-title">Segment / type d\'organisation <span class="soft">— optionnel, libre</span></div>' +
    '<div class="row" id="cb-segments" style="margin-bottom:8px"></div>' +
    '<div class="row"><input type="text" id="cb-segment-in" placeholder="Ex : Grand compte, Université, Association…" style="flex:1;min-width:220px"><button class="btn" id="cb-segment-add">Ajouter</button></div></div>' +

    '<div class="sec"><div class="sec-title">Signal(s) d\'origine <span class="soft">— plusieurs possibles ; pilotent l\'angle</span></div>' +
    '<div class="row" id="cb-signals"></div><div class="hint" id="cb-sig-hint"></div></div>' +

    '<div class="sec"><div class="sec-title">Angle d\'accroche <span class="soft">— pré-rempli, éditable</span></div><textarea id="cb-angle" rows="3"></textarea></div>' +

    '<div class="sec"><div class="panel"><div class="sec-title">Voix &amp; modèle <span class="soft">— pré-remplir depuis un modèle, puis affiner</span></div>' +
    '<div class="row"><select id="cb-voice-src" style="flex:1;min-width:240px"></select></div>' +
    '<div class="hint" id="cb-voice-hint"></div>' +
    '<textarea id="cb-voice" rows="2" style="margin-top:8px" placeholder="Voix appliquée (héritée du workspace par défaut) — édite pour affiner."></textarea></div></div>' +

    '<div class="sec"><div class="sec-title">Objectif du meeting <span class="soft">— éditable</span></div>' +
    '<div class="row" id="cb-obj-chips" style="margin-bottom:8px"></div><input type="text" id="cb-objective"></div>' +

    '<div class="sec"><div class="panel"><div class="sec-title">⛬ Cadence — mini-builder <span class="soft">— phases &amp; délais éditables</span></div>' +
    '<div id="cb-steps"></div>' +
    '<div class="row" style="margin-top:4px"><button class="btn" id="cb-step-add">+ Ajouter une étape</button>' +
    '<select id="cb-preset" class="btn" style="padding:6px 10px"></select>' +
    '<span class="mini" id="cb-steps-sum"></span></div>' +
    '<div class="hint">Canal : email · rédaction IA sur-mesure par lead. Délai = jours après l\'étape précédente. Le dernier <b>breakup</b> reste verrouillé en fin de séquence.</div></div></div>' +

    '<div class="sec"><div class="sec-title">Cible — d\'où viennent les leads ?</div><div class="row" id="cb-target"></div>' +
    '<div id="cb-source-extra" style="margin-top:10px">' +
    '<div class="row" style="margin-bottom:8px"><span class="mini">Leads à sourcer</span>' +
    '<button class="btn" data-vol="-5">−</button><span id="cb-vol" style="min-width:34px;text-align:center;font-weight:600">20</span><button class="btn" data-vol="5">+</button>' +
    '<span class="mini" style="margin-left:12px">Récence (j)</span><input type="number" id="cb-recency" class="num" min="1" max="365" placeholder="auto"></div>' +
    '<textarea id="cb-icp" rows="2"></textarea>' +
    '<div class="hint">Brief ICP du sourcing (pré-rempli depuis le workspace). Lance une vraie mission <code>discover_qualified_leads</code> avec preuves.</div></div>' +
    '<div id="cb-enroll-extra" class="hint" style="margin-top:10px;display:none">Tu préciseras ensuite les leads à enrôler (lead_ids). Aucun sourcing lancé.</div></div>' +

    '<div class="infobar"><span class="mini">ⓘ Cap d\'envoi &amp; délivrabilité : gérés au niveau workspace (pas par campagne). Durée du RDV : ' +
    esc(SD.booking_duration_minutes || 30) + ' min, fixée par le lien de booking. ICP &amp; voix : hérités du workspace par défaut.</span></div>' +

    '<div class="sec"><div class="sec-title">Nom de la campagne <span class="soft">— auto, modifiable</span></div><input type="text" id="cb-name"></div>' +

    '<div class="lint" id="cb-lint"></div>' +
    '<button class="create" id="cb-submit">Créer la campagne ↗</button>' +
    '<div class="hint" style="margin-top:6px">Idempotent : reprendre le même nom met à jour le brouillon, sans doublon.</div>';

  /* ---- chip builders --------------------------------------------------- */
  function single(host, items, gk, gl, field, cb) {
    host.innerHTML = "";
    items.forEach(function (it) {
      var k = gk(it), b = document.createElement("button");
      b.className = "chip" + (S[field] === k ? " on" : ""); b.textContent = gl(it);
      b.onclick = function () { S[field] = k; [].forEach.call(host.children, function (c) { c.classList.remove("on"); }); b.classList.add("on"); if (cb) cb(); refresh(); };
      host.appendChild(b);
    });
  }
  function multi(host, items, gk, gl, arr, cb) {
    host.innerHTML = "";
    items.forEach(function (it) {
      var k = gk(it), on = S[arr].indexOf(k) >= 0, b = document.createElement("button");
      b.className = "chip" + (on ? " on" : ""); b.textContent = gl(it);
      b.onclick = function () { var i = S[arr].indexOf(k); if (i >= 0) S[arr].splice(i, 1); else S[arr].push(k); b.classList.toggle("on"); if (cb) cb(); refresh(); };
      host.appendChild(b);
    });
  }

  /* ---- language / tone ------------------------------------------------- */
  single(el("cb-lang"), [{ k: "en", l: "English" }, { k: "fr", l: "Français" }], function (x) { return x.k; }, function (x) { return x.l; }, "lang");
  single(el("cb-tone"), [{ k: "vous", l: "Vouvoiement" }, { k: "tu", l: "Tutoiement" }], function (x) { return x.k; }, function (x) { return x.l; }, "tone");

  /* ---- geo tags -------------------------------------------------------- */
  function renderGeo() {
    var h = el("cb-geo-tags"); h.innerHTML = "";
    S.geo.forEach(function (g, idx) {
      var t = document.createElement("span"); t.className = "tag"; t.innerHTML = esc(g) + ' <span class="x">×</span>';
      t.querySelector(".x").onclick = function () { S.geo.splice(idx, 1); renderGeo(); refresh(); };
      h.appendChild(t);
    });
  }
  function addGeo(v) { v = (v || "").trim(); if (v && S.geo.indexOf(v) < 0) { S.geo.push(v); renderGeo(); refresh(); } }
  el("cb-geo-add").onclick = function () { addGeo(el("cb-geo-in").value); el("cb-geo-in").value = ""; };
  el("cb-geo-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addGeo(this.value); this.value = ""; } });
  (function () { var g = el("cb-geo-sugg"); geoSugg.forEach(function (x) { var b = document.createElement("button"); b.className = "chip add"; b.textContent = "+ " + x; b.onclick = function () { addGeo(x); }; g.appendChild(b); }); })();
  renderGeo();

  /* ---- personas (multi + custom) -------------------------------------- */
  function renderPersonas() { multi(el("cb-personas"), personaItems, function (x) { return x; }, function (x) { return x; }, "personas"); }
  el("cb-persona-add").onclick = function () { var i = el("cb-persona-in"), v = i.value.trim(); if (v) { if (personaItems.indexOf(v) < 0) personaItems.push(v); if (S.personas.indexOf(v) < 0) S.personas.push(v); i.value = ""; renderPersonas(); refresh(); } };
  renderPersonas();

  /* ---- segments (multi + custom) -------------------------------------- */
  function renderSegments() { multi(el("cb-segments"), segItems, function (x) { return x; }, function (x) { return x; }, "segments"); }
  el("cb-segment-add").onclick = function () { var i = el("cb-segment-in"), v = i.value.trim(); if (v) { if (segItems.indexOf(v) < 0) segItems.push(v); if (S.segments.indexOf(v) < 0) S.segments.push(v); i.value = ""; renderSegments(); refresh(); } };
  renderSegments();

  /* ---- signals (multi) drive the angle -------------------------------- */
  var angleEl = el("cb-angle"), recEl = el("cb-recency"), sigHint = el("cb-sig-hint");
  function renderSignals() {
    multi(el("cb-signals"), signalTypes, function (x) { return x.key; },
      function (x) { return x.name + (x.family && signalFamLabel[x.family] ? " · " + signalFamLabel[x.family] : ""); }, "signals", applySignals);
  }
  function applySignals() {
    var recs = S.signals.map(function (k) { var t = sigType(k); return t ? (FAM_RECENCY[t.family] || null) : null; }).filter(function (r) { return r != null; });
    if (S.recencyAuto) { recEl.value = recs.length ? Math.min.apply(null, recs) : ""; }
    if (!S.angleEdited) {
      if (S.signals.length) {
        var names = S.signals.map(function (k) { var t = sigType(k); return t ? t.name.toLowerCase() : k; });
        angleEl.value = "Trigger: " + names.join(" + ") + ". " + DEFAULT_ANGLE;
        S.angle = angleEl.value;
      } else { angleEl.value = DEFAULT_ANGLE; S.angle = DEFAULT_ANGLE; }
    }
    sigHint.textContent = S.signals.length ? ("Récence conseillée : " + (recs.length ? Math.min.apply(null, recs) + " j" : "libre")) : "Sans signal : approche cold sur l'ICP.";
  }
  function sigType(k) { for (var i = 0; i < signalTypes.length; i++) if (signalTypes[i].key === k) return signalTypes[i]; return null; }
  angleEl.value = S.angle;
  angleEl.addEventListener("input", function () { S.angleEdited = true; S.angle = this.value; });
  recEl.addEventListener("input", function () { S.recencyAuto = false; S.recency = this.value; });
  renderSignals(); applySignals();

  /* ---- voice & model prefill ------------------------------------------ */
  var voiceEl = el("cb-voice"), voiceSel = el("cb-voice-src"), voiceHint = el("cb-voice-hint");
  (function () {
    var opts = ['<option value="workspace">Voix du workspace (héritée)</option>'];
    authored.forEach(function (m) { opts.push('<option value="model:' + esc(m.id) + '">Modèle IA — ' + esc(m.name) + '</option>'); });
    templates.forEach(function (t) { opts.push('<option value="template:' + esc(t.id) + '">Modèle de séquence — ' + esc(t.name) + '</option>'); });
    voiceSel.innerHTML = opts.join("");
  })();
  voiceEl.value = S.voice;
  voiceEl.addEventListener("input", function () { S.voiceEdited = true; S.voice = this.value; });
  voiceSel.addEventListener("change", function () {
    var v = this.value; S.voiceSource = v; S.baseModelId = ""; S.templateId = "";
    if (v === "workspace") {
      if (!S.voiceEdited) voiceEl.value = DEFAULT_VOICE;
      voiceHint.textContent = "Voix par défaut du workspace.";
    } else if (v.indexOf("model:") === 0) {
      var id = v.slice(6); S.baseModelId = id; var m = findById(authored, id);
      applyModelPrefill(m);
      voiceHint.textContent = "Pré-rempli depuis le modèle IA « " + (m ? m.name : id) + " » : structure, angle et persona repris, voix appliquée. Affine librement.";
    } else if (v.indexOf("template:") === 0) {
      var tid = v.slice(9); S.templateId = tid; var t = findById(templates, tid);
      applyTemplatePrefill(t);
      voiceHint.textContent = "Étapes pré-remplies depuis le modèle de séquence « " + (t ? t.name : tid) + " ». Affine librement.";
    }
    refresh();
  });
  function findById(arr, id) { for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i]; return null; }
  function applyModelPrefill(m) {
    if (!m) return; var meta = m.meta || {};
    if (meta.language && !S.langTouched) { S.lang = meta.language === "fr" ? "fr" : "en"; single(el("cb-lang"), [{ k: "en", l: "English" }, { k: "fr", l: "Français" }], function (x) { return x.k; }, function (x) { return x.l; }, "lang"); }
    if (meta.angle) { angleEl.value = meta.angle; S.angle = meta.angle; S.angleEdited = true; }
    if (meta.persona && S.personas.indexOf(meta.persona) < 0) { if (personaItems.indexOf(meta.persona) < 0) personaItems.push(meta.persona); S.personas.push(meta.persona); renderPersonas(); }
    if (meta.expected_steps) { setStepCount(meta.expected_steps); }
    if (m.voice) { voiceEl.value = m.voice; S.voice = m.voice; }
  }
  function applyTemplatePrefill(t) {
    if (!t) return;
    if (t.steps && t.steps.length) { S.steps = t.steps.map(function (s, i) { return { role: normRole(s.role), delay: i === 0 ? 0 : (s.delay_days != null ? s.delay_days : SD.default_delay_days) }; }); renderSteps(); }
    else if (t.expected_steps) setStepCount(t.expected_steps);
    if (t.language) { S.lang = t.language === "fr" ? "fr" : "en"; single(el("cb-lang"), [{ k: "en", l: "English" }, { k: "fr", l: "Français" }], function (x) { return x.k; }, function (x) { return x.l; }, "lang"); }
  }

  /* ---- objective ------------------------------------------------------- */
  var objHost = el("cb-obj-chips"), objIn = el("cb-objective");
  objIn.value = S.objective;
  objChips.forEach(function (o) {
    var b = document.createElement("button"); b.className = "chip" + (S.objective === o ? " on" : ""); b.textContent = o;
    b.onclick = function () { S.objective = o; objIn.value = o; [].forEach.call(objHost.children, function (c) { c.classList.remove("on"); }); b.classList.add("on"); refresh(); };
    objHost.appendChild(b);
  });
  objIn.addEventListener("input", function () { S.objective = this.value; [].forEach.call(objHost.children, function (c) { c.classList.remove("on"); }); });

  /* ---- cadence mini-builder (canonical roles + breakup-last) ----------- */
  function normRole(r) { return ROLE_ORDER.indexOf(r) >= 0 ? r : "value"; }
  function enforceBreakup() {
    if (S.steps.length >= (SD.breakup_min_length || 2)) {
      S.steps.forEach(function (s, i) { if (i < S.steps.length - 1 && s.role === "breakup") s.role = "value"; });
      S.steps[S.steps.length - 1].role = "breakup";
      if (S.steps[0]) S.steps[0].role = S.steps[0].role === "breakup" ? "opener" : S.steps[0].role;
    }
  }
  function setStepCount(n) {
    n = Math.max(SD.min_steps || 1, Math.min(SD.max_steps || 7, n));
    var preset = PRESETS["founder_led_5"];
    while (S.steps.length < n) S.steps.push({ role: "value", delay: SD.default_delay_days });
    while (S.steps.length > n) S.steps.pop();
    if (S.steps[0]) S.steps[0].delay = 0;
    enforceBreakup(); renderSteps();
  }
  function renderSteps() {
    enforceBreakup();
    var h = el("cb-steps"); h.innerHTML = "";
    S.steps.forEach(function (st, idx) {
      var last = idx === S.steps.length - 1;
      var card = document.createElement("div"); card.className = "stepcard" + (st.role === "breakup" ? " brk" : "");
      var opts = ROLE_ORDER.map(function (r) { return '<option value="' + r + '"' + (st.role === r ? " selected" : "") + '>' + esc(ROLE_LABELS[r] || r) + "</option>"; }).join("");
      card.innerHTML = '<span class="ix">Étape ' + (idx + 1) + '</span>' +
        '<select class="role"' + (last && (SD.enforce_breakup_last !== false) ? " disabled title='breakup verrouillé en fin'" : "") + ">" + opts + "</select>" +
        '<span class="mini">délai (j)</span><input type="number" class="num delay" min="0" max="30" value="' + st.delay + '"' + (idx === 0 ? " disabled title='étape 1 = jour 0'" : "") + ">" +
        '<button class="btn del" aria-label="supprimer"' + (S.steps.length <= 1 ? " disabled" : "") + ">✕</button>";
      card.querySelector(".role").onchange = function () { st.role = this.value; renderSteps(); refresh(); };
      card.querySelector(".delay").oninput = function () { st.delay = Math.max(0, Math.min(30, parseInt(this.value || "0", 10))); refresh(); };
      card.querySelector(".del").onclick = function () { if (S.steps.length > 1) { S.steps.splice(idx, 1); renderSteps(); refresh(); } };
      h.appendChild(card);
    });
    var cum = 0; S.steps.forEach(function (s) { cum += s.delay; });
    el("cb-steps-sum").textContent = S.steps.length + " étapes · dernier contact ~J+" + cum;
  }
  el("cb-step-add").onclick = function () { if (S.steps.length < (SD.max_steps || 7)) { S.steps.push({ role: "value", delay: SD.default_delay_days }); renderSteps(); refresh(); } };
  (function () {
    var sel = el("cb-preset"); var names = { light_3_email: "Preset : light (3)", founder_led_5: "Preset : founder-led (5)", deep_7: "Preset : deep (7)" };
    var opts = ['<option value="">Appliquer un preset…</option>'];
    Object.keys(PRESETS).forEach(function (k) { opts.push('<option value="' + k + '">' + (names[k] || k) + "</option>"); });
    sel.innerHTML = opts.join("");
    sel.onchange = function () { var k = this.value; if (k && PRESETS[k]) { S.steps = PRESETS[k].map(function (r, i) { return { role: r, delay: i === 0 ? 0 : SD.default_delay_days }; }); renderSteps(); refresh(); } this.value = ""; };
  })();
  renderSteps();

  /* ---- target ---------------------------------------------------------- */
  single(el("cb-target"), [{ k: "source", l: "Sourcer de nouveaux leads (ICP)" }, { k: "enroll", l: "Enrôler une sélection existante" }], function (x) { return x.k; }, function (x) { return x.l; }, "target");
  [].forEach.call(root.querySelectorAll("button[data-vol]"), function (b) {
    b.onclick = function () { S.vol = Math.max(5, Math.min(60, S.vol + parseInt(b.getAttribute("data-vol"), 10))); el("cb-vol").textContent = S.vol; refresh(); };
  });
  el("cb-icp").value = S.icp;
  el("cb-icp").addEventListener("input", function () { S.icp = this.value; });

  /* ---- name ------------------------------------------------------------ */
  el("cb-name").addEventListener("input", function () { S.nameEdited = true; el("cb-rname").textContent = this.value; });

  /* ---- clone flow ------------------------------------------------------ */
  (function () {
    var sel = el("cb-clone");
    var opts = ['<option value="">— aucune (partir de zéro) —</option>'];
    campaigns.forEach(function (c) { opts.push('<option value="' + esc(c.id) + '">' + esc(c.name + (c.status ? " · " + c.status : "")) + "</option>"); });
    sel.innerHTML = opts.join("");
  })();
  el("cb-clone-apply").onclick = function () {
    var id = el("cb-clone").value; var c = findById(campaigns, id);
    if (!c) { el("cb-clone-hint").textContent = "Aucune campagne sélectionnée — repart de zéro."; S.cloneFrom = ""; return; }
    var cfg = c.config || {};
    S.cloneFrom = c.id; S.cloneName = c.name;
    if (cfg.language) { S.lang = cfg.language === "fr" ? "fr" : "en"; single(el("cb-lang"), [{ k: "en", l: "English" }, { k: "fr", l: "Français" }], function (x) { return x.k; }, function (x) { return x.l; }, "lang"); }
    if (cfg.objective) { S.objective = cfg.objective; objIn.value = cfg.objective; }
    if (cfg.angle) { S.angle = cfg.angle; angleEl.value = cfg.angle; S.angleEdited = true; }
    if (cfg.icp_description) { S.icp = cfg.icp_description; el("cb-icp").value = cfg.icp_description; }
    S.personas = [];
    if (cfg.persona) cfg.persona.split(/[,;]/).forEach(function (x) { x = x.trim(); if (x) { if (personaItems.indexOf(x) < 0) personaItems.push(x); S.personas.push(x); } });
    S.segments = [];
    if (cfg.segment) { var sg = cfg.segment.trim(); if (sg) { if (segItems.indexOf(sg) < 0) segItems.push(sg); S.segments.push(sg); } }
    S.geo = [];
    if (cfg.geo) (Array.isArray(cfg.geo) ? cfg.geo : [cfg.geo]).forEach(function (g) { g = String(g).trim(); if (g) S.geo.push(g); });
    S.signals = [];
    if (cfg.signal_type_key) S.signals.push(cfg.signal_type_key);
    if (cfg.steps && cfg.steps.length) S.steps = cfg.steps.map(function (s, i) { return { role: normRole(s.role), delay: i === 0 ? 0 : (s.delay_days != null ? s.delay_days : SD.default_delay_days) }; });
    renderGeo(); renderPersonas(); renderSegments(); renderSignals(); applySignals(); renderSteps();
    el("cb-clone-hint").textContent = "Paramètres clonés depuis « " + c.name + " ». Ajuste librement ci-dessous.";
    refresh();
  };

  /* ---- recap + visibility --------------------------------------------- */
  function refresh() {
    if (!S.nameEdited) el("cb-name").value = autoName();
    el("cb-rname").textContent = el("cb-name").value;
    var sigTxt = S.signals.length ? S.signals.map(function (k) { var t = sigType(k); return t ? t.name : k; }).join("+") : "cold";
    el("cb-rline").textContent = (S.lang === "fr" ? "FR" : "EN") + " · " + (S.geo.join("/") || "—") + " · " + (S.personas.join(", ") || "—") + " · " + sigTxt + " · " + S.steps.length + " étapes";
    el("cb-tone-sec").style.display = S.lang === "fr" ? "block" : "none";
    el("cb-source-extra").style.display = S.target === "source" ? "block" : "none";
    el("cb-enroll-extra").style.display = S.target === "enroll" ? "block" : "none";
    validate();
  }
  function validate() {
    var msgs = [];
    if (!el("cb-name").value.trim()) msgs.push("Donne un nom à la campagne.");
    if (!S.personas.length) msgs.push("Sélectionne au moins un persona.");
    if (S.target === "source" && !(S.icp || "").trim()) msgs.push("Renseigne le brief ICP du sourcing.");
    var lint = el("cb-lint"), btn = el("cb-submit");
    if (msgs.length) { lint.textContent = "• " + msgs.join("  • "); lint.classList.add("show"); }
    else { lint.textContent = ""; lint.classList.remove("show"); }
    if (btn) btn.disabled = msgs.length > 0;
  }

  /* ---- submit ---------------------------------------------------------- */
  el("cb-submit").onclick = function () {
    if (el("cb-submit").disabled) return;
    var name = el("cb-name").value.trim() || autoName();
    var seq = S.steps.map(function (st, i) { return (i + 1) + ". " + (ROLE_LABELS[st.role] || st.role) + " (J+" + st.delay + ")"; }).join(" · ");
    var sigList = S.signals.map(function (k) { var t = sigType(k); return (t ? t.name : k) + " [" + k + "]"; });
    var voiceLine = S.voiceSource === "workspace" ? "voix du workspace" : (S.voiceSource.indexOf("model:") === 0 ? ("modèle IA " + S.baseModelId) : ("modèle de séquence " + S.templateId));
    var L = [];
    L.push("Crée et paramètre une nouvelle campagne (campaign-first) avec EXACTEMENT ces réglages — ne réinvente rien.");
    L.push("");
    L.push("- Nom : " + name);
    L.push("- Point de départ : " + (S.cloneFrom ? ("cloner la campagne " + S.cloneFrom + " (" + S.cloneName + ") puis ajuster") : "partir de zéro"));
    L.push("- Langue : " + (S.lang === "fr" ? "français" : "anglais") + (S.lang === "fr" ? (" · ton " + (S.tone === "vous" ? "vouvoiement" : "tutoiement")) : ""));
    L.push("- Géographie : " + (S.geo.join(", ") || "non précisée"));
    L.push("- Persona(s) : " + (S.personas.join(", ") || "non précisé"));
    if (S.segments.length) L.push("- Segment(s) d'organisation : " + S.segments.join(", "));
    L.push("- Objectif du meeting : " + (objIn.value.trim() || S.objective));
    L.push("- Signal(s) d'origine : " + (sigList.length ? sigList.join(", ") : "aucun (cold / ICP)"));
    L.push("- Angle : " + angleEl.value.trim());
    L.push("- Voix & modèle : " + voiceLine + (voiceEl.value.trim() ? (" — override : " + voiceEl.value.trim()) : ""));
    if (S.baseModelId) L.push("  → campaign_create base_model_id=" + S.baseModelId + " (generation_mode=claude_authored).");
    if (S.templateId) L.push("  → repartir du modèle de séquence template_id=" + S.templateId + ".");
    L.push("- Cadence : " + seq + " — canal email, claude_authored.");
    L.push("");
    if (S.target === "source") {
      L.push("Étape 1 — SOURCING : discover_qualified_leads (recherche web + preuves) pour ~" + S.vol + " leads QUALIFIED.");
      L.push("  Brief ICP : " + (el("cb-icp").value.trim() || S.icp));
      L.push("  Filtre géo : " + (S.geo.join(", ") || "large") + " · personas : " + (S.personas.join(", ") || "large") + (S.segments.length ? (" · segment : " + S.segments.join(", ")) : ""));
      if ((recEl.value || "").trim()) L.push("  Récence du signal : < " + recEl.value.trim() + " jours.");
      if (S.signals.length) L.push("  Oriente le sourcing sur : " + S.signals.join(", ") + ".");
      L.push("  Récupère les lead_ids.");
    } else {
      L.push("Étape 1 — ENRÔLEMENT : utilise les lead_ids de la sélection existante (je te les précise). Aucun sourcing.");
    }
    L.push("");
    L.push("Étape 2 — CAMPAGNE : campaign_create (name + angle + persona + steps selon la cadence ci-dessus, lead_ids). " + (S.baseModelId ? "Passe base_model_id." : (S.templateId ? "Repars du template." : "")));
    L.push("Étape 3 — set_campaign_config sur le DRAFT : objective, angle, persona, icp_description" + (S.signals.length ? (", signal_type_key=" + S.signals[0] + (S.signals.length > 1 ? " (+ " + S.signals.slice(1).join(", ") + ")" : "")) : "") + (voiceEl.value.trim() ? ", voice_description (override)" : "") + ".");
    L.push("Étape 4 — montre-moi la maquette éditable sur le meilleur lead, fais-la valider, puis lance.");
    L.push("");
    L.push("Note : cap d'envoi/délivrabilité = niveau workspace (ne pas régler ici) ; durée du RDV = définie par le lien de booking.");
    send(L.join("\n"));
    var b = el("cb-submit"); var prev = b.textContent; b.textContent = "Campagne envoyée ✓"; b.disabled = true;
    setTimeout(function () { b.textContent = prev; b.disabled = false; }, 2000);
  };

  refresh();
})();
