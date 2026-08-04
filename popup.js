// Digest — popup.js

const els = {
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  resultTitle: document.getElementById("resultTitle"),
  resultUrl: document.getElementById("resultUrl"),
  resultProvider: document.getElementById("resultProvider"),
  resultText: document.getElementById("resultText"),
  summarizePage: document.getElementById("summarizePage"),
  summarizeSelection: document.getElementById("summarizeSelection"),
  addToQueue: document.getElementById("addToQueue"),
  wantFlashcards: document.getElementById("wantFlashcards"),
  flashcardsSection: document.getElementById("flashcardsSection"),
  flashcardsList: document.getElementById("flashcardsList"),
  flashcardsError: document.getElementById("flashcardsError"),
  exportAnkiBtn: document.getElementById("exportAnkiBtn"),
  copyBtn: document.getElementById("copyBtn"),
  exportMdBtn: document.getElementById("exportMdBtn"),
  openOptions: document.getElementById("openOptions"),
};

let currentEntry = null;

init();

async function init() {
  els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  els.summarizePage.addEventListener("click", () => handleSummarize("page"));
  els.summarizeSelection.addEventListener("click", () => handleSummarize("selection"));
  els.addToQueue.addEventListener("click", handleAddToQueue);
  els.copyBtn.addEventListener("click", handleCopy);
  els.exportMdBtn.addEventListener("click", handleExport);
  els.exportAnkiBtn.addEventListener("click", handleExportAnki);

  // Si venimos de un clic en el menú contextual, ya hay un resultado
  // esperando en session storage — lo mostramos directamente.
  const { digestPending } = await chrome.storage.session.get("digestPending");
  if (digestPending) {
    await chrome.storage.session.remove("digestPending");
    if (digestPending.ok) {
      showResult(digestPending.entry);
    } else {
      showStatus(digestPending.error, true);
    }
  }

  const { digestProviders, digestConfig } = await chrome.storage.local.get(["digestProviders", "digestConfig"]);
  const hasProvider = (Array.isArray(digestProviders) && digestProviders.length > 0) || (digestConfig && digestConfig.endpoint);
  if (!hasProvider) {
    showStatus("No has configurado ningún proveedor de IA todavía. Ve a Opciones (⚙️) para añadir tu API key o tu endpoint local.", true);
  }
}

function getSelectedLength() {
  const checked = document.querySelector('input[name="length"]:checked');
  return checked ? checked.value : "medio";
}

async function handleSummarize(source) {
  setButtonsDisabled(true);
  showStatus(source === "page" ? "Extrayendo y resumiendo la página…" : "Resumiendo selección…", false);
  els.result.hidden = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "digest-summarize",
      source,
      length: getSelectedLength(),
      wantFlashcards: els.wantFlashcards.checked,
    });

    if (!response || !response.ok) {
      showStatus((response && response.error) || "Ha ocurrido un error inesperado.", true);
      return;
    }

    showResult(response.entry);
    hideStatus();
  } catch (err) {
    showStatus(String(err && err.message ? err.message : err), true);
  } finally {
    setButtonsDisabled(false);
  }
}

async function handleAddToQueue() {
  els.addToQueue.disabled = true;
  const original = els.addToQueue.textContent;
  showStatus("Añadiendo página a la cola…", false);

  try {
    const response = await chrome.runtime.sendMessage({ type: "digest-queue-add" });
    if (!response || !response.ok) {
      showStatus((response && response.error) || "No se pudo añadir a la cola.", true);
      return;
    }
    els.addToQueue.textContent = "Añadida ✓";
    showStatus(`"${response.item.title}" guardada en la cola. Procésala desde "Ver cola" cuando quieras.`, false);
    setTimeout(() => (els.addToQueue.textContent = original), 1500);
  } catch (err) {
    showStatus(String(err && err.message ? err.message : err), true);
  } finally {
    els.addToQueue.disabled = false;
  }
}

function showResult(entry) {
  currentEntry = entry;
  els.resultTitle.textContent = entry.title || "(sin título)";
  els.resultUrl.textContent = entry.url || "";
  els.resultUrl.href = entry.url || "#";
  renderMarkdown(els.resultText, entry.summary || "");

  if (entry.providerLabel) {
    els.resultProvider.hidden = false;
    els.resultProvider.textContent = entry.fallbackUsed ? `vía ${entry.providerLabel} (fallback)` : `vía ${entry.providerLabel}`;
  } else {
    els.resultProvider.hidden = true;
  }

  renderFlashcards(entry);
  els.result.hidden = false;
}

