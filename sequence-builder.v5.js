(function(){
      var root = document.querySelector(".ao-seq");
      if (!root) return;
      var CTX = {};
      try { CTX = JSON.parse(document.getElementById("seq-ctx").textContent || "{}"); } catch(e){}

      // Best-effort render beacon (unchanged).
      try {
        var tok = (CTX && CTX.render_token) || "";
        var ackUrl = (CTX && CTX.ack_url) || "/api/public/render-ack";
        if (tok) {
          var beacon = JSON.stringify({ render_token: tok, surface: "sequence_builder" });
          if (navigator.sendBeacon) navigator.sendBeacon(ackUrl, beacon);
          else fetch(ackUrl, { method: "POST", body: beacon, keepalive: true, headers: { "content-type": "application/json" } });
        }
      } catch(e){}

      function post(msg){
        try { window.parent && window.parent.postMessage(msg, "*"); } catch(e){}
        try { if (window.top && window.top !== window.parent) window.top.postMessage(msg, "*"); } catch(e){}
      }
      // Prefer window.sendPrompt (Cowork/visualize); fall back to MCP-UI postMessage.
      function send(prompt){
        if(!prompt) return;
        if (typeof window.sendPrompt === "function") { try { window.sendPrompt(prompt); return; } catch(e){} }
        var mid = "ao-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
        post({ type: "prompt", payload: { prompt: prompt }, messageId: mid });
        post({ type: "prompt", payload: { prompt: prompt } });
        post({ type: "mcp-ui:prompt", payload: { prompt: prompt }, messageId: mid });
      }
      function flash(btn, label){
        if(!btn) return;
        var prev = btn.textContent;
        btn.classList.add("btn-sent");
        btn.textContent = label || "Envoyé ✓";
        setTimeout(function(){ btn.classList.remove("btn-sent"); btn.textContent = prev; }, 1600);
      }

      root.classList.add("js");
      var cardsWrap = document.getElementById("ao-cards");
      var kind = CTX.target_kind || (CTX.template_id ? "template" : null);
      var policyScope = (kind === "campaign" || kind === "variant");
      var bookingMin = (CTX.booking_minutes != null) ? Number(CTX.booking_minutes) : null;

      var pbRef;
      if (kind === "campaign") pbRef = "la séquence de la campagne (campaign_id " + (CTX.campaign_id || "") + ")";
      else if (kind === "variant") pbRef = "la variante A/B (variant_id " + (CTX.variant_id || "") + ", campaign_id " + (CTX.campaign_id || "") + ")";
      else if (CTX.template_id || CTX.playbook_id) pbRef = "le modèle (playbook_id " + (CTX.template_id || CTX.playbook_id) + ")";
      else pbRef = "la séquence « " + (CTX.name || "") + " »";
      var leadRef = CTX.lead_id ? (" (lead_id " + CTX.lead_id + (CTX.lead_name ? ", " + CTX.lead_name : "") + ")") : (CTX.lead_name ? (" pour " + CTX.lead_name) : "");
      var setTarget = (kind === "variant")
        ? "campaign_id=" + (CTX.campaign_id || "") + ", variant_id=" + (CTX.variant_id || "")
        : "campaign_id=" + (CTX.campaign_id || "");

      // ---- helpers over the live DOM ------------------------------------
      function cards(){ return Array.prototype.slice.call(cardsWrap.querySelectorAll(".card")); }
      function aliveCards(){ return cards().filter(function(c){ return !c.classList.contains("del"); }); }
      function field(card, sel){ var el = card.querySelector(sel); return el ? el : null; }
      function fval(card, sel){ var el = card.querySelector(sel); return el ? String(el.value || "") : ""; }
      function readCard(card){
        return {
          role: (function(){ var s = card.querySelector(".f-role"); return s ? s.value : ""; })(),
          delay: (function(){ var d = card.querySelector(".f-delay"); return d ? d.value : "0"; })(),
          subject: fval(card, ".f-subject"),
          angle: fval(card, ".f-angle"),
          body: fval(card, ".f-body"),
          channel: card.getAttribute("data-channel") || "email",
          kind: card.getAttribute("data-kind") || "email",
          linkedin_action: card.getAttribute("data-linkedin-action") || "",
          precondition: card.getAttribute("data-precondition") || "",
          requires_verification: card.getAttribute("data-requires-verification") === "1",
          locked: card.getAttribute("data-locked") === "1",
          isNew: card.classList.contains("newc"),
          regen: card.classList.contains("regen"),
          del: card.classList.contains("del")
        };
      }
      function cardLimit(card){ var b = card.querySelector(".f-body"); var l = b ? Number(b.getAttribute("data-limit") || 0) : 0; return l || 0; }
      // Snapshot baseline (= last server-rendered state) for change/diff/revert.
      cards().forEach(function(card){
        card._base = card.classList.contains("newc") ? null : readSnapshot(card);
      });
      function readSnapshot(card){ var s = readCard(card); return { role:s.role, delay:String(s.delay), subject:s.subject, angle:s.angle, body:s.body }; }
      function changed(card){
        if (card.classList.contains("newc")) return true;
        var b = card._base; if (!b) return true; var s = readCard(card);
        return s.role!==b.role || String(s.delay)!==b.delay || s.subject!==b.subject || s.angle!==b.angle || s.body!==b.body;
      }
      function bodyChanged(card){ var b = card._base; return b && fval(card, ".f-body")!==b.body; }

      // ---- lint ----------------------------------------------------------
      function lintBody(body){
        var o = [];
        var hasBooking = body.indexOf("](booking)") >= 0;
        // Ancre markdown COMPLÈTE [label](cible) où cible = booking, {{booking_url}}
        // ou une URL http(s). On tolère donc un lien cliquable quelconque, pas
        // seulement le lien de RDV.
        var anchorRe = /\[[^\]\n]*\]\(\s*(?:booking|\{\{\s*booking_url\s*\}\}|https?:\/\/[^\s)]+)\s*\)/g;
        var anchors = (body.match(anchorRe) || []).length;
        var brackets = (body.match(/\[/g) || []).length;
        if (brackets > anchors) o.push(["err", "Crochet [ non autorisé (utilise [texte](booking) ou [texte](https://…))"]);
        else if (hasBooking) o.push(["ok", "CTA booking OK"]);
        // « URL brute » = une URL http(s) hors ancre markdown (lien collé nu).
        if (/https?:\/\//i.test(body.replace(anchorRe, ""))) o.push(["err", "URL brute (utilise [texte](https://…))"]);
        if (/\n[ \t]*\n[ \t]*\n/.test(body)) o.push(["warn", "Double saut de ligne"]);
        if (bookingMin != null) {
          var m, re = /(\d+)\s*-?\s*minute/gi, bad = false;
          while ((m = re.exec(body))) { if (Number(m[1]) !== bookingMin) bad = true; }
          if (bad) o.push(["err", "Durée ≠ " + bookingMin + " min"]);
        }
        if (body.indexOf("!") >= 0) o.push(["warn", "Point d'exclamation"]);
        if (/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(body)) o.push(["warn", "Emoji"]);
        return o;
      }
      function lintSubject(sub, isEmail){
        var o = [];
        if (isEmail && !sub.trim()) { o.push(["err", "Objet vide"]); return o; }
        if (sub.length > 62) o.push(["warn", "Objet long (" + sub.length + ")"]);
        var sBrackets = (sub.match(/\[/g) || []).length;
        var sAnchors = (sub.match(/\]\(booking\)/g) || []).length;
        if (sBrackets > sAnchors) o.push(["err", "Crochet [ non autorisé dans l'objet — utilise {{company_name}} ou la vraie valeur"]);
        if (sub.indexOf("!") >= 0) o.push(["warn", "Point d'exclamation"]);
        return o;
      }
      // LinkedIn message lint: character limit is a HARD error (the network
      // rejects over-limit notes/DMs/comments); exclamation/emoji stay soft.
      function lintMessage(body, limit){
        var o = [];
        var L = body.length;
        if (limit && L > limit) o.push(["err", L + "/" + limit + " caractères (limite dépassée)"]);
        else if (limit) o.push(["ok", L + "/" + limit + " caractères"]);
        if (body.indexOf("!") >= 0) o.push(["warn", "Point d'exclamation"]);
        if (/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(body)) o.push(["warn", "Emoji"]);
        return o;
      }
      function cardErrors(card){
        if (card.classList.contains("del") || card.classList.contains("regen")) return 0;
        var kind = card.getAttribute("data-kind") || "email";
        if (kind === "action") return 0;
        var e = 0, all;
        if (kind === "message") all = lintMessage(fval(card, ".f-body"), cardLimit(card));
        else all = lintBody(fval(card, ".f-body")).concat(lintSubject(fval(card, ".f-subject"), true));
        all.forEach(function(x){ if (x[0] === "err") e++; });
        return e;
      }

      // ---- per-card paint -----------------------------------------------
      function paintCard(card, sendDay){
        card.classList.remove("dirty");
        var isNew = card.classList.contains("newc"), del = card.classList.contains("del"), regen = card.classList.contains("regen");
        var bh = "";
        if (del) bh += '<span class="badge bdel">à supprimer</span>';
        else if (isNew) bh += '<span class="badge bnew">nouvelle</span>';
        else if (changed(card)) { card.classList.add("dirty"); bh += '<span class="badge bmod">modifié</span>'; }
        if (regen && !del) bh += '<span class="badge breg">régén.</span>';
        var bb = card.querySelector(".smbadges"); if (bb) bb.innerHTML = bh;

        var rc = card.querySelector(".rolechip");
        if (rc && !(card.getAttribute("data-locked") === "1")) {
          var roleSel = card.querySelector(".f-role");
          rc.textContent = roleSel && roleSel.options[roleSel.selectedIndex] ? roleSel.options[roleSel.selectedIndex].text : "—";
        }
        var kind = card.getAttribute("data-kind") || "email";
        var chLabelEl = card.querySelector(".ch-badge"); var chLabel = chLabelEl ? chLabelEl.textContent : "";
        var body = fval(card, ".f-body");
        var first = (body.split("\n").filter(function(l){ return l.trim() && !/^hi /i.test(l.trim()); })[0] || body.split("\n")[0] || "").trim();
        var subEl = card.querySelector(".smsub");
        if (subEl) {
          if (kind === "email") subEl.textContent = fval(card, ".f-subject") || "(objet vide)";
          else if (kind === "action") subEl.textContent = chLabel || "Action LinkedIn";
          else subEl.textContent = first ? first.slice(0, 80) : chLabel; // message
        }
        var meta = card.querySelector(".smmeta");
        if (meta) {
          var when = del ? "supprimée" : (sendDay === 0 ? "Envoi immédiat (J0)" : "Envoi J+" + sendDay);
          var tail = (kind === "action") ? "" : (first ? "  ·  " + first.slice(0, 80) : "");
          meta.textContent = when + tail;
        }

        var lb = card.querySelector(".lintbox");
        if (lb) {
          var lc = (del || kind === "action") ? [] : (kind === "message" ? lintMessage(body, cardLimit(card)) : lintBody(body)), html = "";
          lc.forEach(function(x){ html += '<span class="lc ' + x[0] + '">' + x[1] + '</span>'; });
          lb.innerHTML = html;
        }
        var cf = card.querySelector(".cf");
        if (cf) cf.innerHTML = (regen && bodyChanged(card) && !isNew) ? '<div class="conflict">⚠ Ton edit manuel du corps sera écrasé par la régénération IA.</div>' : "";
        var ms = card.querySelector(".m-sub");
        if (ms) { var sl = fval(card, ".f-subject").length; ms.textContent = sl + "/62"; ms.className = "meter m-sub" + (sl > 62 ? " warn" : ""); }
        var mb = card.querySelector(".m-body");
        if (mb) { var w = body.trim() ? body.trim().split(/\s+/).length : 0; mb.textContent = w + " mots"; }
        var mm = card.querySelector(".m-msg");
        if (mm) { var lim = cardLimit(card); var L = body.length; mm.textContent = L + (lim ? "/" + lim : "") + " car."; mm.className = "meter m-msg" + (lim && L > lim ? " err" : (lim && L > lim * 0.9 ? " warn" : "")); }
        var ctaIntent = card.getAttribute("data-cta-intent") || "";
        var cta = card.querySelector(".f-cta"); if (cta && document.activeElement !== cta && !ctaIntent) cta.checked = body.indexOf("](booking)") >= 0;
        var ctaHint = card.querySelector(".cta-hint");
        if (ctaHint) ctaHint.textContent = ctaIntent === "add" ? "L'IA ajoutera le CTA à la régénération." : ctaIntent === "remove" ? "L'IA retirera le CTA et reformulera à la régénération." : "";
        var e = cardErrors(card), dot = card.querySelector(".ldot");
        if (dot) { dot.className = "ldot " + (e ? "err" : "ok"); dot.title = e ? (e + " règle(s) à corriger") : "OK"; }
        var rv = card.querySelector(".btn-revert");
        if (rv) rv.style.display = (!isNew && (changed(card) || regen || del)) ? "inline-flex" : "none";

        var up = card.querySelector(".mv-up"), dn = card.querySelector(".mv-dn");
        var list = cards(), i = list.indexOf(card);
        var prev = list[i-1], next = list[i+1];
        if (up) up.disabled = !(prev && card.getAttribute("data-locked") !== "1" && prev.getAttribute("data-locked") !== "1");
        if (dn) dn.disabled = !(next && card.getAttribute("data-locked") !== "1" && next.getAttribute("data-locked") !== "1");
      }

      function counts(){
        var c = { m:0, r:0, x:0, n:0 };
        cards().forEach(function(card){
          if (card.classList.contains("del")) { c.x++; return; }
          if (card.classList.contains("newc")) c.n++;
          else if (changed(card)) c.m++;
          if (card.classList.contains("regen")) c.r++;
        });
        c.total = c.m + c.r + c.x + c.n;
        return c;
      }
      function totalErrors(){ var e = 0; cards().forEach(function(card){ e += cardErrors(card); }); return e; }

      function recompute(){
        var list = cards(), seg = [], cum = 0, k = 0;
        list.forEach(function(card){ if (card.classList.contains("del")) return; cum += Number(card.querySelector(".f-delay") ? card.querySelector(".f-delay").value : 0) || 0; seg.push(cum); });
        list.forEach(function(card){
          var no = card.querySelector(".step-no");
          var day = card.classList.contains("del") ? null : seg[k];
          paintCard(card, day);
          if (!card.classList.contains("del")) k++;
        });
        // renumber visible steps
        var n = 0; list.forEach(function(card){ if (card.classList.contains("del")) return; n++; var s = card.querySelector(".step-no"); if (s) s.textContent = n; });
        renderHealth(seg);
        renderFooter(counts(), totalErrors());
      }

      function renderHealth(seg){
        var al = aliveCards(), parts = [];
        var firstRole = al.length ? (al[0].querySelector(".f-role") ? al[0].querySelector(".f-role").value : "") : "";
        parts.push(firstRole === "opener" ? ["ok","Ouverture en 1ère"] : ["warn","Pas d'ouverture en 1ère"]);
        var lastLocked = al.length ? (al[al.length-1].getAttribute("data-locked") === "1" || (al[al.length-1].querySelector(".f-role") && al[al.length-1].querySelector(".f-role").value === "breakup")) : false;
        parts.push(lastLocked ? ["ok","Adieu en dernier"] : ["warn","Adieu pas en dernier"]);
        var subs = al.map(function(c){ return fval(c, ".f-subject").replace(/^re:\s*/i, "").trim().toLowerCase(); }), dup = false;
        subs.forEach(function(s, i){ if (s && subs.indexOf(s) !== i) dup = true; });
        parts.push(dup ? ["warn","Objets en doublon"] : ["ok","Objets distincts"]);
        var te = totalErrors();
        parts.push(te ? ["err", te + " règle" + (te>1?"s":"") + " à corriger"] : ["ok","Règles dures OK"]);
        var html = parts.map(function(x){ return '<span class="hk ' + x[0] + '">' + x[1] + '</span>'; }).join("");
        var tl = seg.map(function(x){ return x === 0 ? "J0" : "J+" + x; }).join(" · ");
        html += '<span class="cadence">Cadence <b>' + tl + '</b></span>';
        var h = document.getElementById("ao-health"); if (h) h.innerHTML = html;
        var sp = document.getElementById("ao-savepill");
        var c = counts();
        if (sp) { if (c.total) { sp.className = "pill unsaved"; sp.textContent = c.total + " non enregistré" + (c.total>1?"s":""); } else { sp.className = "pill saved"; sp.textContent = "Enregistré"; } }
        var ab = document.getElementById("ao-add");
        var maxN = Number(CTX.max_steps || 0);
        if (ab && maxN) { ab.disabled = aliveCards().length >= maxN; }
        var an = document.getElementById("ao-addnote");
        if (an) an.textContent = (maxN && aliveCards().length >= maxN) ? ("Maximum " + maxN + " étapes (politique workspace) — marque-en une à supprimer pour en ajouter.") : "";
      }

      // ---- consolidated commit prompt -----------------------------------
      function buildFinalTable(){
        return aliveCards().map(function(card, i){
          var s = readCard(card);
          var noteEl = card.querySelector(".f-regen-note"); var note = noteEl ? String(noteEl.value || "").trim() : "";
          var ctaIntent = card.getAttribute("data-cta-intent") || "";
          var ctaDir = ctaIntent === "add"
            ? "ajoute une invitation à réserver un créneau via un lien [texte](booking), intégrée naturellement dans le corps (durée et langue réelles du lead)"
            : ctaIntent === "remove"
            ? "retire toute invitation à réserver et tout lien [..](booking), et reformule le passage concerné pour que le texte reste cohérent et naturel sans CTA"
            : "";
          var consigne = [note, ctaDir].filter(function(x){ return x; }).join(" · ");
          var flags = (s.regen ? (consigne ? " [RÉGÉNÉRER selon consigne: " + consigne + "]" : " [RÉGÉNÉRER]") : "") + (s.isNew ? " [NOUVELLE]" : "");
          var head = (i+1) + ") channel=" + (s.channel || "email") + ", role=" + (s.role || "?") + ", delay_days=" + s.delay;
          if (s.kind === "email") head += ", subject=\"" + s.subject.replace(/"/g, "'") + "\"";
          if (s.kind !== "email") {
            var li = [];
            if (s.linkedin_action) li.push("linkedin_action=" + s.linkedin_action);
            if (s.precondition) li.push("precondition=" + s.precondition);
            if (s.channel === "linkedin_invite") li.push("requires_verification=" + (s.requires_verification ? "true" : "false"));
            if (li.length) head += ", " + li.join(", ");
          }
          var line = head + flags + "\n   angle: " + s.angle;
          if (s.kind === "action") {
            line += "\n   (action LinkedIn — pas de message à rédiger)";
          } else {
            var lbl = s.kind === "message" ? "message" : "corps";
            line += "\n   " + lbl + ":\n\"\"\"\n" + s.body + "\n\"\"\"";
          }
          return line;
        }).join("\n");
      }
      function deletedSubjects(){ return cards().filter(function(c){ return c.classList.contains("del"); }).map(function(c){ return fval(c, ".f-subject"); }); }

      var TOOL = (kind === "template") ? "playbook_update" : "sequence_set";
      function commitPrompt(mode){
        var dels = deletedSubjects();
        var head = ({ save:"Enregistre les modifications de la séquence", saveval:"Enregistre les modifications PUIS valide la maquette", relaunch:"Enregistre et relance (régénère entièrement) la maquette", validate:"Valide la maquette" })[mode];
        var p = "ACTION OPÉRATEUR — " + head + " (" + pbRef + ").\n";
        if (TOOL === "sequence_set")
          p += "1) Appelle sequence_set({" + setTarget + ", steps}) avec le TABLEAU FINAL ci-dessous, dans cet ordre exact (réindexé 0..N-1" + (dels.length ? ", étapes supprimées retirées : " + dels.join(" | ") : "") + "). Renvoie le tableau COMPLET.\n";
        else
          p += "1) Appelle playbook_update avec le TABLEAU FINAL ci-dessous (réindexé 0..N-1" + (dels.length ? ", étapes supprimées retirées" : "") + ").\n";
        p += "2) Étapes marquées [RÉGÉNÉRER...]" + (mode === "relaunch" ? " ET toutes les étapes (relance complète)" : "") + " → réécris TOI-MÊME le corps des étapes marquées, selon l'angle ET la consigne entre crochets (n'appelle JAMAIS message_generate : il est neutralisé et ne persiste rien). Campagne personnalisée par IA (un bouton « Valider la maquette » est présent) : garde les corps NON marqués à l'identique (fournis ci-dessous) et RE-POUSSE le FIL COMPLET du lead via messages_push (campaign_id et lead_id du contexte ci-dessous, items avec TOUS les steps {step, subject, body}, et facts_used) — c'est messages_push qui persiste la copie. Campagne template : passe directement les corps réécrits dans sequence_set / playbook_update.\n";
        p += "3) Étapes [NOUVELLE] → rédige le contenu complet on-voice grounded sur les faits du lead : email = objet + corps (CTA via [..](booking)) ; LinkedIn message (invite/DM/commentaire) = un seul message qui respecte la limite du canal (invitation 300, DM 700, commentaire 400 caractères), sans objet ; LinkedIn action (visite/like) = aucun texte.\n";
        p += "   Pour chaque étape LinkedIn, conserve channel + linkedin_action + precondition + requires_verification tels que fournis dans le tableau.\n";
        if (mode === "saveval" || mode === "validate") {
          var cid = CTX.campaign_id || "";
          p += "4) Puis débloque et applique au reste, sans repasser la main :\n";
          p += "   a) mockup_approve({campaign_id: \"" + cid + "\"}).\n";
          p += "   b) authoring_start({campaign_id: \"" + cid + "\"}) — worklist des leads restants ; si un reference_model revient, applique-le strictement.\n";
          p += "   c) BOUCLE : pour CHAQUE lead du todo, rédige le fil complet (même typologie que la maquette validée), grounded sur ses facts, puis messages_push. Continue tant que authoring_start renvoie des todo. NE T'ARRÊTE PAS au 1er lead, ne re-rends pas de maquette, n'attends pas de nouvelle validation.\n";
          p += "   d) Confirme en une phrase métier : « Les emails sont rédigés pour les N leads de la campagne. »\n";
        } else {
          p += "4) Termine par sequence_show (+ le widget visualize) pour ré-afficher la maquette finale.\n";
        }
        p += "\nTABLEAU FINAL (" + aliveCards().length + " étapes) :\n" + buildFinalTable();
        return p;
      }

      // ---- footer (contextual) ------------------------------------------
      function renderFooter(c, errs){
        var ftxt = document.getElementById("ao-ftxt"), aw = document.getElementById("ao-actwrap"), pv = document.getElementById("ao-preview");
        var menu = document.getElementById("ao-menu"), confirm = document.getElementById("ao-confirm");
        if (menu) menu.classList.remove("open");
        if (confirm) confirm.classList.remove("open");
        var mockupActive = CTX.mockup && CTX.mockup.active && CTX.mockup.status !== "approved";
        if (c.total) {
          if (pv) pv.style.display = "";
          if (ftxt) ftxt.innerHTML = "<b>" + c.total + " changement" + (c.total>1?"s":"") + "</b> non enregistré" + (c.total>1?"s":"") + (errs ? (' · <span class="t-err">' + errs + " à corriger avant validation</span>") : "");
          var split = '<div class="split"><button class="primary" id="ao-save">Enregistrer les modifications (' + c.total + ')</button>';
          if (mockupActive || kind === "campaign" || kind === "variant" || kind === "template") split += '<button class="more" id="ao-more" aria-haspopup="true" aria-label="Plus d\'actions">⌄</button>';
          split += "</div>";
          if (aw) aw.innerHTML = split;
          var sb = document.getElementById("ao-save"); if (sb) sb.onclick = function(){ send(commitPrompt("save")); flash(this); };
          var mb = document.getElementById("ao-more"); if (mb) mb.onclick = function(){ menu.classList.toggle("open"); };
          var sv = document.getElementById("ao-m-saveval"); if (sv) sv.disabled = !mockupActive || errs > 0;
        } else {
          if (pv) pv.style.display = "none";
          if (CTX.mockup && CTX.mockup.status === "approved") {
            if (ftxt) ftxt.innerHTML = '<span class="t-ok">Maquette validée</span> — l\'envoi du lot est débloqué.';
            if (aw) aw.innerHTML = '<button class="ghost" id="ao-msave">Enregistrer comme modèle réutilisable</button>';
            var msv = document.getElementById("ao-msave"); if (msv) msv.onclick = function(){ modelSave(this); };
          } else if (mockupActive) {
            if (ftxt) ftxt.innerHTML = errs ? ('<span class="t-err">' + errs + " règle" + (errs>1?"s":"") + " à corriger avant de pouvoir valider.</span>") : "Maquette à jour — prête à être appliquée au reste de la campagne.";
            if (aw) aw.innerHTML = '<button class="primary" id="ao-validate"' + (errs ? " disabled" : "") + ">Valider la maquette et appliquer au reste</button>";
            var vb = document.getElementById("ao-validate"); if (vb && !errs) vb.onclick = function(){ confirm.classList.add("open"); };
          } else {
            if (ftxt) ftxt.innerHTML = errs ? ('<span class="t-err">' + errs + " règle" + (errs>1?"s":"") + " à corriger.</span>") : '<span class="t-ok">Tout est enregistré.</span>';
            if (aw) aw.innerHTML = "";
          }
        }
      }
      function modelSave(btn){
        var cid = CTX.campaign_id || "";
        var p = "ACTION OPÉRATEUR : enregistre les mails VALIDÉS de cette campagne (campaign_id " + cid + ") comme MODÈLE authored réutilisable. Propose un nom court et parlant (basé sur l'angle/persona), puis appelle authored_model_save({campaign_id: \"" + cid + "\", name: <ce nom>}). Confirme en une phrase qu'il pourra être réutilisé via authoring_start({campaign_id, base_model_id}).";
        send(p); flash(btn);
      }

      // ---- change preview (diff) ----------------------------------------
      function lcs(a, c){
        var n=a.length, m=c.length, dp=[]; for (var i=0;i<=n;i++){ dp[i]=[]; for (var j=0;j<=m;j++) dp[i][j]=0; }
        for (i=n-1;i>=0;i--) for (j=m-1;j>=0;j--) dp[i][j] = a[i]===c[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
        var out=[]; i=0; j=0;
        while (i<n && j<m){ if (a[i]===c[j]){ out.push(["same",a[i]]); i++; j++; } else if (dp[i+1][j]>=dp[i][j+1]){ out.push(["del",a[i]]); i++; } else { out.push(["add",c[j]]); j++; } }
        while (i<n){ out.push(["del",a[i++]]); } while (j<m){ out.push(["add",c[j++]]); } return out;
      }
      function esc2(t){ return String(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
      function buildDiff(){
        var h = "", n = 0;
        cards().forEach(function(card, idx){
          var isNew = card.classList.contains("newc"), del = card.classList.contains("del"), regen = card.classList.contains("regen");
          if (!isNew && !del && !regen && !changed(card)) return;
          n++;
          var b = card._base, s = readCard(card), tag = "";
          if (del) tag = '<span class="badge bdel">à supprimer</span>';
          else if (isNew) tag = '<span class="badge bnew">nouvelle</span>';
          else if (changed(card)) tag = '<span class="badge bmod">modifié</span>';
          if (regen && !del) tag += ' <span class="badge breg">régén.</span>';
          h += '<div class="di"><div class="dh">Étape ' + (idx+1) + ' · ' + (s.role||"?") + ' ' + tag + '</div>';
          if (isNew) h += '<div class="dch">Nouvelle étape — objet : ' + (esc2(s.subject)||"(vide)") + '</div>';
          else if (del) h += '<div class="dch"><span class="o">' + esc2(s.subject) + '</span></div>';
          else if (b) {
            if (s.subject !== b.subject) h += '<div class="dch">Objet : <span class="o">' + esc2(b.subject) + '</span> → <span class="nw">' + esc2(s.subject) + '</span></div>';
            if (String(s.delay) !== b.delay) h += '<div class="dch">Délai : <span class="o">' + b.delay + ' j</span> → <span class="nw">' + s.delay + ' j</span></div>';
            if (s.role !== b.role) h += '<div class="dch">Rôle : <span class="o">' + b.role + '</span> → <span class="nw">' + s.role + '</span></div>';
            if (s.angle !== b.angle) h += '<div class="dch">Angle modifié</div>';
            var ci = card.getAttribute("data-cta-intent");
            if (ci) h += '<div class="dch">CTA de réservation : <span class="nw">' + (ci === "add" ? "à ajouter (réécriture IA)" : "à retirer (réécriture IA)") + '</span></div>';
            if (s.body !== b.body) {
              h += '<div class="dch">Corps' + (regen ? " (sera régénéré par IA)" : "") + ' :</div>';
              lcs(b.body.split("\n"), s.body.split("\n")).forEach(function(p){ if (p[0]==="same") return; h += '<div class="dl ' + p[0] + '">' + (p[0]==="add"?"+ ":"- ") + esc2(p[1]||"·") + '</div>'; });
            }
          }
          h += "</div>";
        });
        return h || '<div class="di">Aucun changement.</div>';
      }

      // ---- new-step injection (clone an existing card) ------------------
      function makeNewCard(){
        var model = cards().find(function(c){ return c.getAttribute("data-locked") !== "1"; }) || cards()[0];
        var nc = model.cloneNode(true);
        nc.classList.remove("dirty","del","regen"); nc.classList.add("newc","open");
        nc.setAttribute("data-locked","0"); nc._base = null;
        nc.removeAttribute("data-cta-intent");
        var del = nc.querySelector(".f-del"); if (del){ del.checked = false; del.disabled = false; }
        var rb = nc.querySelector(".btn-regen"); if (rb) rb.setAttribute("aria-pressed","false");
        var rs = nc.querySelector(".f-role"); if (rs){ rs.disabled = false; rs.value = "value"; }
        var dl = nc.querySelector(".f-delay"); if (dl) dl.value = "3";
        var su = nc.querySelector(".f-subject"); if (su) su.value = "";
        var an = nc.querySelector(".f-angle"); if (an) an.value = "Nouvelle étape — décris ici l'angle (hook, preuve, CTA)…";
        var bo = nc.querySelector(".f-body"); if (bo) bo.value = "";
        var aw = nc.querySelector(".angwrap"); if (aw) aw.classList.add("open");
        var at = nc.querySelector(".angtog"); if (at) at.setAttribute("aria-expanded","true");
        return nc;
      }
      function canAdd(){ var maxN = Number(CTX.max_steps || 0); return !maxN || aliveCards().length < maxN; }
      function insertBefore(refCard){
        if (!canAdd()) return; var nc = makeNewCard(); cardsWrap.insertBefore(nc, refCard); recompute();
      }
      function addStep(){
        if (!canAdd()) return; var nc = makeNewCard();
        var lockedLast = cards().filter(function(c){ return c.getAttribute("data-locked") === "1"; })[0];
        if (lockedLast) cardsWrap.insertBefore(nc, lockedLast); else cardsWrap.appendChild(nc);
        recompute();
      }

      // ---- reorder -------------------------------------------------------
      function move(card, dir){
        var list = cards(), i = list.indexOf(card), t = i + dir, other = list[t];
        if (!other) return;
        if (card.getAttribute("data-locked") === "1" || other.getAttribute("data-locked") === "1") return;
        if (dir < 0) cardsWrap.insertBefore(card, other);
        else cardsWrap.insertBefore(other, card);
        recompute();
      }

      // ---- delegated events ---------------------------------------------
      cardsWrap.addEventListener("input", function(e){
        if (e.target.matches(".f-subject,.f-angle,.f-body,.f-delay")) {
          if (e.target.matches(".f-body,.f-angle")) { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }
          recompute();
        }
      });
      cardsWrap.addEventListener("change", function(e){
        if (e.target.matches(".f-role")) recompute();
        else if (e.target.matches(".f-cta")) {
          // Intent-only: ne touche jamais au texte. Coche/décoche = consigne pour
          // la réécriture IA (ajoute/retire le CTA naturellement, dans la bonne
          // langue et avec la vraie durée), pour ne pas casser la phrase ni figer
          // une langue/durée en dur.
          var card = e.target.closest(".card"); var bo = card.querySelector(".f-body"); if (!bo) return;
          var has = bo.value.indexOf("](booking)") >= 0;
          var want = !!e.target.checked;
          if (want === has) { card.removeAttribute("data-cta-intent"); }
          else {
            card.setAttribute("data-cta-intent", want ? "add" : "remove");
            if (!card.classList.contains("regen")) {
              card.classList.add("regen");
              var rb = card.querySelector(".btn-regen"); if (rb) rb.setAttribute("aria-pressed", "true");
              var rn = card.querySelector(".regen-note"); if (rn) rn.style.display = "block";
            }
          }
          recompute();
        }
        else if (e.target.matches(".f-del")) {
          var card = e.target.closest(".card");
          if (card.classList.contains("newc")) { card.parentNode.removeChild(card); recompute(); return; }
          card.classList.toggle("del", e.target.checked); recompute();
        }
      });
      cardsWrap.addEventListener("click", function(e){
        var card = e.target.closest(".card"); if (!card) return;
        if (e.target.closest(".sum") && !e.target.closest(".ord") && !e.target.matches("input,select,textarea")) {
          var open = card.classList.toggle("open"); var s = card.querySelector(".sum"); if (s) s.setAttribute("aria-expanded", open); return;
        }
        if (e.target.matches(".mv-up")) { move(card, -1); return; }
        if (e.target.matches(".mv-dn")) { move(card, 1); return; }
        if (e.target.matches(".btn-regen")) { var on = card.classList.toggle("regen"); e.target.setAttribute("aria-pressed", on); var rn = card.querySelector(".regen-note"); if (rn) rn.style.display = on ? "block" : "none"; if (!on) card.removeAttribute("data-cta-intent"); recompute(); return; }
        if (e.target.matches(".btn-insert")) { insertBefore(card); return; }
        if (e.target.matches(".btn-revert")) {
          var b = card._base; if (!b) return;
          var rs = card.querySelector(".f-role"); if (rs) rs.value = b.role;
          var dl = card.querySelector(".f-delay"); if (dl) dl.value = b.delay;
          var su = card.querySelector(".f-subject"); if (su) su.value = b.subject;
          var an = card.querySelector(".f-angle"); if (an) an.value = b.angle;
          var bo2 = card.querySelector(".f-body"); if (bo2) bo2.value = b.body;
          card.classList.remove("regen","del"); var d = card.querySelector(".f-del"); if (d) d.checked = false;
          card.removeAttribute("data-cta-intent");
          var rb = card.querySelector(".btn-regen"); if (rb) rb.setAttribute("aria-pressed","false");
          var rn2 = card.querySelector(".regen-note"); if (rn2) { rn2.style.display = "none"; var ri = rn2.querySelector(".f-regen-note"); if (ri) ri.value = ""; }
          recompute(); return;
        }
        if (e.target.matches(".sum .chev")) { var open2 = card.classList.toggle("open"); card.querySelector(".sum").setAttribute("aria-expanded", open2); return; }
      });
      cardsWrap.addEventListener("keydown", function(e){
        if ((e.key === "Enter" || e.key === " ") && e.target.matches(".sum")) { e.preventDefault(); var card = e.target.closest(".card"); var open = card.classList.toggle("open"); e.target.setAttribute("aria-expanded", open); }
      });

      // footer / global controls
      var addBtn = document.getElementById("ao-add"); if (addBtn) addBtn.onclick = addStep;
      var prevBtn = document.getElementById("ao-preview");
      if (prevBtn) prevBtn.onclick = function(){ var d = document.getElementById("ao-diff"); document.getElementById("ao-difflist").innerHTML = buildDiff(); d.classList.toggle("open"); };
      var mSaveval = document.getElementById("ao-m-saveval"); if (mSaveval) mSaveval.onclick = function(){ if (this.disabled) return; send(commitPrompt("saveval")); flash(this); };
      var mRelaunch = document.getElementById("ao-m-relaunch"); if (mRelaunch) mRelaunch.onclick = function(){ send(commitPrompt("relaunch")); flash(this); };
      var mCancel = document.getElementById("ao-m-cancel"); if (mCancel) mCancel.onclick = function(){ send("Annule mes modifications non enregistrées sur " + pbRef + " et ré-affiche la dernière version enregistrée via sequence_show."); };
      var cBack = document.getElementById("ao-c-back"); if (cBack) cBack.onclick = function(){ document.getElementById("ao-confirm").classList.remove("open"); };
      var cGo = document.getElementById("ao-c-go"); if (cGo) cGo.onclick = function(){ send(commitPrompt("validate")); flash(this); };

      // policy header (unchanged verbs: campaign_policy_set)
      var stepSel = document.getElementById("ao-step-count");
      if (stepSel) stepSel.addEventListener("change", function(){
        var n = stepSel.value;
        if (policyScope) send("Change le nombre d'étapes de " + pbRef + " à " + n + ".\n1) campaign_policy_set({campaign_id=" + (CTX.campaign_id||"") + ", target_steps=" + n + "}).\n2) Reconstruis la séquence (sequence_set) en gardant au mieux la copie, dernière = adieu si la règle est active.\n3) Re-render sequence_show.");
        else send("Reconstruis " + pbRef + " avec " + n + " étapes role-taggées (dernière = adieu si actif), en préservant la copie, puis re-render sequence_show.");
      });
      var chanSel = document.getElementById("ao-channel-mode");
      if (chanSel) chanSel.addEventListener("change", function(){
        var v = chanSel.value;
        // LinkedIn/Mixte only switchable when the workspace flag is on.
        if (!CTX.linkedin_enabled && v !== "email") { chanSel.value = "email"; return; }
        if (policyScope) send("Passe le mode canal de " + pbRef + " sur « " + v + " ».\n1) campaign_policy_set({campaign_id=" + (CTX.campaign_id||"") + ", channel_mode=" + v + "}).\n2) Reconstruis la séquence adaptée à ce canal (sequence_set) — pour LinkedIn/mixte, utilise les canaux linkedin_visit/linkedin_invite/linkedin_dm/linkedin_comment avec leurs préconditions, dernière = adieu si la règle est active.\n3) Re-render sequence_show.");
        else send("Passe " + pbRef + " en mode canal « " + v + " » et reconstruis la séquence adaptée à ce canal, puis re-render sequence_show.");
      });
      var presetSel = document.getElementById("ao-preset");
      if (presetSel) presetSel.addEventListener("change", function(){
        var k = presetSel.value; if (!k) return;
        var label = presetSel.options[presetSel.selectedIndex] ? presetSel.options[presetSel.selectedIndex].text : k;
        send("Applique le preset de séquence « " + label + " » (key=" + k + ") à " + pbRef + ".\n1) " + (policyScope ? "campaign_policy_set({campaign_id=" + (CTX.campaign_id||"") + "}) pour aligner le mode canal sur le preset, puis " : "") + "reconstruis les étapes selon ce preset (canaux, ordre, préconditions, barrières) via sequence_set.\n2) Re-render sequence_show.");
        presetSel.value = "";
      });
      var inheritBtn = document.getElementById("ao-reinherit");
      if (inheritBtn) inheritBtn.onclick = function(){ send("Ré-hérite la politique du workspace pour " + pbRef + " : campaign_policy_set({campaign_id=" + (CTX.campaign_id||"") + ", reset:true}), puis re-render sequence_show."); flash(inheritBtn); };
      var undoBtn = document.getElementById("ao-undo-adjust");
      if (undoBtn) undoBtn.onclick = function(){ send("Annule les ajustements de conformité appliqués à " + pbRef + " : restaure mes étapes telles que saisies. Si la politique l'impose encore, explique le conflit au lieu de réappliquer silencieusement."); flash(undoBtn); };

      document.addEventListener("keydown", function(e){ if (e.key === "Escape") { var m = document.getElementById("ao-menu"); if (m) m.classList.remove("open"); var c = document.getElementById("ao-confirm"); if (c) c.classList.remove("open"); } });

      // init: accordion (collapse all but first), then first paint
      cards().forEach(function(card, i){ card.classList.toggle("open", i === 0); var s = card.querySelector(".sum"); if (s) s.setAttribute("aria-expanded", i === 0); });
      function autosizeAll(){ root.querySelectorAll("textarea.gen-body,textarea.f-angle").forEach(function(el){ el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }); }
      recompute(); autosizeAll();
      window.addEventListener("load", autosizeAll); window.addEventListener("resize", autosizeAll); setTimeout(autosizeAll, 50);
    })();
