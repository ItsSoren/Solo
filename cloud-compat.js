// Chargé uniquement sous HTTP(S) par cloud-loader.js. Les identifiants Web Firebase sont publics.
const firebaseConfig = {
  apiKey: "AIzaSyBrO3HV9i-fpjgTW_gK2t2SHuBO-ktCyHU",
  authDomain: "novatasks-23d9d.firebaseapp.com",
  projectId: "novatasks-23d9d",
  storageBucket: "novatasks-23d9d.firebasestorage.app",
  messagingSenderId: "632042442618",
  appId: "1:632042442618:web:86b2c51935db4ccbca50c3"
};

const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(app);
const db = firebase.firestore(app);
const Timestamp = firebase.firestore.Timestamp;
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const collection = (source, ...parts) => source === db ? db.collection(parts.join("/")) : source.collection(parts.join("/"));
const doc = (source, ...parts) => source === db ? db.doc(parts.join("/")) : (parts.length ? source.doc(parts[0]) : source.doc());
const setDoc = (ref, data, options) => ref.set(data, options);
const addDoc = (ref, data) => ref.add(data);
const updateDoc = (ref, data) => ref.update(data);
const deleteDoc = ref => ref.delete();
const getDoc = async ref => { const snapshot = await ref.get(); return { id: snapshot.id, exists: () => snapshot.exists, data: () => snapshot.data(), ref: snapshot.ref }; };
const getDocs = ref => ref.get();
const writeBatch = () => db.batch();
const orderBy = (field, direction = "asc") => ({ type: "orderBy", field, direction });
const limit = count => ({ type: "limit", count });
const query = (ref, ...constraints) => constraints.reduce((current, item) => item.type === "orderBy" ? current.orderBy(item.field, item.direction) : current.limit(item.count), ref);
const onSnapshot = (ref, callback) => ref.onSnapshot(callback);
const onAuthStateChanged = (_, callback) => auth.onAuthStateChanged(callback);
const createUserWithEmailAndPassword = (_, email, password) => auth.createUserWithEmailAndPassword(email, password);
const signInWithEmailAndPassword = (_, email, password) => auth.signInWithEmailAndPassword(email, password);
const signOut = () => auth.signOut();
const updateProfile = (user, value) => user.updateProfile(value);
const root = document.getElementById("sharedSection");

const cloud = {
  user: null, workspaces: [], active: null, tasks: [], notes: [], activity: [],
  tab: "tasks", panel: null, busy: false, notice: "", pendingInvite: new URLSearchParams(location.search).get("invite")?.toUpperCase() || "",
  unsubs: []
};

const ICONS = { violet: "✦", mint: "◒", ember: "◆", sky: "☼" };
const ROLES = { admin: "Admin", member: "Membre", viewer: "Spectateur" };
const canEdit = () => ["admin", "member"].includes(cloud.active?.role);
const isAdmin = () => cloud.active?.role === "admin";
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
const dateText = (value) => value?.toDate ? value.toDate().toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "à l’instant";
const relativeTime = (value) => value?.toDate ? new Intl.RelativeTimeFormat("fr", { numeric: "auto" }).format(Math.round((value.toDate() - Date.now()) / 60000), "minute") : "à l’instant";
const activeRef = (path) => collection(db, "workspaces", cloud.active.id, path);

