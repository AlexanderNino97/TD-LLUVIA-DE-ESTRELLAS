/* =====================================================================
   TG-01 · Lluvia de estrellas (Go/No-Go de ejecución continua)
   Flujo: laboratorio (consigna de Kud) → transición → práctica guiada
          → misión (medición, 120 s) → cierre → envío de datos
   ===================================================================== */
"use strict";

/* ---------------------------------------------------------------------
   1. PARÁMETROS DE INTEGRACIÓN (URL)
   ------------------------------------------------------------------- */
const urlParams    = new URLSearchParams(window.location.search);
const sessionId    = urlParams.get("sessionId");
const launchToken  = urlParams.get("token");
const apiBase      = urlParams.get("apiBase") || "http://localhost:3000/api/v1";
const targetOrigin = urlParams.get("targetOrigin") || window.location.origin;
const attempt      = parseInt(urlParams.get("attempt") || "1", 10);
// Solo para pruebas (quedan registrados en config.testOverrides):
const AUTOTEST     = urlParams.get("autotest") === "1";   // un "jugador" simulado
const SKIP_VIDEO   = urlParams.get("sinTransicion") === "1";
const DEBUG        = urlParams.get("debug") === "1" || AUTOTEST;

/* ---------------------------------------------------------------------
   2. CONFIGURACIÓN DE LA TAREA (cambiar aquí = subir configVersion)
   ------------------------------------------------------------------- */
const CONFIG = {
    taskId: "TG-01",
    contractVersion: "1",
    configVersion: 2,
    durationS: 120,                 // duración de la medición (Fundamento: ~2 min)
    segmentCount: 3,                // 0–40 s, 40–80 s, 80–120 s
    zone: { width: 1070, height: 620 }, // zona de actividad, px lógicos (independiente de la pantalla)
    speedPxS: 170,                  // velocidad de caída constante
    stimulusSizePx: 110,            // tamaño fijo de estrellas y lunas (≈ 73 px en una pantalla de 1280 px)
    targetRatio: 0.7,               // 70 % estrellas (Go), 30 % lunas (No-Go) en cada segmento
    isiMinS: 1.1, isiMaxS: 1.8,     // intervalo entre apariciones
    lanes: 6,
    maxConsecutiveDistractors: 2,
    seed: 20261,                    // misma secuencia para todos los estudiantes
    anticipationMs: 150,            // aciertos con TR menor: anticipatorios (no entran a estadísticas de TR)
    minRtForStats: 5,               // menos TR válidos que esto → "datos insuficientes"
    hitRadiusFactor: 0.6,           // radio de toque = tamaño × factor
    practice: { sequence: ["star", "moon", "star"], maxRounds: 2 },
    musicVolume: 0.25,
    testOverrides: {}
};
if (urlParams.get("duracion")) { CONFIG.durationS = Math.max(10, +urlParams.get("duracion")); CONFIG.testOverrides.durationS = CONFIG.durationS; }
if (urlParams.get("seed"))     { CONFIG.seed = +urlParams.get("seed"); CONFIG.testOverrides.seed = CONFIG.seed; }
if (AUTOTEST) CONFIG.testOverrides.autotest = true;
CONFIG.exposureMs = Math.round((CONFIG.zone.height + CONFIG.stimulusSizePx) / CONFIG.speedPxS * 1000);

/* ---------------------------------------------------------------------
   3. ESTRUCTURA DE LA SESIÓN (contrato v1 + campos adicionales)
   ------------------------------------------------------------------- */
