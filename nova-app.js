(() => {
  "use strict";

  const STORAGE_KEY = "nova_tasks_v5";
  const DAY = 86400000;
  const IMPORTANCE = { 1: "Tranquille", 2: "Important", 3: "Prioritaire" };
  const esc = value => window.NovaEditor.escapeHtml(value == null ? "" : String(value));
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  function freshState() {
    return {
      tasks: [],
      notes: [],
      tags: [],
      profile: { name: "", avatar: "" },
      settings: { uiTheme: "opal-light", compactLists: false },
      syncUpdatedAt: 0,
      viewed: {},
      mailboxUnread: { global: false, failed: false }
    };
  }

  function normalizeStep(step = {}) {
    return {
      ...step,
      id: step.id || uid(),
      title: step.title || "Étape",
      description: step.description || "",
      completed: !!step.completed,
      children: (step.children || step.substeps || []).map(normalizeStep)
    };
  }

  function normalizeTask(task = {}) {
    const deadlineTs = Number(task.deadlineTs || (task.deadline ? new Date(task.deadline).getTime() : 0));
    return {
      ...task,
      id: task.id || uid(),
      title: task.title || "Objectif sans titre",
      description: task.description || "",
      importance: [1, 2, 3].includes(Number(task.importance)) ? Number(task.importance) : 1,
      deadlineTs: Number.isFinite(deadlineTs) ? deadlineTs : 0,
      state: ["inprogress", "completed", "failed"].includes(task.state) ? task.state : "inprogress",
      tags: Array.isArray(task.tags) ? task.tags : [],
      steps: (task.steps || []).map(normalizeStep),
      createdAt: Number(task.createdAt) || Date.now()
    };
  }

  function normalizeNote(note = {}) {
    return {
      ...note,
      id: note.id || uid(),
      title: note.title || "Note sans titre",
      content: note.content || "",
      color: ["opal", "blue", "violet", "sand"].includes(note.color) ? note.color : "opal",
      pinned: !!note.pinned,
      createdAt: Number(note.createdAt) || Date.now(),
      updatedAt: Number(note.updatedAt) || Number(note.createdAt) || Date.now()
    };
  }

  function loadState() {
    const empty = freshState();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || empty;
      return {
        ...empty,
        ...parsed,
        tasks: (parsed.tasks || []).map(normalizeTask),
        notes: (parsed.notes || []).map(normalizeNote),
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        profile: { ...empty.profile, ...(parsed.profile || {}), name: parsed.profile?.name === "Player" ? "" : (parsed.profile?.name || "") },
        settings: { ...empty.settings, ...(parsed.settings || {}), uiTheme: parsed.settings?.uiTheme === "opal-dark" ? "opal-dark" : "opal-light" }
      };
    } catch (error) {
      console.warn("Nova: anciennes données illisibles, base locale vierge chargée.", error);
      return empty;
    }
  }

  const state = loadState();
  const ui = { section: "home", taskFilter: "open", taskSearch: "", noteSearch: "", settingsTab: "profile", account: { status: "loading" } };
  const sections = ["home", "tasks", "notes", "shared", "stats", "profile"];

  function save({ notify = true, touch = true } = {}) {
    if (touch) state.syncUpdatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (notify) window.dispatchEvent(new CustomEvent("nova:local-change"));
  }

  function getPersonalSnapshot() {
    return {
      version: 1,
      updatedAt: Number(state.syncUpdatedAt) || 0,
      tasks: structuredClone(state.tasks),
      notes: structuredClone(state.notes),
      tags: structuredClone(state.tags),
      profile: { name: state.profile.name || "" },
      settings: structuredClone(state.settings)
    };
  }

  function applyPersonalSnapshot(snapshot = {}) {
    state.tasks = (snapshot.tasks || []).map(normalizeTask);
    state.notes = (snapshot.notes || []).map(normalizeNote);
    state.tags = Array.isArray(snapshot.tags) ? snapshot.tags : [];
    state.profile = { ...state.profile, ...(snapshot.profile || {}), avatar: state.profile.avatar || "" };
    state.settings = { ...state.settings, ...(snapshot.settings || {}) };
    state.syncUpdatedAt = Number(snapshot.updatedAt) || Date.now();
    save({ notify: false, touch: false });
    applyTheme();
    renderSection();
  }

  function accountCopy() {
    const account = ui.account || {};
    if (account.status === "signed-in") return {
      icon: "bi-cloud-check", title: account.displayName || "Compte Nova", text: `${account.email || "Compte connecté"} · objectifs, notes et réglages synchronisés`, action: "Se déconnecter", kind: "signed-in"
    };
    if (account.status === "protocol-blocked") return {
      icon: "bi-globe2", title: "Version web requise", text: "Ouvre la version en ligne pour activer le compte, la synchronisation et les espaces partagés.", action: "Ouvrir Nova en ligne", kind: "blocked"
    };
    if (account.status === "unavailable") return {
      icon: "bi-cloud-slash", title: "Service indisponible", text: "Tes données locales restent accessibles. Réessaie quand tu retrouves une connexion.", action: "Réessayer", kind: "blocked"
    };
    return {
      icon: "bi-cloud", title: "Mode local", text: "Connecte-toi pour retrouver tes objectifs, notes et réglages sur tes appareils.", action: "Se connecter", kind: "local"
    };
  }

  function updateAccountIndicator() {
    const dot = document.getElementById("accountStatusDot");
    if (!dot) return;
    dot.className = `account-status-dot ${ui.account.status === "signed-in" ? "online" : ui.account.status === "protocol-blocked" || ui.account.status === "unavailable" ? "blocked" : "local"}`;
  }
  function applyTheme() {
    const theme = state.settings.uiTheme === "opal-dark" ? "opal-dark" : "opal-light";
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle("compact-lists", !!state.settings.compactLists);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "opal-dark" ? "#071a21" : "#f1fbfc");
  }

  function toast(message) {
    const node = document.getElementById("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
  }

  function formatDate(timestamp, short = false) {
    if (!timestamp) return "Sans échéance";
    const date = new Date(timestamp);
    const today = new Date();
    const tomorrow = new Date(Date.now() + DAY);
    if (date.toDateString() === today.toDateString()) return "Aujourd’hui";
    if (date.toDateString() === tomorrow.toDateString()) return "Demain";
    return date.toLocaleDateString("fr-FR", short ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "long" });
  }

  function relativeTime(timestamp) {
    const days = Math.floor((Date.now() - timestamp) / DAY);
    if (days <= 0) return "aujourd’hui";
    if (days === 1) return "hier";
    if (days < 7) return `il y a ${days} jours`;
    return new Date(timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  function taskProgress(task) {
    const flat = [];
    const walk = steps => steps.forEach(step => { flat.push(step); walk(step.children || []); });
    walk(task.steps || []);
    if (!flat.length) return task.state === "completed" ? 100 : 0;
    return Math.round(flat.filter(step => step.completed).length / flat.length * 100);
  }

  function noteChecklist(note) {
    return window.NovaRichEditor.checklistStats(note.content || "", note.format || "markdown");
  }

  function navigate(section) {
    ui.section = sections.includes(section) ? section : "home";
    document.body.dataset.section = ui.section;
    document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.id === `${ui.section}Section`));
    document.querySelectorAll(".menu-btn[data-section]").forEach(button => button.classList.toggle("active", button.dataset.section === ui.section));
    renderSection();
    closeQuickMenu();
  }

  function pageHeader(eyebrow, title, copy, actions = "") {
    return `<header class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p></div><div class="page-actions">${actions}</div></header>`;
  }

  function emptyState(icon, title, copy, action = "") {
    return `<div class="empty-state"><span><i class="bi ${icon}"></i></span><h2>${title}</h2><p>${copy}</p>${action}</div>`;
  }

  function renderHome() {
    const root = document.getElementById("homeSection");
    const active = state.tasks.filter(task => task.state === "inprogress").sort((a, b) => (a.deadlineTs || Infinity) - (b.deadlineTs || Infinity) || b.importance - a.importance);
    const done = state.tasks.filter(task => task.state === "completed");
    const focus = active[0];
    const recentNotes = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2);
    const today = active.filter(task => task.deadlineTs && new Date(task.deadlineTs).toDateString() === new Date().toDateString()).length;
    const name = state.profile.name ? `, ${esc(state.profile.name)}` : "";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

    root.innerHTML = `<div class="home-page">
      ${pageHeader(new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), `${greeting}${name}`, active.length ? "Ton prochain pas est prêt. Le reste peut attendre." : "Un espace calme pour poser ce qui compte.", `<button class="primary" data-home-action="task"><i class="bi bi-plus-lg"></i> Nouvel objectif</button>`)}
      <div class="home-grid">
        <article class="focus-panel panel">
          <div class="panel-top"><span class="panel-kicker"><i class="bi bi-stars"></i> À faire maintenant</span>${focus ? `<span class="priority p${focus.importance}">${IMPORTANCE[focus.importance]}</span>` : ""}</div>
          ${focus ? `<div class="focus-copy"><h2>${esc(focus.title)}</h2><p>${esc(focus.description || "Avance simplement avec la prochaine étape.")}</p></div><div class="focus-progress"><span><i style="width:${taskProgress(focus)}%"></i></span><strong>${taskProgress(focus)}%</strong></div><div class="focus-actions"><button class="secondary" data-edit-task="${focus.id}">Ouvrir</button><button class="primary" data-toggle-task="${focus.id}"><i class="bi bi-check2"></i> Terminer</button></div>` : `<div class="focus-empty"><span><i class="bi bi-check2-circle"></i></span><h2>Tout est clair.</h2><p>Crée un objectif quand tu es prête.</p><button class="secondary" data-home-action="task">Créer le premier</button></div>`}
        </article>

        <article class="summary-panel panel">
          <span class="panel-kicker">Vue rapide</span>
          <div class="summary-values"><div><strong>${active.length}</strong><span>en cours</span></div><div><strong>${today}</strong><span>aujourd’hui</span></div><div><strong>${done.length}</strong><span>terminés</span></div></div>
          <button class="secondary full" data-home-route="tasks">Voir tous les objectifs <i class="bi bi-arrow-right"></i></button>
        </article>

        <article class="upcoming-panel panel">
          <div class="panel-heading"><div><span class="panel-kicker">Prochainement</span><h2>Garder le cap</h2></div><button class="icon-btn" data-home-route="tasks" aria-label="Voir les objectifs"><i class="bi bi-arrow-right"></i></button></div>
          <div class="mini-list">${active.length ? active.slice(0, 3).map(task => `<button data-edit-task="${task.id}"><span class="mini-check"></span><span><strong>${esc(task.title)}</strong><small>${formatDate(task.deadlineTs, true)}</small></span><i class="bi bi-chevron-right"></i></button>`).join("") : `<div class="mini-empty"><i class="bi bi-wind"></i> Rien d’urgent.</div>`}</div>
        </article>

        <article class="notes-panel panel">
          <div class="panel-heading"><div><span class="panel-kicker">Notes rapides</span><h2>Tout garder sous la main</h2></div><button class="icon-btn" data-home-action="note" aria-label="Nouvelle note"><i class="bi bi-plus-lg"></i></button></div>
          <div class="mini-notes">${recentNotes.length ? recentNotes.map(note => `<button class="mini-note ${note.color}" data-edit-note="${note.id}"><i class="bi bi-journal-text"></i><span><strong>${esc(note.title)}</strong><small>${relativeTime(note.updatedAt)}</small></span></button>`).join("") : `<button class="note-invite" data-home-action="note"><i class="bi bi-journal-plus"></i><span><strong>Écrire une première note</strong><small>Listes, liens et cases à cocher</small></span></button>`}</div>
        </article>
      </div>
    </div>`;
    bindTaskActions(root);
    bindNoteActions(root);
    root.querySelectorAll("[data-home-action='task']").forEach(button => button.onclick = () => openTaskDialog());
    root.querySelectorAll("[data-home-action='note']").forEach(button => button.onclick = () => openNoteDialog());
    root.querySelectorAll("[data-home-route]").forEach(button => button.onclick = () => navigate(button.dataset.homeRoute));
  }

  function taskCard(task) {
    const progress = taskProgress(task);
    const tags = (task.tags || []).map(id => state.tags.find(tag => tag.id === id)).filter(Boolean);
    const overdue = task.deadlineTs && task.deadlineTs < Date.now() && task.state === "inprogress";
    return `<article class="task-card ${task.state === "completed" ? "done" : ""}" data-task-card="${task.id}">
      <button class="task-check" data-toggle-task="${task.id}" aria-label="${task.state === "completed" ? "Rouvrir" : "Terminer"}">${task.state === "completed" ? '<i class="bi bi-check-lg"></i>' : ""}</button>
      <button class="task-main" data-edit-task="${task.id}"><span class="task-title-line"><strong>${esc(task.title)}</strong>${tags.map(tag => `<i class="tag-dot" style="--tag:${esc(tag.color || "#36bdb8")}" title="${esc(tag.name)}"></i>`).join("")}</span><span class="task-meta"><span class="priority p${task.importance}">${IMPORTANCE[task.importance]}</span><span class="${overdue ? "overdue" : ""}"><i class="bi bi-calendar3"></i> ${formatDate(task.deadlineTs, true)}</span>${task.steps.length ? `<span><i class="bi bi-list-check"></i> ${progress}%</span>` : ""}</span>${task.steps.length ? `<span class="task-progress"><i style="width:${progress}%"></i></span>` : ""}</button>
      <div class="task-card-actions"><button class="icon-btn" data-edit-task="${task.id}" aria-label="Modifier"><i class="bi bi-pencil"></i></button><button class="icon-btn danger" data-delete-task="${task.id}" aria-label="Supprimer"><i class="bi bi-trash3"></i></button></div>
    </article>`;
  }

  function renderTasks() {
    const root = document.getElementById("tasksSection");
    const search = ui.taskSearch.trim().toLowerCase();
    let tasks = [...state.tasks];
    if (ui.taskFilter === "open") tasks = tasks.filter(task => task.state === "inprogress");
    if (ui.taskFilter === "done") tasks = tasks.filter(task => task.state === "completed");
    if (search) tasks = tasks.filter(task => `${task.title} ${task.description}`.toLowerCase().includes(search));
    tasks.sort((a, b) => (a.state === "completed") - (b.state === "completed") || (a.deadlineTs || Infinity) - (b.deadlineTs || Infinity) || b.importance - a.importance);
    root.innerHTML = `<div class="list-page">
      ${pageHeader("Organisation personnelle", "Mes objectifs", "Une liste claire, des étapes seulement quand elles sont utiles.", `<button class="primary" id="tasksAdd"><i class="bi bi-plus-lg"></i> Nouvel objectif</button>`)}
      <div class="list-toolbar panel-lite">
        <label class="search-field"><i class="bi bi-search"></i><input id="taskSearch" type="search" value="${esc(ui.taskSearch)}" placeholder="Rechercher un objectif"></label>
        <div class="filter-chips" aria-label="Filtrer"><button class="${ui.taskFilter === "open" ? "active" : ""}" data-task-filter="open">À faire</button><button class="${ui.taskFilter === "all" ? "active" : ""}" data-task-filter="all">Tous</button><button class="${ui.taskFilter === "done" ? "active" : ""}" data-task-filter="done">Terminés</button></div>
        <button class="secondary compact only-icon-mobile" id="manageTags"><i class="bi bi-tags"></i><span>Étiquettes</span></button>
      </div>
      <div class="list-scroll">${tasks.length ? `<div class="task-list">${tasks.map(taskCard).join("")}</div>` : emptyState("bi-check2-circle", search ? "Aucun résultat" : "La liste est prête", search ? "Essaie un autre mot ou change le filtre." : "Ajoute un objectif avec un titre clair et une échéance réaliste.", search ? "" : '<button class="primary" id="emptyAddTask"><i class="bi bi-plus-lg"></i> Créer un objectif</button>')}</div>
    </div>`;
    root.querySelector("#tasksAdd").onclick = () => openTaskDialog();
    root.querySelector("#emptyAddTask")?.addEventListener("click", () => openTaskDialog());
    root.querySelector("#manageTags").onclick = openTagManager;
    root.querySelector("#taskSearch").oninput = event => { ui.taskSearch = event.target.value; renderTasks(); requestAnimationFrame(() => { const input = document.querySelector("#taskSearch"); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); };
    root.querySelectorAll("[data-task-filter]").forEach(button => button.onclick = () => { ui.taskFilter = button.dataset.taskFilter; renderTasks(); });
    bindTaskActions(root);
  }

  function noteCard(note) {
    const checklist = noteChecklist(note);
    const preview = window.NovaRichEditor.plainText(note.content || "");
    return `<article class="personal-note ${note.color}">
      <button class="note-body" data-edit-note="${note.id}"><span class="note-top"><i class="bi ${note.pinned ? "bi-pin-angle-fill" : "bi-journal-text"}"></i><small>${relativeTime(note.updatedAt)}</small></span><h2>${esc(note.title)}</h2><p>${esc(preview || "Note vide")}</p>${checklist.total ? `<span class="note-check-progress"><i class="bi bi-check2-square"></i> ${checklist.done}/${checklist.total} éléments cochés</span>` : ""}</button>
      <div class="note-actions"><button class="icon-btn" data-pin-note="${note.id}" aria-label="Épingler"><i class="bi ${note.pinned ? "bi-pin-angle-fill" : "bi-pin-angle"}"></i></button><button class="icon-btn danger" data-delete-note="${note.id}" aria-label="Supprimer"><i class="bi bi-trash3"></i></button></div>
    </article>`;
  }

  function renderNotes() {
    const root = document.getElementById("notesSection");
    const search = ui.noteSearch.trim().toLowerCase();
    const notes = [...state.notes].filter(note => !search || `${note.title} ${note.content}`.toLowerCase().includes(search)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
    root.innerHTML = `<div class="list-page notes-page">
      ${pageHeader("Bloc-notes personnel", "Mes notes", "Écris vite, structure seulement si tu en as besoin.", `<button class="primary" id="notesAdd"><i class="bi bi-journal-plus"></i> Nouvelle note</button>`)}
      <div class="list-toolbar panel-lite notes-toolbar"><label class="search-field"><i class="bi bi-search"></i><input id="noteSearch" type="search" value="${esc(ui.noteSearch)}" placeholder="Rechercher dans les notes"></label><span class="toolbar-copy"><i class="bi bi-cloud-slash"></i> Sauvegardées localement</span></div>
      <div class="list-scroll">${notes.length ? `<div class="personal-notes-grid">${notes.map(noteCard).join("")}</div>` : emptyState("bi-journal-plus", search ? "Aucune note trouvée" : "Une idée à garder ?", search ? "Essaie un autre mot." : "Crée une note, une checklist, un brief ou une liste de liens.", search ? "" : '<button class="primary" id="emptyAddNote"><i class="bi bi-plus-lg"></i> Écrire une note</button>')}</div>
    </div>`;
    root.querySelector("#notesAdd").onclick = () => openNoteDialog();
    root.querySelector("#emptyAddNote")?.addEventListener("click", () => openNoteDialog());
    root.querySelector("#noteSearch").oninput = event => { ui.noteSearch = event.target.value; renderNotes(); requestAnimationFrame(() => { const input = document.querySelector("#noteSearch"); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); };
    bindNoteActions(root);
  }

  function renderStats() {
    const root = document.getElementById("statsSection");
    const total = state.tasks.length;
    const done = state.tasks.filter(task => task.state === "completed").length;
    const open = state.tasks.filter(task => task.state === "inprogress").length;
    const overdue = state.tasks.filter(task => task.state === "inprogress" && task.deadlineTs && task.deadlineTs < Date.now()).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const priorities = [1, 2, 3].map(level => ({ level, count: state.tasks.filter(task => task.importance === level).length }));
    root.innerHTML = `<div class="stats-page">
      ${pageHeader("Progression", "Statistiques", "Quelques repères utiles, rien de plus.")}
      <div class="kpi-grid"><article><span>À faire</span><strong>${open}</strong><i class="bi bi-check2-square"></i></article><article><span>Terminés</span><strong>${done}</strong><i class="bi bi-check2-circle"></i></article><article><span>En retard</span><strong>${overdue}</strong><i class="bi bi-clock-history"></i></article><article><span>Notes</span><strong>${state.notes.length}</strong><i class="bi bi-journal-text"></i></article></div>
      <div class="stats-grid"><article class="panel stats-progress"><div><span class="panel-kicker">Progression globale</span><h2>${pct}% des objectifs terminés</h2><p>${total ? `${done} sur ${total} objectifs` : "Crée un objectif pour démarrer."}</p></div><div class="donut" style="--pct:${pct}"><span>${pct}%</span></div></article><article class="panel"><span class="panel-kicker">Répartition</span><h2>Par niveau d’attention</h2><div class="bar-list">${priorities.map(item => `<div><span>${IMPORTANCE[item.level]}</span><i><b style="width:${total ? item.count / total * 100 : 0}%"></b></i><strong>${item.count}</strong></div>`).join("")}</div></article></div>
    </div>`;
  }

  function renderProfile() {
    const root = document.getElementById("profileSection");
    const dark = state.settings.uiTheme === "opal-dark";
    const account = accountCopy();
    root.innerHTML = `<div class="settings-page">
      ${pageHeader("Préférences", "Profil & réglages", "Les réglages essentiels, regroupés au même endroit.")}
      <section class="account-sync-card panel ${account.kind}"><span class="account-sync-icon"><i class="bi ${account.icon}"></i></span><div><span class="panel-kicker">COMPTE & SAUVEGARDE</span><h2>${esc(account.title)}</h2><p>${esc(account.text)}</p></div><button id="accountAction" class="${account.kind === "signed-in" ? "secondary" : "primary"}">${esc(account.action)}</button></section>
      <nav class="settings-tabs" aria-label="Catégories de réglages"><button class="${ui.settingsTab === "profile" ? "active" : ""}" data-settings-tab="profile"><i class="bi bi-person"></i><span>Profil</span></button><button class="${ui.settingsTab === "appearance" ? "active" : ""}" data-settings-tab="appearance"><i class="bi bi-palette"></i><span>Thème</span></button><button class="${ui.settingsTab === "help" ? "active" : ""}" data-settings-tab="help"><i class="bi bi-compass"></i><span>Aide</span></button><button class="${ui.settingsTab === "data" ? "active" : ""}" data-settings-tab="data"><i class="bi bi-database"></i><span>Données</span></button></nav>
      <div class="settings-grid">
        <section class="setting-card panel ${ui.settingsTab === "profile" ? "mobile-active" : ""}" data-setting-panel="profile"><div class="setting-title"><span><i class="bi bi-person"></i></span><div><h2>Ton profil</h2><p>Utilisé aussi dans les espaces partagés.</p></div></div><div class="profile-fields"><div class="avatar-preview">${state.profile.avatar ? `<img src="${esc(state.profile.avatar)}" alt="">` : '<i class="bi bi-person"></i>'}</div><label>Nom affiché<input id="profileName" value="${esc(state.profile.name)}" placeholder="Ton prénom ou pseudo"></label></div><label class="secondary file-button"><i class="bi bi-image"></i> Choisir une photo<input id="profileAvatar" type="file" accept="image/*"></label><button class="primary" id="saveProfile">Enregistrer le profil</button></section>
        <section class="setting-card panel ${ui.settingsTab === "appearance" ? "mobile-active" : ""}" data-setting-panel="appearance"><div class="setting-title"><span><i class="bi bi-palette"></i></span><div><h2>Apparence</h2><p>La même logique claire/sombre que Flow.</p></div></div><div class="theme-choice"><button data-theme-choice="opal-light" class="${!dark ? "active" : ""}"><i class="theme-demo light"></i><span><strong>Opale claire</strong><small>Blanc nacré & turquoise</small></span></button><button data-theme-choice="opal-dark" class="${dark ? "active" : ""}"><i class="theme-demo dark"></i><span><strong>Opale nuit</strong><small>Bleu profond & reflets aqua</small></span></button></div><label class="toggle-row"><span><strong>Listes compactes</strong><small>Affiche davantage d’éléments</small></span><input id="compactLists" type="checkbox" ${state.settings.compactLists ? "checked" : ""}></label></section>
        <section class="setting-card panel ${ui.settingsTab === "help" ? "mobile-active" : ""}" data-setting-panel="help"><div class="setting-title"><span><i class="bi bi-compass"></i></span><div><h2>Aide</h2><p>Le tutoriel ne s’affiche automatiquement qu’une fois.</p></div></div><button class="secondary full" id="replayTutorial"><i class="bi bi-play-circle"></i> Revoir le mini tutoriel</button><button class="secondary full" id="openSearchSettings"><i class="bi bi-search"></i> Rechercher une fonction</button></section>
        <section class="setting-card panel ${ui.settingsTab === "data" ? "mobile-active" : ""}" data-setting-panel="data"><div class="setting-title"><span><i class="bi bi-database"></i></span><div><h2>Données locales</h2><p>Compatible avec les sauvegardes Nova précédentes.</p></div></div><div class="data-actions"><button class="secondary" id="exportData"><i class="bi bi-download"></i> Exporter</button><label class="secondary file-button"><i class="bi bi-upload"></i> Importer<input id="importData" type="file" accept=".json,application/json"></label></div><button class="danger-button full" id="resetData"><i class="bi bi-trash3"></i> Réinitialiser les données locales</button></section>
      </div>
    </div>`;
    root.querySelectorAll("[data-settings-tab]").forEach(button => button.onclick = () => { ui.settingsTab = button.dataset.settingsTab; renderProfile(); });
    root.querySelector("#accountAction").onclick = () => {
      if (ui.account.status === "signed-in") window.NovaAccount?.signOut?.();
      else if (ui.account.status === "unavailable") location.reload();
      else if (ui.account.status === "protocol-blocked") window.NovaAccount?.openOnline?.();
      else window.NovaAccount?.open?.("login");
    };
    root.querySelectorAll("[data-theme-choice]").forEach(button => button.onclick = () => { state.settings.uiTheme = button.dataset.themeChoice; save(); applyTheme(); renderProfile(); });
    root.querySelector("#compactLists").onchange = event => { state.settings.compactLists = event.target.checked; save(); applyTheme(); };
    root.querySelector("#saveProfile").onclick = () => {
      state.profile.name = root.querySelector("#profileName").value.trim();
      const file = root.querySelector("#profileAvatar").files[0];
      if (!file) { save(); toast("Profil enregistré"); return renderProfile(); }
      if (file.size > 1200000) return toast("Choisis une image de moins de 1,2 Mo.");
      const reader = new FileReader();
      reader.onload = () => { state.profile.avatar = reader.result; save(); renderProfile(); toast("Profil enregistré"); };
      reader.readAsDataURL(file);
    };
    root.querySelector("#replayTutorial").onclick = () => window.NovaTutorial?.open();
    root.querySelector("#openSearchSettings").onclick = openCommandPalette;
    root.querySelector("#exportData").onclick = exportData;
    root.querySelector("#importData").onchange = importData;
    root.querySelector("#resetData").onclick = async () => { if (await confirmAction("Effacer les données locales ?", "Les objectifs et notes de cet appareil seront supprimés. Les espaces Firebase ne seront pas touchés.")) { localStorage.removeItem(STORAGE_KEY); location.reload(); } };
  }

  function renderSection() {
    if (ui.section === "home") renderHome();
    if (ui.section === "tasks") renderTasks();
    if (ui.section === "notes") renderNotes();
    if (ui.section === "stats") renderStats();
    if (ui.section === "profile") renderProfile();
  }

  function bindTaskActions(root) {
    root.querySelectorAll("[data-toggle-task]").forEach(button => button.onclick = event => { event.stopPropagation(); const task = state.tasks.find(item => item.id === button.dataset.toggleTask); if (!task) return; task.state = task.state === "completed" ? "inprogress" : "completed"; task.completedAt = task.state === "completed" ? Date.now() : null; save(); renderSection(); toast(task.state === "completed" ? "Objectif terminé" : "Objectif rouvert"); });
    root.querySelectorAll("[data-edit-task]").forEach(button => button.onclick = event => { event.stopPropagation(); openTaskDialog(button.dataset.editTask); });
    root.querySelectorAll("[data-delete-task]").forEach(button => button.onclick = async event => { event.stopPropagation(); const task = state.tasks.find(item => item.id === button.dataset.deleteTask); if (!task) return; if (await confirmAction("Supprimer cet objectif ?", `« ${task.title} » sera retiré de cet appareil.`)) { state.tasks = state.tasks.filter(item => item.id !== task.id); save(); renderSection(); toast("Objectif supprimé"); } });
  }

  function bindNoteActions(root) {
    root.querySelectorAll("[data-edit-note]").forEach(button => button.onclick = () => openNoteDialog(button.dataset.editNote));
    root.querySelectorAll("[data-pin-note]").forEach(button => button.onclick = () => { const note = state.notes.find(item => item.id === button.dataset.pinNote); if (!note) return; note.pinned = !note.pinned; note.updatedAt = Date.now(); save(); renderSection(); });
    root.querySelectorAll("[data-delete-note]").forEach(button => button.onclick = async () => { const note = state.notes.find(item => item.id === button.dataset.deleteNote); if (!note) return; if (await confirmAction("Supprimer cette note ?", `« ${note.title} » sera supprimée de cet appareil.`)) { state.notes = state.notes.filter(item => item.id !== note.id); save(); renderSection(); toast("Note supprimée"); } });
  }

  function openTaskDialog(taskId = null) {
    const existing = taskId ? state.tasks.find(task => task.id === taskId) : null;
    const draft = existing ? structuredClone(existing) : { ...normalizeTask({ id: uid(), deadlineTs: Date.now() + 7 * DAY, importance: 2, steps: [] }), title: "" };
    const dialog = document.getElementById("taskDialog");
    const dateValue = draft.deadlineTs ? new Date(draft.deadlineTs - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "";
    dialog.innerHTML = `<form class="modal-content" id="taskForm">
      <header class="modal-head"><div><span class="eyebrow">${existing ? "Modification" : "Nouvel objectif"}</span><h2>${existing ? "Ajuster l’objectif" : "Qu’est-ce qui compte ?"}</h2></div><button type="button" class="icon-btn" data-close aria-label="Fermer"><i class="bi bi-x-lg"></i></button></header>
      <div class="form-stack"><label class="hero-field">Titre<input id="taskTitleInput" required maxlength="120" value="${esc(draft.title)}" placeholder="Ex. Préparer le week-end"></label><label>Description <span>facultatif</span><textarea id="taskDescription" rows="2" maxlength="1200" placeholder="Une phrase de contexte suffit.">${esc(draft.description)}</textarea></label>
      <fieldset><legend>Niveau d’attention</legend><div class="segmented importance-segment">${[1,2,3].map(level => `<label class="p${level}"><input type="radio" name="importance" value="${level}" ${draft.importance === level ? "checked" : ""}><span>${IMPORTANCE[level]}</span></label>`).join("")}</div></fieldset>
      <fieldset><legend>Échéance</legend><div class="deadline-row"><div class="quick-dates"><button type="button" data-date-offset="0">Aujourd’hui</button><button type="button" data-date-offset="1">Demain</button><button type="button" data-date-offset="7">Dans 7 jours</button></div><input id="taskDeadline" type="date" value="${dateValue}"></div></fieldset>
      <details class="advanced-box" ${draft.steps.length || draft.tags.length ? "open" : ""}><summary><span><i class="bi bi-sliders"></i> Étapes et étiquettes</span><small>Optionnel</small></summary><div class="advanced-content"><div class="steps-editor"><div class="subhead"><strong>Petites étapes</strong><button type="button" class="text-btn" id="addTaskStep"><i class="bi bi-plus-lg"></i> Ajouter</button></div><div id="taskSteps">${draft.steps.map((step, index) => stepEditorRow(step, index)).join("")}</div></div><div class="tag-editor"><strong>Étiquettes</strong><div class="tag-checks">${state.tags.length ? state.tags.map(tag => `<label><input type="checkbox" value="${esc(tag.id)}" ${draft.tags.includes(tag.id) ? "checked" : ""}><i style="--tag:${esc(tag.color || "#36bdb8")}"></i>${esc(tag.name)}</label>`).join("") : '<p>Aucune étiquette. Tu peux en créer depuis la liste des objectifs.</p>'}</div></div></div></details></div>
      <footer class="modal-actions"><button type="button" class="secondary" data-close>Annuler</button><button type="submit" class="primary"><i class="bi bi-check2"></i> ${existing ? "Enregistrer" : "Créer l’objectif"}</button></footer>
    </form>`;
    const close = () => dialog.close();
    dialog.querySelectorAll("[data-close]").forEach(button => button.onclick = close);
    dialog.querySelectorAll("[data-date-offset]").forEach(button => button.onclick = () => { const date = new Date(); date.setDate(date.getDate() + Number(button.dataset.dateOffset)); dialog.querySelector("#taskDeadline").value = new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
    const stepsRoot = dialog.querySelector("#taskSteps");
    const redrawSteps = () => { stepsRoot.innerHTML = draft.steps.map((step, index) => stepEditorRow(step, index)).join(""); bindStepRows(); };
    const syncSteps = () => { draft.steps.forEach((step, index) => { step.title = dialog.querySelector(`[data-step-title="${index}"]`)?.value || step.title; }); };
    const bindStepRows = () => dialog.querySelectorAll("[data-remove-step]").forEach(button => button.onclick = () => { syncSteps(); draft.steps.splice(Number(button.dataset.removeStep), 1); redrawSteps(); });
    dialog.querySelector("#addTaskStep").onclick = () => { syncSteps(); draft.steps.push(normalizeStep({ title: "" })); redrawSteps(); requestAnimationFrame(() => dialog.querySelector(`[data-step-title="${draft.steps.length - 1}"]`)?.focus()); };
    bindStepRows();
    dialog.querySelector("#taskForm").onsubmit = event => {
      event.preventDefault(); syncSteps();
      const title = dialog.querySelector("#taskTitleInput").value.trim();
      if (!title) return toast("Ajoute un titre à l’objectif.");
      const date = dialog.querySelector("#taskDeadline").value;
      const body = { ...draft, title, description: dialog.querySelector("#taskDescription").value.trim(), importance: Number(dialog.querySelector("input[name='importance']:checked").value), deadlineTs: date ? new Date(`${date}T18:00:00`).getTime() : 0, tags: [...dialog.querySelectorAll(".tag-checks input:checked")].map(input => input.value), steps: draft.steps.filter(step => step.title.trim()).map(step => ({ ...step, title: step.title.trim() })), updatedAt: Date.now() };
      if (existing) Object.assign(existing, body); else state.tasks.unshift(body);
      save(); dialog.close(); renderSection(); toast(existing ? "Objectif mis à jour" : "Objectif créé");
    };
    dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector("#taskTitleInput")?.focus());
  }

  function stepEditorRow(step, index) {
    return `<div class="step-editor-row"><span>${index + 1}</span><input data-step-title="${index}" value="${esc(step.title)}" placeholder="Ex. Réserver les billets"><button type="button" class="icon-btn" data-remove-step="${index}" aria-label="Retirer"><i class="bi bi-x-lg"></i></button></div>`;
  }

  function openNoteDialog(noteId = null) {
    const existing = noteId ? state.notes.find(note => note.id === noteId) : null;
    const draft = existing ? structuredClone(existing) : { ...normalizeNote({ id: uid(), content: "", color: "opal" }), title: "" };
    let savedNote = existing;
    window.NovaNoteWorkspace.open({
      id: draft.id,
      draftId: existing ? draft.id : "new",
      scope: "personal",
      label: "Mes notes",
      title: draft.title,
      content: draft.content,
      format: draft.format || "markdown",
      color: draft.color,
      autoSave: true,
      onSave: async value => {
        const body = { ...draft, ...value, updatedAt: Date.now() };
        if (savedNote) Object.assign(savedNote, body);
        else { savedNote = body; state.notes.unshift(savedNote); }
        save();
        if (!value.auto) { navigate("notes"); toast(existing ? "Note enregistrée" : "Note créée"); }
      }
    });
  }

  function openTagManager() {
    const dialog = document.getElementById("confirmDialog");
    const render = () => {
      dialog.innerHTML = `<div class="modal-content"><header class="modal-head"><div><span class="eyebrow">Organisation</span><h2>Étiquettes</h2></div><button class="icon-btn" data-close><i class="bi bi-x-lg"></i></button></header><div class="tag-manager"><div class="tag-list">${state.tags.length ? state.tags.map(tag => `<div><i style="--tag:${esc(tag.color || "#36bdb8")}"></i><span><strong>${esc(tag.name)}</strong><small>${esc(tag.description || "Sans description")}</small></span><button class="icon-btn danger" data-remove-tag="${esc(tag.id)}"><i class="bi bi-trash3"></i></button></div>`).join("") : '<p class="muted">Aucune étiquette pour l’instant.</p>'}</div><form id="newTagForm"><input id="newTagName" maxlength="32" placeholder="Nouvelle étiquette" required><input id="newTagColor" type="color" value="#36bdb8"><button class="primary" type="submit">Ajouter</button></form></div></div>`;
      dialog.querySelector("[data-close]").onclick = () => dialog.close();
      dialog.querySelector("#newTagForm").onsubmit = event => { event.preventDefault(); state.tags.push({ id: uid(), name: dialog.querySelector("#newTagName").value.trim(), color: dialog.querySelector("#newTagColor").value, description: "" }); save(); render(); };
      dialog.querySelectorAll("[data-remove-tag]").forEach(button => button.onclick = () => { state.tags = state.tags.filter(tag => tag.id !== button.dataset.removeTag); state.tasks.forEach(task => task.tags = task.tags.filter(id => id !== button.dataset.removeTag)); save(); render(); });
    };
    render(); dialog.showModal();
  }

  function openCommandPalette() {
    const dialog = document.getElementById("commandDialog");
    const features = [
      ["home", "Aujourd’hui", "Voir le tableau de bord", "bi-house"], ["tasks", "Mes objectifs", "Ouvrir la liste des objectifs", "bi-check2-square"], ["notes", "Mes notes", "Retrouver les notes personnelles", "bi-journal-text"], ["shared", "Espaces partagés", "Tâches, notes et membres", "bi-people"], ["stats", "Statistiques", "Voir les progrès", "bi-bar-chart"], ["profile", "Réglages", "Thème, profil et sauvegardes", "bi-sliders"], ["create-task", "Créer un objectif", "Ajouter rapidement une tâche", "bi-plus-square"], ["create-note", "Créer une note", "Ouvrir le mini éditeur", "bi-journal-plus"]
    ];
    dialog.innerHTML = `<div class="command-content"><label class="command-input"><i class="bi bi-search"></i><input id="commandInput" autocomplete="off" placeholder="Rechercher une fonction, un objectif ou une note…"><kbd>Esc</kbd></label><div id="commandResults" class="command-results"></div><footer><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span></footer></div>`;
    const input = dialog.querySelector("#commandInput");
    const results = dialog.querySelector("#commandResults");
    let activeIndex = 0;
    let current = [];
    const draw = () => {
      const query = input.value.trim().toLowerCase();
      const featureResults = features.filter(item => !query || `${item[1]} ${item[2]}`.toLowerCase().includes(query)).map(item => ({ type: "feature", id: item[0], title: item[1], copy: item[2], icon: item[3] }));
      const taskResults = state.tasks.filter(task => query && `${task.title} ${task.description}`.toLowerCase().includes(query)).slice(0, 5).map(task => ({ type: "task", id: task.id, title: task.title, copy: `Objectif · ${formatDate(task.deadlineTs, true)}`, icon: "bi-check2-square" }));
      const noteResults = state.notes.filter(note => query && `${note.title} ${note.content}`.toLowerCase().includes(query)).slice(0, 5).map(note => ({ type: "note", id: note.id, title: note.title, copy: "Note personnelle", icon: "bi-journal-text" }));
      current = [...featureResults.slice(0, query ? 5 : 8), ...taskResults, ...noteResults];
      activeIndex = Math.min(activeIndex, Math.max(0, current.length - 1));
      results.innerHTML = current.length ? current.map((item, index) => `<button class="${index === activeIndex ? "active" : ""}" data-command-index="${index}"><span><i class="bi ${item.icon}"></i></span><div><strong>${esc(item.title)}</strong><small>${esc(item.copy)}</small></div><i class="bi bi-arrow-return-left"></i></button>`).join("") : '<p class="command-empty">Aucun résultat.</p>';
      results.querySelectorAll("[data-command-index]").forEach(button => button.onclick = () => run(Number(button.dataset.commandIndex)));
    };
    const run = index => {
      const item = current[index]; if (!item) return;
      dialog.close();
      if (item.type === "task") { navigate("tasks"); return openTaskDialog(item.id); }
      if (item.type === "note") { navigate("notes"); return openNoteDialog(item.id); }
      if (item.id === "create-task") return openTaskDialog();
      if (item.id === "create-note") return openNoteDialog();
      navigate(item.id);
    };
    input.oninput = draw;
    input.onkeydown = event => { if (event.key === "ArrowDown") { event.preventDefault(); activeIndex = (activeIndex + 1) % Math.max(current.length, 1); draw(); } if (event.key === "ArrowUp") { event.preventDefault(); activeIndex = (activeIndex - 1 + Math.max(current.length, 1)) % Math.max(current.length, 1); draw(); } if (event.key === "Enter") { event.preventDefault(); run(activeIndex); } };
    draw(); dialog.showModal(); requestAnimationFrame(() => input.focus());
  }

  function confirmAction(title, copy) {
    return new Promise(resolve => {
      const dialog = document.getElementById("confirmDialog");
      dialog.innerHTML = `<div class="modal-content confirm-content"><span class="confirm-icon"><i class="bi bi-exclamation-lg"></i></span><h2>${esc(title)}</h2><p>${esc(copy)}</p><div class="modal-actions"><button class="secondary" data-answer="no">Annuler</button><button class="danger-button" data-answer="yes">Confirmer</button></div></div>`;
      const finish = answer => { dialog.close(); resolve(answer); };
      dialog.querySelector("[data-answer='no']").onclick = () => finish(false);
      dialog.querySelector("[data-answer='yes']").onclick = () => finish(true);
      dialog.oncancel = event => { event.preventDefault(); finish(false); };
      dialog.showModal();
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString(), novaVersion: 9 }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `nova-tasks-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href); toast("Sauvegarde exportée");
  }

  function importData(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.tasks)) throw new Error("format");
        if (!await confirmAction("Importer cette sauvegarde ?", "Les données locales actuelles seront remplacées. Les espaces partagés ne changent pas.")) return;
        parsed.syncUpdatedAt = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); location.reload();
      } catch { toast("Ce fichier n’est pas une sauvegarde Nova valide."); }
    };
    reader.readAsText(file);
  }

  function toggleQuickMenu() { document.getElementById("quickMenu").classList.toggle("hidden"); }
  function closeQuickMenu() { document.getElementById("quickMenu").classList.add("hidden"); }

  function mount() {
    applyTheme();
    document.querySelectorAll(".menu-btn[data-section]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.section)));
    document.getElementById("globalSearchBtn").onclick = openCommandPalette;
    document.getElementById("quickCreateBtn").onclick = event => { event.stopPropagation(); toggleQuickMenu(); };
    document.getElementById("mobileCreateBtn").onclick = event => { event.stopPropagation(); toggleQuickMenu(); };
    document.getElementById("quickMenu").querySelectorAll("[data-quick]").forEach(button => button.onclick = () => { const action = button.dataset.quick; closeQuickMenu(); if (action === "task") openTaskDialog(); if (action === "note") openNoteDialog(); if (action === "shared") navigate("shared"); });
    document.addEventListener("click", event => { if (!event.target.closest("#quickMenu,#quickCreateBtn,#mobileCreateBtn")) closeQuickMenu(); });
    document.addEventListener("keydown", event => {
      const field = event.target.matches?.("input,textarea,select") || event.target.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openCommandPalette(); }
      if (!field && event.key.toLowerCase() === "n") { event.preventDefault(); openTaskDialog(); }
    });
    document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));
    window.NovaApp = { navigate, openTask: openTaskDialog, openNote: openNoteDialog, openSearch: openCommandPalette, state, toast, getPersonalSnapshot, applyPersonalSnapshot };
    save({ notify: false, touch: false }); navigate("home");
    updateAccountIndicator();
  }

  window.addEventListener("nova:auth-state", event => {
    ui.account = event.detail || { status: "signed-out" };
    updateAccountIndicator();
    if (ui.section === "profile" && document.getElementById("profileSection")) renderProfile();
  });

  document.addEventListener("DOMContentLoaded", mount);
})();