function flash(message, type = "") {
  cloud.notice = message;
  cloud.noticeType = type;
  render();
  window.clearTimeout(flash.timer);
  flash.timer = window.setTimeout(() => { cloud.notice = ""; render(); }, 3600);
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function stopWorkspaceListeners() {
  cloud.unsubs.forEach((unsubscribe) => unsubscribe());
  cloud.unsubs = [];
}

async function loadWorkspaces() {
  if (!cloud.user) return;
  const index = await getDocs(query(collection(db, "users", cloud.user.uid, "workspaces"), orderBy("updatedAt", "desc"), limit(24)));
  cloud.workspaces = index.docs.map(entry => ({ id: entry.id, ...entry.data() }));
  if (!cloud.active || !cloud.workspaces.some((space) => space.id === cloud.active.id)) {
    cloud.active = cloud.workspaces[0] || null;
    cloud.tasks = []; cloud.notes = []; cloud.activity = [];
  } else {
    cloud.active = cloud.workspaces.find((space) => space.id === cloud.active.id);
  }
  if (cloud.active) subscribeWorkspace();
  render();
}

function subscribeWorkspace() {
  stopWorkspaceListeners();
  if (!cloud.active) return;
  const workspaceId = cloud.active.id;
  cloud.unsubs.push(onSnapshot(query(collection(db, "workspaces", workspaceId, "tasks"), orderBy("updatedAt", "desc"), limit(100)), (snapshot) => {
    if (cloud.active?.id !== workspaceId) return;
    cloud.tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    render();
  }, friendlyError));
  cloud.unsubs.push(onSnapshot(query(collection(db, "workspaces", workspaceId, "notes"), orderBy("updatedAt", "desc"), limit(30)), (snapshot) => {
    if (cloud.active?.id !== workspaceId) return;
    cloud.notes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    render();
  }, friendlyError));
}

function friendlyError(error) {
  console.error("Nova shared", error);
  const permission = error.code === "permission-denied" || error.code === "firestore/permission-denied";
  flash(permission ? "Accès refusé : publie le fichier firestore.rules dans la console Firebase, puis réessaie." : "Connexion Firebase indisponible. Réessaie dans un instant.", "error");
}

function waitForNovaApp() {
  if (window.NovaApp?.getPersonalSnapshot) return Promise.resolve(window.NovaApp);
  return new Promise(resolve => window.addEventListener("DOMContentLoaded", () => resolve(window.NovaApp), { once: true }));
}

async function writePersonalState() {
  if (!cloud.user) return;
  const nova = await waitForNovaApp();
  const personalState = nova?.getPersonalSnapshot?.();
  if (!personalState) return;
  if (JSON.stringify(personalState).length > 850000) {
    nova.toast?.("Sauvegarde cloud trop volumineuse. Exporte tes données pour conserver une copie.");
    return;
  }
  await setDoc(doc(db, "users", cloud.user.uid), { personalState, personalStateUpdatedAt: serverTimestamp() }, { merge: true });
}

async function syncPersonalOnLogin() {
  const nova = await waitForNovaApp();
  if (!nova?.getPersonalSnapshot || !cloud.user) return;
  const userRef = doc(db, "users", cloud.user.uid);
  const userSnapshot = await getDoc(userRef);
  const local = nova.getPersonalSnapshot();
  const remote = userSnapshot.exists() ? userSnapshot.data().personalState : null;
  if (remote && Number(remote.updatedAt || 0) > Number(local.updatedAt || 0)) {
    nova.applyPersonalSnapshot(remote);
    nova.toast?.("Tes données Nova ont été retrouvées.");
  } else if (!remote || Number(local.updatedAt || 0) > Number(remote.updatedAt || 0)) {
    await writePersonalState();
  }
}

function emitAuth(status, user = null, message = "") {
  window.dispatchEvent(new CustomEvent("nova:auth-state", { detail: {
    status,
    uid: user?.uid || "",
    displayName: user?.displayName || "",
    email: user?.email || "",
    message
  } }));
}

function openAccount(mode = "login") {
  const dialog = document.getElementById("accountDialog");
  if (!dialog) return;
  const loginMode = mode !== "register";
  dialog.innerHTML = `<div class="account-modal"><button type="button" class="icon-btn account-close" aria-label="Fermer"><i class="bi bi-x-lg"></i></button><div class="nova-mini"><img src="assets/nova-mark.svg" alt=""><strong>Compte Nova</strong></div><span class="eyebrow">SAUVEGARDE PERSONNELLE</span><h2>${loginMode ? "Retrouve ton espace." : "Crée ton compte gratuit."}</h2><p>Un seul compte pour tes objectifs, tes notes, tes réglages et tes espaces partagés.</p><form id="globalAuthForm" class="nova-form">${loginMode ? "" : '<label>Nom affiché<input name="name" maxlength="40" autocomplete="name" placeholder="Ton prénom ou pseudo"></label>'}<label>E-mail<input name="email" type="email" required autocomplete="email"></label><label>Mot de passe<input name="password" type="password" required minlength="6" autocomplete="${loginMode ? "current-password" : "new-password"}"></label><p id="accountFormError" class="account-form-error" role="alert"></p><button class="nova-primary wide" type="submit">${loginMode ? "Se connecter" : "Créer mon compte"} <span>→</span></button></form><button type="button" class="auth-mode-switch">${loginMode ? "Pas encore de compte ? Créer mon compte" : "J’ai déjà un compte"}</button><small class="account-local-note"><i class="bi bi-shield-check"></i> Mode gratuit Spark · aucune image envoyée dans Firebase Storage</small></div>`;
  dialog.querySelector(".account-close").onclick = () => dialog.close();
  dialog.querySelector(".auth-mode-switch").onclick = () => openAccount(loginMode ? "register" : "login");
  dialog.querySelector("#globalAuthForm").onsubmit = loginMode ? login : register;
  if (!dialog.open) dialog.showModal();
}

function accountError(message) {
  const node = document.getElementById("accountFormError");
  if (node) node.textContent = message;
  else flash(message, "error");
}

window.NovaAccount = { available: true, open: openAccount, signOut: () => auth.signOut(), syncNow: writePersonalState };
window.addEventListener("nova:local-change", () => {
  if (!cloud.user) return;
  clearTimeout(writePersonalState.timer);
  writePersonalState.timer = setTimeout(() => writePersonalState().catch(friendlyError), 1500);
});

async function record(kind, text) {
  if (!cloud.active || !cloud.user) return;
  try {
    await addDoc(activeRef("activity"), { kind, text: String(text).slice(0, 140), authorId: cloud.user.uid, authorName: cloud.user.displayName || cloud.user.email?.split("@")[0] || "Membre", createdAt: serverTimestamp() });
  } catch (error) { console.warn("Activity not written", error); }
}

function showShared(visible) {
  root.classList.toggle("hidden", !visible);
  document.body.classList.toggle("shared-open", visible);
  if (visible) render();
}

function sharedShell() {
  if (!cloud.user) return `
    <div class="shared-landing nova-enter">
      <div class="shared-hero"><span class="eyebrow">NOVA COLLAB</span><h2>Organise ce qui compte,<br><em>ensemble.</em></h2><p>Un seul compte pour tes données personnelles et tes espaces privés, avec des rôles clairs et une synchronisation légère.</p><div class="shared-orbs" aria-hidden="true"><i></i><i></i><i></i></div></div>
      <div class="auth-card glass-panel"><div class="nova-mini"><img src="assets/nova-mark.svg" alt=""> <strong>Nova partagé</strong></div><h3>Entrer dans l’espace</h3><p class="muted">Crée un compte gratuit ou connecte-toi.</p>
        <form id="novaAuthForm" class="nova-form"><label>Pseudo<input name="name" maxlength="40" placeholder="Ton prénom ou pseudo"></label><label>E-mail<input name="email" type="email" required autocomplete="email" placeholder="toi@exemple.fr"></label><label>Mot de passe<input name="password" type="password" required minlength="6" autocomplete="current-password" placeholder="6 caractères minimum"></label><button class="nova-primary" type="submit">Créer mon compte <span>→</span></button></form>
        <p class="auth-switch">Déjà un compte ? <button type="button" data-cloud-action="toggle-login">Se connecter</button></p>
      </div>
    </div>`;
  if (cloud.panel === "login") return "";
  return `
    <div class="shared-layout nova-enter">
      <aside class="spaces-panel glass-panel">
        <div class="spaces-head"><div class="nova-mini"><img src="assets/nova-mark.svg" alt=""><strong>Nova collaboratif</strong></div><button class="icon-button" title="Se déconnecter" data-cloud-action="signout"><i class="bi bi-box-arrow-right"></i></button></div>
        <button class="nova-primary wide" data-cloud-action="open-create"><i class="bi bi-plus-lg"></i> Nouvel espace</button>
        <button class="nova-secondary wide" data-cloud-action="open-join"><i class="bi bi-link-45deg"></i> Rejoindre avec un code</button>
        <div class="spaces-list"><span class="list-label">TES ESPACES</span>${cloud.workspaces.length ? cloud.workspaces.map(space => `<button class="space-item ${cloud.active?.id === space.id ? "active" : ""}" data-space-id="${space.id}"><span class="space-icon ${esc(space.color || "violet")}">${ICONS[space.color] || "✦"}</span><span><strong>${esc(space.title)}</strong><small>${ROLES[space.role]}</small></span></button>`).join("") : `<p class="empty-side">Ton premier espace partagé commence ici.</p>`}</div>
        <div class="account-chip"><span>${esc((cloud.user.displayName || cloud.user.email || "N").slice(0, 1).toUpperCase())}</span><div><strong>${esc(cloud.user.displayName || "Nova membre")}</strong><small>${esc(cloud.user.email || "")}</small></div></div>
      </aside>
      <div class="shared-work">${cloud.active ? workspaceView() : emptyWorkspace()}</div>
    </div>`;
}

function emptyWorkspace() {
  return `<div class="shared-empty"><img src="assets/nova-mark.svg" alt=""><h2>Un espace pour chaque élan.</h2><p>Crée un espace pour ton équipe, ta classe ou ton projet, puis partage un lien d’invitation.</p><button class="nova-primary" data-cloud-action="open-create">Créer un espace <span>→</span></button></div>`;
}

function workspaceView() {
  const space = cloud.active;
  const done = cloud.tasks.filter(task => task.status === "done").length;
  const open = cloud.tasks.length - done;
  return `
    <header class="workspace-head"><div><div class="workspace-kicker"><span class="space-icon ${esc(space.color || "violet")}">${ICONS[space.color] || "✦"}</span> ${ROLES[space.role]}</div><h1>${esc(space.title)}</h1><p>${esc(space.description || "Un espace partagé Nova.")}</p></div><div class="workspace-actions"><button class="nova-secondary" data-cloud-action="copy-invite"><i class="bi bi-link-45deg"></i> Inviter</button>${isAdmin() ? `<button class="icon-button" title="Gérer les invitations" data-cloud-action="open-invite"><i class="bi bi-person-plus"></i></button>` : ""}</div></header>
    <div class="shared-metrics"><div><span>À faire</span><strong>${open}</strong></div><div><span>Terminées</span><strong>${done}</strong></div><div><span>Progression</span><strong>${cloud.tasks.length ? Math.round(done / cloud.tasks.length * 100) : 0}%</strong></div></div>
    <nav class="shared-tabs"><button class="${cloud.tab === "tasks" ? "active" : ""}" data-cloud-tab="tasks"><i class="bi bi-check2-square"></i> Tâches</button><button class="${cloud.tab === "notes" ? "active" : ""}" data-cloud-tab="notes"><i class="bi bi-journal-text"></i> Notes</button><button class="${cloud.tab === "members" ? "active" : ""}" data-cloud-tab="members"><i class="bi bi-people"></i> Membres</button><button class="${cloud.tab === "activity" ? "active" : ""}" data-cloud-tab="activity"><i class="bi bi-activity"></i> Historique</button></nav>
    <div class="shared-content">${cloud.tab === "tasks" ? tasksView() : cloud.tab === "notes" ? notesView() : cloud.tab === "members" ? membersView() : activityView()}</div>
    ${cloud.panel ? panelView() : ""}`;
}

function tasksView() {
  const tasks = [...cloud.tasks].sort((a, b) => (a.status === "done") - (b.status === "done") || (b.priority || 1) - (a.priority || 1));
  return `<section class="collab-section"><div class="section-title"><div><h2>Objectifs partagés</h2><p>Une seule liste, visible par les membres de cet espace.</p></div>${canEdit() ? `<button class="nova-primary" data-cloud-action="open-task"><i class="bi bi-plus-lg"></i> Ajouter</button>` : `<span class="read-only"><i class="bi bi-eye"></i> Lecture seule</span>`}</div>${tasks.length ? `<div class="collab-task-list">${tasks.map(task => `<article class="collab-task ${task.status === "done" ? "done" : ""}"><button class="task-check" data-task-toggle="${task.id}" ${canEdit() ? "" : "disabled"} aria-label="Changer l’état">${task.status === "done" ? "✓" : ""}</button><div class="task-copy"><div><span class="priority-dot p${task.priority || 1}"></span><strong>${esc(task.title)}</strong></div>${task.description ? `<p>${esc(task.description)}</p>` : ""}<small>${task.dueDate ? `Échéance ${esc(task.dueDate)} · ` : ""}par ${esc(task.createdByName || "un membre")}</small></div>${canEdit() ? `<div class="task-menu"><button class="icon-button" data-task-edit="${task.id}" title="Modifier"><i class="bi bi-pencil"></i></button><button class="icon-button danger-icon" data-task-delete="${task.id}" title="Supprimer"><i class="bi bi-trash3"></i></button></div>` : ""}</article>`).join("")}</div>` : `<div class="shared-placeholder"><i class="bi bi-stars"></i><h3>Le tableau est prêt.</h3><p>Ajoute le premier objectif de votre espace.</p>${canEdit() ? `<button class="nova-secondary" data-cloud-action="open-task">Créer une tâche</button>` : ""}</div>`}</section>`;
}

function notesView() {
  const preview = content => window.NovaRichEditor.plainText(content || "");
  return `<section class="collab-section"><div class="section-title"><div><h2>Notes partagées</h2><p>Mini éditeur complet, avec une seule écriture Firebase au moment d’enregistrer.</p></div>${canEdit() ? `<button class="nova-primary" data-cloud-action="open-note"><i class="bi bi-plus-lg"></i> Nouvelle note</button>` : `<span class="read-only"><i class="bi bi-eye"></i> Lecture seule</span>`}</div>${cloud.notes.length ? `<div class="notes-grid">${cloud.notes.map(note => `<article class="note-card"><div class="note-card-top"><span class="note-spark"><i class="bi bi-journal-text"></i></span><small>${relativeTime(note.updatedAt)}</small></div><h3>${esc(note.title)}</h3><p>${esc(preview(note.content).slice(0, 210) || "Note vide")}${preview(note.content).length > 210 ? "…" : ""}</p>${note.linkUrl ? `<a href="${esc(note.linkUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right"></i> Ressource liée</a>` : ""}<footer><span>${esc(note.updatedByName || note.createdByName || "Membre")}</span>${canEdit() ? `<button class="text-button" data-note-edit="${note.id}">Ouvrir l’éditeur</button>` : ""}</footer></article>`).join("")}</div>` : `<div class="shared-placeholder"><i class="bi bi-journal-text"></i><h3>Une page blanche, à plusieurs.</h3><p>Crée une note, une checklist ou un brief. Les images restent des liens externes pour conserver Firebase Spark.</p>${canEdit() ? `<button class="nova-secondary" data-cloud-action="open-note">Écrire une note</button>` : ""}</div>`}</section>`;
}

function membersView() {
  return `<section class="collab-section"><div class="section-title"><div><h2>Membres</h2><p>Les rôles sont vérifiés par Firestore, pas seulement par l’interface.</p></div>${isAdmin() ? `<button class="nova-primary" data-cloud-action="open-invite"><i class="bi bi-person-plus"></i> Inviter</button>` : ""}</div><div id="membersMount" class="members-list"><p class="muted">Chargement des membres…</p></div></section>`;
}

function activityView() {
  return `<section class="collab-section"><div class="section-title"><div><h2>Historique léger</h2><p>Les 25 dernières actions importantes, sans journaliser chaque frappe.</p></div><button class="nova-secondary" data-cloud-action="load-activity"><i class="bi bi-arrow-clockwise"></i> Actualiser</button></div><div class="activity-list">${cloud.activity.length ? cloud.activity.map(item => `<div class="activity-row"><span class="activity-dot"></span><div><strong>${esc(item.authorName || "Membre")}</strong> ${esc(item.text || "a mis à jour l’espace")}<small>${relativeTime(item.createdAt)}</small></div></div>`).join("") : `<div class="shared-placeholder compact"><i class="bi bi-clock-history"></i><p>Charge l’historique seulement quand tu en as besoin.</p></div>`}</div></section>`;
}

function panelView() {
  if (cloud.panel === "create") return modal("Nouvel espace", `<form id="createSpaceForm" class="nova-form"><label>Nom de l’espace<input required name="title" maxlength="60" placeholder="Ex. Projet de groupe"></label><label>Description <span class="optional">facultatif</span><textarea name="description" maxlength="240" placeholder="À quoi sert cet espace ?"></textarea></label><label>Couleur <select name="color"><option value="violet">Nova violet</option><option value="mint">Mint</option><option value="ember">Ember</option><option value="sky">Sky</option></select></label><button class="nova-primary" type="submit">Créer l’espace <span>→</span></button></form>`);
  if (cloud.panel === "join") return modal("Rejoindre un espace", `<form id="joinSpaceForm" class="nova-form"><p class="modal-intro">Colle le code reçu ou ouvre directement le lien d’invitation.</p><label>Code d’invitation<input required name="code" value="${esc(cloud.pendingInvite)}" maxlength="12" autocapitalize="characters" placeholder="ABC123XYZ789"></label><button class="nova-primary" type="submit">Rejoindre <span>→</span></button></form>`);
  if (cloud.panel === "invite") return modal("Inviter des personnes", `<form id="inviteForm" class="nova-form"><p class="modal-intro">Le lien ne donne accès qu’aux personnes connectées et expire automatiquement après 7 jours.</p><label>Rôle à l’arrivée<select name="role"><option value="member">Membre — peut contribuer</option><option value="viewer">Spectateur — lecture seule</option></select></label><button class="nova-primary" type="submit">Créer un lien d’invitation <span>→</span></button></form>`);
  if (cloud.panel === "task") {
    const task = cloud.editingTask || {};
    return modal(task.id ? "Modifier la tâche" : "Nouvel objectif", `<form id="taskForm" class="nova-form"><label>Titre<input name="title" required maxlength="100" value="${esc(task.title || "")}" placeholder="Ex. Préparer la présentation"></label><label>Description <span class="optional">facultatif</span><textarea name="description" maxlength="600" placeholder="Contexte, étapes, détail…">${esc(task.description || "")}</textarea></label><div class="form-split"><label>Priorité<select name="priority"><option value="1" ${task.priority == 1 ? "selected" : ""}>Normale</option><option value="2" ${task.priority == 2 ? "selected" : ""}>Importante</option><option value="3" ${task.priority == 3 ? "selected" : ""}>Urgente</option></select></label><label>Échéance<input name="dueDate" type="date" value="${esc(task.dueDate || "")}"></label></div><button class="nova-primary" type="submit">${task.id ? "Enregistrer" : "Ajouter la tâche"} <span>→</span></button></form>`);
  }
  if (cloud.panel === "note") {
    const note = cloud.editingNote || {};
    return modal(note.id ? "Modifier la note" : "Nouvelle note", `<form id="noteForm" class="nova-form shared-note-editor"><label>Titre<input name="title" required maxlength="100" value="${esc(note.title || "")}" placeholder="Ex. Compte-rendu du lundi"></label><div class="mini-editor">${window.NovaEditor.toolbar()}<div class="editor-work"><textarea name="content" required maxlength="12000" placeholder="Écris ici…\n\n- [ ] Une chose à faire\n**Une idée importante**">${esc(note.content || "")}</textarea><div id="sharedNotePreview" class="editor-preview"></div></div></div><label>Lien externe <span class="optional">facultatif · image, document, référence</span><input name="linkUrl" type="url" value="${esc(note.linkUrl || "")}" placeholder="https://…"></label><div class="shared-note-save"><span><i class="bi bi-cloud-check"></i> Une seule écriture au clic</span><button class="nova-primary" type="submit">Enregistrer la note <i class="bi bi-check2"></i></button></div></form>`);
  }
  return "";
}

function modal(title, content) { return `<div class="nova-modal-backdrop" data-cloud-action="close-panel"><div class="nova-modal glass-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}" onclick="event.stopPropagation()"><div class="modal-head"><h2>${esc(title)}</h2><button class="icon-button" data-cloud-action="close-panel" aria-label="Fermer"><i class="bi bi-x-lg"></i></button></div>${content}</div></div>`; }

function render() {
  if (!root || root.classList.contains("hidden")) return;
  root.innerHTML = `${cloud.notice ? `<div class="cloud-notice ${cloud.noticeType || ""}">${esc(cloud.notice)}</div>` : ""}${sharedShell()}`;
  bind();
  if (cloud.user && cloud.active && cloud.tab === "members") loadMembers();
}

function bind() {
  root.querySelectorAll("[data-space-id]").forEach(button => button.onclick = () => selectWorkspace(button.dataset.spaceId));
  root.querySelectorAll("[data-cloud-tab]").forEach(button => button.onclick = () => { cloud.tab = button.dataset.cloudTab; render(); });
  root.querySelectorAll("[data-cloud-action]").forEach(button => button.addEventListener("click", () => action(button.dataset.cloudAction)));
  root.querySelectorAll("[data-task-toggle]").forEach(button => button.onclick = () => toggleTask(button.dataset.taskToggle));
  root.querySelectorAll("[data-task-edit]").forEach(button => button.onclick = () => { cloud.editingTask = cloud.tasks.find(task => task.id === button.dataset.taskEdit); cloud.panel = "task"; render(); });
  root.querySelectorAll("[data-task-delete]").forEach(button => button.onclick = () => deleteTask(button.dataset.taskDelete));
  root.querySelectorAll("[data-note-edit]").forEach(button => button.onclick = () => openSharedNote(cloud.notes.find(note => note.id === button.dataset.noteEdit)));
  root.querySelector("#novaAuthForm")?.addEventListener("submit", register);
  root.querySelector("#createSpaceForm")?.addEventListener("submit", createWorkspace);
  root.querySelector("#joinSpaceForm")?.addEventListener("submit", joinWorkspace);
  root.querySelector("#inviteForm")?.addEventListener("submit", createInvite);
  root.querySelector("#taskForm")?.addEventListener("submit", saveTask);
  root.querySelector("#noteForm")?.addEventListener("submit", saveNote);
  const sharedNoteForm = root.querySelector("#noteForm.shared-note-editor");
  if (sharedNoteForm) window.NovaEditor.bind(sharedNoteForm, sharedNoteForm.querySelector("textarea[name='content']"), sharedNoteForm.querySelector("#sharedNotePreview"));
}

async function action(name) {
  if (name === "toggle-login") return renderLogin();
  if (name === "signout") return signOut(auth);
  if (name === "open-create") { cloud.panel = "create"; return render(); }
  if (name === "open-join") { cloud.panel = "join"; return render(); }
  if (name === "open-invite") { cloud.panel = "invite"; return render(); }
  if (name === "open-task") { cloud.editingTask = null; cloud.panel = "task"; return render(); }
  if (name === "open-note") return openSharedNote();
  if (name === "close-panel") { cloud.panel = null; cloud.editingTask = null; cloud.editingNote = null; return render(); }
  if (name === "copy-invite") return copyInvite();
  if (name === "load-activity") return loadActivity();
}

function renderLogin() {
  root.innerHTML = `<div class="shared-landing nova-enter"><div class="shared-hero"><span class="eyebrow">NOVA COLLAB</span><h2>Bon retour dans<br><em>la constellation.</em></h2><p>Retrouve tes objectifs, tes notes, tes réglages et les espaces que tu partages.</p><div class="shared-orbs" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="auth-card glass-panel"><div class="nova-mini"><img src="assets/nova-mark.svg" alt=""> <strong>Compte Nova</strong></div><h3>Se connecter</h3><form id="novaLoginForm" class="nova-form"><label>E-mail<input name="email" type="email" required autocomplete="email"></label><label>Mot de passe<input name="password" type="password" required autocomplete="current-password"></label><button class="nova-primary" type="submit">Continuer <span>→</span></button></form><p class="auth-switch">Pas encore de compte ? <button type="button" data-cloud-action="back-register">Créer mon compte</button></p></div></div>`;
  root.querySelector("#novaLoginForm").addEventListener("submit", login);
  root.querySelector("[data-cloud-action='back-register']").onclick = () => { cloud.panel = null; render(); };
}

async function register(event) {
  event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") || "").trim();
  try { const credential = await createUserWithEmailAndPassword(auth, data.get("email"), data.get("password")); await updateProfile(credential.user, { displayName: name || "Membre Nova" }); await setDoc(doc(db, "users", credential.user.uid), { displayName: name || "Membre Nova", email: credential.user.email, createdAt: serverTimestamp() }, { merge: true }); }
  catch (error) { accountError(error.code === "auth/email-already-in-use" ? "Cette adresse possède déjà un compte. Connecte-toi." : "Impossible de créer le compte : vérifie les informations."); }
}
async function login(event) { event.preventDefault(); const data = new FormData(event.currentTarget); try { await signInWithEmailAndPassword(auth, data.get("email"), data.get("password")); } catch { accountError("E-mail ou mot de passe incorrect."); } }

async function createWorkspace(event) {
  event.preventDefault(); const data = new FormData(event.currentTarget); const workspace = doc(collection(db, "workspaces")); const member = doc(db, "workspaces", workspace.id, "members", cloud.user.uid); const index = doc(db, "users", cloud.user.uid, "workspaces", workspace.id); const title = String(data.get("title")).trim();
  try { const description = String(data.get("description") || "").trim(); const batch = writeBatch(db); batch.set(workspace, { title, description, color: data.get("color"), ownerId: cloud.user.uid, memberCount: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); batch.set(member, { uid: cloud.user.uid, role: "admin", displayName: cloud.user.displayName || "Membre Nova", email: cloud.user.email || "", joinedAt: serverTimestamp() }); batch.set(index, { workspaceId: workspace.id, title, description, color: data.get("color"), ownerId: cloud.user.uid, role: "admin", updatedAt: serverTimestamp() }); await batch.commit(); cloud.panel = null; await loadWorkspaces(); cloud.active = cloud.workspaces.find(space => space.id === workspace.id) || cloud.active; cloud.tab = "tasks"; subscribeWorkspace(); await record("workspace", "a créé l’espace"); flash("Espace créé. Tu peux maintenant inviter ton équipe."); }
  catch (error) { console.error(error); friendlyError(error); }
}

async function joinWorkspace(event) {
  event.preventDefault(); const code = String(new FormData(event.currentTarget).get("code") || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  try {
    const inviteRef = doc(db, "invites", code);
    const invite = await getDoc(inviteRef);
    if (!invite.exists() || invite.data().expiresAt?.toDate() < new Date()) throw new Error("invite-invalid");
    const info = invite.data();
    const membership = doc(db, "workspaces", info.workspaceId, "members", cloud.user.uid);
    if ((await getDoc(membership)).exists()) { cloud.panel = null; await loadWorkspaces(); flash("Tu fais déjà partie de cet espace."); return; }
    const userIndex = doc(db, "users", cloud.user.uid, "workspaces", info.workspaceId);
    const batch = writeBatch(db);
    batch.set(membership, { uid: cloud.user.uid, role: info.role, displayName: cloud.user.displayName || "Membre Nova", email: cloud.user.email || "", inviteCode: code, joinedAt: serverTimestamp() });
    batch.set(userIndex, { workspaceId: info.workspaceId, title: info.workspaceTitle || "Espace partagé", color: info.workspaceColor || "violet", role: info.role, updatedAt: serverTimestamp() });
    await batch.commit();
    // Compatibilité avec les anciens liens : la lecture devient autorisée après la création du rôle.
    if (!info.workspaceTitle) {
      const workspace = await getDoc(doc(db, "workspaces", info.workspaceId));
      if (workspace.exists()) await setDoc(userIndex, { title: workspace.data().title || "Espace partagé", color: workspace.data().color || "violet", updatedAt: serverTimestamp() }, { merge: true });
    }
    cloud.pendingInvite = ""; cloud.panel = null; history.replaceState({}, "", location.pathname); await loadWorkspaces(); cloud.active = cloud.workspaces.find(space => space.id === info.workspaceId) || cloud.active; subscribeWorkspace(); await record("member", "a rejoint l’espace"); flash("Bienvenue dans l’espace partagé !");
  }
  catch (error) { console.error(error); flash("Ce lien est invalide, expiré ou déjà utilisé.", "error"); }
}

async function createInvite(event) {
  event.preventDefault(); const role = new FormData(event.currentTarget).get("role"); const code = randomCode();
  try { await setDoc(doc(db, "invites", code), { workspaceId: cloud.active.id, workspaceTitle: cloud.active.title || "Espace partagé", workspaceColor: cloud.active.color || "violet", role, createdBy: cloud.user.uid, createdAt: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)) }); cloud.panel = null; await record("invite", "a créé un lien d’invitation"); const link = `${location.href.split("?")[0]}?invite=${code}`; await copyText(link); flash(`Lien créé : ${code} — copié dans le presse-papiers.`); }
  catch (error) { console.error(error); friendlyError(error); }
}

async function copyInvite() { if (!cloud.active) return; if (!isAdmin()) return flash("Seul un admin peut créer un lien d’invitation."); cloud.panel = "invite"; render(); }
async function copyText(value) { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value); const input = document.createElement("textarea"); input.value = value; document.body.append(input); input.select(); document.execCommand("copy"); input.remove(); }

