/* qualified-leads.v1.js — AIOrigin BDR leads table behaviour.
   SOURCE OF TRUTH = LEADS_WIDGET_SCRIPT in src/lib/mcp/widgets/qualified-leads-mcpui.ts.
   Progressive enhancement: the table is fully server-rendered; this only wires
   selection + actions and emits chat prompts the agent routes to existing tools.
   Bridge identical to sequence-builder.v3.js (window.sendPrompt → postMessage). */
(function () {
  var root = document.querySelector(".ao-leads");
  if (!root) return;

  var CTX = {};
  try { CTX = JSON.parse(document.getElementById("leads-ctx").textContent || "{}"); } catch (e) {}

  // Best-effort render beacon (parity with the other widgets).
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

  root.classList.add("js");

  var batchId = CTX.batch_id || "";
  var camp = CTX.campaign || null; // { id, name, locked }
  var campLabel = camp && camp.name ? camp.name : "la campagne";

  function rows() { return Array.prototype.slice.call(root.querySelectorAll("tr[data-lead-id]")); }
  function boxes() { return Array.prototype.slice.call(root.querySelectorAll(".rowsel")); }
  function selectedRows() { return rows().filter(function (r) { var b = r.querySelector(".rowsel"); return b && b.checked && !r.classList.contains("excluded"); }); }
  function selectedIds() { return selectedRows().map(function (r) { return r.getAttribute("data-lead-id"); }); }
  function selectedNames() { return selectedRows().map(function (r) { return r.getAttribute("data-name") || ""; }).filter(Boolean); }

  var master = document.getElementById("ao-master");
  var selbar = root.querySelector(".selbar");
  var selCount = document.getElementById("ao-selcount");

  function refreshState() {
    var all = boxes().filter(function (b) { return !b.closest("tr").classList.contains("excluded"); });
    var checked = all.filter(function (b) { return b.checked; });
    var n = checked.length;
    root.classList.toggle("has-sel", n > 0);
    if (selCount) selCount.textContent = n + " sélectionné" + (n > 1 ? "s" : "");
    if (master) {
      master.classList.remove("all", "some");
      if (n > 0 && n === all.length) master.classList.add("all");
      else if (n > 0) master.classList.add("some");
    }
  }

  if (master) {
    master.addEventListener("click", function () {
      var all = boxes().filter(function (b) { return !b.closest("tr").classList.contains("excluded"); });
      var target = !(all.length && all.every(function (b) { return b.checked; }));
      all.forEach(function (b) { b.checked = target; });
      refreshState();
    });
  }
  boxes().forEach(function (b) { b.addEventListener("change", refreshState); });

  var clr = document.getElementById("ao-clear");
  if (clr) clr.addEventListener("click", function () { boxes().forEach(function (b) { b.checked = false; }); refreshState(); });

  // Add selection to a campaign (default = locked campaign from sourcing context).
  var addCamp = document.getElementById("ao-add-camp");
  if (addCamp) addCamp.addEventListener("click", function () {
    var ids = selectedIds(); if (!ids.length) return;
    var ref = camp && camp.id ? ("la campagne « " + camp.name + " » (campaign_id " + camp.id + ")") : "une campagne (demande-moi laquelle ou propose d'en créer une)";
    send("Ajoute les " + ids.length + " leads sélectionnés (lead_id " + ids.join(", ") + ") à " + ref + " via campaign_enroll. Leads : " + selectedNames().join(", ") + ".");
    flash(addCamp, "Demandé ✓");
  });

  // Launch a sequence for the selection.
  var launch = document.getElementById("ao-launch");
  if (launch) launch.addEventListener("click", function () {
    var ids = selectedIds(); if (!ids.length) return;
    send("Lance la séquence d'outreach pour les " + ids.length + " leads sélectionnés (lead_id " + ids.join(", ") + ") : montre-moi la maquette via sequence_show" + (camp && camp.id ? (" sur la campagne " + camp.id) : "") + ".");
    flash(launch, "Demandé ✓");
  });

  // Export CSV.
  var exp = document.getElementById("ao-export");
  if (exp) exp.addEventListener("click", function () {
    var ids = selectedIds();
    send("Exporte en CSV " + (ids.length ? ("les leads sélectionnés (lead_id " + ids.join(", ") + ")") : "tous les leads de ce lot") + ".");
    flash(exp, "Demandé ✓");
  });

  // Change / choose campaign (header pill).
  var campPill = document.getElementById("ao-camp");
  if (campPill && !(camp && camp.locked)) campPill.addEventListener("click", function () {
    send("Montre-moi mes campagnes existantes pour y rattacher ces leads, ou propose d'en créer une nouvelle.");
  });

  // Refresh pending emails (global).
  var refreshBtn = document.getElementById("ao-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", function () {
    send("Rafraîchis les emails encore en attente du lot " + batchId + " : rappelle discover_qualified_leads avec le MÊME batch (le cache renverra les emails) puis ré-affiche le tableau.");
    flash(refreshBtn, "Demandé ✓");
  });

  // Per-row refresh link (pending email).
  Array.prototype.slice.call(root.querySelectorAll(".relink")).forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      send("Rafraîchis les emails encore en attente du lot " + batchId + " (rappelle discover_qualified_leads sur le même batch) puis ré-affiche le tableau.");
    });
  });

  // Exclude a lead from the workspace.
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

  // Source more leads to reach the objective.
  var src = document.getElementById("ao-src");
  var qty = document.getElementById("ao-qty");
  if (src) src.addEventListener("click", function () {
    var n = qty && Number(qty.value) > 0 ? Math.round(Number(qty.value)) : (CTX.batch_size || 5);
    send("Source " + n + " leads qualifiés de plus" + (CTX.target ? (" (objectif " + CTX.target + ")") : "") + " : rappelle discover_qualified_leads avec batch_size=" + n + (camp && camp.id ? (" pour la campagne " + camp.id) : "") + ".");
    flash(src, "Demandé ✓");
  });

  refreshState();
})();
