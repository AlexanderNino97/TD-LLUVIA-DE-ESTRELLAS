// 1. EXTRAER PARÁMETROS DE INTEGRACIÓN DE LA URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get("sessionId");
const launchToken = urlParams.get("token");
const apiBase = urlParams.get("apiBase") || "http://localhost:3000/api/v1";
const targetOrigin = urlParams.get("targetOrigin") || window.location.origin;

// 2. REGISTRO DE INCIDENCIAS
const incidents = [];

window.addEventListener("blur", () => {
    incidents.push({ type: "loss_of_focus", timestampMs: performance.now() });
});

window.addEventListener("error", (e) => {
    incidents.push({ type: "script_error", message: e.message, timestampMs: performance.now() });
});

// 3. INICIALIZAR KABOOM LOCAL
kaboom({
    width: window.innerWidth,
    height: window.innerHeight,
});

loadSprite("background", "assets/background.gif");
loadSprite("kud", "assets/kud.png");
loadSprite("star", "assets/star.png");
loadSprite("moon", "assets/moon.png");
loadSound("hit", "assets/pop.mp3");
loadSound("bgm", "assets/musica.mp3");

// Estructura de sesión del contrato v1
const sessionData = {
    contractVersion: "1",
    taskId: "TG-01",
    configVersion: 1,
    state: "interrupted",
    device: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    },
    events: [],
    incidents: incidents
};

let trialCounter = 1;
let backgroundMusic;

// ESCENA INTRO
scene("intro", () => {
    add([
        sprite("background", { width: width(), height: height() }),
        pos(width() / 2, height() / 2),
        anchor("center")
    ]);

    add([
        sprite("kud"),
        pos(width() / 2, height() / 2 - 50),
        anchor("center")
    ]);

    add([
        rect(420, 110, { radius: 10 }),
        pos(width() / 2, height() / 2 + 90),
        anchor("center"),
        color(0, 0, 0),
        opacity(0.7)
    ]);

    add([
        text("¡Toca las estrellas y\ndeja pasar las lunas!", { size: 24, align: "center" }),
        pos(width() / 2, height() / 2 + 90),
        anchor("center")
    ]);

    add([
        text("Haz clic para comenzar", { size: 20 }),
        pos(width() / 2, height() - 80),
        anchor("center")
    ]);

    onClick(() => {
        try {
            backgroundMusic = play("bgm", { loop: true, volume: 0.3 });
        } catch (e) {
            incidents.push({ type: "audio_play_failed", message: e.message, timestampMs: performance.now() });
        }
        go("game");
    });
});