async function saveTask(event) {
  event.preventDefault(); const data = new FormData(event.currentTarget); const editing = cloud.editingTask; const body = { title: String(data.get("title")).trim(), description: String(data.get("description") || "").trim(), priority: Number(data.get("priority")), dueDate: String(data.get("dueDate") || ""), updatedAt: serverTimestamp(), updatedBy: cloud.user.uid, updatedByName: cloud.user.displayName || "Membre Nova" };
  try { if (editing?.id) { await updateDoc(doc(db, "workspaces", cloud.active.id, "tasks", editing.id), body); if (editing.status !== "done" && body.status === "done") await record("task-done", `a terminé « ${body.title} »`); } else { await addDoc(activeRef("tasks"), { ...body, status: "open", createdBy: cloud.user.uid, createdByName: cloud.user.displayName || "Membre Nova", createdAt: serverTimestamp() }); await record("task-created", `a ajouté « ${body.title} »`); } cloud.panel = null; cloud.editingTask = null; render(); }
  catch (error) { friendlyError(error); }
}

async function toggleTask(id) {
  if (!canEdit()) return; const task = cloud.tasks.find(item => item.id === id); if (!task) return; const status = task.status === "done" ? "open" : "done";
  try { await updateDoc(doc(db, "workspaces", cloud.active.id, "tasks", id), { status, updatedAt: serverTimestamp(), updatedBy: cloud.user.uid, updatedByName: cloud.user.displayName || "Membre Nova" }); if (status === "done") await record("task-done", `a terminé « ${task.title} »`); }
  catch (error) { friendlyError(error); }
}
async function deleteTask(id) { const task = cloud.tasks.find(item => item.id === id); if (!task || !confirm(`Supprimer « ${task.title} » ?`)) return; try { await deleteDoc(doc(db, "workspaces", cloud.active.id, "tasks", id)); } catch (error) { friendlyError(error); } }

