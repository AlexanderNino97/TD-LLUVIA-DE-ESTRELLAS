// backend/server.js
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Endpoint para recibir los datos de TG-01
app.post('/api/sessions/:sessionId/tasks/TG-01', (req, res) => {
    const { sessionId } = req.params;
    const sessionData = req.body;

    // Variables esperadas en sessionData.events:
    // trial_id, stimulus_type, timestamp_spawn, timestamp_response, reaction_time_ms, result, segment[cite: 1]

    console.log(`Datos recibidos para la sesión ${sessionId} en estado: ${sessionData.state}`);

    // Aquí guardarías en tu base de datos
    res.status(200).json({ message: "Datos guardados exitosamente" });
});

app.listen(3000, () => console.log('Servidor Node.js corriendo en puerto 3000'));