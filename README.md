# Digest — Resumidor con IA

Extensión de Chrome (Manifest V3) que resume páginas web con IA desde el propio navegador. Sin backend propio: tú aportas tu API key (OpenAI, o cualquier endpoint compatible) o apuntas a un modelo local con [Ollama](https://ollama.com).

## Funcionalidades (v0.1 — MVP)

- Resumir la página activa completa (extracción de contenido con [Readability.js](https://github.com/mozilla/readability), la misma librería del modo lectura de Firefox) o solo el texto seleccionado.
- Tres niveles de longitud: **breve** (1-2 frases), **medio** (bullets) y **extenso** (resumen estructurado por secciones).
- Menú contextual (clic derecho) para resumir selección o página sin abrir el popup primero.
- Exportar cualquier resumen como Markdown con frontmatter YAML (título, URL, fecha), listo para pegar en Obsidian o cualquier otro sistema de notas.
- Historial local de todos los resúmenes generados, con buscador, exportación individual o completa (JSON), y borrado.
- Configuración por **proveedor** desde Opciones (OpenAI, Google Gemini, Groq, OpenRouter, Ollama local o Personalizado): eliges uno y el endpoint/modelo se rellenan solos, solo hace falta pegar la API key. Botón "Probar conexión" para validar antes de guardar.
- **Varios proveedores a la vez, con fallback automático**: puedes guardar más de uno (por ejemplo Gemini + Groq + OpenRouter) y ordenarlos por prioridad. Si el primero falla o está saturado, Digest prueba el siguiente de la lista solo, sin que tengas que hacer nada — el resumen final indica de qué proveedor vino.
- El resumen se muestra con formato real (negrita, listas, encabezados) tanto en el popup como en el historial, en vez de texto plano con `**` sueltos.
- Interfaz con la paleta e identidad visual de Shellpath (Nunito + JetBrains Mono, tema pastel, esquinas redondeadas), vendorizada localmente sin llamadas a fuentes externas.
- **Modo Estudio**: marca la casilla "+ Flashcards" antes de resumir y, además del resumen, Digest genera 5 preguntas y respuestas sobre el contenido. Se muestran como tarjetas que revelan la respuesta al hacer clic, y se pueden exportar a CSV listo para importar en Anki.
- **Cola de lectura**: botón "+ Añadir a la cola" (o desde el menú contextual) para guardar una página sin resumirla todavía — el texto se extrae en el momento, así que puedes cerrar la pestaña original. Desde la pestaña "Cola de lectura" del historial la resumes una a una o todas de golpe (procesamiento secuencial, para no saturar el proveedor gratuito de turno).

## Instalación (modo desarrollador)

Como Mirage, esta extensión no está en la Chrome Web Store — se instala manualmente:

1. Clona este repositorio.
2. Ve a `chrome://extensions`.
3. Activa "Modo de desarrollador" (interruptor arriba a la derecha).
4. Pulsa "Cargar descomprimida" y selecciona la carpeta del proyecto.
5. Abre Opciones (icono ⚙️ en el popup), elige tu proveedor de IA y pega tu API key.

### Proveedores soportados de serie

| Proveedor | Coste | Necesita API key | Dónde conseguirla |
|---|---|---|---|
| OpenAI | De pago | Sí | platform.openai.com/api-keys |
| Google Gemini | Gratis (tier gratuito generoso) | Sí | aistudio.google.com/apikey |
| Groq | Gratis, el más rápido de los gratuitos | Sí | console.groq.com/keys |
| OpenRouter | Gratis (modelos con sufijo `:free`) | Sí | openrouter.ai/keys |
| Ollama (modelo local) | Gratis, corre en tu equipo | No | Instala [Ollama](https://ollama.com) y descarga un modelo, p. ej. `ollama pull llama3.1` |
| Personalizado | Depende | Depende | Cualquier API compatible con `chat/completions` de OpenAI |

Al elegir un proveedor en el formulario de Opciones, el endpoint y el modelo se rellenan automáticamente (editable en "Ajustes avanzados" si hace falta). Usa **Probar conexión** antes de guardar para confirmar que funciona.

### Varios proveedores y fallback

En vez de una única configuración, Opciones guarda una **lista** de proveedores. Añade los que quieras (por ejemplo Gemini como principal y Groq + OpenRouter como respaldo) y reordénalos con las flechas ↑/↓ — el primero de la lista es el que se intenta primero. Si da un error (saturación, rate limit, key inválida...), Digest prueba automáticamente el siguiente sin que tengas que hacer nada, y el resumen final indica de qué proveedor vino la respuesta. Puedes desactivar un proveedor temporalmente sin borrarlo (botón "Desactivar" en su tarjeta) si por ejemplo no quieres que se use el de pago salvo que los gratuitos fallen todos.

### Solución de problemas

- **Error 404 "model is no longer available"**: el proveedor renombró o retiró ese modelo (le pasó a Gemini con la línea `2.5-*`, sustituida por `3.5-*`/`3.6-*` en 2026). Entra en "Ajustes avanzados" y pon el nombre de modelo vigente — consulta la documentación del proveedor si no lo sabes.
- **Error 503 "currently experiencing high demand" / "UNAVAILABLE"**: no es un problema de configuración, es el proveedor saturado en ese momento. Reintenta en un rato o cambia de proveedor mientras tanto.
- **Error 401 "incorrect API key"**: normalmente significa que la key es de un proveedor distinto al endpoint seleccionado (por ejemplo, una key de Gemini contra el endpoint de OpenAI). Revisa que el proveedor elegido coincida con la key que has pegado.
- **Error 429 "rate limit"**: has superado el límite de peticiones por minuto/día del tier gratuito. Espera o cambia de proveedor.

## Por qué pide permisos tan amplios

El `manifest.json` declara `host_permissions` sobre `https://*/*` y `http://*/*`. Es necesario porque Digest tiene que poder extraer el contenido de **cualquier** página que decidas resumir — no solo un dominio concreto. El content script no hace nada por sí solo: únicamente se ejecuta cuando tú pulsas "Resumir página" o usas el menú contextual, nunca en segundo plano ni sin tu acción explícita.

## Privacidad

- Cero telemetría propia. Nada sale de tu máquina salvo la llamada que tú configures al proveedor de IA que elijas.
- Historial, configuración y todo lo demás vive en `chrome.storage.local` — solo en tu equipo.
- El código es legible y auditable: no hay build step ni dependencias empaquetadas más allá de Readability.js (vendorizada en `vendor/`, licencia Apache 2.0).

## Roadmap

Ver la nota de proyecto completa en el vault para el detalle de fases futuras: exportar a PDF, importar PDF y Word, resumen combinado de varias páginas a la vez, quiz interactivo, trazabilidad, texto a voz y traducción.

## Licencia

MIT — ver [LICENSE](LICENSE). Readability.js se distribuye bajo Apache 2.0 (ver cabecera del archivo en `vendor/Readability.js`). Tipografías vendorizadas en `vendor/fonts/`: Nunito (SIL Open Font License) y JetBrains Mono (Apache 2.0).