const T0_ISO = new Date().toISOString();
const incidents = [];
const sessionData = {
    contractVersion: CONFIG.contractVersion,
    taskId: CONFIG.taskId,
    configVersion: CONFIG.configVersion,
    state: "interrupted",           // completed | interrupted
    phaseReached: "loading",        // loading | intro | transition | practice | test | done
    sessionId: sessionId,
    attempt: attempt,
    timing: { pageLoadedAt: T0_ISO, testStartedAt: null, testEndedAt: null, testStartMs: null, testEndMs: null,
              testDurationMs: null, pausedMs: 0 },
    device: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        stagePx: null,
        devicePixelRatio: window.devicePixelRatio || 1,
        touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
        userAgent: navigator.userAgent,
        pointerTypes: []
    },
    config: null,                   // copia de CONFIG + huella de la secuencia
    instruction: { shownAtMs: null, acceptedAtMs: null, repeats: 0 },
    practice: { rounds: [], completed: false, roundsNeeded: 0, errors: 0, durationMs: null },
    events: [],                     // un registro por ensayo (estímulo) de la medición
    emptyResponses: [],             // toques que no cayeron sobre ningún estímulo
    incidents: incidents,
    summary: null                   // indicadores calculados (Fundamento, cap. 5.5)
};

const now = () => performance.now();
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
function addIncident(type, extra) { incidents.push(Object.assign({ type, timestampMs: r1(now()), phase: sessionData.phaseReached }, extra || {})); }

window.addEventListener("error", (e) => addIncident("script_error", { message: String(e.message || e) }));

/* ---------------------------------------------------------------------
   4. SECUENCIA DE ESTÍMULOS (determinista y balanceada)
   ------------------------------------------------------------------- */
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function buildSchedule(cfg) {
    const rnd = mulberry32(cfg.seed);
    const segLenS = cfg.durationS / cfg.segmentCount;
    const exposureS = cfg.exposureMs / 1000;
    // tiempos de aparición: cada estímulo debe terminar su recorrido dentro de la duración
    const times = [];
    let t = 0.6;
    while (t + exposureS <= cfg.durationS) { times.push(t); t += cfg.isiMinS + rnd() * (cfg.isiMaxS - cfg.isiMinS); }
    // tipos balanceados por segmento: proporción exacta y como máximo N lunas seguidas
    const segOf = (s) => Math.min(cfg.segmentCount, Math.floor(s / segLenS) + 1);
    const types = new Array(times.length);
    for (let sg = 1; sg <= cfg.segmentCount; sg++) {
        const idx = times.map((s, i) => [s, i]).filter(([s]) => segOf(s) === sg).map(([, i]) => i);
        const nStars = Math.round(idx.length * cfg.targetRatio);
        let arr, ok = false, guard = 0;
        while (!ok && guard++ < 500) {
            arr = Array(nStars).fill("star").concat(Array(idx.length - nStars).fill("moon"));
            for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
            let run = 0; ok = true;
            for (const x of arr) { run = x === "moon" ? run + 1 : 0; if (run > cfg.maxConsecutiveDistractors) { ok = false; break; } }
            if (sg === 1 && arr[0] === "moon") ok = false;   // la misión empieza con una estrella
        }
        idx.forEach((i, k) => { types[i] = arr[k]; });
    }
    // carriles: nunca el mismo carril dos veces seguidas
    const laneW = cfg.zone.width / cfg.lanes;
    let prevLane = -1;
    const items = times.map((s, i) => {
        let lane; do { lane = Math.floor(rnd() * cfg.lanes); } while (lane === prevLane);
        prevLane = lane;
        return { index: i + 1, tSpawnS: Math.round(s * 1000) / 1000, type: types[i], lane, x: Math.round(lane * laneW + laneW / 2), plannedSegment: segOf(s) };
    });
    return items;
}
function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

/* ---------------------------------------------------------------------
   5. INDICADORES (Fundamento teórico, 5.5) — función pura
   ------------------------------------------------------------------- */
