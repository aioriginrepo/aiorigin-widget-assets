/* qualified-leads.v2.js — AIOrigin BDR leads table behaviour (v2).
   SOURCE OF TRUTH = LEADS_WIDGET_SCRIPT in src/lib/mcp/widgets/qualified-leads-mcpui.ts.
   v2 adds: real campaign <select> (pre-filled), bottom "Ajouter à la campagne" bar,
   Recharger button, first-class "Sourcer plus de leads" block.
   Bridge identical to sequence-builder.v3.js (window.sendPrompt → postMessage). */
(function () {
  var root = document.querySelector(".ao-leads");
  if (!root) return;

  var CTX = {};
  try { CTX = JSON.parse(document.getElementById("leads-ctx").textContent || "{}"); } catch (e) {}

  try {
    var tok = (CTX && CTX.render_token) || "";
    var ackUrl = (CTX && CTX.ack_url) || "/api/public/render-ack";
    if (tok) {
      var beacon = JSON.stringify({ render_token: tok, surface: "qualified_leads_table" });
      if (navigator.sendBeacon) navigator.sendBeacon(ackUrl, beacon);
      else fetch(ackUrl, { method: "POST", body: beacon, keepalive: true, headers: { "content-type": "application/json" } });
    }
  } catch (e) {}

  function post(msg) {
    try { window.parent && window.parent.postMessage(msg, "*"); } catch (e) {}
    try { if (window.top && window.top !== window.parent) window.top.postMessage(msg, "*"); } catch (e) {}
  }
  function send(prompt) {
    if (!prompt) return;
    if (typeof window.sendPrompt === "function") { try { window.sendPrompt(prompt); return; } catch (e) {} }
    var mid = "ao-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    post({ type: "prompt", payload: { prompt: prompt }, messageId: mid });
    post({ type: "prompt", payload: { prompt: prompt } });
    post({ type: "mcp-ui:prompt", payload: { prompt: prompt }, messageId: mid });
  }
  function flash(btn, label) {
    if (!btn) return;
    var prev = btn.textContent;
    btn.classList.add("btn-sent");
    btn.textContent = label || "Envoyé ✓";
    setTimeout(function () { btn.classList.remove("btn-sent"); btn.textContent = prev; }, 1600);
  }
  function byId(id) { return document.getElementById(id); }

  root.classList.add("js");

  var batchId = CTX.batch_id || "";

  function rows() { return Array.prototype.slice.call(root.querySelectorAll("tr[data-lead-id]")); }
  function boxes() { return Array.prototype.slice.call(root.querySelectorAll(".rowsel")); }
  function liveBoxes() { return boxes().filter(function (b) { return !b.closest("tr").classList.contains("excluded"); }); }
  function selectedRows() { return rows().filter(function (r) { var b = r.querySelector(".rowsel"); return b && b.checked && !r.classList.contains("excluded"); }); }
  function selectedIds() { return selectedRows().map(function (r) { return r.getAttribute("data-lead-id"); }); }
  function selectedNames() { return selectedRows().map(function (r) { return r.getAttribute("data-name") || ""; }).filter(Boolean); }

  // ---- campaign select -------------------------------------------------
  var campSel = byId("ao-camp-sel");
  function currentCampaign() {
    if (!campSel) return CTX.campaign || null;
    var opt = campSel.options[campSel.selectedIndex];
    if (!opt) return null;
    if (opt.value === "__new__") return { id: null, name: null, isNew: true };
    return { id: opt.getAttribute("data-id") || null, name: opt.textContent || "", isNew: false };
  }

  // ---- selection state / enroll bar -----------------------------------
  var master = byId("ao-master");
  var seln = byId("ao-seln");
  var destName = byId("ao-destname");
  var enrollBtn = byId("ao-enroll");

  function refreshState() {
    var all = liveBoxes();
    var checked = all.filter(function (b) { return b.checked; });
    var n = checked.length;
    if (seln) seln.textContent = n + " lead" + (n > 1 ? "s" : "");
    if (master) {
      master.classList.remove("all", "some");
      if (n > 0 && n === all.length) master.classList.add("all");
      else if (n > 0) master.classList.add("some");
    }
    var c = currentCampaign();
    if (destName) destName.textContent = c && c.isNew ? "nouvelle campagne" : (c && c.name ? c.name : "—");
    if (enrollBtn) enrollBtn.disabled = n === 0;
  }

  if (master) master.addEventListener("click", function () {
    var all = liveBoxes();
    var target = !(all.length && all.every(function (b) { return b.checked; }));
    all.forEach(function (b) { b.checked = target; });
    refreshState();
  });
  boxes().forEach(function (b) { b.addEventListener("change", refreshState); });
  if (campSel) campSel.addEventListener("change", function () {
    var c = currentCampaign();
    if (c && c.isNew) {
      send("Crée une nouvelle campagne pour y rattacher ces leads : demande-moi le nom et les paramètres, ou propose-en un.");
    }
    refreshState();
  });

  // ---- add selection to the chosen campaign ---------------------------
  if (enrollBtn) enrollBtn.addEventListener("click", function () {
    var ids = selectedIds(); if (!ids.length) return;
    var c = currentCampaign();
    var ref = c && c.id
      ? ("la campagne « " + c.name + " » (campaign_id " + c.id + ")")
      : (c && c.isNew ? "une nouvelle campagne (demande-moi le nom)" : "la campagne sélectionnée");
    send("Ajoute les " + ids.length + " leads sélectionnés à " + ref + " via campaign_enroll. lead_id : " + ids.join(", ") + ". Leads : " + selectedNames().join(", ") + ".");
    flash(enrollBtn, "Demandé ✓");
  });

  // ---- launch a sequence ----------------------------------------------
  var launch = byId("ao-launch");
  if (launch) launch.addEventListener("click", function () {
    var ids = selectedIds(); if (!ids.length) return;
    var c = currentCampaign();
    send("Lance la séquence d'outreach pour les " + ids.length + " leads sélectionnés (lead_id " + ids.join(", ") + ")" + (c && c.id ? (" sur la campagne " + c.id) : "") + " : montre-moi la maquette via sequence_show.");
    flash(launch, "Demandé ✓");
  });

  // ---- reload pending emails ------------------------------------------
  var reload = byId("ao-reload");
  if (reload) reload.addEventListener("click", function () {
    send("Recharge les emails encore en attente du lot " + batchId + " : rappelle discover_qualified_leads avec le MÊME batch (le cache FullEnrich renverra les emails) puis ré-affiche le tableau.");
    flash(reload, "Rechargement demandé ✓");
  });
  Array.prototype.slice.call(root.querySelectorAll(".relink")).forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      send("Recharge les emails encore en attente du lot " + batchId + " (rappelle discover_qualified_leads sur le même batch) puis ré-affiche le tableau.");
    });
  });

  // ---- exclude --------------------------------------------------------
  Array.prototype.slice.call(root.querySelectorAll(".x")).forEach(function (x) {
    x.addEventListener("click", function () {
      var tr = x.closest("tr"); if (!tr) return;
      var name = tr.getAttribute("data-name") || "";
      var company = tr.getAttribute("data-company") || "";
      tr.classList.add("excluded");
      var b = tr.querySelector(".rowsel"); if (b) b.checked = false;
      refreshState();
      send("Exclus définitivement " + name + (company ? " (" + company + ")" : "") + " du workspace via exclusion_add, pour qu'il ne soit plus sourcé.");
    });
  });

  // ---- source more leads (first-class) --------------------------------
  var src = byId("ao-src");
  var qty = byId("ao-qty");
  if (src) src.addEventListener("click", function () {
    var n = qty && Number(qty.value) > 0 ? Math.round(Number(qty.value)) : (CTX.batch_size || 5);
    var c = currentCampaign();
    send("Source " + n + " leads qualifiés de plus avec les mêmes critères (exclus ceux déjà sourcés) : rappelle discover_qualified_leads avec batch_size=" + n + (c && c.id ? (" pour la campagne " + c.id) : "") + ".");
    flash(src, "Demandé ✓");
  });

  refreshState();
})();
