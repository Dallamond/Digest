// Digest — background.js (service worker)
// Orquesta: extracción de contenido de la pestaña activa, llamada al LLM
// configurado por el usuario (con fallback entre varios proveedores si hay
// más de uno guardado), historial local, flashcards (Modo Estudio) y cola
// de lectura. Sin backend propio.

const DEFAULT_PROVIDER = {
  provider: "openai",
  label: "OpenAI",
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o-mini",
  enabled: true,
};

const LENGTH_INSTRUCTIONS = {
  breve: "Resume el texto en 1-2 frases como máximo. Ve directo a la idea principal, sin rodeos.",
  medio: "Resume el texto en 4-6 bullets con los puntos clave, cada uno de una frase.",
  extenso:
    "Haz un resumen estructurado y más completo del texto, respetando en la medida de lo posible las secciones o el orden original del contenido. Usa subtítulos cortos en negrita si el contenido tiene partes claramente diferenciadas, y bullets dentro de cada una.",
};

const FLASHCARD_COUNT = 5;

// ---------- Menú contextual ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "digest-summarize-selection",
    title: "Resumir selección con Digest",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "digest-summarize-page",
    title: "Resumir esta página con Digest",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "digest-queue-page",
    title: "Añadir página a la cola de Digest",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "digest-queue-page") {
    try {
      await addToQueue(tab.id);
    } catch (err) {
      // Silencioso a propósito — no hay UI que mostrar desde un menú contextual.
    }
    return;
  }

  const source = info.menuItemId === "digest-summarize-selection" ? "selection" : "page";

  try {
    const result = await runSummarize(tab.id, source, "medio", false);
    await chrome.storage.session.set({ digestPending: result });
  } catch (err) {
    await chrome.storage.session.set({
      digestPending: { ok: false, error: String(err && err.message ? err.message : err) },
    });
  }

  // Intenta abrir el popup automáticamente (requiere gesto de usuario reciente,
  // el propio clic del menú contextual cuenta). Si el navegador no lo soporta,
  // el resultado ya queda guardado en session storage y el popup lo recoge
  // en cuanto el usuario lo abra manualmente.
  try {
    await chrome.action.openPopup();
  } catch (err) {
    // Silencioso a propósito — no es crítico.
  }
});

// ---------- Mensajería con el popup / opciones / historial ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  if (message.type === "digest-summarize") {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No se encontró la pestaña activa." });
          return;
        }
        const result = await runSummarize(tab.id, message.source, message.length, !!message.wantFlashcards);
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true;
  }

  if (message.type === "digest-test-config") {
    (async () => {
      try {
        await callLLM("Responde solo con la palabra 'ok'.", "breve", message.config);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true;
  }

  if (message.type === "digest-queue-add") {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: "No se encontró la pestaña activa." });
          return;
        }
        const item = await addToQueue(tab.id);
        sendResponse({ ok: true, item });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true;
  }

  if (message.type === "digest-queue-process") {
    (async () => {
      try {
        const result = await processQueueItem(message.id, message.length, !!message.wantFlashcards);
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    })();
    return true;
  }

  if (message.type === "digest-summarize-pdf-file") {
    (async () => {
      try {
        const text = await extractPdfText(message.buffer);
        const extracted = {
          ok: true,
          textContent: text.slice(0, 20000),
          title: message.fileName || "PDF importado",
          url: "",
          kind: "pdf",
        };
        const result = await summarizeExtracted(extracted, "pdf-file", message.length, !!message.wantFlashcards);
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: `No se pudo leer el PDF: ${String(err && err.message ? err.message : err)}` });
      }
    })();
    return true;
  }

  return false;
});

// ---------- Lógica principal: resumen ----------

async function runSummarize(tabId, source, length, wantFlashcards) {
  const extracted = await extractFromTab(tabId, source);
  if (!extracted.ok) {
    return { ok: false, error: extracted.error || "No se pudo extraer contenido de la página." };
  }
  return summarizeExtracted(extracted, source, length, wantFlashcards);
}

