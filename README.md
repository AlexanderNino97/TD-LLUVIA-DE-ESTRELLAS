# TG-01: Lluvia de Estrellas — Minijuego de Evaluación Cognitiva

[![Proyecto UPTC](https://img.shields.io/badge/UPTC-Facultad%20de%20Ingenier%C3%ADa-gold)](#)
[![Población](https://img.shields.io/badge/Poblaci%C3%B3n-Grado%20Tercero-blue)](#)
[![Motor](https://img.shields.io/badge/Kaboom.js-v3000.1.17-brightgreen)](#)
[![Integración](https://img.shields.io/badge/Contrato%20MVP-v1-orange)](#)
[![Configuración](https://img.shields.io/badge/configVersion-2-purple)](#)

Minijuego interactivo desarrollado con **Kaboom.js** y **Node.js** para registrar indicadores conductuales de **atención sostenida** y **control de la respuesta** en estudiantes de grado tercero del Colegio "San Diego" de Duitama, Boyacá (Proyecto UPTC). La tarea es una adaptación del **paradigma Go/No-Go** y de las tareas de ejecución continua.

---

## 📋 Descripción y fundamento metodológico

* **Estímulo objetivo (Go):** estrellas que caen por la zona de actividad. El estudiante debe tocarlas.
* **Estímulo distractor (No-Go):** lunas. El estudiante debe **dejarlas pasar**.
* **Personaje guía:** Kud presenta la consigna en su laboratorio, viaja al espacio y acompaña la práctica.
* **Duración de la medición:** 120 segundos, en 3 segmentos de 40 s.
* **Uso pedagógico:** complementario y **no diagnóstico** (Fundamento teórico, cap. 4–5).

### Flujo de la experiencia

```text
Laboratorio de Kud ──► consigna (con opción "Escuchar otra vez")
        │
        ▼
Transición animada laboratorio → espacio (8,8 s)
        │
        ▼
Práctica guiada (estrella, luna, estrella) con retroalimentación de Kud
   └─ si hay errores se repite una vez (máx. 2 rondas) — no cuenta para los indicadores
        │
        ▼
Cuenta regresiva 3-2-1 ──► MISIÓN (medición, 120 s) ──► Kud cierra la misión ──► envío de datos
```

Durante la medición, Kud queda **quieto** en su nave (zona secundaria) para no introducir movimiento periférico, el globo se oculta y solo se muestra una barra de progreso neutra (sin puntaje).

---

## 📁 Estructura del repositorio

```text
tg-01-estrellas/
├── backend/
│   ├── package.json
│   └── server.js               # Servidor Express de prueba: POST /api/v1/task-sessions/:sessionId/results
└── frontend/
    ├── index.html              # Escenario 16:9 con capas (fondo, Kud, nave, zona de actividad, globo, UI)
    ├── game.js                 # Flujo, mecánica, registro de datos e indicadores
    ├── test_host.html          # Host de prueba por iframe + postMessage (muestra indicadores y JSON)
    ├── assets/
    │   ├── escenario-laboratorio.webp      # Laboratorio de presentación (incluye el globo vacío)
    │   ├── escenario-espacio.webp          # Escenario espacial (incluye la parte trasera de la nave)
    │   ├── nave-frente.png                 # Frente de la nave (va encima de Kud)
    │   ├── kud-quieto.png                  # Kud en reposo
    │   ├── kud-hablando.webm / .webp       # Kud hablando (WebM con transparencia; WebP para Safari)
    │   ├── transicion-lab-a-espacio.webm / .mp4
    │   ├── star.png / moon.png             # Estímulos (mismo estilo de los escenarios)
    │   ├── pop.mp3                         # ⚠ conservar el archivo del proyecto (no incluido aquí)
    │   └── musica.mp3                      # ⚠ conservar el archivo del proyecto (no incluido aquí)
    └── libs/
        └── kaboom.js           # Bundle local de Kaboom.js v3000.1.17 (sin CDN)
```

> `background.gif` y `kud.png` ya no se usan. Si faltan `pop.mp3` o `musica.mp3`, el juego funciona igual y lo registra como incidencia `resource_load_error`.

---

## 🛠️ Especificación técnica y mecánica

### 1. Escenario de tamaño fijo
* El escenario es 16:9 sobre una base lógica de **1920 × 1080** que se escala a cualquier pantalla.
* Los estímulos solo existen dentro de la **zona de actividad** (x 440–1510, y 330–950 de la base). Esa zona es el lienzo de Kaboom, de **1070 × 620 px lógicos**.
* Así la **velocidad, el tamaño y el tiempo de exposición son iguales en todos los equipos**. Antes dependían del alto de la ventana.

### 2. Secuencia de estímulos (determinista y balanceada)
* Una semilla fija (`seed: 20261`) genera **la misma secuencia para todos los estudiantes**.
* **Proporción exacta** de 70 % estrellas y 30 % lunas en **cada** segmento.
* Como máximo 2 lunas seguidas, la misión empieza con una estrella y nunca se repite el mismo carril (6 carriles) dos veces seguidas.
* Intervalo entre apariciones: 1,1–1,8 s. Velocidad constante: 170 px/s. Tamaño fijo: 110 px.
* Cada estímulo tarda **4,29 s** en atravesar la zona.
* Solo aparecen estímulos que alcanzan a terminar su recorrido antes de los 120 s, así que **ningún ensayo queda truncado**.
* Con la configuración actual hay **78 ensayos**: 55 estrellas y 23 lunas.
* `config.sequenceHash` identifica la secuencia exacta usada en cada sesión.

### 3. Tiempos
* **Presentación (`presentedAtMs`):** primer fotograma en que el estímulo es visible en la zona (`performance.now()`).
* **Respuesta (`respondedAtMs`):** marca de tiempo del propio evento del puntero (`event.timeStamp`), en la misma escala que `performance.now()`.
* **Tiempo de respuesta (`rtMs`)** = `respondedAtMs − presentedAtMs` (Fundamento 5.3.3).
* El movimiento se calcula con el reloj y no por fotogramas, así que un equipo lento no cambia la exposición.
* Se puede tocar el estímulo desde que aparece. Antes, un toque sobre una estrella a medio entrar se ignoraba sin registrarse.

### 4. Clasificación de cada ensayo (`result`)
| Resultado | Significado |
| :--- | :--- |
| `hit` | Tocó una estrella (acierto) |
| `miss` | Dejó pasar una estrella (omisión) |
| `false_alarm` | Tocó una luna (comisión) |
| `correct_rejection` | Dejó pasar una luna (rechazo correcto) |

* **`anticipatory: true`:** acierto con TR < 150 ms. Cuenta como acierto, pero no entra en las estadísticas de TR.
* Los toques que no caen sobre ningún estímulo se guardan en `emptyResponses` (dentro o fuera de la zona). **No son comisiones**: la comisión es solo la respuesta a una luna.

### 5. Validez de los ensayos e incidencias (Fundamento 5.4)
* Si la pestaña se oculta (`tab_hidden`) o la ventana pierde el foco (`focus_lost`), los ensayos en pantalla quedan como **inválidos**. Una incidencia técnica **no se convierte en error del estudiante**.
* Los ensayos inválidos **no entran en los denominadores**.
* Mientras la pestaña está oculta, el reloj de la tarea se detiene y el tiempo detenido se guarda en `timing.pausedMs`.
* Incidencias que se registran: `tab_hidden` y `tab_visible` (con duración), `loss_of_focus` y `focus_regained` (con duración), `resource_load_error`, `audio_play_failed`, `script_error`, `network_submit_error`, `transition_skipped` y `small_stage`.

### 6. Segmentos
Cada ensayo se asigna al segmento según su **momento de presentación**: 1 = 0–40 s, 2 = 40–80 s, 3 = 80–120 s. También se guarda el segmento planeado (`plannedSegment`).

---

## 📊 Indicadores (`summary`) — Fundamento teórico 5.5

Se calculan **para el total y para cada segmento**, solo con ensayos válidos.

| Indicador | Fórmula |
| :--- | :--- |
| `precisionPct` | aciertos / estrellas válidas × 100 |
| `omissionRatePct` | omisiones / estrellas válidas × 100 |
| `commissionRatePct` | comisiones / lunas válidas × 100 |
| `rtMedianMs`, `rtMeanMs` | sobre los TR de aciertos válidos y no anticipatorios |
| `rtSdMs` | √(Σ(xᵢ − x̄)² / n) |
| `rtCvPct` | SD / x̄ × 100 |

* Con menos de **5** TR válidos, las medidas de TR quedan en `null` y `status: "insufficient_rt_data"`. Si no hay estrellas o lunas válidas, `status: "insufficient_data"`.
* Nunca se asigna 0 a un dato faltante (Fundamento 5.4.4 y 5.12).
* No se calcula una puntuación global única. El resumen es una ayuda: la plataforma puede recalcularlo a partir de `events`.

---

## 🔗 Contrato de integración MVP (v1)

### Parámetros de invocación por URL
```text
http://<host-juego>/index.html?sessionId=<ID>&token=<LAUNCH_TOKEN>&apiBase=<API_URL>&targetOrigin=<ORIGEN_PADRE>&attempt=<N>
```
| Parámetro | Descripción |
| :--- | :--- |
| `sessionId` | Identificador de la sesión de tarea. |
| `token` | `launchToken` para autenticarse ante el backend. |
| `apiBase` | URL base de la API (p. ej. `http://localhost:3000/api/v1`). |
| `targetOrigin` | Origen permitido para `window.parent.postMessage`. |
| `attempt` | Número de intento (por defecto 1). |

**Solo para pruebas** (quedan registrados en `config.testOverrides`): `duracion=<s>`, `seed=<n>`, `sinTransicion=1`, `autotest=1` (jugador simulado) y `debug=1`.

### Paquete enviado (`POST {apiBase}/task-sessions/{sessionId}/results`, `Authorization: Bearer <token>`)

Los campos del contrato v1 se mantienen: `contractVersion`, `taskId`, `configVersion`, `state`, `device`, `events[]` (con `trial`, `stimulus`, `presentedAtMs`, `respondedAtMs`, `result` y `segment`) e `incidents[]`. **Se agregaron campos sin romper los existentes**:

```json
{
  "contractVersion": "1", "taskId": "TG-01", "configVersion": 2,
  "state": "completed", "phaseReached": "done", "sessionId": "…", "attempt": 1,
  "timing": { "pageLoadedAt": "ISO", "testStartedAt": "ISO", "testEndedAt": "ISO",
              "testStartMs": 0, "testEndMs": 0, "testDurationMs": 120000, "pausedMs": 0 },
  "device": { "viewport": "1366x768", "stagePx": "1365x768", "devicePixelRatio": 1,
              "touch": false, "userAgent": "…", "pointerTypes": ["mouse"] },
  "config": { "durationS": 120, "speedPxS": 170, "stimulusSizePx": 110, "exposureMs": 4294,
              "seed": 20261, "plannedTrials": 78, "plannedTargets": 55, "plannedDistractors": 23,
              "sequenceHash": "…", "testOverrides": {} },
  "instruction": { "shownAtMs": 0, "acceptedAtMs": 0, "repeats": 0 },
  "practice": { "rounds": [ { "round": 1, "items": [ … ], "errors": 0 } ],
                "completed": true, "roundsNeeded": 1, "errors": 0, "durationMs": 0 },
  "events": [ {
      "trial": 1, "stimulus": "star", "lane": 1, "xPx": 268, "sizePx": 110,
      "scheduledOnsetS": 0.6, "plannedSegment": 1, "segment": 1,
      "presentedAtMs": 17530.1, "respondedAtMs": 18172.2, "rtMs": 642.1,
      "exitedAtMs": null, "exposureMs": 642.1, "result": "hit", "anticipatory": false,
      "valid": true, "invalidReason": null, "pointerType": "mouse", "responseX": 268, "responseY": 64.8 } ],
  "emptyResponses": [ { "atMs": 0, "x": 0, "y": 0, "region": "zone", "segment": 2, "pointerType": "mouse" } ],
  "incidents": [ { "type": "tab_visible", "timestampMs": 0, "phase": "test", "hiddenDurationMs": 3016.6 } ],
  "summary": { "overall": { … }, "bySegment": [ { "segment": 1, … } ] }
}
```

### Tolerancia a fallos
* **Fallo de red:** el paquete se guarda en `localStorage` con la clave `pending_session_<sessionId>`.
* **Sesión interrumpida:** si se cierra la página antes de terminar, se envía igual (`fetch` con `keepalive`) con `state: "interrupted"`, `phaseReached` y el mensaje `GAME_INTERRUPTED`. Los ensayos sin resolver quedan con `invalidReason: "interrupted"`. Así se distingue *abandono ≠ respuesta incorrecta ≠ fallo técnico* (Fundamento 5.11).
* **Mensajes al padre:** `GAME_OVER` y `GAME_INTERRUPTED`, con el paquete completo en `payload`.

---

## 🚀 Instalación y despliegue local

```bash
cd tg-01-estrellas/backend && npm install && npm start      # API de prueba en :3000
cd ../frontend && npx http-server -c-1                       # juego en :8080
```

## 🧪 Pruebas

* **Prueba completa:** `http://127.0.0.1:8080/test_host.html?token=DEMO&apiBase=http://localhost:3000/api/v1`. Al terminar, el panel lateral muestra los indicadores totales y por segmento, la práctica, las incidencias y el JSON, que se puede descargar. El backend guarda el JSON en `backend/data/`.
* **Prueba rápida automática:** `index.html?autotest=1&duracion=30&sinTransicion=1`. Un jugador simulado responde y el JSON aparece al final de la página.

---

## 📝 Cambios respecto a la versión preliminar

| # | Antes | Ahora |
| :-- | :--- | :--- |
| 1 | La medición duraba **20 s** (`wait(20)`), aunque el comentario y el README decían 120 s. Solo existía el segmento 1. | 120 s y 3 segmentos de 40 s. |
| 2 | La velocidad era fija en px, pero el recorrido dependía del alto de la ventana, así que la exposición cambiaba según el equipo. | Zona de actividad de tamaño lógico fijo: misma exposición en todos los equipos. |
| 3 | Secuencia aleatoria (`chance(0.7)`): cada estudiante veía una cantidad distinta de estrellas y lunas. | Secuencia fija con semilla, balanceada por segmento. |
| 4 | Tamaño aleatorio (75–105 px). | Tamaño fijo y registrado. |
| 5 | La presentación se marcaba cuando el **centro** llegaba al borde, y los toques antes de eso se ignoraban sin registrarse. | Presentación en el primer fotograma visible; se puede responder desde entonces. |
| 6 | No se guardaba el TR ni se marcaban las anticipaciones. | `rtMs` con la marca del evento y `anticipatory`. |
| 7 | Los estímulos que quedaban al terminar se contaban como omisión o rechazo correcto con la ventana de respuesta cortada. | Ningún ensayo se trunca; si ocurre, queda inválido y no cuenta como error. |
| 8 | La pérdida de foco no afectaba a los ensayos. | Los ensayos afectados quedan inválidos y el reloj se detiene con la pestaña oculta. |
| 9 | El segmento se asignaba al crear el estímulo. | Se asigna al presentarlo. |
| 10 | Sin datos de práctica, de repetición de la consigna ni de abandono. | `instruction`, `practice`, `phaseReached` y envío al interrumpir. |
| 11 | La ruta del servidor de prueba (`/api/sessions/:id/tasks/TG-01`) no coincidía con la que usa el juego. | `POST /api/v1/task-sessions/:sessionId/results`. |
| 12 | `index.html` cargaba Kaboom desde un CDN. | Copia local (`libs/kaboom.js`). |

## 📄 Créditos e instituciones

* **Institución:** Universidad Pedagógica y Tecnológica de Colombia (UPTC) — Facultad de Ingeniería.
* **Proyecto:** Plataforma web para el seguimiento de indicadores de memoria y atención en primaria.
* **Colegio objetivo:** Colegio de Preescolar y Básica Primaria "San Diego" (Duitama, Boyacá).
