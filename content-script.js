// Digest — content-script.js
// Se inyecta junto con vendor/Readability.js. Define una función global
// que scripting.executeScript vuelve a invocar por separado (func:) para
// poder recoger su valor de retorno de forma fiable.

window.__digestExtractArticle = function () {
  try {
    // Readability muta el DOM que recibe, así que le pasamos un clon
    // para no romper la página real del usuario.
    const clone = document.cloneNode(true);
    const article = new Readability(clone, { charThreshold: 200 }).parse();

    if (!article || !article.textContent || article.textContent.trim().length < 50) {
      // Fallback: si Readability no consigue extraer nada útil (páginas muy
      // dinámicas, apps SPA raras, etc.), usamos el texto plano del body.
      return {
        ok: true,
        title: document.title || "",
        textContent: document.body ? document.body.innerText.slice(0, 20000) : "",
        excerpt: "",
        byline: "",
        url: location.href,
        fallback: true,
      };
    }

    return {
      ok: true,
      title: article.title || document.title || "",
      textContent: article.textContent.slice(0, 20000),
      excerpt: article.excerpt || "",
      byline: article.byline || "",
      url: location.href,
      fallback: false,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
};

window.__digestGetSelection = function () {
  const text = window.getSelection ? window.getSelection().toString() : "";
  return {
    ok: true,
    textContent: text.slice(0, 20000),
    title: document.title || "",
    url: location.href,
  };
};
