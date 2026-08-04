// Digest — offscreen.js
// El service worker de background.js no tiene DOM, y pdf.js lo necesita
// (Worker, algunas APIs de canvas/documento según la build). Este documento
// offscreen existe únicamente para correr pdf.js y devolver el texto plano
// extraído — se crea bajo demanda y no tiene interfaz visible.

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.js");
}

const MAX_PAGES = 60; // límite razonable para no reventar el contexto del modelo con PDFs enormes

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "digest-offscreen-extract-pdf") return false;

  (async () => {
    try {
      const text = await extractText(message.buffer);
      sendResponse({ ok: true, text });
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  })();

  return true; // respuesta async
});

async function extractText(arrayBuffer) {
  if (!window.pdfjsLib) throw new Error("pdf.js no se cargó correctamente.");

  // isEvalSupported: false — el CSP de la extensión (script-src 'self', sin
  // 'unsafe-eval') bloquearía el atajo de rendimiento que pdf.js intenta
  // usar por defecto para ciertas fuentes; con esto lo desactiva y usa la
  // ruta sin eval, más lenta pero compatible.
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false });
  const pdf = await loadingTask.promise;

  const pagesToRead = Math.min(pdf.numPages, MAX_PAGES);
  let text = "";

  for (let i = 1; i <= pagesToRead; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    text += pageText + "\n\n";
  }

  if (pdf.numPages > MAX_PAGES) {
    text += `\n[Digest: el PDF tiene ${pdf.numPages} páginas, solo se leyeron las primeras ${MAX_PAGES}.]`;
  }

  return text.trim();
}
