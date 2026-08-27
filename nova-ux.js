(() => {
  const TUTORIAL_KEY = "nova_tasks_tutorial_v9_seen";
  const STARTUP_KEY = "solo_startup_choice_v1";
  const STORAGE_KEY = "nova_tasks_v5";
  const storageGet = key => { try { return globalThis.localStorage?.getItem(key) || ""; } catch { return ""; } };
  const storageSet = (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch {} };
  const steps = [
    { icon: "bi-house-heart", eyebrow: "1 sur 3 · AUJOURD’HUI", title: "L’essentiel, dès l’ouverture.", text: "Sōlo te montre le prochain objectif, les échéances proches et tes notes rapides sans surcharger l’écran." },
    { icon: "bi-check2-square", eyebrow: "2 sur 3 · OBJECTIFS & NOTES", title: "Écris vite, organise ensuite.", text: "Crée un objectif simple ou ouvre une note en plein écran pour ajouter titres, listes, liens et cases à cocher." },
    { icon: "bi-people", eyebrow: "3 sur 3 · COMPTE & PARTAGE", title: "Local ou synchronisé, à toi de choisir.", text: "Sōlo fonctionne sans compte. Connecte-toi pour retrouver tes données personnelles et collaborer dans des espaces privés." }
  ];
  let index = 0;
  let tutorialAfterAuth = false;

  function localSummary() {
    try {
      const state = JSON.parse(storageGet(STORAGE_KEY) || "{}");
      const tasks = Array.isArray(state.tasks) ? state.tasks.length : 0;
      const notes = Array.isArray(state.notes) ? state.notes.length : 0;
      const hasProfile = Boolean(state.profile?.name);
      return { tasks, notes, hasData: tasks > 0 || notes > 0 || hasProfile };
    } catch { return { tasks: 0, notes: 0, hasData: false }; }
  }

  function openTutorialSoon() {
    if (!storageGet(TUTORIAL_KEY)) window.setTimeout(open, 220);
  }

  function requestLogin() {
    tutorialAfterAuth = true;
    storageSet(STARTUP_KEY, "account");
    const account = window.NovaAccount;
    if (account?.open) account.open("login");
    else if (account?.openOnline) { account.openOnline(); openTutorialSoon(); }
    else {
      window.__soloPendingAuth = true;
      window.dispatchEvent(new CustomEvent("nova:request-auth", { detail: { mode: "login" } }));
    }
  }

  function ensureWelcomeDialog() {
    let dialog = document.getElementById("soloWelcome");
    if (dialog) return dialog;
    const summary = localSummary();
    dialog = document.createElement("dialog");
    dialog.id = "soloWelcome";
    dialog.className = "welcome-dialog";
    dialog.innerHTML = `<div class="welcome-card"><span class="welcome-mark"><img src="assets/solo-mark-opal.png" alt=""></span><span class="eyebrow">BIENVENUE DANS SŌLO</span><h2>Ton espace, à ton rythme.</h2><p>Tu peux commencer tout de suite, ou te connecter pour retrouver tes objectifs et tes notes sur tous tes appareils.</p>${summary.hasData ? `<div class="welcome-warning"><i class="bi bi-shield-exclamation"></i><span>Tu as déjà des informations enregistrées sur cet appareil. Elles resteront locales tant que tu n’auras pas choisi comment les synchroniser.</span></div>` : `<div class="welcome-warning soft"><i class="bi bi-info-circle"></i><span>Sans connexion, tes données restent uniquement sur cet appareil.</span></div>`}<div class="welcome-actions"><button type="button" class="primary" id="welcomeLogin"><i class="bi bi-cloud-arrow-up"></i> Se connecter</button><button type="button" class="secondary" id="welcomeOffline"><i class="bi bi-phone"></i> Continuer hors ligne</button></div><small>Tu pourras changer d’avis depuis Profil &amp; réglages.</small></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("#welcomeLogin").onclick = () => { dialog.close(); requestLogin(); };
    dialog.querySelector("#welcomeOffline").onclick = () => { storageSet(STARTUP_KEY, "offline"); dialog.close(); openTutorialSoon(); };
    dialog.addEventListener("cancel", event => { event.preventDefault(); storageSet(STARTUP_KEY, "offline"); dialog.close(); openTutorialSoon(); });
    return dialog;
  }

  function openWelcome() {
    const dialog = ensureWelcomeDialog();
    if (!dialog.open) dialog.showModal();
  }

  function ensureDialog() {
    let dialog = document.getElementById("novaTutorial");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "novaTutorial";
    dialog.className = "tutorial-dialog";
    dialog.innerHTML = `<div class="tutorial-card"><button class="icon-btn tutorial-close" type="button" aria-label="Passer"><i class="bi bi-x-lg"></i></button><div class="tutorial-art"><div><span class="tutorial-orb"><i id="tutorialIcon" class="bi"></i></span><i></i><i></i><i></i></div></div><div class="tutorial-copy"><span id="tutorialEyebrow" class="eyebrow"></span><h2 id="tutorialTitle"></h2><p id="tutorialText"></p><div class="tutorial-bottom"><div id="tutorialDots" class="tutorial-dots"></div><div><button type="button" id="tutorialSkip" class="secondary">Passer</button><button type="button" id="tutorialNext" class="primary">Continuer <i class="bi bi-arrow-right"></i></button></div></div></div></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".tutorial-close").onclick = close;
    dialog.querySelector("#tutorialSkip").onclick = close;
    dialog.querySelector("#tutorialNext").onclick = () => index < steps.length - 1 ? (index += 1, render()) : close();
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    return dialog;
  }

  function render() {
    const dialog = ensureDialog();
    const step = steps[index];
    dialog.querySelector("#tutorialIcon").className = `bi ${step.icon}`;
    dialog.querySelector("#tutorialEyebrow").textContent = step.eyebrow;
    dialog.querySelector("#tutorialTitle").textContent = step.title;
    dialog.querySelector("#tutorialText").textContent = step.text;
    dialog.querySelector("#tutorialDots").innerHTML = steps.map((_, i) => `<i class="${i === index ? "active" : ""}"></i>`).join("");
    dialog.querySelector("#tutorialNext").innerHTML = index === steps.length - 1 ? 'Commencer <i class="bi bi-check2"></i>' : 'Continuer <i class="bi bi-arrow-right"></i>';
  }

  function open() {
    index = 0;
    const dialog = ensureDialog();
    render();
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    storageSet(TUTORIAL_KEY, "1");
    const dialog = document.getElementById("novaTutorial");
    if (dialog?.open) dialog.close();
  }

  window.NovaTutorial = { open };
  document.addEventListener("DOMContentLoaded", () => {
    if (!storageGet(STARTUP_KEY)) window.setTimeout(openWelcome, 180);
    else if (!storageGet(TUTORIAL_KEY)) window.setTimeout(open, 350);
  });
  window.addEventListener("nova:auth-ready", event => {
    if (event.detail?.status === "signed-in" && tutorialAfterAuth) {
      tutorialAfterAuth = false;
      openTutorialSoon();
    }
  });
  window.addEventListener("nova:auth-state", event => {
    if (event.detail?.status === "signed-in") {
      storageSet(STARTUP_KEY, "account");
      document.getElementById("soloWelcome")?.close();
    }
  });
  window.addEventListener("nova:offline-choice", () => {
    tutorialAfterAuth = false;
    openTutorialSoon();
  });
  window.addEventListener("nova:account-closed", () => {
    if (tutorialAfterAuth) {
      tutorialAfterAuth = false;
      storageSet(STARTUP_KEY, "offline");
      openTutorialSoon();
    }
  });
})();