// ESCENA PRINCIPAL
scene("game", () => {
    add([
        sprite("background", { width: width(), height: height() }),
        pos(width() / 2, height() / 2),
        anchor("center")
    ]);

    const startTimeMs = performance.now();
    let isGameOver = false;

    const getSegment = () => {
        const elapsedSec = (performance.now() - startTimeMs) / 1000;
        if (elapsedSec < 40) return 1;
        if (elapsedSec < 80) return 2;
        return 3;
    };

    const NUM_LANES = 6;
    const LANE_WIDTH = width() / NUM_LANES;

    const getValidPosition = () => {
        const minDistance2D = 180;
        let attempts = 0;

        while (attempts < 30) {
            const lane = randi(0, NUM_LANES);
            const laneX = (lane * LANE_WIDTH) + (LANE_WIDTH / 2);
            const spawnY = -60;
            let isValid = true;

            for (const item of get("stimulus")) {
                const dx = item.pos.x - laneX;
                const dy = item.pos.y - spawnY;
                if (Math.sqrt(dx * dx + dy * dy) < minDistance2D) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) return laneX;
            attempts++;
        }
        return null;
    };

    const spawnStimulus = () => {
        if (isGameOver) return;

        const spawnX = getValidPosition();

        if (spawnX !== null) {
            const isStar = chance(0.7);
            const stimType = isStar ? "star" : "moon";
            const baseSize = rand(75, 105);

            const stimulus = add([
                sprite(stimType, { width: baseSize, height: baseSize }),
                pos(spawnX, -60),
                anchor("center"),
                move(DOWN, 210),
                area(),
                "stimulus",
                {
                    trial: trialCounter++,
                    stimulus_type: stimType,
                    presentedAtMs: null,
                    segment: getSegment(),
                    interacted: false,
                    isVisible: false
                }
            ]);

            // Detección exacta de visibilidad (y >= 0) para timestamp preciso
            stimulus.onUpdate(() => {
                if (!stimulus.isVisible && stimulus.pos.y >= 0) {
                    stimulus.isVisible = true;
                    stimulus.presentedAtMs = performance.now();
                }

                // Omisión o Rechazo correcto al salir de pantalla
                if (stimulus.pos.y > height() + 80 && !stimulus.interacted) {
                    stimulus.interacted = true;
                    const result = isStar ? "miss" : "correct_rejection";

                    sessionData.events.push({
                        trial: stimulus.trial,
                        stimulus: stimulus.stimulus_type,
                        presentedAtMs: stimulus.presentedAtMs,
                        respondedAtMs: null,
                        result: result,
                        segment: stimulus.segment
                    });

                    destroy(stimulus);
                }
            });
        }

        wait(rand(1.1, 1.8), spawnStimulus);
    };

    // Manejador único global de clics para evitar fugas de memoria
    onClick("stimulus", (stimulus) => {
        if (!stimulus.interacted && stimulus.isVisible) {
            stimulus.interacted = true;
            const respondedAtMs = performance.now();
            const isStar = stimulus.stimulus_type === "star";
            const result = isStar ? "hit" : "false_alarm";

            if (result === "hit") play("hit", { volume: 0.5 });

            sessionData.events.push({
                trial: stimulus.trial,
                stimulus: stimulus.stimulus_type,
                presentedAtMs: stimulus.presentedAtMs,
                respondedAtMs: respondedAtMs,
                result: result,
                segment: stimulus.segment
            });

            destroy(stimulus);
        }
    });

    spawnStimulus();

    // Finalización a los 120 segundos
    wait(20, () => {
        isGameOver = true;
        sessionData.state = "completed";
        if (backgroundMusic) backgroundMusic.paused = true;

        // Resolver estímulos pendientes en pantalla para no perder datos
        get("stimulus").forEach((stimulus) => {
            if (!stimulus.interacted && stimulus.isVisible) {
                const isStar = stimulus.stimulus_type === "star";
                sessionData.events.push({
                    trial: stimulus.trial,
                    stimulus: stimulus.stimulus_type,
                    presentedAtMs: stimulus.presentedAtMs,
                    respondedAtMs: null,
                    result: isStar ? "miss" : "correct_rejection",
                    segment: stimulus.segment
                });
            }
            destroy(stimulus);
        });

        go("gameOver");
    });
});

// ESCENA FINAL Y ENVÍO DE DATOS
scene("gameOver", () => {
    add([
        sprite("background", { width: width(), height: height() }),
        pos(width() / 2, height() / 2),
        anchor("center")
    ]);

    add([
        text("¡Misión Completada!", { size: 40 }),
        pos(width() / 2, height() / 2),
        anchor("center")
    ]);

    // Enviar resultados directamente al Backend
    if (sessionId && launchToken) {
        fetch(`${apiBase}/task-sessions/${sessionId}/results`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${launchToken}`
            },
            body: JSON.stringify(sessionData)
        }).catch((err) => {
            incidents.push({ type: "network_submit_error", message: err.message, timestampMs: performance.now() });
            localStorage.setItem(`pending_session_${sessionId}`, JSON.stringify(sessionData));
        });
    }

    // Notificar a la aplicación ventana padre de forma segura
    window.parent.postMessage({ type: "GAME_OVER", payload: sessionData }, targetOrigin);
});

// INICIAR
go("intro");