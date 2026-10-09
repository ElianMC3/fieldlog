# FieldLog PWA

**Bitácora e Inventario de Trabajo en Campo** — Progressive Web App que funciona **sin conexión** y sincroniza los registros cuando detecta red.

Proyecto basado en la estructura de la PWA *Twittor* (Service Worker + manifest + jQuery).

---

## Cómo usar la app (guía rápida)

> También está dentro de la aplicación: toca el ícono **`?`** del título.

### 1. Registrar un trabajo (Bitácora)

1. Asegúrate de estar en la pestaña **Bitácora** (la que viene activa).
2. Toca el botón **`+`** (esquina inferior derecha).
3. Captura el **tipo de trabajo**, la **ubicación** y las **notas**.
4. Toca **`✔`** para guardar. El registro aparece en la lista con el badge
   `pendiente` (aún sin enviar) o `sincronizado`.

### 2. Controlar el Inventario

1. Cambia a la pestaña **Inventario**.
2. Toca **`+`** y captura **clave**, **artículo**, **cantidad** y **unidad**.
3. Guarda: se almacena en el dispositivo igual que la bitácora.

### 3. Trabajar sin conexión

- Activa el **modo avión** (o DevTools → Network → Offline) y sigue registrando.
- La barra bajo el título te indica el estado:
  - 🟢 **En línea** / 🔴 **Sin conexión**
  - `N pendientes de sincronizar` (registros aún no enviados)
- Todo se guarda en **IndexedDB** (almacenamiento local): puedes cerrar la app,
  apagar el equipo o perder la red sin perder nada.

### 4. Sincronizar

- **Automática**: al volver la red, la app envía sola los pendientes
  (evento `online` + Background Sync del Service Worker).
- **Manual**: toca el ícono **`⟳`** del título.
- Al terminar:
  - El badge de cada registro pasa a `sincronizado`.
  - Se muestra una **notificación** (o un mensaje flotante si aún no diste permiso).

### 5. Activar las notificaciones

1. El **server debe estar corriendo** (`npm run dev` en `server/`, ver más abajo).
2. Toca la **campana 🔔** del título → acepta el permiso.
3. La campana se enciende en **amarillo** cuando está activa.
   Vuelve a tocarla para **desactivarla**.
4. La URL del servidor se configura **desde la propia app**: ayuda (`?`) → sección **7. Configurar el servidor**.
   Se guarda en el dispositivo, así no hay que re-desplegar para cambiar de servidor.
5. Para probar: abre la ayuda (`?`) → **Probar notificación**, o dispara una push
   desde una terminal:

```bash
curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{"title":"FieldLog","body":"Orden de trabajo #45 asignada"}'
```

### 6. Instalar como app en el dispositivo

| Plataforma | Pasos |
|---|---|
| Android / Chrome | menú ⋮ → **Instalar aplicación** / **Añadir a pantalla de inicio** |
| iPhone / Safari | botón Compartir → **Añadir a pantalla de inicio** |
| Escritorio | ícono de instalar en la barra de direcciones |

Una vez instalada abre en modo *standalone*, con sus propios íconos y colores del `manifest.json`.

---

## Requisitos

- Node.js (para el server de notificaciones/sincronización)
- `http-server` para servir la app en local:

```bash
npm install -g http-server
```

## 1. Correr la app en local

```bash
cd /home/elianmc4/Documentos/PWA/fieldlog
http-server -o
```

> `http-server` sirve en `http://localhost:8080`. Abrir en Chrome → DevTools → Application → **Service Workers** para verificar que quedó `activated`.

## 2. Correr el server (notificaciones push + sync)

```bash
cd /home/elianmc4/Documentos/PWA/fieldlog/server
npm install        # solo la primera vez
npm run dev        # local: carga el .env con las llaves VAPID
# en producción (Render y similares): npm start
```