function computeIndicators(events, emptyResponses, cfg) {
    const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sdPop = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); }; // SD = √(Σ(x−x̄)²/n)
    const pct = (num, den) => (den > 0 ? r1(num / den * 100) : null);

    function block(evts, empties) {
        const valid = evts.filter((e) => e.valid);
        const targets = valid.filter((e) => e.stimulus === "star");
        const distractors = valid.filter((e) => e.stimulus === "moon");
        const hits = targets.filter((e) => e.result === "hit");
        const omissions = targets.filter((e) => e.result === "miss").length;
        const commissions = distractors.filter((e) => e.result === "false_alarm").length;
        const correctRejections = distractors.filter((e) => e.result === "correct_rejection").length;
        const rts = hits.filter((e) => e.rtMs != null && !e.anticipatory).map((e) => e.rtMs);
        const rtOk = rts.length >= cfg.minRtForStats;
        const m = rtOk ? mean(rts) : null, sd = rtOk ? sdPop(rts) : null;
        return {
            stimuliPresented: evts.length,
            invalidTrials: evts.length - valid.length,
            validTargets: targets.length,
            validDistractors: distractors.length,
            hits: hits.length,
            omissions,
            commissions,
            correctRejections,
            precisionPct: pct(hits.length, targets.length),          // aciertos / objetivos válidos × 100
            omissionRatePct: pct(omissions, targets.length),         // omisiones / objetivos válidos × 100
            commissionRatePct: pct(commissions, distractors.length), // comisiones / distractores válidos × 100
            anticipatoryHits: hits.filter((e) => e.anticipatory).length,
            emptyResponses: empties.length,
            rtValidN: rts.length,
            rtMedianMs: rtOk ? r1(median(rts)) : null,
            rtMeanMs: rtOk ? r1(m) : null,
            rtSdMs: rtOk ? r1(sd) : null,                              // desviación estándar (poblacional)
            rtCvPct: rtOk && m > 0 ? r1(sd / m * 100) : null,          // coeficiente de variación
            status: (targets.length === 0 || distractors.length === 0) ? "insufficient_data"
                  : (rtOk ? "ok" : "insufficient_rt_data")
        };
    }
    const overall = block(events, emptyResponses);
    const bySegment = [];
    for (let s = 1; s <= cfg.segmentCount; s++) {
        bySegment.push(Object.assign({ segment: s }, block(events.filter((e) => e.segment === s), emptyResponses.filter((e) => e.segment === s))));
    }
    return { formulasRef: "Fundamento teórico 5.5.1–5.5.6", overall, bySegment };
}

/* ---------------------------------------------------------------------
   6. ELEMENTOS DE LA PÁGINA, AUDIO Y KUD
   ------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const stage = $("stage"), zoneEl = $("zone"), canvas = $("game");
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

// Kud: quieto (imagen) / hablando (WebM; WebP animado en Safari)
const kudIdle = $("kudIdle"), kudTalk = $("kudTalk"), kudTalkImg = $("kudTalkImg");
if (isSafari) kudTalkImg.src = "assets/kud-hablando.webp";
function kudTalking(on) {
    if (isSafari) { kudTalkImg.classList.toggle("hidden", !on); kudIdle.classList.toggle("hidden", on); return; }
    if (on) { kudTalk.classList.remove("hidden"); kudIdle.classList.add("hidden"); kudTalk.play().catch(() => {}); }
    else { kudTalk.pause(); kudTalk.classList.add("hidden"); kudIdle.classList.remove("hidden"); }
}
const STAR_ICON = '<img class="ico" src="assets/star.png" alt="estrella">';
const MOON_ICON = '<img class="ico" src="assets/moon.png" alt="luna">';
let talkTimer = null;
function say(html, ms, where) {
    const el = where === "lab" ? $("labText") : $("spaceBubble");
    if (where !== "lab") { el.classList.remove("hidden"); }
    el.innerHTML = `<span>${html}</span>`;
    el.classList.remove("off");
    kudTalking(true);
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => kudTalking(false), ms || 1800);
}
function hideBubble() { $("spaceBubble").classList.add("off"); kudTalking(false); }
const sleep = (ms) => new Promise((r) => setTimeout(r, AUTOTEST ? Math.min(ms, 120) : ms));
function buttons(defs) {     // defs: [{label, alt, onClick}]
    const box = $("buttons"); box.innerHTML = "";
    return new Promise((resolve) => {
        defs.forEach((d, i) => {
            const b = document.createElement("button");
            b.className = "btn" + (d.alt ? " alt" : ""); b.textContent = d.label;
            b.addEventListener("click", (ev) => { ev.stopPropagation(); box.innerHTML = ""; resolve(i); });
            box.appendChild(b);
        });
        if (AUTOTEST) setTimeout(() => { const b = box.querySelector(".btn"); if (b) b.click(); }, 150);
    });
}

// Audio (archivos opcionales: si faltan, se registra la incidencia y el juego sigue)
let music = null, audioCtx = null, popBuffer = null;
function initAudio() {
    try {
        music = new Audio("assets/musica.mp3"); music.loop = true; music.volume = CONFIG.musicVolume;
        let musicMissing = false;
        music.addEventListener("error", () => { musicMissing = true; addIncident("resource_load_error", { resource: "musica.mp3" }); });
        music.play().catch((e) => { if (!musicMissing) addIncident("audio_play_failed", { message: e.message }); });
    } catch (e) { addIncident("audio_play_failed", { message: e.message }); }
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        fetch("assets/pop.mp3").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
            .then((b) => audioCtx.decodeAudioData(b)).then((buf) => { popBuffer = buf; })
            .catch(() => { addIncident("resource_load_error", { resource: "pop.mp3" }); });
    } catch (e) { addIncident("audio_play_failed", { message: e.message }); }
}
function playPop() {
    try {
        if (popBuffer && audioCtx) { const s = audioCtx.createBufferSource(), g = audioCtx.createGain(); g.gain.value = 0.5; s.buffer = popBuffer; s.connect(g).connect(audioCtx.destination); s.start(); }
    } catch (e) { /* sin sonido */ }
}

