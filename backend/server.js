// backend/server.js — servidor local de prueba para la ingesta de TG-01
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Misma ruta que usa el juego: POST {apiBase}/task-sessions/{sessionId}/results
app.post('/api/v1/task-sessions/:sessionId/results', (req, res) => {
    const { sessionId } = req.params;
    const auth = req.headers.authorization || '';
    const data = req.body || {};

    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Falta el launchToken (Authorization: Bearer ...)' });
    if (data.taskId !== 'TG-01' || !Array.isArray(data.events)) return res.status(400).json({ error: 'Paquete inválido: se esperaba taskId TG-01 y events[]' });

    // Validaciones mínimas de consistencia del registro
    const unresolved = data.events.filter((e) => !e.result).length;
    const invalid = data.events.filter((e) => e.valid === false).length;
    const o = (data.summary && data.summary.overall) || {};
    console.log(`[${sessionId}] estado=${data.state} fase=${data.phaseReached} intento=${data.attempt} ` +
        `ensayos=${data.events.length} inválidos=${invalid} sin_resultado=${unresolved} ` +
        `precisión=${o.precisionPct ?? '—'}% comisión=${o.commissionRatePct ?? '—'}% TRmed=${o.rtMedianMs ?? '—'}ms`);

    // Guardado de prueba (en producción: base de datos de la plataforma)
    const file = path.join(DATA_DIR, `${sessionId}_${data.state}_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    res.status(200).json({ message: 'Datos guardados exitosamente', file: path.basename(file) });
});

app.listen(3000, () => console.log('Servidor Node.js corriendo en http://localhost:3000 (POST /api/v1/task-sessions/:sessionId/results)'));
