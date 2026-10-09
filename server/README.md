
Comando 
npx web-push generate-vapid-keys  -> genera tu par de llaves.

La terminal mostrará algo así:

```console
Public Key:
BFwOK7Dhf_MedJhH5Ozg...

Private Key:
3esMHuKVyj4XTWnSl5y9...
```

Copia las dos y crea el archivo .env y pega tus llaves (sin comillas ni espacios):

VAPID_PUBLIC=aqui_tu_llave_publica
VAPID_PRIVATE=aqui_tu_llave_privada

Un archivo .env sirve para guardar datos secretos fuera del código. Así la llave privada no queda escrita dentro de server.js.



-----
Abre js/app.js. Arriba del todo está esta línea:

js
const VAPID_PUBLIC_KEY = 'BIN9hZ7Z4Rv6...';

Reemplaza el texto entre comillas por tu llave pública nueva (la misma que pusiste en el .env). Solo la pública, nunca la privada.

-----

## Cómo correrlo

```bash
cd server
npm install     # solo la primera vez
npm run dev     # local: usa --env-file=.env
npm start       # producción (el host inyecta las variables y el PORT)
```

Queda en `http://localhost:3000` (o en el `PORT` que defina el host).

## Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/subscribe` | POST | Guarda la suscripción en memoria |
| `/api/subscribe` | DELETE | Elimina una suscripción |
| `/api/subscriptions` | GET | Número de suscripciones activas |
| `/api/push` | POST | Push a todos los suscriptores |
| `/api/sync` | POST/GET | Recibe/devuelve los registros offline |
| `/health` | GET | Estado (para monitores anti-sleep) |

## Despliegue en Render (gratis)

El repositorio trae un `render.yaml` en la raíz: en Render → **New → Blueprint** → conecta el repo.
Define las variables de entorno `VAPID_PUBLIC` y `VAPID_PRIVATE` (valores de tu `.env`; **no** se suben al repo).

El plan gratis duerme a los 15 min: para evitarlo, pon un monitor (cron-job.org / UptimeRobot) que haga
`GET https://tu-servidor.onrender.com/health` cada 10 minutos.

> El servidor es **stateless** (no escribe en disco). El navegador reenvía su suscripción al abrir la app,
> así que no se necesita base de datos.