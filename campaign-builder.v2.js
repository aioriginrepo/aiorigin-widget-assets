/* =========================================================================
 * campaign-builder.v2.js — AIOrigin « new campaign » cockpit (ACCORDION)
 * Published copy for github.com/aioriginrepo/aiorigin-widget-assets@cb-v2
 * Reads #cb-ctx, renders an accordion (one section open at a time + soft
 * auto-advance), writes nothing. « Créer la campagne » posts one consolidated
 * prompt for the agent to run the campaign_create chain.
 * ========================================================================= */
(function () {
  "use strict";
  var ctx = {};
  try { ctx = JSON.parse(document.getElementById("cb-ctx").textContent || "{}"); } catch (e) { ctx = {}; }
  var root = document.getElementById("ao-campaign") || document.querySelector(".ao-cb");
  if (!root) return;

  var inh = ctx.inherited || {};
  function iv(k) { return (inh[k] && inh[k].value) ? String(inh[k].value) : ""; }
  var DEFAULT_ICP = iv("icp_description") || "B2B SaaS & digital-first brands that want to be cited by AI engines (ChatGPT, Perplexity, Claude, Gemini). Exclude SEO/GEO agencies, consultants and SEO/AEO tool vendors.";
  var DEFAULT_ANGLE = iv("angle") || "Open with a real AI-engine query run this morning showing the brand is absent; quantify who outranked them; offer the prompt-by-prompt breakdown.";
  var DEFAULT_VOICE = iv("voice_description") || "";

  var ROLE_LABELS = ctx.step_roles || { opener: "Opener", value: "Valeur", proof: "Preuve", angle: "Angle", bump: "Relance", breakup: "Breakup" };
  if (!ROLE_LABELS.connect) ROLE_LABELS.connect = "Invitation";
  if (!ROLE_LABELS.visit) ROLE_LABELS.visit = "Visite profil";
  if (!ROLE_LABELS.message) ROLE_LABELS.message = "Message";
  var ROLE_ALL = ["opener", "value", "proof", "angle", "bump", "breakup", "connect", "visit", "message", "linkedin_invite", "linkedin_dm", "linkedin_visit", "linkedin_like", "linkedin_comment"];
  var PRESETS = ctx.presets || { light_3_email: ["opener", "value", "breakup"], founder_led_5: ["opener", "value", "proof", "bump", "breakup"], deep_7: ["opener", "value", "proof", "angle", "value", "bump", "breakup"] };
  var SD = ctx.sequence_defaults || {};
  var DELAY = SD.default_delay_days || 3, MAXST = SD.max_steps || 7;
  var LINKEDIN = !!(ctx.linkedin_enabled || ctx.linkedinEnabled);
  var PRESET_LABELS = { light_3_email: "Light", founder_led_5: "Founder-led", deep_7: "Deep", linkedin_5: "LinkedIn", multichannel_6: "Multicanal" };
  function isLinkedinPreset(k) { var r = PRESETS[k] || []; return /linkedin|multichannel|mixed/i.test(k) || r.indexOf("connect") >= 0 || r.indexOf("visit") >= 0; }
  function presetMode(k) { var pc = ctx.preset_catalog; if (pc) { for (var i = 0; i < pc.length; i++) if (pc[i].preset === k) return pc[i].channel_mode; } return isLinkedinPreset(k) ? "mixed" : "email"; }
  function presetStepRole(r, mode) { if (r === "visit" || r === "connect" || r === "message") return mapRole(r); return mode === "linkedin" ? "linkedin_dm" : r; }
  function presetLabel(k) { return PRESET_LABELS[k] || k.replace(/_/g, " "); }
  function lkChannels() {
    var ac = ctx.available_channels;
    if (ac && ac.length) { var lk = ac.filter(function (c) { return (c.channel || "") === "linkedin"; }).map(function (c) { return { key: c.key, label: c.label || c.key }; }); if (lk.length) return lk; }
    var a = ctx.channel_actions && ctx.channel_actions.linkedin;
    if (a && a.length) return a.map(function (x) { return Array.isArray(x) ? { key: x[0], label: x[1] } : { key: x.key, label: x.label || x.key }; });
    return [{ key: "linkedin_invite", label: "LinkedIn · Invitation" }, { key: "linkedin_dm", label: "LinkedIn · Message" }, { key: "linkedin_visit", label: "LinkedIn · Visite profil" }];
  }
  function actionsFor(channel) {
    if (channel === "linkedin") return lkChannels();
    var a = ctx.channel_actions && ctx.channel_actions.email;
    if (a && a.length) return a.map(function (x) { return Array.isArray(x) ? { key: x[0], label: x[1] } : { key: x.key, label: x.label || x.key }; });
    return ["opener", "value", "proof", "angle", "bump", "breakup"].map(function (r) { return { key: r, label: ROLE_LABELS[r] || r }; });
  }
  function mapRole(r) { return r === "visit" ? "linkedin_visit" : (r === "connect" ? "linkedin_invite" : (r === "message" ? "linkedin_dm" : r)); }
  function channelForRole(r) { return (/^linkedin/.test(r) || r === "visit" || r === "connect" || r === "message") ? "linkedin" : "email"; }
  function stepChannel(st) { return S.channel === "mixed" ? (st.channel || channelForRole(st.role)) : S.channel; }
  function labelFor(key) { var ac = ctx.available_channels; if (ac) { for (var i = 0; i < ac.length; i++) if (ac[i].key === key) return ac[i].label || key; } return ROLE_LABELS[key] || key; }

  var signalTypes = ctx.signal_types || [];
  var clones = [{ id: "", name: "— aucune (partir de zéro) —" }].concat(ctx.campaigns || []);
  var templates = ctx.templates || [], authored = ctx.authored_models || [];

  var personasAll = [];
  (function () { var p = iv("persona"); if (p) p.split(/[,;]/).forEach(function (x) { x = x.trim(); if (x) personasAll.push(x); }); ["Founders / CEO", "Marketing leaders", "Growth / Demand gen"].forEach(function (x) { if (personasAll.indexOf(x) < 0) personasAll.push(x); }); })();
  var segAll = ["B2B SaaS", "Grand compte / Enterprise", "Université", "Association / ONG", "Secteur public"];
  var geoSugg = ["UK", "Germany", "France", "Spain", "DACH", "Benelux", "Nordics"];
  var objChips = ["Booker un call de 30 min", "Envoyer le rapport échantillon", "Intro douce / awareness"];

  function defSteps() { var r = PRESETS[SD.preset || "founder_led_5"] || PRESETS.founder_led_5; return r.map(function (x, i) { var role = mapRole(x); return { role: role, delay: i === 0 ? 0 : DELAY, channel: channelForRole(role) }; }); }
  var S = {
    start: "", cloneName: "", cloning: "", name: "", nameEdited: false,
    lang: (ctx.default_language === "fr") ? "fr" : "en", tone: "vous",
    geo: [], personas: [], segments: [], signals: [],
    objective: iv("objective") || "Booker un call de 30 min",
    angle: DEFAULT_ANGLE, voice: "workspace", voiceText: DEFAULT_VOICE, baseModelId: "", templateId: "",
    leads: "source", vol: 20, icp: DEFAULT_ICP, channel: "email", steps: defSteps()
  };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function autoName() { return (S.geo[0] || "Multi-geo") + " GEO — " + (S.personas[0] || "décideurs") + " — " + monthYear(); }
  function monthYear() { var m = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; var d = new Date(); return m[d.getMonth()] + " " + d.getFullYear(); }
  function enforceBreakup() { if (S.steps.length >= 2) { var last = S.steps[S.steps.length - 1]; if (stepChannel(last) === "email" && SD.enforce_breakup_last !== false) { S.steps.forEach(function (s, i) { if (i < S.steps.length - 1 && s.role === "breakup") s.role = "value"; }); last.role = "breakup"; } } }
  function normalizeStepsForChannel() {
    if (S.channel === "email") { S.steps.forEach(function (st) { st.channel = "email"; if (channelForRole(st.role) === "linkedin") st.role = "value"; }); }
    else if (S.channel === "linkedin") { var acts = actionsFor("linkedin"); S.steps.forEach(function (st) { st.channel = "linkedin"; if (!acts.some(function (a) { return a.key === st.role; })) st.role = (acts[0] && acts[0].key) || "linkedin_dm"; }); }
    else { S.steps.forEach(function (st) { if (!st.channel) st.channel = channelForRole(st.role); }); }
    enforceBreakup();
  }
  function cadDays() { var c = 0; S.steps.forEach(function (s) { c += s.delay; }); return c; }
  function presetName() { var key = S.steps.map(function (s) { return s.role; }).join(); for (var k in PRESETS) if (PRESETS[k].map(mapRole).join() === key) return PRESET_LABELS[k] || k; return "Personnalisé"; }
  function sigType(k) { for (var i = 0; i < signalTypes.length; i++) if (signalTypes[i].key === k) return signalTypes[i]; return null; }

  function chip(f, pairs) { return pairs.map(function (p) { return '<button class="chip' + (S[f] === p[0] ? " on" : "") + '" data-chip="' + f + '" data-val="' + esc(p[0]) + '">' + esc(p[1]) + "</button>"; }).join(""); }
  function multi(f, pairs) { return pairs.map(function (p) { return '<button class="chip' + (S[f].indexOf(p[0]) >= 0 ? " on" : "") + '" data-mc="' + f + '" data-val="' + esc(p[0]) + '">' + esc(p[1]) + "</button>"; }).join(""); }
  function customChips(f, known) { return S[f].filter(function (v) { return known.indexOf(v) < 0; }).map(function (v) { return '<button class="chip on" data-mc="' + f + '" data-val="' + esc(v) + '">' + esc(v) + "</button>"; }).join(""); }
  function tags(f) { return S[f].length ? S[f].map(function (v, i) { return '<span class="tag">' + esc(v) + ' <span class="x" data-rm="' + f + '" data-i="' + i + '">×</span></span>'; }).join("") : '<span class="mini">aucun pour l\'instant</span>'; }

  var SECTIONS = [
    { id: "start", icon: "ti-copy", title: "Démarrer depuis une campagne",
      sum: function () { return S.cloning ? ("Chargement de « " + S.cloning + " »…") : (S.start ? ("cloné : " + S.cloneName) : "Partir de zéro"); },
      status: function () { return "opt"; },
      body: function () { return '<label class="lbl">Cloner une campagne existante</label><select data-sel="start">' + clones.map(function (c) { return '<option value="' + esc(c.id) + '"' + (S.start === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + '</select><div class="mini" style="margin-top:6px">Reprend sa config (ciblage, angle, cadence). Ajustable ensuite.</div>'; } },
    { id: "essentiel", icon: "ti-flag", title: "Essentiel", req: true,
      sum: function () { return (S.lang === "fr" ? "FR" : "EN") + (S.lang === "fr" ? (" · " + (S.tone === "vous" ? "vouvoiement" : "tutoiement")) : "") + " · " + (S.name.trim() ? "nommée" : "auto"); },
      status: function () { return "ok"; },
      body: function () { var t = S.lang === "fr" ? '<label class="lbl">Ton</label><div class="row">' + chip("tone", [["vous", "Vouvoiement"], ["tu", "Tutoiement"]]) + "</div>" : "";
        return '<label class="lbl">Nom de la campagne</label><input data-txt="name" value="' + esc(S.name || autoName()) + '"><label class="lbl">Objectif du meeting</label><div class="row" style="margin-bottom:6px">' + objChips.map(function (o) { return '<button class="chip' + (S.objective === o ? " on" : "") + '" data-obj="' + esc(o) + '">' + esc(o) + "</button>"; }).join("") + '</div><input data-txt="objective" value="' + esc(S.objective) + '"><label class="lbl">Langue d\'envoi</label><div class="row">' + chip("lang", [["en", "English"], ["fr", "Français"]]) + "</div>" + t; } },
    { id: "cible", icon: "ti-target", title: "Cible", req: true,
      sum: function () { return (S.geo.join(", ") || "—") + " · " + (S.personas.join(", ") || "—"); },
      status: function () { return (S.geo.length && S.personas.length) ? "ok" : "todo"; },
      body: function () { return '' +
        '<label class="lbl">Géographie <span class="mini">(tape n\'importe quel pays / ville / région)</span></label><div class="row">' + tags("geo") + '</div>' +
        '<div class="addrow"><input data-add="geo" placeholder="ex. London, Île-de-France, Benelux…"><button class="btn" data-addbtn="geo">Ajouter</button></div>' +
        '<div class="row" style="margin-top:8px">' + geoSugg.map(function (g) { return '<button class="chip add" data-sugg="geo" data-val="' + esc(g) + '">+ ' + esc(g) + "</button>"; }).join("") + '</div>' +
        '<label class="lbl">Persona(s) <span class="mini">(tape ou choisis ; clique × pour retirer)</span></label><div class="row">' + tags("personas") + '</div>' +
        '<div class="addrow"><input data-add="personas" placeholder="ex. Head of Demand Gen"><button class="btn" data-addbtn="personas">Ajouter</button></div>' +
        '<div class="row" style="margin-top:8px">' + personasAll.map(function (p) { return '<button class="chip add" data-sugg="personas" data-val="' + esc(p) + '">+ ' + esc(p) + "</button>"; }).join("") + '</div>' +
        '<label class="lbl">Segment <span class="mini">(optionnel, libre ; clique × pour retirer)</span></label><div class="row">' + tags("segments") + '</div>' +
        '<div class="addrow"><input data-add="segments" placeholder="ex. Scale-up financé, ETI industrielle…"><button class="btn" data-addbtn="segments">Ajouter</button></div>' +
        '<div class="row" style="margin-top:8px">' + segAll.map(function (s) { return '<button class="chip add" data-sugg="segments" data-val="' + esc(s) + '">+ ' + esc(s) + "</button>"; }).join("") + '</div>'; } },
    { id: "angle", icon: "ti-bulb", title: "Angle & signaux", req: true,
      sum: function () { return (S.signals.length ? S.signals.length + " signal(s)" : "cold") + " · angle " + (S.angle.trim() ? "défini" : "vide"); },
      status: function () { return S.angle.trim() ? "ok" : "todo"; },
      body: function () { return '<label class="lbl">Signal(s) d\'origine <span class="mini">(pilotent l\'angle)</span></label><div class="row">' + multi("signals", signalTypes.map(function (t) { return [t.key, t.name]; })) + '</div><label class="lbl">Angle d\'accroche</label><textarea data-txt="angle" rows="3">' + esc(S.angle) + "</textarea>"; } },
    { id: "voix", icon: "ti-microphone", title: "Voix & modèle",
      sum: function () { return S.voice === "workspace" ? "voix du workspace" : "modèle sélectionné"; },
      status: function () { return "opt"; },
      body: function () { var opts = '<option value="workspace"' + (S.voice === "workspace" ? " selected" : "") + ">Voix du workspace (héritée)</option>";
        authored.forEach(function (m) { opts += '<option value="model:' + esc(m.id) + '"' + (S.voice === "model:" + m.id ? " selected" : "") + ">Modèle IA — " + esc(m.name) + "</option>"; });
        templates.forEach(function (t) { opts += '<option value="template:' + esc(t.id) + '"' + (S.voice === "template:" + t.id ? " selected" : "") + ">Modèle de séquence — " + esc(t.name) + "</option>"; });
        return '<label class="lbl">Source de la voix / du modèle</label><select data-sel="voice">' + opts + '</select><textarea data-txt="voiceText" rows="2" style="margin-top:8px" placeholder="Voix appliquée (héritée par défaut) — édite pour affiner.">' + esc(S.voiceText) + '</textarea>'; } },
    { id: "cadence", icon: "ti-timeline-event", title: "Cadence", req: true,
      sum: function () { return presetName() + " · " + S.steps.length + " étapes" + (S.channel !== "email" ? " · " + (S.channel === "mixed" ? "mixte" : "LinkedIn") : "") + " · ~J+" + cadDays(); },
      status: function () { return "ok"; },
      body: function () {
        var chan = LINKEDIN ? '<div class="row" style="margin-bottom:8px"><span class="mini" style="margin-right:4px">Canal</span>' + chip("channel", [["email", "Email"], ["linkedin", "LinkedIn"], ["mixed", "Mixte"]]) + '</div>' : '';
        var mixed = S.channel === "mixed";
        var rows = S.steps.map(function (st, i) {
          var last = i === S.steps.length - 1;
          var ch = stepChannel(st);
          var acts = actionsFor(ch);
          if (!acts.some(function (a) { return a.key === st.role; })) st.role = (acts[0] && acts[0].key) || "value";
          var chanSel = mixed ? '<select data-stepchan="' + i + '" title="Canal de l\'étape"><option value="email"' + (ch === "email" ? " selected" : "") + '>Email</option><option value="linkedin"' + (ch === "linkedin" ? " selected" : "") + '>LinkedIn</option></select>' : '';
          var lockLast = last && SD.enforce_breakup_last !== false && ch === "email";
          var actSel = '<select data-role="' + i + '"' + (lockLast ? " disabled" : "") + ">" + acts.map(function (a) { return '<option value="' + a.key + '"' + (st.role === a.key ? " selected" : "") + ">" + esc(a.label) + "</option>"; }).join("") + "</select>";
          return '<div class="step' + (st.role === "breakup" ? " brk" : "") + '"><span class="ix">Étape ' + (i + 1) + '</span>' + chanSel + actSel + '<span class="mini">J+</span><input class="dl" type="number" min="0" max="30" data-delay="' + i + '" value="' + st.delay + '"' + (i === 0 ? " disabled" : "") + '><button class="btn" data-rmstep="' + i + '"' + (S.steps.length <= 1 ? " disabled" : "") + ">×</button></div>";
        }).join("");
        var presetOpts = '<option value="">Preset…</option>' + Object.keys(PRESETS).filter(function (k) { return LINKEDIN || !isLinkedinPreset(k); }).map(function (k) { return '<option value="' + k + '">' + esc(presetLabel(k)) + " · " + PRESETS[k].length + "</option>"; }).join("");
        var chanNote = S.channel === "email" ? "canal email" : (S.channel === "mixed" ? "multicanal (email + LinkedIn par étape)" : "canal LinkedIn");
        return chan + '<div class="mini" style="margin:8px 0">Action + délai par étape · breakup verrouillé en fin · ' + chanNote + ' · le contenu se rédige dans la maquette (héritée).</div>' + rows + '<div class="row" style="margin-top:4px"><button class="btn" data-addstep="1">+ Ajouter une étape</button><select data-preset="1" style="width:auto">' + presetOpts + '</select><span class="mini" id="cad-sum">' + S.steps.length + " étapes · dernier contact ~J+" + cadDays() + "</span></div>"; } },
    { id: "leads", icon: "ti-users", title: "Leads", req: true,
      sum: function () { return S.leads === "source" ? (S.vol + " leads à sourcer") : "sélection existante"; },
      status: function () { return "ok"; },
      body: function () { return '<div class="row">' + chip("leads", [["source", "Sourcer (ICP)"], ["enroll", "Enrôler une sélection"]]) + "</div>" + (S.leads === "source" ? '<label class="lbl">Nombre de leads</label><div class="row"><button class="btn" data-vol="-5">−</button><span id="w-vol" style="min-width:34px;text-align:center;font-weight:500">' + S.vol + '</span><button class="btn" data-vol="5">+</button></div><label class="lbl">Brief ICP du sourcing</label><textarea data-txt="icp" rows="2">' + esc(S.icp) + "</textarea>" : '<div class="mini" style="margin-top:8px">Tu préciseras les lead_ids à enrôler. Aucun sourcing lancé.</div>'); } }
  ];

  var openId = "essentiel", pendingAdvance = false;
  function pillHtml(st) { var m = { ok: ["ok", "Prêt"], todo: ["todo", "À compléter"], opt: ["opt", "Optionnel"] }[st]; return '<span class="pill ' + m[0] + '">' + m[1] + "</span>"; }

  root.innerHTML = '<div class="top"><div class="nm" id="w-nm"></div><div class="rl" id="w-rl"></div><div class="bar"><i id="w-bar"></i></div><div class="barlbl" id="w-barlbl"></div></div><div id="w-acc"></div><button class="create" id="w-create" disabled>Créer la campagne ↗</button><div class="mini" id="w-remain" style="margin-top:6px;text-align:center"></div>';

  function rebuild() {
    if (pendingAdvance) { pendingAdvance = false; var cur = SECTIONS.filter(function (s) { return s.id === openId; })[0]; if (cur && cur.req && cur.status() === "ok") advance(openId); }
    var host = root.querySelector("#w-acc"); host.innerHTML = "";
    SECTIONS.forEach(function (sec) {
      var open = openId === sec.id;
      var d = document.createElement("div"); d.className = "acc" + (open ? " open" : ""); d.setAttribute("data-id", sec.id);
      d.innerHTML = '<button class="hd" data-acc="' + sec.id + '"><i class="ti ti-chevron-down chev" aria-hidden="true"></i><i class="ti ' + sec.icon + ' ti-lead" aria-hidden="true"></i><span class="grow"><span class="ttl">' + sec.title + '</span><div class="sum">' + sec.sum() + '</div></span><span class="pillwrap">' + pillHtml(sec.status()) + "</span></button>" + (open ? ('<div class="bd">' + sec.body() + "</div>") : "");
      host.appendChild(d);
    });
    bind(); meta();
  }
  function meta() {
    SECTIONS.forEach(function (sec) { var el = root.querySelector('.acc[data-id="' + sec.id + '"]'); if (!el) return; el.querySelector(".sum").textContent = sec.sum(); el.querySelector(".pillwrap").innerHTML = pillHtml(sec.status()); });
    var req = SECTIONS.filter(function (s) { return s.req; }); var done = req.filter(function (s) { return s.status() === "ok"; }).length;
    root.querySelector("#w-bar").style.width = Math.round(done / req.length * 100) + "%";
    root.querySelector("#w-barlbl").textContent = done + "/" + req.length + " sections prêtes";
    root.querySelector("#w-nm").textContent = (S.name.trim() || autoName());
    root.querySelector("#w-rl").textContent = (S.lang === "fr" ? "FR" : "EN") + " · " + (S.geo.join("/") || "—") + " · " + (S.personas.join(", ") || "—") + " · " + (S.signals.length ? S.signals.length + " signal(s)" : "cold");
    var ok = done === req.length; root.querySelector("#w-create").disabled = !ok;
    root.querySelector("#w-remain").textContent = ok ? "Tout est prêt." : ((req.length - done) + " section(s) à compléter");
    var cs = root.querySelector("#cad-sum"); if (cs) cs.textContent = S.steps.length + " étapes · dernier contact ~J+" + cadDays();
  }
  // soft auto-advance: after a required section becomes ready, open the next still-todo one
  function advance(curId) {
    var idx = SECTIONS.findIndex(function (s) { return s.id === curId; });
    for (var i = idx + 1; i < SECTIONS.length; i++) { if (SECTIONS[i].req && SECTIONS[i].status() !== "ok") { openId = SECTIONS[i].id; return; } }
  }
  function applyVoice(v) {
    S.voice = v; S.baseModelId = ""; S.templateId = "";
    if (v.indexOf("model:") === 0) { S.baseModelId = v.slice(6); var m = authored.find(function (x) { return "model:" + x.id === v; }); if (m && m.meta) { if (m.meta.angle) S.angle = m.meta.angle; if (m.meta.persona && S.personas.indexOf(m.meta.persona) < 0) S.personas.push(m.meta.persona); } }
    else if (v.indexOf("template:") === 0) { S.templateId = v.slice(9); }
    else { if (!S.voiceTextEdited) S.voiceText = DEFAULT_VOICE; }
  }
  function applyConfigObj(cfg) {
    cfg = cfg || {};
    if (cfg.language) S.lang = cfg.language === "fr" ? "fr" : "en";
    if (cfg.objective) S.objective = cfg.objective;
    if (cfg.angle) { S.angle = cfg.angle; S.angleEdited = true; }
    if (cfg.icp_description) S.icp = cfg.icp_description;
    if (cfg.persona) { S.personas = []; cfg.persona.split(/[,;]/).forEach(function (x) { x = x.trim(); if (x) S.personas.push(x); }); }
    if (cfg.signal_type_key) S.signals = [cfg.signal_type_key];
    if (cfg.steps && cfg.steps.length) {
      S.steps = cfg.steps.map(function (s, i) { var role = mapRole(s.role); role = ROLE_ALL.indexOf(role) >= 0 ? role : "value"; return { role: role, delay: i === 0 ? 0 : (s.delay_days != null ? s.delay_days : DELAY), channel: s.channel || channelForRole(role) }; });
      if (LINKEDIN) { var chs = S.steps.map(function (st) { return st.channel; }); S.channel = chs.every(function (c) { return c === "linkedin"; }) ? "linkedin" : (chs.some(function (c) { return c === "linkedin"; }) ? "mixed" : "email"); }
    }
  }
  function applyClone(id) {
    var c = (ctx.campaigns || []).find(function (x) { return x.id === id; }); S.start = id; S.cloneName = c ? c.name : "";
    if (c) applyConfigObj(c.config || {});
  }

  function bind() {
    root.querySelectorAll("[data-acc]").forEach(function (b) { b.onclick = function () { var id = this.getAttribute("data-acc"); openId = (openId === id ? "" : id); rebuild(); }; });
    root.querySelectorAll("[data-chip]").forEach(function (b) { b.onclick = function () { var f = this.getAttribute("data-chip"); S[f] = this.getAttribute("data-val"); if (f === "channel") normalizeStepsForChannel(); rebuild(); }; });
    root.querySelectorAll("[data-obj]").forEach(function (b) { b.onclick = function () { S.objective = this.getAttribute("data-obj"); rebuild(); }; });
    root.querySelectorAll("[data-mc]").forEach(function (b) { b.onclick = function () { var f = this.getAttribute("data-mc"), v = this.getAttribute("data-val"); var i = S[f].indexOf(v); if (i >= 0) S[f].splice(i, 1); else S[f].push(v); pendingAdvance = true; rebuild(); }; });
    root.querySelectorAll("[data-sugg]").forEach(function (b) { b.onclick = function () { var f = this.getAttribute("data-sugg"), v = this.getAttribute("data-val"); if (S[f].indexOf(v) < 0) S[f].push(v); pendingAdvance = true; rebuild(); }; });
    root.querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { S[this.getAttribute("data-rm")].splice(+this.getAttribute("data-i"), 1); rebuild(); }; });
    root.querySelectorAll("[data-addbtn]").forEach(function (b) { b.onclick = function () { var f = this.getAttribute("data-addbtn"); var inp = root.querySelector('[data-add="' + f + '"]'); var v = (inp.value || "").trim(); if (v && S[f].indexOf(v) < 0) S[f].push(v); pendingAdvance = true; rebuild(); }; });
    root.querySelectorAll("[data-add]").forEach(function (inp) { inp.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); var f = this.getAttribute("data-add"); var v = (this.value || "").trim(); if (v && S[f].indexOf(v) < 0) S[f].push(v); pendingAdvance = true; rebuild(); } }; });
    root.querySelectorAll("[data-sel]").forEach(function (s) { s.onchange = function () {
      var f = this.getAttribute("data-sel");
      if (f === "voice") { applyVoice(this.value); rebuild(); return; }
      if (f === "start") {
        var id = this.value;
        if (!id) { S.start = ""; S.cloneName = ""; S.cloning = ""; rebuild(); return; }
        var c = (ctx.campaigns || []).find(function (x) { return x.id === id; });
        if (c && c.config) { applyClone(id); S.cloning = ""; rebuild(); return; } // instant si la config est déjà fournie (compat)
        var nm = c ? c.name : id;                                                    // sinon : préremplissage à la demande
        S.start = id; S.cloneName = nm; S.cloning = nm; rebuild();
        send("Rouvre le configurateur de campagne pré-rempli à partir de la campagne « " + nm + " » : appelle l'outil campaign_builder avec prefill_campaign_id=\"" + id + "\", puis affiche le builder pré-rempli (sa config complète, ICP inclus). Ne crée aucune campagne — c'est seulement un préremplissage.");
        return;
      }
      S[f] = this.value; rebuild();
    }; });
    root.querySelectorAll('[data-txt]').forEach(function (el) { el.oninput = function () { var f = this.getAttribute("data-txt"); S[f] = this.value; if (f === "name") S.nameEdited = true; if (f === "voiceText") S.voiceTextEdited = true; meta(); }; });
    root.querySelectorAll("[data-role]").forEach(function (s) { s.onchange = function () { S.steps[+this.getAttribute("data-role")].role = this.value; enforceBreakup(); rebuild(); }; });
    root.querySelectorAll("[data-stepchan]").forEach(function (s) { s.onchange = function () { var st = S.steps[+this.getAttribute("data-stepchan")]; st.channel = this.value; var acts = actionsFor(st.channel); if (!acts.some(function (a) { return a.key === st.role; })) st.role = (acts[0] && acts[0].key) || "value"; enforceBreakup(); rebuild(); }; });
    root.querySelectorAll("[data-delay]").forEach(function (inp) { inp.oninput = function () { S.steps[+this.getAttribute("data-delay")].delay = Math.max(0, Math.min(30, parseInt(this.value || "0", 10))); meta(); }; });
    root.querySelectorAll("[data-rmstep]").forEach(function (b) { b.onclick = function () { if (S.steps.length > 1) { S.steps.splice(+this.getAttribute("data-rmstep"), 1); enforceBreakup(); rebuild(); } }; });
    root.querySelectorAll("[data-addstep]").forEach(function (b) { b.onclick = function () { if (S.steps.length < MAXST) { var ch = S.channel === "linkedin" ? "linkedin" : "email"; var role = ch === "linkedin" ? ((actionsFor("linkedin")[0] || {}).key || "linkedin_dm") : "value"; S.steps.push({ role: role, delay: DELAY, channel: ch }); enforceBreakup(); rebuild(); } }; });
    root.querySelectorAll("[data-preset]").forEach(function (s) { s.onchange = function () { var k = this.value; if (PRESETS[k]) { var mode = presetMode(k); S.steps = PRESETS[k].map(function (r, i) { var role = presetStepRole(r, mode); return { role: role, delay: i === 0 ? 0 : DELAY, channel: channelForRole(role) }; }); var chs = S.steps.map(function (st) { return st.channel; }); S.channel = mode || (chs.every(function (c) { return c === "linkedin"; }) ? "linkedin" : (chs.some(function (c) { return c === "linkedin"; }) ? "mixed" : "email")); rebuild(); } }; });
    root.querySelectorAll("[data-vol]").forEach(function (b) { b.onclick = function () { S.vol = Math.max(5, Math.min(60, S.vol + (+this.getAttribute("data-vol")))); rebuild(); }; });
    var cb = root.querySelector("#w-create"); if (cb) cb.onclick = submit;
  }

  function send(p) { if (!p) return; if (typeof window.sendPrompt === "function") { try { window.sendPrompt(p); return; } catch (e) {} } try { window.parent.postMessage({ type: "prompt", payload: { prompt: p } }, "*"); } catch (e) {} }
  function submit() {
    if (root.querySelector("#w-create").disabled) return;
    var name = S.name.trim() || autoName();
    var seq = S.steps.map(function (st, i) { var ch = stepChannel(st); var lbl = ch === "linkedin" ? labelFor(st.role) : (ROLE_LABELS[st.role] || st.role); return (i + 1) + ". " + lbl + " (J+" + st.delay + ")"; }).join(" · ");
    var sigList = S.signals.map(function (k) { var t = sigType(k); return (t ? t.name : k) + " [" + k + "]"; });
    var voiceLine = S.voice === "workspace" ? "voix du workspace" : (S.baseModelId ? ("modèle IA " + S.baseModelId) : ("modèle de séquence " + S.templateId));
    var L = [];
    L.push("Crée et paramètre une nouvelle campagne (campaign-first) avec EXACTEMENT ces réglages — ne réinvente rien.");
    L.push("");
    L.push("- Nom : " + name);
    L.push("- Point de départ : " + (S.start ? ("cloner la campagne " + S.start + " (" + S.cloneName + ") puis ajuster") : "partir de zéro"));
    L.push("- Langue : " + (S.lang === "fr" ? "français" : "anglais") + (S.lang === "fr" ? (" · ton " + (S.tone === "vous" ? "vouvoiement" : "tutoiement")) : ""));
    L.push("- Géographie : " + (S.geo.join(", ") || "non précisée"));
    L.push("- Persona(s) : " + (S.personas.join(", ") || "non précisé"));
    if (S.segments.length) L.push("- Segment(s) : " + S.segments.join(", "));
    L.push("- Objectif du meeting : " + S.objective);
    L.push("- Signal(s) d'origine : " + (sigList.length ? sigList.join(", ") : "aucun (cold / ICP)"));
    L.push("- Angle : " + S.angle.trim());
    L.push("- Voix & modèle : " + voiceLine + (S.voiceText.trim() ? (" — override : " + S.voiceText.trim()) : ""));
    if (S.baseModelId) L.push("  → campaign_create base_model_id=" + S.baseModelId + " (generation_mode=claude_authored).");
    if (S.templateId) L.push("  → repartir du modèle de séquence template_id=" + S.templateId + ".");
    var chanLabel = S.channel === "email" ? "email" : (S.channel === "mixed" ? "mixte (email + LinkedIn)" : "LinkedIn");
    L.push("- Canal : " + chanLabel + (S.channel !== "email" ? " (channel_mode=" + S.channel + ")" : ""));
    L.push("- Cadence : " + seq + " — claude_authored.");
    L.push("");
    if (S.leads === "source") {
      L.push("Étape 1 — SOURCING : discover_qualified_leads (recherche web + preuves) pour ~" + S.vol + " leads QUALIFIED.");
      L.push("  Brief ICP : " + (S.icp.trim() || DEFAULT_ICP));
      L.push("  Filtre géo : " + (S.geo.join(", ") || "large") + " · personas : " + (S.personas.join(", ") || "large") + (S.segments.length ? (" · segment : " + S.segments.join(", ")) : ""));
      if (S.signals.length) L.push("  Oriente le sourcing sur : " + S.signals.join(", ") + ".");
      L.push("  Récupère les lead_ids.");
    } else { L.push("Étape 1 — ENRÔLEMENT : utilise les lead_ids de la sélection existante (je te les précise). Aucun sourcing."); }
    L.push("");
    L.push("Étape 2 — CAMPAGNE : campaign_create (name + angle + persona + steps selon la cadence — chaque étape porte son canal (email/linkedin) + son action + son délai, lead_ids). La maquette héritera de cette séquence ; le contenu de chaque étape (email ou message/action LinkedIn) y sera rédigé." + (S.baseModelId ? " Passe base_model_id." : (S.templateId ? " Repars du template." : "")));
    L.push("Étape 3 — set_campaign_config sur le DRAFT : objective, angle, persona, icp_description" + (S.signals.length ? (", signal_type_key=" + S.signals[0]) : "") + (S.channel !== "email" ? (", channel_mode=" + S.channel + " (séquence " + presetName() + ")") : "") + (S.voiceText.trim() ? ", voice_description (override)" : "") + ".");
    L.push("Étape 4 — montre-moi la maquette éditable sur le meilleur lead, fais-la valider, puis lance.");
    send(L.join("\n"));
    var b = root.querySelector("#w-create"); var prev = b.textContent; b.textContent = "Campagne envoyée ✓"; b.disabled = true; setTimeout(function () { b.textContent = prev; b.disabled = false; }, 2000);
  }

  if (ctx.prefill) { S.start = ctx.prefill.campaign_id || ""; S.cloneName = ctx.prefill.name || ""; S.cloning = ""; applyConfigObj(ctx.prefill.config || {}); }
  rebuild();
})();