async function summarizeExtracted(extracted, source, length, wantFlashcards) {
  if (!extracted.textContent || extracted.textContent.trim().length < 20) {
    return {
      ok: false,
      error:
        source === "selection"
          ? "No hay texto seleccionado (o es demasiado corto)."
          : "No se pudo extraer suficiente texto de esta página.",
    };
  }

  const providers = (await getProviders()).filter((p) => p.enabled !== false);
  if (providers.length === 0) {
    return { ok: false, error: "No tienes ningún proveedor de IA configurado. Ve a Opciones para añadir uno." };
  }

  const attempts = [];
  let summary = null;
  let usedProvider = null;

  for (const provider of providers) {
    try {
      summary = await callLLM(extracted.textContent, length, provider);
      usedProvider = provider;
      break;
    } catch (err) {
      attempts.push(`${provider.label || provider.provider}: ${String(err && err.message ? err.message : err)}`);
    }
  }

  if (!summary) {
    const detail = attempts.length ? `\n\n${attempts.join("\n")}` : "";
    return { ok: false, error: `Todos los proveedores configurados fallaron.${detail}` };
  }

  let flashcards = [];
  let flashcardsError = null;
  if (wantFlashcards) {
    try {
      flashcards = await generateFlashcards(extracted.textContent, usedProvider);
    } catch (err) {
      flashcardsError = String(err && err.message ? err.message : err);
    }
  }

  const entry = {
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    title: extracted.title || "(sin título)",
    url: extracted.url || "",
    source,
    kind: extracted.kind || "html",
    length,
    summary,
    flashcards,
    flashcardsError,
    providerLabel: usedProvider.label || usedProvider.provider,
    fallbackUsed: attempts.length > 0,
  };
  await saveHistoryEntry(entry);

  return { ok: true, entry };
}

async function extractFromTab(tabId, source) {
  if (source === "selection") {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const text = window.getSelection ? window.getSelection().toString() : "";
        return {
          ok: true,
          textContent: text.slice(0, 20000),
          title: document.title || "",
          url: location.href,
        };
      },
    });
    return result;
  }

  // source === "page": si la pestaña está mostrando un PDF, el visor
  // integrado de Chrome no es una página normal donde podamos inyectar
  // Readability — en vez de eso, descargamos el propio PDF y lo pasamos
  // por pdf.js (vía el documento offscreen). Si no es un PDF, extracción
  // normal con Readability + el wrapper.
  const tab = await chrome.tabs.get(tabId);
  if (isPdfUrl(tab.url)) {
    return extractPdfFromUrl(tab.url, tab.title);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["vendor/Readability.js", "content-script.js"],
  });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__digestExtractArticle(),
  });
  return result;
}

