(() => {
  "use strict";

  const debug = (...values) => console.log("[Sōlo loader]", ...values);
  const trace = (name, details = {}) => window.NovaTrace?.step(name, details);
  debug("démarrage", { protocol: location.protocol });
  trace("03 chargeur démarré", { protocol: location.protocol });
  window.addEventListener("error", event => console.error("[Sōlo loader] erreur runtime", event.message || event.error || event));

  const emit = detail => window.dispatchEvent(new CustomEvent("nova:auth-state", { detail }));
  const onlineUrl = "https://itssoren.github.io/Solo/";

  if (location.protocol === "file:") {
    const message = "Les comptes et espaces partagés sont disponibles dans la version web hébergée. Cette copie locale reste utilisable pour tes données hors ligne.";
    window.NovaAccount = {
      available: false,
      onlineUrl,
      open() {
        window.open(onlineUrl, "_blank", "noopener,noreferrer");
      },
      openOnline() {
        window.open(onlineUrl, "_blank", "noopener,noreferrer");
      }
    };
    emit({ status: "protocol-blocked", message });
    window.addEventListener("DOMContentLoaded", () => {
      const shared = document.getElementById("sharedSection");
      if (!shared) return;
      shared.innerHTML = `<div class="protocol-help panel"><img src="assets/solo-mark-opal.png" alt=""><span class="eyebrow">VERSION WEB</span><h1>Le partage est prêt dans la version en ligne.</h1><p>${message}</p><a class="primary protocol-online-link" href="${onlineUrl}" target="_blank" rel="noopener noreferrer">Ouvrir Sōlo en ligne <i class="bi bi-arrow-up-right"></i></a><small class="protocol-local-note">Les objectifs et notes locales restent disponibles sur cet appareil.</small></div>`;
    });
    return;
  }

  const scripts = [
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js",
    "cloud-compat.js?v=9.4.4"
  ];

  const load = src => new Promise((resolve, reject) => {
    debug("chargement", src); trace("04 chargement script", { src });
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => { debug("chargé", src); trace("05 script chargé", { src }); resolve(); };
    script.onerror = error => { console.error("[Sōlo loader] échec", src, error); trace("ERREUR script", { src }); reject(error); };
    document.head.append(script);
  });

  scripts.reduce((chain, src) => chain.then(() => load(src)), Promise.resolve()).then(() => { debug("Firebase et partage prêts"); trace("06 Firebase et partage prêts"); }).catch(error => {
    console.error("Sōlo cloud loader", error);
    emit({ status: "unavailable", message: "Connexion au service Sōlo indisponible." });
  });
})();
