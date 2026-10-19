(() => {
  "use strict";
  const C = window.SoloPlannerCore, esc = window.NovaEditor.escapeHtml;
  const app = () => window.NovaApp;
  const uid = () => typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const mode = () => app().state.settings.lifeMode === "pro" ? "pro" : "personal";
  const scope = () => app().state.settings.agendaAll ? "all" : mode();
  const today = () => C.dayKey(Date.now());
  const dateLabel = key => C.dateOf(key).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const clock = ts => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const repeatNames = { none: "Une fois", daily: "Chaque jour", weekdays: "Du lundi au vendredi", weekly: "Chaque semaine", monthly: "Chaque mois" };
  const fontNames = { sans: "Claire", serif: "Littéraire", mono: "Machine à écrire", rounded: "Douce" };
  let selected = today(), month = selected.slice(0, 7), activeSection = "home", workerRegistration, lastVisibleDay = today();

  function commit(change) {
    const before = structuredClone(app().state);
    try { change(); app().save(); return true; }
    catch { Object.keys(app().state).forEach(key => delete app().state[key]); Object.assign(app().state, before); return false; }
  }
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function banner(message, action) {
    let node = document.getElementById("soloPersistentNotice");
    if (!node) { node = document.createElement("aside"); node.id = "soloPersistentNotice"; node.setAttribute("role", "alert"); document.body.append(node); }
    node.replaceChildren(); const text = document.createElement("span"); text.textContent = message; node.append(text);
    if (action) { const button = document.createElement("button"); button.className = "secondary"; button.textContent = action.label; button.onclick = action.run; node.append(button); }
  }
  const entryButton = (task, day, label, action, css = "secondary") => `<button class="${css}" data-entry="${esc(task.id)}" data-day="${day}" data-action="${action}">${label}</button>`;
  function itemRow(entry) {
    const { task, day, status, at } = entry, appointment = task.kind === "appointment";
    const label = appointment ? "Rendez-vous" : Number(task.importance) === 3 ? "Essentiel" : Number(task.importance) === 1 ? "Facultatif" : "À faire";
    const departure = at - ((Number(task.travelMinutes) || 0) + (Number(task.arrivalBuffer) || 0)) * 60000;
    return `<article class="agenda-item ${status} ${appointment ? "appointment" : ""}">
      <button class="agenda-check" data-entry="${esc(task.id)}" data-day="${day}" data-action="toggle" aria-label="${status === "done" ? "Rouvrir" : appointment ? "Marquer comme honoré" : "Terminer"} : ${esc(task.title)}" aria-pressed="${status === "done"}">${status === "done" ? "✓" : status === "skipped" ? "↷" : ""}</button>
      <button class="agenda-copy" data-entry="${esc(task.id)}" data-action="edit"><strong>${esc(task.title)}</strong><small>${task.planTime ? `${esc(task.planTime)} · ` : ""}${label}${task.repeat && task.repeat !== "none" ? " · ↻" : ""}${status === "skipped" ? " · Passée pour cette fois" : ""}${(task.lifeMode || "personal") === "pro" ? " · Pro" : ""}</small>${appointment && task.location ? `<span>${esc(task.location)}${Number(task.travelMinutes) ? ` · Départ ${clock(departure)} (durée estimée manuellement)` : ""}</span>` : ""}</button>
      <div class="agenda-item-actions">${status === "open" && C.canSkip(task) ? entryButton(task, day, "Passer", "skip", "text-btn") : ""}${status === "skipped" ? entryButton(task, day, "Rétablir", "restore", "text-btn") : ""}${appointment && task.location ? `<a class="secondary" href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(task.location)}" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir l’itinéraire dans Google Maps (adresse transmise)">Itinéraire ↗</a>` : ""}</div>
    </article>`;
  }
  function header(title, subtitle) {
    return `<header class="daily-heading"><div><span class="eyebrow">SŌLO · ${mode() === "pro" ? "ESPACE PRO" : "TON QUOTIDIEN"}</span><h1>${title}</h1><p>${subtitle}</p></div><div class="daily-header-actions"><div class="life-switch" role="group" aria-label="Ambiance"><button data-mode="personal" class="${mode() === "personal" ? "active" : ""}" aria-pressed="${mode() === "personal"}">Perso</button><button data-mode="pro" class="${mode() === "pro" ? "active" : ""}" aria-pressed="${mode() === "pro"}">Pro</button></div><button class="primary" data-new="task">＋ Ajouter</button></div></header><div class="agenda-tools"><label><input type="checkbox" id="agendaAll" ${scope() === "all" ? "checked" : ""}> Voir Pro et Perso ensemble</label><button class="text-btn" data-route="tasks">Tous les objectifs →</button><button class="text-btn" data-reminder-settings>Rappels & confidentialité</button></div>`;
  }
  function home(root) {
    const entries = C.forDay(app().state.tasks, today(), scope()), open = entries.filter(e => e.status === "open");
    const appointments = open.filter(e => e.task.kind === "appointment"), essential = open.filter(e => e.task.kind !== "appointment" && Number(e.task.importance) === 3), flexible = open.filter(e => e.task.kind !== "appointment" && Number(e.task.importance) !== 3);
    const finished = entries.filter(e => e.status !== "open"), done = finished.filter(e => e.status === "done").length;
    const overdue = app().state.tasks.filter(task => (!task.repeat || task.repeat === "none") && task.state === "inprogress" && C.anchor(task) && C.anchor(task) < today() && C.status(task, C.anchor(task)) === "open" && (scope() === "all" || (task.lifeMode || "personal") === scope()));
    const next = appointments.find(e => e.at >= Date.now()), focus = next || essential[0] || flexible[0];
    const name = app().state.profile.name ? `, ${esc(app().state.profile.name)}` : "";
    const group = (title, list, hint = "") => `<section class="day-group"><div class="day-group-heading"><h2>${title} <span>${list.length}</span></h2>${hint ? `<p>${hint}</p>` : ""}</div>${list.length ? list.map(itemRow).join("") : '<p class="agenda-empty">Rien à prévoir ici.</p>'}</section>`;
    root.innerHTML = `<div class="daily-page">${header(`Bonjour${name}.`, dateLabel(today()))}
      <div class="daily-layout"><div class="daily-main">
      <article class="daily-focus"><span class="eyebrow">${next ? "TON PROCHAIN RENDEZ-VOUS" : "UN PAS À LA FOIS"}</span><h2>${focus ? esc(focus.task.title) : "Un peu de place pour toi."}</h2><p>${next ? `${clock(next.at)}${next.task.location ? ` · ${esc(next.task.location)}` : ""}` : essential.length ? `${essential.length} essentiel${essential.length > 1 ? "s" : ""} à garder en vue. Le facultatif peut attendre.` : mode() === "pro" ? "Ton planning est à jour. Ajoute un engagement ou consulte le calendrier." : "Tout n’a pas besoin d’être fait aujourd’hui. Choisis ce qui te fera avancer."}</p>${focus ? entryButton(focus.task, focus.day, "Ouvrir →", "edit", "primary") : '<button class="primary" data-new="task">Préparer ma journée</button>'}</article>
      ${group("À heure fixe", appointments)}${group("Ce qui compte aujourd’hui", essential)}${group("À ton rythme", flexible, mode() === "personal" ? "Tu peux passer une petite mission flexible ou facultative, sans la compter comme accomplie." : "Tâches à placer entre tes engagements.")}
      ${overdue.length ? group("À replanifier", overdue.slice(0, 12).map(task => ({ task, day: C.anchor(task), status: "open", at: C.timestamp(task, C.anchor(task)) })), "Une date dépassée reste visible. Ouvre la tâche pour choisir une nouvelle date.") : ""}
      ${finished.length ? `<details class="finished-list"><summary>Fait ou passé aujourd’hui (${finished.length})</summary>${finished.map(itemRow).join("")}</details>` : ""}
      </div><aside class="daily-aside">
      <article class="panel daily-progress"><span class="eyebrow">${mode() === "personal" ? "CHAQUE PAS COMPTE" : "AVANCEMENT DU JOUR"}</span><strong>${done}<small> / ${entries.length}</small></strong><p>${done ? `${done} engagement${done > 1 ? "s" : ""} tenu${done > 1 ? "s" : ""}. ${mode() === "personal" ? "C’est du progrès, même si tout n’est pas coché." : ""}` : "Les missions passées ne comptent pas comme des réussites."}</p><div class="daily-progress-track"><i style="width:${entries.length ? done / entries.length * 100 : 0}%"></i></div></article>
      <article class="panel aside-calendar"><span class="eyebrow">PRENDRE DU RECUL</span><h2>Une journée dans le mois.</h2><p>Retrouve tes rendez-vous, tes routines et les dates à garder en tête.</p><button class="secondary full" data-route="calendar">Ouvrir le calendrier →</button></article>
      <article class="panel"><span class="eyebrow">SOUS LA MAIN</span><h2>Idées & moments partagés</h2><div class="note-shortcuts"><button data-template="films">🎬 Films à voir</button><button data-template="tasting">★ Dégustations & classements</button><button data-template="poem">✎ Poème ou texte libre</button></div><button class="text-btn" data-route="shared">Retrouver mes espaces partagés →</button></article>
      </aside></div></div>`;
    bind(root);
  }
  function calendar(root) {
    const start = C.dateOf(`${month}-01`), first = C.addDays(C.dayKey(start), -((start.getDay() + 6) % 7));
    const entries = C.forDay(app().state.tasks, selected, scope());
    const monthTitle = start.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    root.innerHTML = `<div class="daily-page">${header("Ton calendrier", mode() === "pro" ? "Les engagements au bon endroit, le temps libre bien visible." : "Un mois lisible. Des journées à ta mesure.")}
      <div class="calendar-layout"><section class="month-panel panel"><div class="month-toolbar"><h2>${monthTitle}</h2><div><button class="secondary" data-month="-1" aria-label="Mois précédent">‹</button><button class="secondary" data-month="today">Aujourd’hui</button><button class="secondary" data-month="1" aria-label="Mois suivant">›</button></div></div><div class="month-weekdays" aria-hidden="true">${["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d => `<span>${d}</span>`).join("")}</div>
      <div class="month-grid" role="group" aria-label="${monthTitle}">${Array.from({ length: 42 }, (_, i) => {
        const day = C.addDays(first, i), list = C.forDay(app().state.tasks, day, scope());
        return `<button class="month-day ${day.slice(0, 7) !== month ? "outside" : ""} ${day === today() ? "today" : ""} ${day === selected ? "selected" : ""}" data-calendar-day="${day}" aria-pressed="${day === selected}" ${day === today() ? 'aria-current="date"' : ""} aria-label="${dateLabel(day)}, ${list.length} éléments"><span class="day-number">${Number(day.slice(-2))}</span><span class="day-events">${list.slice(0, 2).map(e => `<span class="day-event ${e.task.kind === "appointment" ? "fixed" : ""} ${e.status}">${esc(e.task.planTime || "")}${e.task.planTime ? " " : ""}${esc(e.task.title)}</span>`).join("")}${list.length > 2 ? `<small>+ ${list.length - 2}</small>` : ""}</span>${list.length ? `<span class="day-dots" aria-hidden="true">${list.slice(0, 4).map(e => `<i class="${e.task.kind === "appointment" ? "fixed" : ""}"></i>`).join("")}</span>` : ""}</button>`;
      }).join("")}</div><p class="calendar-legend"><span>● Rendez-vous</span> <span>● Mission</span> · Clique sur un jour pour l’organiser.</p></section>
      <aside class="selected-day panel"><span class="eyebrow">LE JOUR EN DÉTAIL</span><h2>${dateLabel(selected)}</h2><button class="primary full" data-new="task">＋ Mission</button><button class="secondary full" data-new="appointment">＋ Rendez-vous</button><div class="selected-day-list">${entries.length ? entries.map(itemRow).join("") : '<p class="agenda-empty">De la place pour ce qui compte.</p>'}</div><button class="text-btn" data-export-calendar>Exporter mon agenda (.ics)</button><p class="agenda-footnote">Copie des 12 prochains mois à importer dans Calendrier Apple ou Outlook. Ce fichier ne se met pas à jour automatiquement.</p></aside></div></div>`;
    bind(root);
  }
  function bind(root) {
    root.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { if (commit(() => { app().state.settings.lifeMode = b.dataset.mode; })) app().refresh(); });
    root.querySelector("#agendaAll").onchange = e => { if (commit(() => { app().state.settings.agendaAll = e.target.checked; })) app().refresh(); };
    root.querySelectorAll("[data-route]").forEach(b => b.onclick = () => app().navigate(b.dataset.route));
    root.querySelectorAll("[data-new]").forEach(b => b.onclick = () => openItem(null, { kind: b.dataset.new, planDate: activeSection === "calendar" ? selected : today() }));
    root.querySelectorAll("[data-entry]").forEach(b => b.onclick = () => {
      const task = app().state.tasks.find(t => t.id === b.dataset.entry); if (!task) return;
      if (b.dataset.action === "edit") return openItem(task.id);
      const day = b.dataset.day;
      const next = b.dataset.action === "skip" ? "skipped" : b.dataset.action === "restore" || C.status(task, day) === "done" ? "open" : "done";
      if (day > today() && next === "done") return app().toast("Cette mission est prévue plus tard. Tu pourras la cocher le jour venu.");
      if (commit(() => C.mark(task, day, next))) { app().refresh(); app().toast(next === "done" ? task.kind === "appointment" ? "Rendez-vous honoré" : "Un pas de plus. Bien joué." : next === "skipped" ? "Passée pour cette fois. Les essentiels restent en vue." : "Mission rétablie"); }
    });
    root.querySelectorAll("[data-calendar-day]").forEach(b => b.onclick = () => { selected = b.dataset.calendarDay; calendar(root); });
    root.querySelectorAll("[data-month]").forEach(b => b.onclick = () => { if (b.dataset.month === "today") { selected = today(); month = selected.slice(0, 7); } else { const d = C.dateOf(`${month}-01`); d.setMonth(d.getMonth() + Number(b.dataset.month)); month = C.dayKey(d).slice(0, 7); selected = `${month}-01`; } calendar(root); });
    root.querySelectorAll("[data-template]").forEach(b => b.onclick = () => createTemplate(b.dataset.template));
    root.querySelector("[data-reminder-settings]").onclick = reminderSettings;
    root.querySelector("[data-export-calendar]")?.addEventListener("click", () => download(C.calendarICS(app().state.tasks.filter(t => scope() === "all" || (t.lifeMode || "personal") === scope())), "solo-agenda.ics", "text/calendar;charset=utf-8"));
  }
  function openItem(id, defaults = {}) {
    const existing = app().state.tasks.find(t => t.id === id), draft = structuredClone(existing || { id: uid(), title: "", description: "", importance: 2, state: "inprogress", steps: [], tags: [], createdAt: Date.now(), kind: "task", lifeMode: mode(), planDate: today(), repeat: "none", remindBefore: 15, durationMinutes: 30, ...defaults });
    const dialog = document.getElementById("taskDialog"), date = C.anchor(draft), value = (key, fallback = "") => esc(String(draft[key] ?? fallback));
    dialog.innerHTML = `<form class="modal-content agenda-form"><header class="modal-head"><div><span class="eyebrow">${existing ? "AJUSTER" : "FAIRE DE LA PLACE"}</span><h2>${existing ? "Modifier cet engagement" : "Qu’est-ce que tu prévois ?"}</h2></div><button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button></header>
      <div class="form-stack"><label>Titre<input name="title" required maxlength="120" value="${value("title")}" placeholder="Ex. Dentiste, lire 15 minutes…"></label><div class="form-two"><label>Type<select name="kind"><option value="task" ${draft.kind !== "appointment" ? "selected" : ""}>Mission / objectif</option><option value="appointment" ${draft.kind === "appointment" ? "selected" : ""}>Rendez-vous à heure fixe</option></select></label><label>Espace<select name="lifeMode"><option value="personal" ${draft.lifeMode !== "pro" ? "selected" : ""}>Perso</option><option value="pro" ${draft.lifeMode === "pro" ? "selected" : ""}>Pro</option></select></label></div>
      <div class="form-two"><label>Date<input type="date" name="planDate" value="${esc(date)}"></label><label>Heure <small>facultative pour une mission</small><input type="time" name="planTime" value="${value("planTime")}"></label></div>
      <div class="mission-fields"><div class="form-two"><label>Importance<select name="importance">${[[1,"Facultatif — je peux passer"],[2,"Normal — je m’organise"],[3,"Essentiel — à garder en vue"]].map(([n,l]) => `<option value="${n}" ${Number(draft.importance) === n ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>Effort<select name="effort"><option value="normal">Standard</option><option value="quick" ${draft.effort === "quick" ? "selected" : ""}>Petit pas (5–15 min)</option></select></label></div></div>
      <div class="appointment-fields"><label>Adresse <small>transmise à Maps seulement si tu ouvres l’itinéraire</small><input name="location" maxlength="300" value="${value("location")}" autocomplete="off" placeholder="Adresse du rendez-vous"></label><div class="form-two"><label>Durée du rendez-vous (min)<input type="number" min="5" max="1440" name="durationMinutes" value="${value("durationMinutes",30)}"></label><label>Trajet estimé par toi (min)<input type="number" min="0" max="1440" name="travelMinutes" value="${value("travelMinutes",0)}"></label></div><label>Marge d’arrivée (min)<input type="number" min="0" max="120" name="arrivalBuffer" value="${value("arrivalBuffer",5)}"></label></div>
      <div class="form-two"><label>Répéter<select name="repeat">${Object.entries(repeatNames).map(([k,l]) => `<option value="${k}" ${(draft.repeat || "none") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>Rappel avant l’heure / le départ<select name="remindBefore">${[[-1,"Aucun"],[0,"À l’heure"],[5,"5 minutes"],[15,"15 minutes"],[30,"30 minutes"],[60,"1 heure"],[1440,"La veille"]].map(([n,l]) => `<option value="${n}" ${Number(draft.remindBefore ?? 15) === n ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <details><summary>Contexte, répétition, étapes et étiquettes</summary><div class="form-stack"><label>Description<textarea name="description" rows="3" maxlength="1200">${esc(draft.description || "")}</textarea></label><div class="form-two"><label>Tous les N jours <small>si « Chaque jour »</small><input name="repeatEvery" type="number" min="1" max="365" value="${value("repeatEvery",1)}"></label><label>Fin de répétition <small>facultative</small><input name="repeatUntil" type="date" value="${value("repeatUntil")}"></label></div><div class="planner-steps">${(draft.steps || []).map((step,i) => `<label class="planner-step"><input type="checkbox" data-step-check="${i}" ${step.completed ? "checked" : ""}><input data-step-title="${i}" value="${esc(step.title)}" maxlength="120" aria-label="Étape ${i+1}"></label>`).join("")}</div><label>Ajouter des étapes <small>une par ligne</small><textarea name="newSteps" rows="2" placeholder="Une petite action…"></textarea></label><div class="tag-editor"><strong>Étiquettes</strong><div class="tag-checks">${app().state.tags.length ? app().state.tags.map(tag => `<label><input type="checkbox" value="${esc(tag.id)}" ${draft.tags.includes(tag.id) ? "checked" : ""}><i style="--tag:${/^#[0-9a-f]{3,8}$/i.test(tag.color || "") ? tag.color : "#36bdb8"}"></i>${esc(tag.name)}</label>`).join("") : '<p>Aucune étiquette pour l’instant.</p>'}</div><button type="button" class="text-btn" data-open-tags>Gérer mes étiquettes →</button></div></div></details><p class="agenda-footnote">Rappels dans Sōlo quand l’app est ouverte. Pour les alertes hors de Sōlo, exporte l’agenda vers Calendrier Apple. Les notifications push ne sont pas encore raccordées.</p></div>
      <p class="agenda-form-error" role="alert"></p><footer class="modal-actions">${existing ? '<button type="button" class="text-btn danger" data-delete>Supprimer</button>' : ""}<button type="button" class="secondary" data-close>Annuler</button><button type="submit" class="primary">${existing ? "Enregistrer" : "Ajouter à mon agenda"}</button></footer></form>`;
    const form = dialog.querySelector("form"), kind = form.elements.kind, error = form.querySelector(".agenda-form-error");
    const updateKind = () => { const fixed = kind.value === "appointment"; form.querySelector(".mission-fields").hidden = fixed; form.querySelector(".appointment-fields").hidden = !fixed; form.elements.planDate.required = fixed || form.elements.repeat.value !== "none"; form.elements.planTime.required = fixed; form.elements.planTime.closest("label").querySelector("small").textContent = fixed ? "Heure de début obligatoire" : "facultative pour une mission"; };
    kind.onchange = updateKind; form.elements.repeat.onchange = updateKind; updateKind();
    dialog.querySelectorAll("[data-close]").forEach(b => b.onclick = () => dialog.close());
    dialog.querySelector("[data-delete]")?.addEventListener("click", () => { if (!confirm("Supprimer cet engagement et, s’il se répète, toute sa série ?")) return; if (commit(() => { app().state.tasks = app().state.tasks.filter(t => t.id !== id); })) { dialog.close(); app().refresh(); } });
    dialog.querySelector("[data-open-tags]")?.addEventListener("click", () => app().openTags());
    form.onsubmit = e => {
      e.preventDefault(); const data = new FormData(form), get = k => String(data.get(k) || "").trim(), repeat = get("repeat"), planDate = get("planDate"), planTime = get("planTime");
      if (!get("title")) return;
      if (planDate && !C.validDay(planDate)) { error.textContent = "Choisis une date valide."; return; }
      if (get("repeatUntil") && get("repeatUntil") < planDate) { error.textContent = "La fin de répétition doit suivre le début."; return; }
      const steps = (draft.steps || []).map((step,i) => ({ ...step, title: form.querySelector(`[data-step-title="${i}"]`).value.trim() || step.title, completed: form.querySelector(`[data-step-check="${i}"]`).checked }));
      steps.push(...get("newSteps").split("\n").filter(Boolean).map(title => ({ id: uid(), title: title.slice(0,120), completed: false, children: [] })));
      const body = { ...draft, title: get("title"), description: get("description"), kind: get("kind"), lifeMode: get("lifeMode"), planDate, planTime, importance: Number(get("importance")), effort: get("effort"), repeat, repeatEvery: Number(get("repeatEvery")) || 1, repeatUntil: get("repeatUntil"), remindBefore: Number(get("remindBefore")), durationMinutes: Number(get("durationMinutes")) || 30, travelMinutes: Number(get("travelMinutes")) || 0, arrivalBuffer: Number(get("arrivalBuffer")) || 0, location: get("location"), tags: [...form.querySelectorAll(".tag-checks input:checked")].map(input => input.value), steps, deadlineTs: planDate ? C.timestamp({ planTime }, planDate) : 0, updatedAt: Date.now() };
      if (repeat !== "none") { body.state = "inprogress"; body.completedAt = null; }
      if (commit(() => { const index = app().state.tasks.findIndex(t => t.id === id); if (index >= 0) app().state.tasks[index] = body; else app().state.tasks.unshift(body); })) { dialog.close(); app().refresh(); app().toast("C’est dans ton agenda."); }
      else error.textContent = "Enregistrement impossible. Garde ce formulaire ouvert et exporte tes données.";
    };
    if (!dialog.open) dialog.showModal(); requestAnimationFrame(() => form.elements.title.focus());
  }
  function templateFor(type) {
    const templates = {
      films: { title: "Notre liste de films", content: "<h2>À regarder ensemble</h2><div class=\"editor-check-block\"><input type=\"checkbox\"><span>Titre du film — proposé par…</span></div><h2>On en a pensé quoi ?</h2><p>Film · note /5 · nos avis</p>" },
      tasting: { title: "Nos dégustations", content: "<h2>Le classement du groupe</h2><ol><li>Notre favori — note /10</li><li>À départager — note /10</li></ol><h2>Nos avis</h2><p>Produit / parfum :</p><p>Goût · originalité · note /10 :</p><p>Avis de chacun :</p>" },
      poem: { title: "Un texte à moi", content: "<p>Un premier vers,<br>une idée qui reste.</p>" }
    };
    return templates[type];
  }
  function createTemplate(type) {
    const template = templateFor(type); if (!template) return;
    const note = { id: uid(), ...template, format: "html", color: "opal", font: type === "poem" ? "serif" : "sans", pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
    if (commit(() => { app().state.notes.unshift(note); })) app().openNote(note.id);
  }
  function reminderSettings() {
    const dialog = document.getElementById("confirmDialog"), settings = app().state.settings;
    dialog.innerHTML = `<div class="modal-content reminder-settings"><header class="modal-head"><h2>Des rappels à ta mesure</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></header><p>Dans cette version, Sōlo peut t’alerter pendant que l’app reste ouverte. Si l’app est fermée ou suspendue par l’iPhone, ces rappels ne se déclenchent pas.</p><button class="primary full" id="enableLocalReminders">Activer les rappels de l’app</button><p id="reminderPermission" role="status">${settings.openAppReminders ? "Rappels de l’app activés sur cet appareil." : "Rappels désactivés."}</p><label class="toggle-row"><span>Masquer le titre des missions dans les notifications</span><input id="privateReminders" type="checkbox" ${settings.privateReminders !== false ? "checked" : ""}></label><label class="toggle-row"><span>Rappels dans Sōlo activés</span><input id="remindersEnabled" type="checkbox" ${settings.openAppReminders ? "checked" : ""}></label><hr><h3>Sur ton iPhone</h3><p>Dans Safari : Partager → Sur l’écran d’accueil. Pour recevoir les alertes lorsque Sōlo est fermé, exporte ton agenda puis importe-le dans Calendrier Apple et vérifie les alertes de Calendrier.</p><button class="secondary full" id="exportCalendarSettings">Exporter mes 12 prochains mois (.ics)</button><small>Export ponctuel, sans synchronisation automatique. Les notifications push nécessitent un service d’envoi qui reste à configurer.</small><hr><h3>Ta vie privée</h3><p>Pas de suivi publicitaire ni d’API de géolocalisation en arrière-plan ajoutés par cette version. Les polices utilisent ton appareil. Tes adresses ne quittent pas Sōlo avant un clic sur « Itinéraire » ; ce clic ouvre Google Maps avec la destination.</p><p>Le mode local conserve les données dans ce navigateur. Connecté, Sōlo les synchronise dans Firebase : ce stockage n’est pas chiffré de bout en bout. Les services externes de connexion et d’icônes restent utilisés.</p><button class="text-btn" id="recoverPrevious">Récupérer la sauvegarde locale précédente</button></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.querySelector("#enableLocalReminders").onclick = async () => {
      let permission = "unsupported";
      try { if ("Notification" in window) permission = await Notification.requestPermission(); } catch {}
      if (commit(() => { settings.openAppReminders = true; })) dialog.querySelector("#remindersEnabled").checked = true;
      dialog.querySelector("#reminderPermission").textContent = permission === "granted" ? "Notifications autorisées. L’app doit rester ouverte pour déclencher ces rappels." : "Rappels dans Sōlo activés. Les notifications système ne sont pas autorisées ou disponibles.";
    };
    dialog.querySelector("#privateReminders").onchange = e => commit(() => { settings.privateReminders = e.target.checked; });
    dialog.querySelector("#remindersEnabled").onchange = e => commit(() => { settings.openAppReminders = e.target.checked; });
    dialog.querySelector("#exportCalendarSettings").onclick = () => download(C.calendarICS(app().state.tasks), "solo-agenda.ics", "text/calendar;charset=utf-8");
    dialog.querySelector("#recoverPrevious").onclick = () => { const previous = localStorage.getItem("nova_tasks_v5_previous"); if (!previous) return app().toast("Aucune copie précédente sur cet appareil."); download(previous, "solo-sauvegarde-precedente.json", "application/json"); app().toast("Copie exportée. Tu peux l’importer depuis Réglages → Données."); };
    if (!dialog.open) dialog.showModal();
  }
  async function checkReminders() {
    if (!app()?.state.settings.openAppReminders) return;
    for (const entry of C.upcomingReminders(app().state.tasks)) {
      const key = `solo_reminder_${entry.task.id}_${entry.day}_${entry.due}`;
      if (localStorage.getItem(key)) continue;
      const text = app().state.settings.privateReminders !== false ? "Un engagement arrive. Ouvre Sōlo pour voir le détail." : `${entry.task.title} · ${clock(entry.at)}`;
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          if (workerRegistration) await workerRegistration.showNotification("Sōlo · Garde le cap", { body: text, tag: "solo-reminder", icon: "assets/solo-mark-opal.png" });
          else new Notification("Sōlo · Garde le cap", { body: text, tag: "solo-reminder" });
        }
        app().toast(text);
        localStorage.setItem(key, "1");
      } catch { app().toast(text); }
    }
  }
  function decorateNotes() {
    const root = document.getElementById("notesSection"), head = root.querySelector(".page-head");
    if (!head || root.querySelector(".note-template-strip")) return;
    const strip = document.createElement("div"); strip.className = "note-template-strip";
    strip.innerHTML = '<span>Partir d’une idée</span><button data-template="films">🎬 Films</button><button data-template="tasting">★ Classement</button><button data-template="poem">✎ Poème</button>';
    head.after(strip); strip.querySelectorAll("[data-template]").forEach(b => b.onclick = () => createTemplate(b.dataset.template));
    const toolbar = root.querySelector(".toolbar-copy"); if (toolbar) toolbar.textContent = "Brouillons locaux · compte dans Réglages";
  }
  window.SoloPlanner = {
    openItem, createTemplate, templateFor, reminderSettings, fontNames, download,
    renderSection(section) {
      activeSection = section; document.body.dataset.lifeMode = mode();
      if (section === "home" || section === "calendar") { (section === "home" ? home : calendar)(document.getElementById(`${section}Section`)); return true; }
      if (section === "notes") setTimeout(decorateNotes, 0);
      return false;
    }
  };
  window.addEventListener("solo:save-error", () => banner("Enregistrement impossible sur cet appareil. Tes dernières modifications ne sont pas sauvegardées.", { label: "Exporter une copie", run: () => download(JSON.stringify(app().state), "solo-copie-secours.json", "application/json") }));
  window.addEventListener("storage", e => { if (e.key === "nova_tasks_v5") banner("Une autre fenêtre a modifié Sōlo. Recharge cette page avant de poursuivre pour éviter d’écraser ces changements.", { label: "Recharger", run: () => location.reload() }); });
  window.addEventListener("solo:storage-conflict", () => banner("Une autre fenêtre a modifié Sōlo. Enregistrement bloqué pour préserver ses changements.", { label: "Recharger", run: () => location.reload() }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (["home", "calendar"].includes(activeSection) && !document.querySelector("dialog[open]") && !document.body.classList.contains("note-workspace-open")) app()?.refresh(); checkReminders(); } });
  document.addEventListener("DOMContentLoaded", () => {
    if (window.__soloRecoveryNotice) banner("La sauvegarde principale était illisible. Une copie précédente a été chargée si elle était disponible. La version illisible a été conservée.", { label: "Exporter la copie conservée", run: () => download(localStorage.getItem("nova_tasks_v5_unreadable") || "", "solo-donnees-a-recuperer.json", "application/json") });
    if ("serviceWorker" in navigator && ["https:", "http:"].includes(location.protocol)) navigator.serviceWorker.register("./sw.js").then(r => { workerRegistration = r; }).catch(() => {});
    setInterval(checkReminders, 30000);
    setInterval(() => { if (lastVisibleDay !== today() && ["home", "calendar"].includes(activeSection) && !document.hidden && !document.querySelector("dialog[open]") && !document.body.classList.contains("note-workspace-open")) { lastVisibleDay = today(); app().refresh(); } }, 60000);
    checkReminders();
  });
})();
