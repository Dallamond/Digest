// Digest — print.js
// Renderiza un resumen (y sus flashcards, si tiene) en una vista limpia
// pensada para imprimir / exportar a PDF vía el diálogo nativo de Chrome
// (window.print → "Guardar como PDF"). Sin jsPDF ni html2canvas: el texto
// sale seleccionable y con mejor calidad que rasterizando un canvas.

const els = {
  printBtn: document.getElementById("printBtn"),
  doc: document.getElementById("doc"),
  docTitle: document.getElementById("docTitle"),
  docMeta: document.getElementById("docMeta"),
  docSummary: document.getElementById("docSummary"),
  docFlashcards: document.getElementById("docFlashcards"),
  docFlashcardsList: document.getElementById("docFlashcardsList"),
  loadError: document.getElementById("loadError"),
};

init();

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  const { digestHistory } = await chrome.storage.local.get("digestHistory");
  const history = Array.isArray(digestHistory) ? digestHistory : [];
  const entry = history.find((e) => e.id === id);

  if (!entry) {
    els.doc.hidden = true;
    els.loadError.hidden = false;
    return;
  }

  document.title = `Digest — ${entry.title || "Resumen"}`;
  els.docTitle.textContent = entry.title || "Resumen";

  const metaParts = [];
  if (entry.url) metaParts.push(entry.url);
  metaParts.push(new Date(entry.date).toLocaleDateString());
  if (entry.providerLabel) metaParts.push(`vía ${entry.providerLabel}`);
  els.docMeta.textContent = metaParts.join("  ·  ");

  els.docSummary.innerHTML = window.marked ? window.marked.parse(entry.summary || "") : entry.summary || "";

  if (entry.flashcards && entry.flashcards.length > 0) {
    els.docFlashcards.hidden = false;
    entry.flashcards.forEach((card) => {
      const li = document.createElement("li");
      const q = document.createElement("div");
      q.textContent = card.q;
      const a = document.createElement("div");
      a.className = "fc-a";
      a.textContent = card.a;
      li.appendChild(q);
      li.appendChild(a);
      els.docFlashcardsList.appendChild(li);
    });
  }

  els.printBtn.addEventListener("click", () => window.print());
}