function isPdfUrl(url) {
  if (!url) return false;
  return /\.pdf(\?|#|$)/i.test(url);
}

async function extractPdfFromUrl(url, fallbackTitle) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar el PDF (${res.status}).`);
    const buffer = await res.arrayBuffer();
    const text = await extractPdfText(buffer);
    return {
      ok: true,
      textContent: text.slice(0, 20000),
      title: fallbackTitle || decodeURIComponent(url.split("/").pop() || "PDF"),
      url,
      kind: "pdf",
    };
  } catch (err) {
    return { ok: false, error: `No se pudo leer el PDF: ${String(err && err.message ? err.message : err)}` };
  }
}

// ---------- Extracción de PDF vía documento offscreen ----------
// El service worker no tiene DOM, y pdf.js lo necesita — por eso la
// extracción real ocurre en offscreen.js, y aquí solo orquestamos.

let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    try {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      if (contexts && contexts.length > 0) return;
    } catch (err) {
      // getContexts no disponible en esta versión de Chrome — seguimos e intentamos crear igualmente.
    }
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "pdf.js necesita un Worker y DOM para extraer el texto de un PDF, algo que el service worker no puede ofrecer.",
    })
    .catch((err) => {
      // "Only a single offscreen document may be created" no es un error real
      // si ya existe uno — cualquier otro error sí se propaga.
      if (!String(err).includes("single offscreen")) throw err;
    });

  await creatingOffscreen;
  creatingOffscreen = null;
}

async function extractPdfText(arrayBuffer) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ type: "digest-offscreen-extract-pdf", buffer: arrayBuffer });
  if (!response || !response.ok) {
    throw new Error((response && response.error) || "No se pudo extraer texto del PDF.");
  }
  return response.text;
}

async function callLLM(text, length, config) {
  const instruction = LENGTH_INSTRUCTIONS[length] || LENGTH_INSTRUCTIONS.medio;
  const systemPrompt =
    "Eres un asistente que resume contenido web con precisión, sin inventar datos ni añadir opiniones propias. Responde siempre en el mismo idioma del texto original. Puedes usar Markdown (negrita, listas) cuando ayude a la claridad.";
  const userPrompt = `${instruction}\n\n---\n\n${text}`;

  return chatCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

// ---------- Modo Estudio: flashcards ----------

async function generateFlashcards(text, config) {
  const systemPrompt =
    "Eres un asistente que crea material de repaso a partir de un texto. Generas preguntas y respuestas claras y concisas, sin inventar información que no esté en el texto. Respondes siempre en el mismo idioma del texto original.";
  const userPrompt =
    `Genera exactamente ${FLASHCARD_COUNT} preguntas de repaso con su respuesta sobre el siguiente texto, de dificultad media (ni demasiado obvias ni demasiado rebuscadas). ` +
    `Responde ÚNICAMENTE con un array JSON válido, sin texto adicional, sin bloque de código, con este formato exacto: ` +
    `[{"q":"pregunta","a":"respuesta"}, ...]\n\n---\n\n${text}`;

  const raw = await chatCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return parseFlashcardsJSON(raw);
}

function parseFlashcardsJSON(raw) {
  // Los modelos a veces envuelven el JSON en un bloque ```json ... ``` pese
  // a que se les pide que no lo hagan — lo limpiamos antes de parsear.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Último intento: coger solo el primer array que aparezca en el texto.
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("El modelo no devolvió un JSON de flashcards válido.");
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) throw new Error("El modelo no devolvió una lista de flashcards.");

  return parsed
    .filter((c) => c && (c.q || c.question) && (c.a || c.answer))
    .map((c) => ({ q: String(c.q || c.question).trim(), a: String(c.a || c.answer).trim() }));
}

// ---------- Llamada genérica al proveedor (compatible OpenAI) ----------

async function chatCompletion(config, messages) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model || DEFAULT_PROVIDER.model,
      messages,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Error ${res.status}: ${bodyText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Respuesta del modelo vacía o con formato inesperado.");
  return content.trim();
}

// ---------- Cola de lectura ----------

async function addToQueue(tabId) {
  const extracted = await extractFromTab(tabId, "page");
  if (!extracted.ok) throw new Error(extracted.error || "No se pudo extraer contenido de la página.");
  if (!extracted.textContent || extracted.textContent.trim().length < 20) {
    throw new Error("No se pudo extraer suficiente texto de esta página.");
  }

  const item = {
    id: `q-${Date.now()}`,
    dateAdded: new Date().toISOString(),
    title: extracted.title || "(sin título)",
    url: extracted.url || "",
    textContent: extracted.textContent,
    kind: extracted.kind || "html",
  };

  const { digestQueue } = await chrome.storage.local.get("digestQueue");
  const queue = Array.isArray(digestQueue) ? digestQueue : [];
  queue.unshift(item);
  await chrome.storage.local.set({ digestQueue: queue });

  return item;
}

async function processQueueItem(id, length, wantFlashcards) {
  const { digestQueue } = await chrome.storage.local.get("digestQueue");
  const queue = Array.isArray(digestQueue) ? digestQueue : [];
  const item = queue.find((q) => q.id === id);
  if (!item) return { ok: false, error: "Ese elemento ya no está en la cola." };

  const extracted = { ok: true, textContent: item.textContent, title: item.title, url: item.url, kind: item.kind || "html" };
  const result = await summarizeExtracted(extracted, "page", length, wantFlashcards);

  if (result.ok) {
    const remaining = queue.filter((q) => q.id !== id);
    await chrome.storage.local.set({ digestQueue: remaining });
  }

  return result;
}

// ---------- Storage helpers ----------

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Devuelve la lista de proveedores configurados, en orden de prioridad
// (el primero es el que se intenta primero). Migra automáticamente el
// formato antiguo de config única (`digestConfig`) a la lista nueva
// (`digestProviders`) la primera vez que se llama tras la actualización.
async function getProviders() {
  const { digestProviders, digestConfig } = await chrome.storage.local.get(["digestProviders", "digestConfig"]);

  if (Array.isArray(digestProviders) && digestProviders.length > 0) {
    return digestProviders;
  }

  if (digestConfig && digestConfig.endpoint) {
    const migrated = [{ ...DEFAULT_PROVIDER, ...digestConfig, id: "migrated-1", enabled: true }];
    await chrome.storage.local.set({ digestProviders: migrated });
    return migrated;
  }

  return [];
}

async function saveHistoryEntry(entry) {
  const { digestHistory } = await chrome.storage.local.get("digestHistory");
  const history = Array.isArray(digestHistory) ? digestHistory : [];
  history.unshift(entry);
  // Rotación simple: nos quedamos con las últimas 200 entradas.
  const trimmed = history.slice(0, 200);
  await chrome.storage.local.set({ digestHistory: trimmed });
}