function renderFlashcards(entry) {
  els.flashcardsList.innerHTML = "";

  if (entry.flashcards && entry.flashcards.length > 0) {
    els.flashcardsSection.hidden = false;
    entry.flashcards.forEach((card) => els.flashcardsList.appendChild(buildFlashcardEl(card)));
  } else {
    els.flashcardsSection.hidden = true;
  }

  if (entry.flashcardsError) {
    els.flashcardsError.hidden = false;
    els.flashcardsError.textContent = `No se pudieron generar las flashcards: ${entry.flashcardsError}`;
  } else {
    els.flashcardsError.hidden = true;
  }
}

function buildFlashcardEl(card) {
  const wrap = document.createElement("div");
  wrap.className = "flashcard";

  const q = document.createElement("div");
  q.className = "flashcard-q";
  q.textContent = card.q;

  const a = document.createElement("div");
  a.className = "flashcard-a";
  a.textContent = card.a;

  wrap.appendChild(q);
  wrap.appendChild(a);
  wrap.addEventListener("click", () => wrap.classList.toggle("revealed"));

  return wrap;
}

// Renderiza el resumen como Markdown (negrita, listas, encabezados...) en
// vez de texto plano con los `**` visibles. El CSP de la extensión
// (script-src 'self') impide que se ejecute cualquier <script> que pudiera
// colarse en el HTML generado, así que innerHTML aquí es seguro.
function renderMarkdown(el, text) {
  if (window.marked) {
    el.innerHTML = window.marked.parse(text);
  } else {
    el.textContent = text;
  }
}

function showStatus(text, isError) {
  els.status.textContent = text;
  els.status.hidden = false;
  els.status.classList.toggle("error", !!isError);
}

function hideStatus() {
  els.status.hidden = true;
}

function setButtonsDisabled(disabled) {
  els.summarizePage.disabled = disabled;
  els.summarizeSelection.disabled = disabled;
}

async function handleCopy() {
  if (!currentEntry) return;
  await navigator.clipboard.writeText(currentEntry.summary);
  els.copyBtn.textContent = "¡Copiado!";
  setTimeout(() => (els.copyBtn.textContent = "Copiar"), 1200);
}

function handleExport() {
  if (!currentEntry) return;
  const md = buildMarkdown(currentEntry);
  downloadBlob(md, `digest-${slugify(currentEntry.title)}-${currentEntry.date.slice(0, 10)}.md`, "text/markdown;charset=utf-8");
}

function handleExportAnki() {
  if (!currentEntry || !currentEntry.flashcards || currentEntry.flashcards.length === 0) return;
  const csv = buildAnkiCSV(currentEntry.flashcards);
  downloadBlob(csv, `digest-flashcards-${slugify(currentEntry.title)}.csv`, "text/csv;charset=utf-8");
}

function buildMarkdown(entry) {
  const frontmatter = [
    "---",
    `title: "${(entry.title || "").replace(/"/g, '\\"')}"`,
    `url: ${entry.url || ""}`,
    `fecha: ${entry.date.slice(0, 10)}`,
    `longitud: ${entry.length}`,
    "tags: []",
    "---",
    "",
  ].join("\n");
  let body = `${frontmatter}# ${entry.title || "Resumen"}\n\n${entry.summary}\n`;
  if (entry.flashcards && entry.flashcards.length > 0) {
    body += `\n## Flashcards\n\n`;
    body += entry.flashcards.map((c) => `**P:** ${c.q}\n**R:** ${c.a}`).join("\n\n");
    body += "\n";
  }
  return body;
}

// Formato Anki: CSV de dos columnas (pregunta;respuesta), importable
// directamente en Anki eligiendo ";" como separador de campos.
function buildAnkiCSV(flashcards) {
  const escape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return flashcards.map((c) => `${escape(c.q)};${escape(c.a)}`).join("\n");
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => URL.revokeObjectURL(url));
}

function slugify(text) {
  return (text || "resumen")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}