/* ---------------------------------------------------------------------
   7. RELOJ DE LA ACTIVIDAD E INCIDENCIAS DE FOCO
   El reloj se detiene mientras la pestaña está oculta; los ensayos que
   coinciden con una pérdida de foco quedan inválidos (no son errores).
   ------------------------------------------------------------------- */
let pausedAccum = 0, hiddenSince = null, blurSince = null;
const clock = () => now() - pausedAccum - (hiddenSince != null ? now() - hiddenSince : 0);
let activeTrials = [];        // ensayos en pantalla (práctica o medición)

function invalidateActive(reason) {
    activeTrials.forEach((tr) => { if (tr.rec && tr.rec.valid) { tr.rec.valid = false; tr.rec.invalidReason = reason; } });
}
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        hiddenSince = now(); invalidateActive("tab_hidden"); addIncident("tab_hidden");
    } else if (hiddenSince != null) {
        const d = now() - hiddenSince; pausedAccum += d; sessionData.timing.pausedMs = r1(pausedAccum); hiddenSince = null;
        addIncident("tab_visible", { hiddenDurationMs: r1(d) });
    }
});
window.addEventListener("blur", () => { blurSince = now(); invalidateActive("focus_lost"); addIncident("loss_of_focus"); });
window.addEventListener("focus", () => { if (blurSince != null) { addIncident("focus_regained", { blurDurationMs: r1(now() - blurSince) }); blurSince = null; } });

/* ---------------------------------------------------------------------
   8. KABOOM: dibuja solo los estímulos dentro de la zona de actividad
   ------------------------------------------------------------------- */
kaboom({
    canvas: canvas,
    width: CONFIG.zone.width,
    height: CONFIG.zone.height,
    stretch: true,
    letterbox: false,
    background: [0, 0, 0, 0],
    pixelDensity: Math.min(2, window.devicePixelRatio || 1),
    global: true,
    debug: false,
    backgroundAudio: true
});
loadSprite("star", "assets/star.png");
loadSprite("moon", "assets/moon.png");