Queda activo en `http://localhost:3000` con:

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/subscribe` | POST | Guarda la suscripción push en memoria (idempotente por endpoint) |
| `/api/subscribe` | DELETE | Elimina una suscripción (la app la llama al apagar la campana) |
| `/api/subscriptions` | GET | Muestra cuántas suscripciones hay activas |
| `/api/push` | POST | Envía una notificación a todos los suscriptores |
| `/api/sync` | POST | Recibe la cola de registros offline de FieldLog |
| `/api/sync` | GET | Devuelve los registros sincronizados |
| `/health` | GET | Estado del servidor (lo usan los monitores anti-sleep) |

El servidor es **stateless**: las suscripciones viven solo en memoria (no escribe en disco), ideal para
hosts gratuitos. La app **reenvía sola** su suscripción al abrirse, así que se recuperan tras un reinicio.

La llave pública VAPID ya está en `js/app.js` (`VAPID_PUBLIC_KEY`) y coincide con el `.env` del server.

## 3. Flujo offline → online

1. Activa el modo **Offline** (DevTools → Network → Offline, o modo avión).
2. Crea registros de bitácora o inventario: se guardan en **IndexedDB** con estado `pendiente`.
3. Se muestra una **notificación local** de "Guardado sin conexión".
4. Al volver la red (`online` event o Background Sync) se envían a `POST /api/sync`.
5. El servidor responde y la app muestra la **notificación de sincronización confirmada** y cambia el badge a `sincronizado`.

## 4. Notificaciones push

1. Server corriendo en `localhost:3000` (o el host que configures).
2. En la app, toca la **campana** → acepta permisos → se suscribe con la llave VAPID.
3. Puedes disparar una push manualmente con el `curl` de la guía (sección 5).

Las notificaciones también se usan como **feedback local** (sin servidor): guardado offline, confirmación de sync, actualización del Service Worker.

### Checklist si NO llegan las notificaciones

1. **¿La campana está en amarillo?** Si no, no hay suscripción: tócala y acepta el permiso.
   (Antes la campana estaba oculta; ya siempre es visible en la barra superior.)
2. **¿El servidor en uso es el correcto?** Ayuda (`?`) → sección **7. Configurar el servidor**.
3. **En local, ¿el server está corriendo?** `npm run dev` en la carpeta `server`.
4. **Verifica suscripciones**: abre `<url-del-server>/api/subscriptions` — debe mostrar `"total": 1` o más.
5. **¿Reiniciaste el server?** Las suscripciones viven en memoria: al reiniciarse se borran.
   La app las **reenvía sola** al abrirse, pero solo si ya tenías permiso concedido.
6. **¿Permiso bloqueado?** Configuración del sitio → Notificaciones → Permitir → recarga.
   (Opción "Probar notificación" en la ayuda `?` para validar al instante.)
7. **Push vs. local**: las notificaciones *push* necesitan server accesible; las de
   *confirmación de sincronización* son locales y solo piden permiso de notificaciones.

## 5. Despliegue

### 5.1 App en GitHub Pages

1. Sube el contenido de `fieldlog/` al repositorio (rama `main`, raíz `/`).
2. GitHub → **Settings → Pages** → *Deploy from a branch* → `main` / `/ (root)`.
3. Queda en `https://usuario.github.io/repo/`. El proyecto usa **rutas relativas** (`./`, `sw.js`,
   `manifest.json`) y trae `.nojekyll`, así que funciona en la raíz o en subcarpeta sin cambios.

### 5.2 Servidor en Render (gratis) + anti-sleep

El repo incluye `render.yaml`, así que Render lo configura solo:

1. Entra a [render.com](https://render.com) → **New → Blueprint** → conecta este repositorio.
2. Render detecta `render.yaml` (servicio `fieldlog-server`, `rootDir: server`, plan *free*).
3. Cuando lo pida, pega las variables **`VAPID_PUBLIC`** y **`VAPID_PRIVATE`** (los valores de tu `.env`;
   no van en el repo por seguridad). La pública debe ser la misma que `VAPID_PUBLIC_KEY` en `js/app.js`.
4. Al terminar te da una URL `https://fieldlog-server-xxxx.onrender.com`.
5. **Configúrala en la app**: abre la app publicada → ayuda (`?`) → sección **7. Configurar el servidor**
   → pega la URL → **Guardar**. Listo: sync y notificaciones desde GitHub Pages sin tocar código.

> El plan gratis de Render **duerme a los 15 min** de inactividad (despierta en ~1 min y pierde lo que
> había en memoria). Para que no duerma, crea un monitor gratuito en
> [cron-job.org](https://cron-job.org) o [UptimeRobot](https://uptimerobot.com) que haga **GET** a
> `https://tu-servidor.onrender.com/health` **cada 10 minutos**.

### Notas

- GitHub Pages sirve por **HTTPS**, igual que Render: sin problemas de contenido mixto.
- Por defecto la app apunta a `https://fieldlog-server.onrender.com` (cámbialo en `js/app.js` si creas otro host).
  La URL se guarda por dispositivo (`localStorage`): en cada navegador solo hay que tocar la campana, salvo que
  quieras usar otro servidor (entonces configúralo en la sección 7 de la ayuda).
- Push solo funciona con el server accesible por **HTTPS** desde el navegador.

## Estructura

```
fieldlog/
├── index.html          # UI: bitácora, inventario, modal, barra de estado, ayuda (?)
├── manifest.json       # Instalación PWA (standalone, colores, íconos 192/512 + maskable)
├── sw.js               # Service Worker: caché app shell, sync, push, notificationclick
├── render.yaml         # Blueprint de Render para el servidor
├── .gitignore
├── css/
│   ├── style.css
│   └── animate.css
├── js/
│   ├── app.js          # Lógica jQuery: vistas, sync, notificaciones, ayuda, servidor configurable
│   ├── db.js           # Capa IndexedDB (almacenamiento offline)
│   └── libs/jquery.js
├── img/
│   ├── favicon.ico
│   └── icons/          # 72 → 512 px + maskable 192/512
└── server/             # Servidor de notificaciones y sync (Express + web-push)
    ├── src/server.js
    ├── package.json
    └── .env            # (no se sube) VAPID_PUBLIC / VAPID_PRIVATE
```
