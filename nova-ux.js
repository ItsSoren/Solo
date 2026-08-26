(() => {
  const TUTORIAL_KEY = "nova_tasks_tutorial_v9_seen";
  const steps = [
    { icon: "bi-house-heart", eyebrow: "1 sur 3 · AUJOURD’HUI", title: "L’essentiel, dès l’ouverture.", text: "Nova te montre le prochain objectif, les échéances proches et tes notes rapides sans surcharger l’écran." },
    { icon: "bi-check2-square", eyebrow: "2 sur 3 · OBJECTIFS & NOTES", title: "Écris vite, organise ensuite.", text: "Crée un objectif simple ou ouvre une note en plein écran pour ajouter titres, listes, liens et cases à cocher." },
    { icon: "bi-people", eyebrow: "3 sur 3 · COMPTE & PARTAGE", title: "Local ou synchronisé, à toi de choisir.", text: "Nova fonctionne sans compte. Connecte-toi pour retrouver tes données personnelles et collaborer dans des espaces privés." }
  ];
  let index = 0;

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
    localStorage.setItem(TUTORIAL_KEY, "1");
    const dialog = document.getElementById("novaTutorial");
    if (dialog?.open) dialog.close();
  }

  window.NovaTutorial = { open };
  document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem(TUTORIAL_KEY)) window.setTimeout(open, 350);
  });
})();