const SIZE = CONFIG.stimulusSizePx;
function spawnStimulus(type, x, startClock, rec) {
    const obj = add([sprite(type, { width: SIZE, height: SIZE }), pos(x, -SIZE / 2), anchor("center"), "stimulus"]);
    const tr = { obj, type, x, startClock, rec, presented: false, resolved: false, onResolve: null };
    activeTrials.push(tr);
    return tr;
}
function sparkle(x, y) {   // pequeño destello circular de acierto (no usa formas de estrella)
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = add([circle(6), pos(x, y), color(255, 236, 160), opacity(1), anchor("center"), { vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0 }]);
        p.onUpdate(() => { p.life += dt(); p.pos.x += p.vx * dt(); p.pos.y += p.vy * dt(); p.opacity = 1 - p.life / 0.35; if (p.life > 0.35) destroy(p); });
    }
}
function resolveTrial(tr, result, extra) {
    if (tr.resolved) return;
    tr.resolved = true;
    Object.assign(tr.rec, { result }, extra || {});
    destroy(tr.obj);
    activeTrials = activeTrials.filter((t) => t !== tr);
    if (tr.onResolve) tr.onResolve(tr.rec);
}
// Movimiento por reloj (no por fotogramas): la exposición es la misma en cualquier equipo
onUpdate(() => {
    const c = clock();
    for (const tr of [...activeTrials]) {
        const y = -SIZE / 2 + (c - tr.startClock) / 1000 * CONFIG.speedPxS;
        tr.obj.pos.y = y;
        if (!tr.presented && y + SIZE / 2 > 0) {        // primer fotograma en que es visible
            tr.presented = true;
            tr.rec.presentedAtMs = r1(now());
            tr.rec.segment = currentSegment();
        }
        if (y - SIZE / 2 >= CONFIG.zone.height) {      // salió por completo de la zona
            resolveTrial(tr, tr.type === "star" ? "miss" : "correct_rejection", { respondedAtMs: null, rtMs: null, exitedAtMs: r1(now()), exposureMs: r1(now() - tr.rec.presentedAtMs) });
        }
    }
    if (phase === "test") updateTest();
});

/* ---------------------------------------------------------------------
   9. RESPUESTAS (toques/clics) — se registran con la marca del evento
   ------------------------------------------------------------------- */
let phase = "loading";
function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * CONFIG.zone.width, y: (ev.clientY - r.top) / r.height * CONFIG.zone.height };
}
function notePointer(ev) { if (ev.pointerType && !sessionData.device.pointerTypes.includes(ev.pointerType)) sessionData.device.pointerTypes.push(ev.pointerType); }
canvas.addEventListener("pointerdown", (ev) => {
    if (phase !== "practice" && phase !== "test") return;
    ev.preventDefault(); notePointer(ev);
    const t = ev.timeStamp || now();
    const p = toLogical(ev);
    let best = null, bestD = Infinity;
    for (const tr of activeTrials) {
        if (!tr.presented || tr.resolved) continue;
        const d = Math.hypot(tr.obj.pos.x - p.x, tr.obj.pos.y - p.y);
        if (d <= SIZE * CONFIG.hitRadiusFactor && d < bestD) { best = tr; bestD = d; }
    }
    if (best) {
        const rt = t - best.rec.presentedAtMs;
        const isStar = best.type === "star";
        const res = isStar ? "hit" : "false_alarm";
        if (isStar) { playPop(); sparkle(best.obj.pos.x, best.obj.pos.y); }
        resolveTrial(best, res, {
            respondedAtMs: r1(t), rtMs: r1(rt), exitedAtMs: null, exposureMs: r1(rt),
            anticipatory: isStar && rt < CONFIG.anticipationMs,
            pointerType: ev.pointerType || null, responseX: r1(p.x), responseY: r1(p.y)
        });
    } else if (phase === "test") {
        sessionData.emptyResponses.push({ atMs: r1(t), x: r1(p.x), y: r1(p.y), region: "zone", segment: currentSegment(), pointerType: ev.pointerType || null });
    }
});
stage.addEventListener("pointerdown", (ev) => {   // toques fuera de la zona durante la medición
    if (phase !== "test" || ev.target === canvas) return;
    notePointer(ev);
    sessionData.emptyResponses.push({ atMs: r1(ev.timeStamp || now()), region: "outside_zone", segment: currentSegment(), pointerType: ev.pointerType || null });
});

/* ---------------------------------------------------------------------
   10. MEDICIÓN
   ------------------------------------------------------------------- */