async function saveNote(event) {
  event.preventDefault(); const data = new FormData(event.currentTarget); const editing = cloud.editingNote; const url = String(data.get("linkUrl") || "").trim(); const body = { title: String(data.get("title")).trim(), content: String(data.get("content")).trim(), linkUrl: /^https?:\/\//i.test(url) ? url : "", updatedAt: serverTimestamp(), updatedBy: cloud.user.uid, updatedByName: cloud.user.displayName || "Membre Nova" };
  try { if (editing?.id) await updateDoc(doc(db, "workspaces", cloud.active.id, "notes", editing.id), body); else await addDoc(activeRef("notes"), { ...body, createdBy: cloud.user.uid, createdByName: cloud.user.displayName || "Membre Nova", createdAt: serverTimestamp() }); await record("note-saved", `a sauvegardé « ${body.title} »`); cloud.panel = null; cloud.editingNote = null; render(); }
  catch (error) { friendlyError(error); }
}

function openSharedNote(note = null) {
  if (!cloud.active || !canEdit()) return;
  window.NovaNoteWorkspace.open({
    id: note?.id || "new",
    scope: `shared_${cloud.active.id}`,
    label: cloud.active.title || "Espace partagé",
    shared: true,
    title: note?.title || "",
    content: note?.content || "",
    format: note?.format || "markdown",
    color: note?.color || "opal",
    onSave: async value => {
      const body = { ...value, linkUrl: note?.linkUrl || "", updatedAt: serverTimestamp(), updatedBy: cloud.user.uid, updatedByName: cloud.user.displayName || "Membre Nova" };
      try {
        if (note?.id) await updateDoc(doc(db, "workspaces", cloud.active.id, "notes", note.id), body);
        else await addDoc(activeRef("notes"), { ...body, createdBy: cloud.user.uid, createdByName: cloud.user.displayName || "Membre Nova", createdAt: serverTimestamp() });
        await record("note-saved", `a sauvegardé « ${body.title} »`);
        render();
      } catch (error) {
        friendlyError(error);
        throw error;
      }
    }
  });
}

async function selectWorkspace(id) { const selected = cloud.workspaces.find(space => space.id === id); if (!selected || cloud.active?.id === id) return; cloud.active = selected; cloud.tasks = []; cloud.notes = []; cloud.activity = []; cloud.tab = "tasks"; subscribeWorkspace(); render(); }
async function loadMembers() { const mount = root.querySelector("#membersMount"); if (!mount || !cloud.active) return; try { if (!cloud.active.ownerId && isAdmin()) { const workspace = await getDoc(doc(db, "workspaces", cloud.active.id)); if (workspace.exists()) cloud.active.ownerId = workspace.data().ownerId || ""; } const members = await getDocs(query(activeRef("members"), orderBy("joinedAt", "asc"), limit(50))); if (!root.querySelector("#membersMount")) return; mount.innerHTML = members.docs.map(item => { const member = { id: item.id, ...item.data() }; return `<article class="member-row"><span class="member-avatar">${esc((member.displayName || member.email || "N")[0].toUpperCase())}</span><div><strong>${esc(member.displayName || "Membre Nova")}</strong><small>${esc(member.email || "")} · arrivé ${dateText(member.joinedAt)}</small></div><div class="member-role">${isAdmin() && member.uid !== cloud.active.ownerId ? `<select data-member-role="${member.id}">${Object.entries(ROLES).map(([key, label]) => `<option value="${key}" ${member.role === key ? "selected" : ""}>${label}</option>`).join("")}</select><button class="icon-button danger-icon" data-member-remove="${member.id}" title="Retirer"><i class="bi bi-person-dash"></i></button>` : `<span>${ROLES[member.role]}</span>`}</div></article>`; }).join(""); mount.querySelectorAll("[data-member-role]").forEach(select => select.onchange = () => changeRole(select.dataset.memberRole, select.value)); mount.querySelectorAll("[data-member-remove]").forEach(button => button.onclick = () => removeMember(button.dataset.memberRemove)); } catch (error) { mount.innerHTML = `<p class="muted">Impossible de charger les membres.</p>`; console.error(error); } }
async function changeRole(userId, role) { try { const batch = writeBatch(db); batch.update(doc(db, "workspaces", cloud.active.id, "members", userId), { role }); batch.set(doc(db, "users", userId, "workspaces", cloud.active.id), { role, updatedAt: serverTimestamp() }, { merge: true }); await batch.commit(); await record("member", "a modifié un rôle membre"); loadMembers(); } catch (error) { friendlyError(error); } }
async function removeMember(userId) { if (!confirm("Retirer cette personne de l’espace ?")) return; try { const batch = writeBatch(db); batch.delete(doc(db, "workspaces", cloud.active.id, "members", userId)); batch.delete(doc(db, "users", userId, "workspaces", cloud.active.id)); await batch.commit(); await record("member", "a retiré un membre"); loadMembers(); } catch (error) { friendlyError(error); } }
async function loadActivity() { if (!cloud.active) return; try { const items = await getDocs(query(activeRef("activity"), orderBy("createdAt", "desc"), limit(25))); cloud.activity = items.docs.map(item => ({ id: item.id, ...item.data() })); render(); } catch (error) { friendlyError(error); } }

document.querySelectorAll(".menu-btn").forEach(button => button.addEventListener("click", () => showShared(button.dataset.section === "shared")));
onAuthStateChanged(auth, async (user) => {
  stopWorkspaceListeners();
  cloud.user = user; cloud.workspaces = []; cloud.active = null; cloud.tasks = []; cloud.notes = []; cloud.activity = [];
  emitAuth(user ? "signed-in" : "signed-out", user);
  if (user) {
    document.getElementById("accountDialog")?.close();
    try {
      await setDoc(doc(db, "users", user.uid), { displayName: user.displayName || "Membre Nova", email: user.email || "", lastSeenAt: serverTimestamp() }, { merge: true });
      await syncPersonalOnLogin();
      await loadWorkspaces();
    } catch (error) { friendlyError(error); }
  }
  render();
});
