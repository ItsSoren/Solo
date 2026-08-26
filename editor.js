(() => {
  const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  function inline(value) {
    return escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 <i class="bi bi-box-arrow-up-right"></i></a>');
  }

  function render(markdown = "") {
    const lines = String(markdown).replace(/\r/g, "").split("\n");
    const output = [];
    let list = null;
    const closeList = () => {
      if (list) output.push(list === "ol" ? "</ol>" : "</ul>");
      list = null;
    };
    lines.forEach((line, lineIndex) => {
      const heading = line.match(/^(#{1,3})\s+(.+)/);
      const check = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)/);
      const bullet = line.match(/^\s*[-*]\s+(.+)/);
      const ordered = line.match(/^\s*\d+\.\s+(.+)/);
      const quote = line.match(/^>\s?(.+)/);
      if (heading) {
        closeList();
        const level = heading[1].length + 1;
        output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      } else if (check) {
        closeList();
        const done = check[1].toLowerCase() === "x";
        output.push(`<label class="rendered-check ${done ? "done" : ""}"><input type="checkbox" data-editor-line="${lineIndex}" ${done ? "checked" : ""}><span>${inline(check[2])}</span></label>`);
      } else if (bullet || ordered) {
        const type = ordered ? "ol" : "ul";
        if (list !== type) { closeList(); list = type; output.push(`<${type}>`); }
        output.push(`<li>${inline((ordered || bullet)[1])}</li>`);
      } else if (quote) {
        closeList();
        output.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      } else if (!line.trim()) {
        closeList();
        output.push("<div class=\"editor-space\"></div>");
      } else {
        closeList();
        output.push(`<p>${inline(line)}</p>`);
      }
    });
    closeList();
    return output.join("");
  }

  function toolbar() {
    return `<div class="editor-toolbar" role="toolbar" aria-label="Mise en forme">
      <button type="button" data-editor-action="bold" title="Gras"><i class="bi bi-type-bold"></i></button>
      <button type="button" data-editor-action="italic" title="Italique"><i class="bi bi-type-italic"></i></button>
      <button type="button" data-editor-action="heading" title="Titre"><i class="bi bi-type-h2"></i></button>
      <span></span>
      <button type="button" data-editor-action="bullet" title="Liste"><i class="bi bi-list-ul"></i></button>
      <button type="button" data-editor-action="check" title="Liste à cocher"><i class="bi bi-list-check"></i></button>
      <button type="button" data-editor-action="quote" title="Citation"><i class="bi bi-quote"></i></button>
      <button type="button" data-editor-action="link" title="Lien"><i class="bi bi-link-45deg"></i></button>
    </div>`;
  }

  function replaceSelection(textarea, before, after = "", placeholder = "texte") {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder;
    textarea.setRangeText(`${before}${selected}${after}`, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function prefixLines(textarea, prefix) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
    const blockEnd = textarea.value.indexOf("\n", end);
    const finalEnd = blockEnd === -1 ? textarea.value.length : blockEnd;
    const selected = textarea.value.slice(lineStart, finalEnd) || "élément";
    textarea.setRangeText(selected.split("\n").map(line => `${prefix}${line}`).join("\n"), lineStart, finalEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }

  function bind(root, textarea, preview) {
    if (!root || !textarea || !preview) return;
    const refresh = () => { preview.innerHTML = render(textarea.value) || '<p class="editor-empty">L’aperçu apparaîtra ici.</p>'; };
    textarea.addEventListener("input", refresh);
    root.querySelectorAll("[data-editor-action]").forEach(button => button.addEventListener("click", () => {
      const action = button.dataset.editorAction;
      if (action === "bold") replaceSelection(textarea, "**", "**");
      if (action === "italic") replaceSelection(textarea, "*", "*");
      if (action === "heading") prefixLines(textarea, "## ");
      if (action === "bullet") prefixLines(textarea, "- ");
      if (action === "check") prefixLines(textarea, "- [ ] ");
      if (action === "quote") prefixLines(textarea, "> ");
      if (action === "link") replaceSelection(textarea, "[", "](https://)", "nom du lien");
    }));
    preview.addEventListener("change", event => {
      const checkbox = event.target.closest("[data-editor-line]");
      if (!checkbox) return;
      const lines = textarea.value.replace(/\r/g, "").split("\n");
      const index = Number(checkbox.dataset.editorLine);
      if (lines[index] != null) lines[index] = lines[index].replace(/^(\s*-\s+\[)[ xX](\])/, `$1${checkbox.checked ? "x" : " "}$2`);
      textarea.value = lines.join("\n");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    refresh();
  }

  window.NovaEditor = { render, toolbar, bind, escapeHtml };
})();

(() => {
  const allowedTags = new Set(["DIV", "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H1", "H2", "H3", "PRE", "CODE", "HR", "UL", "OL", "LI", "BLOCKQUOTE", "A", "SPAN", "INPUT"]);

  function sanitize(html = "") {
    const template = document.createElement("template");
    template.innerHTML = String(html);
    [...template.content.querySelectorAll("*")].forEach(node => {
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }
      const rawHref = node.tagName === "A" ? node.getAttribute("href") || "" : "";
      const rawStyle = node.tagName === "SPAN" ? node.getAttribute("style") || "" : "";
      const wasCheck = node.classList.contains("editor-check-block") || node.classList.contains("rendered-check");
      const wasChecked = node.tagName === "INPUT" && (node.checked || node.hasAttribute("checked"));
      [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
      if (node.tagName === "A") {
        if (/^https?:\/\//i.test(rawHref)) { node.setAttribute("href", rawHref); node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
      }
      if (node.tagName === "SPAN") {
        const safeStyles = rawStyle.split(";").map(declaration => declaration.trim()).map(declaration => {
          const match = declaration.match(/^(color|background-color)\s*:\s*((?:#[0-9a-f]{3,8})|(?:rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)))$/i);
          return match ? `${match[1].toLowerCase()}:${match[2].replace(/\s+/g, " ").toLowerCase()}` : "";
        }).filter(Boolean).join(";");
        if (safeStyles) node.setAttribute("style", safeStyles);
      }
      if (node.tagName === "INPUT") {
        node.setAttribute("type", "checkbox");
        if (wasChecked) node.setAttribute("checked", "");
        else node.removeAttribute("checked");
      }
      if (wasCheck) node.className = "editor-check-block";
      else node.removeAttribute("class");
    });
    return template.innerHTML;
  }

  function fromStored(content = "", format = "markdown") {
    if (format === "html" || /<(p|div|h2|h3|ul|ol|blockquote|strong|input)\b/i.test(content)) return sanitize(content);
    const holder = document.createElement("div");
    holder.innerHTML = window.NovaEditor.render(content);
    holder.querySelectorAll(".rendered-check").forEach(label => {
      const block = document.createElement("div");
      block.className = "editor-check-block";
      block.innerHTML = `<input type="checkbox" ${label.querySelector("input")?.checked ? "checked" : ""}><span>${label.querySelector("span")?.innerHTML || ""}</span>`;
      label.replaceWith(block);
    });
    return sanitize(holder.innerHTML);
  }

  function plainText(content = "") {
    const holder = document.createElement("div");
    holder.innerHTML = /<[^>]+>/.test(content) ? sanitize(content) : window.NovaEditor.render(content);
    return (holder.textContent || "").replace(/\s+/g, " ").trim();
  }

  function checklistStats(content = "", format = "markdown") {
    if (format === "html" || /<input\b/i.test(content)) {
      const holder = document.createElement("div"); holder.innerHTML = sanitize(content);
      const boxes = [...holder.querySelectorAll('input[type="checkbox"]')];
      return { total: boxes.length, done: boxes.filter(box => box.checked || box.hasAttribute("checked")).length };
    }
    const boxes = [...String(content).matchAll(/^\s*-\s+\[([ xX])\]/gm)];
    return { total: boxes.length, done: boxes.filter(match => match[1].toLowerCase() === "x").length };
  }

  function createCheckBlock(html = "À faire") {
    const block = document.createElement("div");
    block.className = "editor-check-block";
    const input = document.createElement("input");
    input.type = "checkbox";
    const span = document.createElement("span");
    span.innerHTML = html;
    block.append(input, span);
    return block;
  }

  function placeCaret(node, atStart = false) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(atStart);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function toggleInlineCode(body, rememberedRange = null) {
    const selection = window.getSelection();
    const range = rememberedRange ? rememberedRange.cloneRange() : (selection?.rangeCount ? selection.getRangeAt(0) : null);
    if (!range) return;
    if (!body.contains(range.commonAncestorContainer) || range.collapsed) return;
    const code = document.createElement("code");
    code.append(range.extractContents());
    range.insertNode(code);
    placeCaret(code, false);
  }

  function toggleChecklistForSelection(body, rememberedRange = null) {
    const selection = window.getSelection();
    let range = rememberedRange ? rememberedRange.cloneRange() : (selection?.rangeCount ? selection.getRangeAt(0) : null);
    if (!range || !body.contains(range.commonAncestorContainer)) {
      body.focus();
      range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(false);
    }

    const selectedTop = [...body.childNodes].filter(child => {
      try { return range.intersectsNode(child); } catch { return false; }
    });

    if (!range.collapsed && selectedTop.length && selectedTop.every(child => child.nodeType === 1 && child.classList.contains("editor-check-block"))) {
      let last = null;
      selectedTop.forEach(block => {
        const paragraph = document.createElement("p");
        paragraph.innerHTML = block.querySelector("span")?.innerHTML || "";
        block.replaceWith(paragraph);
        last = paragraph;
      });
      if (last) placeCaret(last, false);
      return;
    }

    if (!range.collapsed && selectedTop.length === 1 && selectedTop[0].nodeType === 1 && /^(UL|OL)$/.test(selectedTop[0].tagName)) {
      const list = selectedTop[0];
      const items = [...list.children].filter(item => item.tagName === "LI");
      if (items.length) {
        const fragment = document.createDocumentFragment();
        let last = null;
        items.forEach(item => { last = createCheckBlock(item.innerHTML); fragment.append(last); });
        list.replaceWith(fragment);
        if (last) placeCaret(last.querySelector("span"), false);
        return;
      }
    }

    if (!range.collapsed && selectedTop.length > 1) {
      let last = null;
      selectedTop.forEach(block => {
        if ((block.nodeType === 1 && block.classList.contains("editor-check-block")) || !block.textContent.trim()) return;
        const content = block.nodeType === 3 ? window.NovaEditor.escapeHtml(block.textContent) : block.innerHTML;
        last = createCheckBlock(content);
        block.replaceWith(last);
      });
      if (last) placeCaret(last.querySelector("span"), false);
      return;
    }

    if (!range.collapsed) {
      const fragment = range.extractContents();
      const check = createCheckBlock("");
      check.querySelector("span").append(fragment);
      range.insertNode(check);
      placeCaret(check.querySelector("span"), false);
      return;
    }

    const check = createCheckBlock();
    range.insertNode(check);
    const spacer = document.createElement("div");
    spacer.innerHTML = "<br>";
    check.after(spacer);
    placeCaret(check.querySelector("span"), true);
  }

  function ensureWorkspace() {
    let root = document.getElementById("novaNoteWorkspace");
    if (root) return root;
    root = document.createElement("section");
    root.id = "novaNoteWorkspace";
    root.className = "note-workspace hidden";
    root.setAttribute("aria-label", "Éditeur de note");
    document.body.appendChild(root);
    return root;
  }

  function open(options) {
    const root = ensureWorkspace();
    const draftKey = `nova_note_draft_${String(options.scope || "personal").replace(/[^a-z0-9_-]/gi, "_")}_${options.draftId || options.id || "new"}`;
    let recovered = null;
    try { recovered = JSON.parse(localStorage.getItem(draftKey) || "null"); } catch { recovered = null; }
    const title = recovered?.title ?? options.title ?? "";
    const html = recovered?.html ?? fromStored(options.content || "", options.format || "markdown");
    const color = recovered?.color || options.color || "opal";
    root.innerHTML = `<header class="note-workspace-bar"><button type="button" class="note-back"><i class="bi bi-arrow-left"></i><span>Retour</span></button><div class="note-workspace-place"><span>${window.NovaEditor.escapeHtml(options.label || "Note")}</span><i class="bi bi-chevron-right"></i><strong id="workspaceCrumb">${window.NovaEditor.escapeHtml(title || "Sans titre")}</strong></div><div class="note-save-state" id="noteSaveState"><i class="bi bi-shield-check"></i><span>${recovered ? "Brouillon récupéré" : options.autoSave ? "Sauvegarde automatique active" : "Brouillon local actif · Enregistrer pour partager"}</span></div><button type="button" class="primary" id="workspaceSave"><i class="bi bi-check2"></i> Enregistrer</button></header>
      <div class="note-format-bar-wrap"><div class="rich-toolbar" role="toolbar" aria-label="Mise en forme"><button type="button" data-rich-command="undo" aria-label="Annuler" title="Annuler"><i class="bi bi-arrow-counterclockwise"></i></button><button type="button" data-rich-command="redo" aria-label="Rétablir" title="Rétablir"><i class="bi bi-arrow-clockwise"></i></button><span></span><button type="button" data-rich-command="formatBlock" data-value="P" aria-label="Texte normal" title="Texte normal"><i class="bi bi-type"></i></button><button type="button" data-rich-command="formatBlock" data-value="H1" aria-label="Titre 1" title="Titre 1"><i class="bi bi-type-h1"></i></button><button type="button" data-rich-command="formatBlock" data-value="H2" aria-label="Titre 2" title="Titre 2"><i class="bi bi-type-h2"></i></button><button type="button" data-rich-command="formatBlock" data-value="H3" aria-label="Titre 3" title="Titre 3"><i class="bi bi-type-h3"></i></button><span></span><button type="button" data-rich-command="bold" aria-label="Gras" title="Gras"><i class="bi bi-type-bold"></i></button><button type="button" data-rich-command="italic" aria-label="Italique" title="Italique"><i class="bi bi-type-italic"></i></button><button type="button" data-rich-command="underline" aria-label="Souligné" title="Souligné"><i class="bi bi-type-underline"></i></button><button type="button" data-rich-command="strikeThrough" aria-label="Barré" title="Barré"><i class="bi bi-type-strikethrough"></i></button><button type="button" data-rich-action="code" aria-label="Code en ligne" title="Code en ligne"><i class="bi bi-code"></i></button><button type="button" data-rich-command="removeFormat" aria-label="Effacer la mise en forme" title="Effacer la mise en forme"><i class="bi bi-eraser"></i></button><span></span><button type="button" data-rich-command="insertUnorderedList" aria-label="Liste à puces" title="Liste à puces"><i class="bi bi-list-ul"></i></button><button type="button" data-rich-command="insertOrderedList" aria-label="Liste numérotée" title="Liste numérotée"><i class="bi bi-list-ol"></i></button><button type="button" data-rich-action="check" aria-label="Liste à cocher" title="Liste à cocher"><i class="bi bi-list-check"></i></button><button type="button" data-rich-command="outdent" aria-label="Diminuer le retrait" title="Diminuer le retrait"><i class="bi bi-text-indent-left"></i></button><button type="button" data-rich-command="indent" aria-label="Augmenter le retrait" title="Augmenter le retrait"><i class="bi bi-text-indent-right"></i></button><span></span><button type="button" data-rich-command="formatBlock" data-value="BLOCKQUOTE" aria-label="Citation" title="Citation"><i class="bi bi-quote"></i></button><button type="button" data-rich-command="formatBlock" data-value="PRE" aria-label="Bloc de code" title="Bloc de code"><i class="bi bi-code-square"></i></button><button type="button" data-rich-action="link" aria-label="Ajouter un lien" title="Ajouter un lien"><i class="bi bi-link-45deg"></i></button><button type="button" data-rich-command="insertHorizontalRule" aria-label="Séparateur" title="Séparateur"><i class="bi bi-dash-lg"></i></button></div></div>
      <main class="note-document-shell"><article class="note-document ${color}" id="noteDocument"><div class="note-document-meta"><span><i class="bi ${options.shared ? "bi-people" : "bi-lock"}"></i> ${options.shared ? "Note partagée" : "Note personnelle"}</span><div class="note-colors">${["opal","blue","violet","sand"].map(name => `<button type="button" class="${name} ${name === color ? "active" : ""}" data-rich-color="${name}" aria-label="Couleur ${name}"><i></i></button>`).join("")}</div></div><input id="richNoteTitle" class="note-document-title" maxlength="100" value="${window.NovaEditor.escapeHtml(title)}" placeholder="Titre de la note"><div id="richNoteBody" class="rich-note-body" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Écris quelque chose, ou ajoute une checklist…">${html}</div></article></main>`;
    root.classList.remove("hidden");
    document.body.classList.add("note-workspace-open");
    const titleInput = root.querySelector("#richNoteTitle");
    const body = root.querySelector("#richNoteBody");
    const documentCard = root.querySelector("#noteDocument");
    const stateText = root.querySelector("#noteSaveState span");
    let activeColor = color;
    let saveTimer = null;
    let autoSaveTimer = null;
    let autoSaving = false;
    let autoPersisted = false;
    let rememberedRange = null;

    const rememberSelection = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (body.contains(range.commonAncestorContainer)) rememberedRange = range.cloneRange();
    };

    const storeDraft = () => {
      const payload = { title: titleInput.value, html: sanitize(body.innerHTML), color: activeColor, updatedAt: Date.now() };
      try { localStorage.setItem(draftKey, JSON.stringify(payload)); stateText.textContent = "Brouillon sauvegardé sur cet appareil"; } catch { stateText.textContent = "Brouillon trop volumineux"; }
    };
    const valueForSave = () => ({ title: titleInput.value.trim(), content: sanitize(body.innerHTML), format: "html", color: activeColor });
    const saveAutomatically = async () => {
      if (!options.autoSave || autoSaving || !titleInput.value.trim()) return;
      autoSaving = true;
      stateText.textContent = "Enregistrement automatique…";
      try { await options.onSave({ ...valueForSave(), auto: true }); localStorage.removeItem(draftKey); autoPersisted = true; stateText.textContent = "Enregistrée automatiquement"; }
      catch { stateText.textContent = "Brouillon conservé sur cet appareil"; }
      finally { autoSaving = false; }
    };
    const changed = () => { autoPersisted = false; stateText.textContent = options.autoSave ? "Modification non enregistrée…" : "Sauvegarde du brouillon…"; clearTimeout(saveTimer); saveTimer = setTimeout(storeDraft, 280); clearTimeout(autoSaveTimer); if (options.autoSave) autoSaveTimer = setTimeout(saveAutomatically, 1400); root.querySelector("#workspaceCrumb").textContent = titleInput.value || "Sans titre"; };
    const restoreRememberedRange = () => { if (!rememberedRange) return; const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(rememberedRange.cloneRange()); };
    const addColorPicker = (action, icon, title, value) => {
      const label = document.createElement("label");
      label.className = "rich-color-picker";
      label.title = title;
      label.innerHTML = `<i class="bi ${icon}"></i><input type="color" value="${value}" aria-label="${title}">`;
      label.onmousedown = event => event.preventDefault();
      label.querySelector("input").onchange = event => { restoreRememberedRange(); body.focus(); document.execCommand("styleWithCSS", false, true); document.execCommand(action === "text" ? "foreColor" : "hiliteColor", false, event.target.value); changed(); };
      root.querySelector(".rich-toolbar").append(label);
    };
    addColorPicker("text", "bi-palette", "Couleur du texte", "#62d8d0");
    addColorPicker("highlight", "bi-highlighter", "Surlignage", "#d6f3ee");
    titleInput.addEventListener("input", changed);
    body.addEventListener("input", changed);
    body.addEventListener("mouseup", rememberSelection);
    body.addEventListener("keyup", rememberSelection);
    body.addEventListener("change", event => { if (event.target.matches('input[type="checkbox"]')) { if (event.target.checked) event.target.setAttribute("checked", ""); else event.target.removeAttribute("checked"); changed(); } });
    root.querySelectorAll("[data-rich-color]").forEach(button => button.onclick = () => { documentCard.classList.remove("opal", "blue", "violet", "sand"); activeColor = button.dataset.richColor; documentCard.classList.add(activeColor); root.querySelectorAll("[data-rich-color]").forEach(item => item.classList.toggle("active", item === button)); changed(); });
    root.querySelectorAll("[data-rich-command]").forEach(button => {
      button.onmousedown = event => event.preventDefault();
      button.onclick = () => { body.focus(); document.execCommand(button.dataset.richCommand, false, button.dataset.value || null); changed(); };
    });
    const refreshToolbarState = () => {
      root.querySelectorAll("[data-rich-command]").forEach(button => {
        const command = button.dataset.richCommand;
        let active = false;
        try { active = command === "formatBlock" ? document.queryCommandValue(command).toUpperCase() === button.dataset.value : document.queryCommandState(command); } catch { active = false; }
        button.classList.toggle("is-active", !!active);
      });
      const current = window.getSelection()?.anchorNode;
      root.querySelector("[data-rich-action='check']")?.classList.toggle("is-active", !!current?.parentElement?.closest(".editor-check-block"));
    };
    document.addEventListener("selectionchange", () => { rememberSelection(); refreshToolbarState(); });
    refreshToolbarState();
    root.querySelector("[data-rich-action='code']").onmousedown = event => event.preventDefault();
    root.querySelector("[data-rich-action='code']").onclick = () => { toggleInlineCode(body, rememberedRange); rememberedRange = null; changed(); };
    root.querySelector("[data-rich-action='check']").onmousedown = event => event.preventDefault();
    root.querySelector("[data-rich-action='check']").onclick = () => { toggleChecklistForSelection(body, rememberedRange); rememberedRange = null; changed(); };
    root.querySelector("[data-rich-action='link']").onmousedown = event => event.preventDefault();
    root.querySelector("[data-rich-action='link']").onclick = () => { const url = prompt("Adresse du lien (https://…)"); if (/^https?:\/\//i.test(url || "")) { body.focus(); document.execCommand("createLink", false, url); changed(); } };

    const close = () => { clearTimeout(saveTimer); clearTimeout(autoSaveTimer); if (!autoPersisted) storeDraft(); root.classList.add("hidden"); document.body.classList.remove("note-workspace-open"); options.onClose?.(); };
    root.querySelector(".note-back").onclick = close;
    root.querySelector("#workspaceSave").onclick = async () => {
      const cleanTitle = titleInput.value.trim();
      if (!cleanTitle) { titleInput.focus(); stateText.textContent = "Ajoute un titre avant d’enregistrer"; return; }
      const button = root.querySelector("#workspaceSave");
      button.disabled = true; stateText.textContent = options.shared ? "Enregistrement dans l’espace…" : "Enregistrement…";
      try {
        clearTimeout(autoSaveTimer);
        await options.onSave({ ...valueForSave(), title: cleanTitle, auto: false });
        localStorage.removeItem(draftKey); stateText.textContent = "Note enregistrée";
        root.classList.add("hidden"); document.body.classList.remove("note-workspace-open");
      } catch (error) {
        console.error("Nova note save", error); stateText.textContent = "Impossible d’enregistrer — le brouillon reste ici"; button.disabled = false;
      }
    };
    root.onkeydown = event => {
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.key.toLowerCase() === "s") { event.preventDefault(); root.querySelector("#workspaceSave").click(); return; }
      if (event.target !== body || !commandKey) return;
      const key = event.key.toLowerCase();
      if (key === "b") { event.preventDefault(); document.execCommand("bold"); changed(); }
      if (key === "i") { event.preventDefault(); document.execCommand("italic"); changed(); }
      if (key === "u") { event.preventDefault(); document.execCommand("underline"); changed(); }
      if (key === "k") { event.preventDefault(); root.querySelector("[data-rich-action='link']").click(); }
      if (event.shiftKey && key === "4") { event.preventDefault(); toggleChecklistForSelection(body, rememberedRange); rememberedRange = null; changed(); }
    };
    requestAnimationFrame(() => (titleInput.value ? body : titleInput).focus());
  }

  window.NovaRichEditor = { sanitize, fromStored, plainText, checklistStats };
  window.NovaNoteWorkspace = { open };
})();