let schedule = [], nextIdx = 0, testStartClock = 0, testResolve = null, trialCounter = 0;
function currentSegment() {
    if (phase !== "test") return null;
    const el = (clock() - testStartClock) / 1000;
    return Math.min(CONFIG.segmentCount, Math.floor(el / (CONFIG.durationS / CONFIG.segmentCount)) + 1);
}
function updateTest() {
    const el = (clock() - testStartClock) / 1000;
    $("progressFill").style.width = Math.min(100, el / CONFIG.durationS * 100) + "%";
    while (nextIdx < schedule.length && schedule[nextIdx].tSpawnS <= el) {
        const it = schedule[nextIdx++];
        const rec = {
            trial: ++trialCounter, stimulus: it.type, lane: it.lane, xPx: it.x, sizePx: SIZE,
            scheduledOnsetS: it.tSpawnS, plannedSegment: it.plannedSegment,
            presentedAtMs: null, respondedAtMs: null, rtMs: null, exitedAtMs: null, exposureMs: null,
            result: null, anticipatory: false, segment: null, valid: true, invalidReason: null,
            pointerType: null, responseX: null, responseY: null
        };
        if (hiddenSince != null) { rec.valid = false; rec.invalidReason = "tab_hidden"; }
        if (blurSince != null)   { rec.valid = false; rec.invalidReason = "focus_lost"; }
        sessionData.events.push(rec);
        const tr = spawnStimulus(it.type, it.x, testStartClock + it.tSpawnS * 1000, rec);
        if (AUTOTEST) bot(tr);
    }
    // fin: duración cumplida y todos los estímulos resolvieron su recorrido
    if (el >= CONFIG.durationS && nextIdx >= schedule.length && activeTrials.length === 0 && testResolve) {
        const r = testResolve; testResolve = null; r();
    }
    // salvaguarda: si algo quedó en pantalla demasiado tiempo, se marca truncado (no es error del estudiante)
    if (el >= CONFIG.durationS + CONFIG.exposureMs / 1000 + 1 && testResolve) {
        activeTrials.forEach((tr) => { tr.rec.valid = false; tr.rec.invalidReason = "truncated"; resolveTrial(tr, tr.type === "star" ? "miss" : "correct_rejection"); });
    }
}
function runTest() {
    return new Promise((resolve) => {
        schedule = buildSchedule(CONFIG);
        sessionData.config = Object.assign({}, CONFIG, {
            plannedTrials: schedule.length,
            plannedTargets: schedule.filter((s) => s.type === "star").length,
            plannedDistractors: schedule.filter((s) => s.type === "moon").length,
            sequenceHash: hashString(JSON.stringify(schedule.map((s) => [s.tSpawnS, s.type, s.lane])))
        });
        nextIdx = 0; trialCounter = 0;
        testStartClock = clock();
        sessionData.timing.testStartMs = r1(now());
        sessionData.timing.testStartedAt = new Date().toISOString();
        testResolve = resolve;
        phase = "test"; sessionData.phaseReached = "test";
    });
}

/* ---------------------------------------------------------------------
   11. PRÁCTICA GUIADA (no se mezcla con la medición)
   ------------------------------------------------------------------- */
