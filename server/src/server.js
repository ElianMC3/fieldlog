const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

webpush.setVapidDetails(
    'mailto:cristian.flores@utcv.edu.mx',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
);

// STATELESS: las suscripciones viven solo en memoria (nada en disco).
// En hosts gratuitos el disco es efímero, así que no sirve para persistir.
// El navegador reenvía su propia suscripción al abrir la app
// (reenviarSuscripcion() en js/app.js), por lo que se recuperan solas.
let suscripciones = [];

app.post('/api/subscribe', (req, res) => {
    const sub = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ ok: false, error: 'Suscripción inválida' });
    const yaExiste = suscripciones.some((s) => s.endpoint === sub.endpoint);
    if (!yaExiste) suscripciones.push(sub);
    const respuesta = { ok: true, total: suscripciones.length, yaExistia: yaExiste };
    console.log('[POST /api/subscribe] respuesta:', JSON.stringify(respuesta));
    res.status(201).json(respuesta);
});

// El navegador la manda al desactivar la campana
app.delete('/api/subscribe', (req, res) => {
    const endpoint = req.body && req.body.endpoint;
    if (endpoint) {
        suscripciones = suscripciones.filter((s) => s.endpoint !== endpoint);
    }
    const respuesta = { ok: true, total: suscripciones.length };
    console.log('[DELETE /api/subscribe] respuesta:', JSON.stringify(respuesta));
    res.json(respuesta);
});

// Para verificar en el navegador: http://localhost:3000/api/subscriptions
app.get('/api/subscriptions', (req, res) => {
    res.json({ total: suscripciones.length, endpoints: suscripciones.map((s) => s.endpoint) });
});

app.post('/api/push', async (req, res) => {
    const payload = JSON.stringify({
        title: req.body.title,
        body: req.body.body
    });

    let enviadas = 0;
    for (const sub of suscripciones) {
        try {
            await webpush.sendNotification(sub, payload);
            enviadas++;
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                suscripciones = suscripciones.filter((s) => s.endpoint !== sub.endpoint);
            } else {
                console.error('Error enviando push:', err.message);
            }
        }
    }
    const respuesta = { enviadas, suscripciones: suscripciones.length };
    console.log('[POST /api/push] respuesta:', JSON.stringify(respuesta));
    res.json(respuesta);
});

// Recibe la cola de sincronización de FieldLog (registros hechos sin conexión)
let registrosSincronizados = { bitacora: [], inventario: [] };

app.post('/api/sync', (req, res) => {
    const registros = (req.body && req.body.registros) || [];
    let recibidos = 0;

    for (const item of registros) {
        const store = item.store === 'inventario' ? 'inventario' : 'bitacora';
        registrosSincronizados[store].push(item.datos);
        recibidos++;
    }

    const respuesta = {
        ok: true,
        sincronizados: recibidos,
        bitacora: registrosSincronizados.bitacora.length,
        inventario: registrosSincronizados.inventario.length
    };
    console.log(`[POST /api/sync] recibidos=${recibidos} | bitacora=${respuesta.bitacora} inventario=${respuesta.inventario}`);
    console.log('[POST /api/sync] respuesta:', JSON.stringify(respuesta));
    res.json(respuesta);
});

app.get('/api/sync', (req, res) => {
    res.json(registrosSincronizados);
});

// Health check: lo usan los monitores (cron-job.org / UptimeRobot) para
// mantener despierto el servicio gratuito de Render.
app.get('/health', (req, res) => res.json({ ok: true, up: process.uptime() }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor Activo :  http://localhost:${PORT}`);
    console.log(`Suscripciones activas: ${suscripciones.length}`);
    console.log('Endpoints: POST/DELETE /api/subscribe | GET /api/subscriptions | POST /api/push | POST/GET /api/sync | GET /health');
});