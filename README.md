# TG-01: Lluvia de Estrellas — Minijuego de Evaluación Cognitiva

[![Proyecto UPTC](https://img.shields.io/badge/UPTC-Facultad%20de%20Ingenier%C3%ADa-gold)](#)
[![Población](https://img.shields.io/badge/Poblaci%C3%B3n-Grado%20Tercero-blue)](#)
[![Motor](https://img.shields.io/badge/Kaboom.js-v3000.1.17-brightgreen)](#)
[![Integración](https://img.shields.io/badge/Contrato%20MVP-v1-orange)](#)

Minijuego interactivo desarrollado con **Kaboom.js** y **Node.js** para la evaluación de la **atención sustained** y el **control inhibitorio** en estudiantes de grado tercero del Colegio "San Diego" de Duitama, Boyacá (Proyecto UPTC). La tarea está basada en una adaptación del **paradigma Go/No-Go** y de ejecuciones continuas.

---

## 📋 Descripción y Fundamento Metodológico

La actividad digital **TG-01: Lluvia de Estrellas** evalúa cómo el estudiante mantiene la disposición atencional ante una secuencia continua de estímulos a lo largo del tiempo, regulando sus respuestas ante objetivos y distractores:

* **Estímulo Objetivo (Go):** Estrellas que caen verticalmente por la pantalla. El estudiante debe hacer clic/tocarlas rápidamente antes de que salgan del área visible.
* **Estímulo Distractor (No-Go):** Lunas que caen por la pantalla. El estudiante debe **evitar** tocarlas y dejar que desaparezcan libremente.
* **Personaje Guía:** "Kud" (mascota de la plataforma) presenta la consigna inicial e instruye el comienzo de la actividad.
* **Duración Total:** 2 minutos (120 segundos).
* **Uso Pedagógico:** Carácter puramente **complementario y no diagnóstico**. Sus resultados no establecen diagnósticos de TDAH ni etiquetas clínicas, sino que aportan información descriptiva para el seguimiento docente.

---

## 📁 Estructura del Repositorio

```text
tg-01-estrellas/
├── backend/
│   ├── package.json
│   └── server.js               # Servidor Express de prueba local para ingesta de datos
└── frontend/
    ├── index.html              # Contenedor HTML del lienzo Canvas y scripts
    ├── game.js                 # Lógica principal del juego (Kaboom.js, motor de eventos)
    ├── test_host.html          # Entorno de prueba de integración vía Iframe y postMessage
    ├── assets/                 # Recursos multimedia locales
    │   ├── background.avif     # Fondo espacial/nocturno
    │   ├── kud.png             # Personaje guía Kud
    │   ├── star.png            # Estímulo objetivo (Estrella)
    │   ├── moon.webp           # Estímulo distractor (Luna)
    │   ├── pop.mp3             # Efecto de audio discreto (Acierto)
    │   └── musica.mp3          # Música de fondo ambiental
    └── libs/
        └── kaboom.js           # Bundle local de Kaboom.js v3000.1.17 (sin dependencia de CDN)
```

---

## 🛠️ Especificación Técnica y Mecánica del Juego

### 1. Sistema Anti-Sobreposición y Carriles (Lanes)
Para garantizar la validez neuropsicológica de las mediciones y evitar superposición visual de estímulos:
* **Generación en 6 carriles horizontales:** La pantalla se divide dinámicamente en 6 carriles invisibles.
* **Verificación Espacial 2D en Tiempo Real:** Antes de spawnear un objeto, el motor verifica que no exista ningún estímulo activo a una distancia menor de $180\text{ px}$ ($\sqrt{\Delta x^2 + \Delta y^2}$).
* **Velocidad de Caída Uniforme:** Todos los estímulos descienden a una velocidad constante ($210\text{ px/s}$) para mantener trayectorias paralelas que previenen alcances.

### 2. Registro de Tiempos y Medición de Precisión
* **Marca Temporal de Presentación (`presentedAtMs`):** Se registra mediante la API de alta precisión `performance.now()` exactamente en el instante en que el borde del estímulo entra en la zona visible de la pantalla ($y \ge 0$).
* **Tiempo de Reacción (`reaction_time_ms`):** Se calcula como `respondedAtMs - presentedAtMs`.

### 3. Clasificación de Resultados por Ensayo (`result`)
* **`hit`:** Tocó una estrella (Acierto).
* **`false_alarm`:** Tocó una luna (Comisión / Falsa alarma).
* **`miss`:** Dejó pasar una estrella sin tocarla (Omisión / Inatención).
* **`correct_rejection`:** Dejó pasar una luna sin tocarla (Rechazo correcto / Control inhibitorio).

### 4. Segmentación Temporal (`segment`)
Evalúa el comportamiento de la atención sostenida dividiendo los 120 segundos en tres bloques iguales:
* **Segmento 1:** 0 a 40 segundos.
* **Segmento 2:** 40 a 80 segundos.
* **Segmento 3:** 80 a 120 segundos.

### 5. Registro de Incidencias (`incidents`)
Captura eventos del entorno que puedan alterar la medición:
* `loss_of_focus`: Pérdida de foco de la pestaña/ventana (`window.onblur`).
* `script_error`: Excepciones no controladas.
* `network_submit_error`: Fallos en la entrega de la API HTTP.
* `audio_play_failed`: Bloqueo de reproducción de audio por políticas del navegador.

---

## 🔗 Contrato de Integración MVP (v1)

### Parámetros de Invocación por URL
El juego se lanza dentro de un `<iframe>` consumiendo parámetros de consulta (Query Params) emitidos por la plataforma principal (Kudlab):

```text
http://<host-juego>/index.html?sessionId=<ID>&token=<LAUNCH_TOKEN>&apiBase=<API_URL>&targetOrigin=<ORIGIN_PADRE>
```

| Parámetro | Descripción |
| :--- | :--- |
| `sessionId` | Identificador único transaccional de la sesión de tarea. |
| `token` | `launchToken` de un solo uso para autenticación en la ingesta del backend. |
| `apiBase` | URL base de la API backend (ej. `http://localhost:3000/api/v1`). |
| `targetOrigin` | Dominio permitido para el evento `window.parent.postMessage`. |

### Estructura del Paquete JSON Enviado (`POST /api/v1/task-sessions/{sessionId}/results`)

```json
{
  "contractVersion": "1",
  "taskId": "TG-01",
  "configVersion": 1,
  "state": "completed",
  "device": {
    "viewport": "1366x768",
    "touch": false
  },
  "events": [
    {
      "trial": 1,
      "stimulus": "star",
      "presentedAtMs": 2478.100000023842,
      "respondedAtMs": 4196.800000071526,
      "result": "hit",
      "segment": 1
    },
    {
      "trial": 2,
      "stimulus": "moon",
      "presentedAtMs": 3846.300000071526,
      "respondedAtMs": null,
      "result": "correct_rejection",
      "segment": 1
    }
  ],
  "incidents": [
    {
      "type": "loss_of_focus",
      "timestampMs": 9538.200000047684
    }
  ]
}
```

### Tolerancia a Fallos y Redundancia
* **Manejo Offline / Fallo de Red:** Si la petición HTTP hacia la API falla, el paquete JSON completo se respalda automáticamente en el `localStorage` bajo la clave `pending_session_<sessionId>`.
* **Drenaje al Finalizar:** Al cumplirse el tiempo límite, todos los estímulos que permanecen activos en pantalla se resuelven automáticamente (`miss` o `correct_rejection`) para no perder denominadores.

---

## 🚀 Instalación y Despliegue Local

### Requisitos Previos
* Node.js (v18.0.0 o superior).
* Administrador de paquetes `npm`.

### Paso 1: Clonar el proyecto e instalar dependencias del backend

```bash
cd tg-01-estrellas/backend
npm install
```

### Paso 2: Ejecutar el frontend del juego

Navega a la carpeta `frontend` y levanta un servidor estático (ej. `http-server`):

```bash
cd ../frontend
npx http-server -c-1
```

El servidor web quedará escuchando por defecto en `http://127.0.0.1:8080`.

---

## 🧪 Procedimientos de Prueba

### Opción A: Prueba Directa en Navegador (Parámetros de Simulación)
Copia y pega la siguiente URL en tu navegador:

```text
http://127.0.0.1:8080/index.html?sessionId=SESION-TEST-01&token=TOKEN-DEMO-999&apiBase=http://localhost:3000/api/v1&targetOrigin=*
```

1. Presiona `F12` para abrir las **DevTools**.
2. Juega la partida.
3. Al finalizar, inspecciona el almacenamiento local en la pestaña **Application $\rightarrow$ Local Storage $\rightarrow$ `http://127.0.0.1:8080`**: verás creada la entrada `pending_session_SESION-TEST-01` con el payload JSON completo.

### Opción B: Prueba de Integración por Iframe
Abre en el navegador el archivo de prueba del host:

```text
http://127.0.0.1:8080/test_host.html
```

Este archivo incrusta el juego dentro de un `<iframe>` y escucha el evento `window.addEventListener("message")`. Al completar los 2 minutos (o el tiempo configurado), el host mostrará en pantalla el JSON transmitido vía `postMessage`.

---

## 📄 Créditos e Instituciones

* **Institución:** Universidad Pedagógica y Tecnológica de Colombia (UPTC) — Facultad de Ingeniería.
* **Proyecto:** Plataforma web para el seguimiento de indicadores de memoria y atención en primaria.
* **Colegio Objetivo:** Colegio de Preescolar y Básica Primaria "San Diego" (Duitama, Boyacá).