function practiceItem(type, idx) {
    return new Promise((resolve) => {
        const rec = { item: idx + 1, stimulus: type, presentedAtMs: null, respondedAtMs: null, rtMs: null, result: null, valid: true, invalidReason: null };
        const x = CONFIG.zone.width * (idx % 2 === 0 ? 0.42 : 0.6);
        const tr = spawnStimulus(type, x, clock(), rec);
        tr.onResolve = () => resolve(rec);
        if (AUTOTEST) bot(tr, true);
    });
}
async function runPractice() {
    phase = "practice"; sessionData.phaseReached = "practice";
    const t0 = now();
    const msgs = {
        star: { before: `Mira, una estrella ${STAR_ICON} ¡Tócala!`, hit: "¡Muy bien!", miss: `¡Uy! Las estrellas ${STAR_ICON} se tocan.` },
        moon: { before: `Una luna ${MOON_ICON} ¡Déjala pasar!`, correct_rejection: "¡Bien hecho!", false_alarm: `Las lunas ${MOON_ICON} se dejan pasar.` }
    };
    for (let round = 1; round <= CONFIG.practice.maxRounds; round++) {
        const items = [];
        say(round === 1 ? "¡Primero practiquemos juntos!" : "¡Probemos otra vez!", 1600);
        await sleep(1800);
        for (let i = 0; i < CONFIG.practice.sequence.length; i++) {
            const type = CONFIG.practice.sequence[i];
            say(msgs[type].before, 1400);
            const rec = await practiceItem(type, i);
            items.push(rec);
            say(msgs[type][rec.result], 1300);
            await sleep(1500);
        }
        const errors = items.filter((r) => r.result === "miss" || r.result === "false_alarm").length;
        sessionData.practice.rounds.push({ round, items, errors });
        sessionData.practice.errors += errors;
        sessionData.practice.roundsNeeded = round;
        if (errors === 0) { sessionData.practice.completed = true; break; }
    }
    sessionData.practice.durationMs = r1(now() - t0);
    phase = "idle";
}

/* ---------------------------------------------------------------------
   12. FLUJO COMPLETO
   ------------------------------------------------------------------- */
function showSpace() {
    $("bgLab").classList.add("hidden"); $("labText").classList.add("hidden");
    $("bgSpace").classList.remove("hidden"); $("shipFront").classList.remove("hidden");
    $("kud").className = "layer space";
    zoneEl.classList.remove("hidden");
}
function playTransition() {
    return new Promise((resolve) => {
        if (SKIP_VIDEO) { addIncident("transition_skipped", { reason: "url_param" }); resolve(); return; }
        const v = $("transition");
        let done = false;
        const finish = (why) => { if (done) return; done = true; if (why) addIncident("transition_skipped", { reason: why });
            v.classList.add("fade"); v.style.opacity = "0"; setTimeout(() => { v.classList.add("hidden"); v.style.opacity = ""; }, 400); resolve(); };
        v.classList.remove("hidden");
        v.addEventListener("ended", () => finish(null), { once: true });
        v.addEventListener("error", () => finish("video_error"), { once: true });
        setTimeout(() => finish("timeout"), 15000);
        v.currentTime = 0;
        v.play().catch(() => finish("autoplay_blocked"));
        // el espacio queda listo debajo para que el último cuadro empalme sin salto
        setTimeout(showSpace, 300);
    });
}
async function countdown() {
    const el = $("countdown"); el.classList.remove("hidden");
    for (const n of ["3", "2", "1"]) { el.textContent = n; await sleep(800); }
    el.classList.add("hidden");
}
async function intro() {
    phase = "intro"; sessionData.phaseReached = "intro";
    say("¡Hola! Soy Kud.", 1400, "lab");
    await buttons([{ label: "¡Hola, Kud!" }]);
    initAudio();
    sessionData.instruction.shownAtMs = r1(now());
    let again = 0;
    while (true) {
        say("Hoy vamos a explorar el espacio en mi nave.", 2600, "lab"); await sleep(3000);
        say(`Toca las estrellas ${STAR_ICON} lo más rápido que puedas.`, 2800, "lab"); await sleep(3200);
        say(`Pero las lunas ${MOON_ICON}… ¡déjalas pasar!`, 2600, "lab"); await sleep(2600);
        const choice = await buttons([{ label: "¡Despegar!" }, { label: "Escuchar otra vez", alt: true }]);
        if (choice === 0) break;
        again++;
    }
    sessionData.instruction.repeats = again;
    sessionData.instruction.acceptedAtMs = r1(now());
}
async function main() {
    // esperar a que cargue lo esencial
    await Promise.all([ $("bgLab"), $("kudIdle") ].map((img) => img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = () => { addIncident("resource_load_error", { resource: img.src }); r(); }; })));
    $("loading").classList.add("hidden");
    const rect = stage.getBoundingClientRect();
    sessionData.device.stagePx = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (rect.width < 700) addIncident("small_stage", { stagePx: sessionData.device.stagePx });

    await intro();
    sessionData.phaseReached = "transition"; phase = "transition";
    $("labText").classList.add("off"); kudTalking(false);
    await playTransition();
    showSpace();
    await sleep(300);
    await runPractice();

    say("¡Listo! Ahora empieza la misión.", 1800);
    await buttons([{ label: "¡Empezar misión!" }]);
    hideBubble();
    await countdown();
    $("progress").classList.remove("hidden");
    await runTest();

    // ---- fin de la medición
    phase = "done"; sessionData.phaseReached = "done";
    sessionData.state = "completed";
    sessionData.timing.testEndMs = r1(now());
    sessionData.timing.testEndedAt = new Date().toISOString();
    sessionData.timing.testDurationMs = r1(sessionData.timing.testEndMs - sessionData.timing.testStartMs - (sessionData.timing.pausedMs || 0));
    sessionData.summary = computeIndicators(sessionData.events, sessionData.emptyResponses, CONFIG);
    $("progress").classList.add("hidden");
    if (music) { try { music.pause(); } catch (e) {} }
    say("¡Misión completada! Gracias por explorar conmigo.", 2600);
    submit(false);
}

