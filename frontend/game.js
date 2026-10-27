// Inicializar Kaboom a pantalla completa
kaboom({
    width: window.innerWidth,
    height: window.innerHeight,
});

// 1. CARGA DE RECURSOS (Assets)
loadSprite("background", "assets/background.gif");
loadSprite("kud", "assets/kud.png");
loadSprite("star", "assets/star.png");
loadSprite("moon", "assets/moon.png");
loadSound("hit", "assets/pop.mp3");
loadSound("bgm", "assets/musica.mp3");

// Estructura de datos para registro metodológico
let sessionData = {
    taskId: "TG-01",
    state: "interrupted",
    events: []
};

let trialCounter = 1;
let backgroundMusic;

// 2. ESCENA DE INSTRUCCIONES
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
        backgroundMusic = play("bgm", { loop: true, volume: 0.3 });
        go("game");
    });
});

// 3. ESCENA PRINCIPAL (Go/No-Go)
scene("game", () => {
    add([
        sprite("background", { width: width(), height: height() }),
        pos(width() / 2, height() / 2),
        anchor("center")
    ]);

    const startTime = time();
    let isGameOver = false;

    const getSegment = () => {
        const elapsed = time() - startTime;
        if (elapsed < 40) return 1;
        if (elapsed < 80) return 2;
        return 3;
    };

    // SISTEMA DE CARRILES Y VERIFICACIÓN 2D
    const NUM_LANES = 6;
    const LANE_WIDTH = width() / NUM_LANES;

    const getValidPosition = () => {
        const minDistance2D = 180; // Distancia mínima en píxeles para evitar cualquier solapamiento
        let attempts = 0;

        while (attempts < 30) {
            // Selecciona un carril al azar asegurando margen dentro de la pantalla
            const lane = randi(0, NUM_LANES);
            const laneX = (lane * LANE_WIDTH) + (LANE_WIDTH / 2);
            const spawnY = -60;

            let isValid = true;

            // Mide la distancia euclidiana en tiempo real contra TODOS los objetos activos
            for (const item of get("stimulus")) {
                const dx = item.pos.x - laneX;
                const dy = item.pos.y - spawnY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < minDistance2D) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                return laneX;
            }
            attempts++;
        }
        return null; // Si no hay espacio seguro, omite la generación en este ciclo
    };

    // GENERADOR DE ESTÍMULOS
    const spawnStimulus = () => {
        if (isGameOver) return;

        const spawnX = getValidPosition();

        if (spawnX !== null) {
            const isStar = chance(0.7);
            const stimType = isStar ? "star" : "moon";

            // Variación de tamaño acotada en píxeles
            const baseSize = rand(75, 105);

            const stimulus = add([
                sprite(stimType, { width: baseSize, height: baseSize }),
                pos(spawnX, -60),
                anchor("center"),
                move(DOWN, 210), // Velocidad constante para mantener distancias paralelas
                area(),
                "stimulus",
                {
                    trial_id: trialCounter++,
                    stimulus_type: stimType,
                    timestamp_spawn: Date.now(),
                    segment: getSegment(),
                    interacted: false
                }
            ]);

            onClick(() => {
                if (stimulus.isHovering() && !stimulus.interacted) {
                    stimulus.interacted = true;
                    const reactionTime = Date.now() - stimulus.timestamp_spawn;

                    let result = isStar ? "hit" : "false_alarm";
                    if (result === "hit") play("hit", { volume: 0.5 });

                    sessionData.events.push({
                        trial_id: stimulus.trial_id,
                        stimulus_type: stimulus.stimulus_type,
                        timestamp_spawn: stimulus.timestamp_spawn,
                        timestamp_response: Date.now(),
                        reaction_time_ms: reactionTime,
                        result: result,
                        segment: stimulus.segment
                    });

                    destroy(stimulus);
                }
            });

            stimulus.onUpdate(() => {
                if (stimulus.pos.y > height() + 80 && !stimulus.interacted) {
                    let result = isStar ? "miss" : "correct_rejection";

                    sessionData.events.push({
                        trial_id: stimulus.trial_id,
                        stimulus_type: stimulus.stimulus_type,
                        timestamp_spawn: stimulus.timestamp_spawn,
                        timestamp_response: null,
                        reaction_time_ms: null,
                        result: result,
                        segment: stimulus.segment
                    });

                    destroy(stimulus);
                }
            });
        }

        wait(rand(1.1, 1.8), spawnStimulus);
    };

    spawnStimulus();

    wait(120, () => {
        isGameOver = true;
        sessionData.state = "completed";
        if (backgroundMusic) backgroundMusic.paused = true;
        go("gameOver");
    });
});

// 4. ESCENA FINAL
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

    window.parent.postMessage({ type: "GAME_OVER", payload: sessionData }, "*");
});

// Iniciar
go("intro");