/* ---------------------------------------------------------------------
   13. ENVÍO DE DATOS (y sesión interrumpida)
   ------------------------------------------------------------------- */
let submitted = false;
function submit(interrupted) {
    if (submitted) return; submitted = true;
    if (interrupted) {
        sessionData.state = "interrupted";
        sessionData.events.forEach((e) => { if (!e.result) { e.valid = false; e.invalidReason = "interrupted"; } });
        sessionData.summary = computeIndicators(sessionData.events.filter((e) => e.result), sessionData.emptyResponses, CONFIG);
    }
    const body = JSON.stringify(sessionData);
    if (sessionId && launchToken) {
        fetch(`${apiBase}/task-sessions/${sessionId}/results`, {
            method: "POST", keepalive: true,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${launchToken}` },
            body
        }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); })
          .catch((err) => {
              addIncident("network_submit_error", { message: err.message });
              try { localStorage.setItem(`pending_session_${sessionId}`, JSON.stringify(sessionData)); } catch (e) {}
          });
    }
    try { window.parent.postMessage({ type: interrupted ? "GAME_INTERRUPTED" : "GAME_OVER", payload: sessionData }, targetOrigin); } catch (e) {}
    if (DEBUG) { let pre = $("debug"); if (!pre) { pre = document.createElement("pre"); pre.id = "debug"; stage.appendChild(pre); } pre.textContent = JSON.stringify(sessionData, null, 1); }
}
window.addEventListener("pagehide", () => { if (sessionData.state !== "completed" && sessionData.phaseReached !== "loading") submit(true); });

/* ---------------------------------------------------------------------
   14. JUGADOR SIMULADO (solo con ?autotest=1, para verificar el registro)
   ------------------------------------------------------------------- */
function bot(tr, practice) {
    const r = mulberry32(tr.rec.trial || tr.rec.item || 1)();
    const willRespond = tr.type === "star" ? (practice || r < 0.85) : (!practice && r < 0.18);
    if (!willRespond) return;
    const rt = 250 + r * 600;
    const fire = () => {
        if (tr.resolved) return;
        if (!tr.presented) { setTimeout(fire, 20); return; }
        if (now() - tr.rec.presentedAtMs < rt) { setTimeout(fire, 10); return; }
        const cr = canvas.getBoundingClientRect();
        const cx = cr.left + tr.obj.pos.x / CONFIG.zone.width * cr.width;
        const cy = cr.top + tr.obj.pos.y / CONFIG.zone.height * cr.height;
        canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, pointerType: "mouse", bubbles: true }));
        if (r < 0.1) canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cr.left + 5, clientY: cr.top + cr.height - 5, pointerType: "mouse", bubbles: true }));
    };
    setTimeout(fire, 30);
}

// Exportar funciones puras para pruebas en Node (no afecta al navegador)
if (typeof module !== "undefined") module.exports = { buildSchedule, computeIndicators, CONFIG };

main();
