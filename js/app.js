// ===== FieldLog - Aplicación principal =====

// Llave pública VAPID (la misma del .env del servidor de notificaciones)
const VAPID_PUBLIC_KEY = 'BKsTf1wxQNiM0tlZUpgzbxoPP-C3phHxs4wEKs7MgK-XJ1vp37vl3YWUNewnNjvTS7I-pHIrGUna2TVpWXmCwpM';

// URL del servidor de notificaciones/sincronización.
// Por defecto apunta al servidor público (Render); para trabajar en local usa la
// ayuda (botón ?) -> sección 7 y pon http://localhost:3000 (se guarda en localStorage).
const API_BASE_POR_DEFECTO = 'https://fieldlog-server.onrender.com';

function normalizarUrl(url) {
    return (url || '').trim().replace(/\/+$/, '');
}

let API_BASE = (function () {
    try {
        return normalizarUrl(localStorage.getItem('fieldlog-servidor')) || API_BASE_POR_DEFECTO;
    } catch (e) {
        return API_BASE_POR_DEFECTO;
    }
})();

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ===== Referencias =====
const titulo = $('#titulo');
const tituloModal = $('#titulo-modal');
const nuevoBtn = $('#nuevo-btn');
const cancelarBtn = $('#cancel-btn');
const guardarBtn = $('#guardar-btn');
const notifBtn = $('#notif-btn');
const syncBtn = $('#sync-btn');
const modal = $('#modal');
const barraEstado = $('#barra-estado');
const estadoPunto = $('#estado-punto');
const estadoTexto = $('#estado-texto');
const pendientesTexto = $('#pendientes-texto');
const listaBitacora = $('#lista-bitacora');
const listaInventario = $('#lista-inventario');
const vacio = $('#vacio');
const vacioTexto = $('#vacio-texto');
const tabBitacora = $('#tab-bitacora');
const tabInventario = $('#tab-inventario');
const camposBitacora = $('#campos-bitacora');
const camposInventario = $('#campos-inventario');

let modulo = 'bitacora'; // bitacora | inventario

// ===== Mensajes flotantes (feedback cuando no hay permiso de notificación) =====
let toastTimer = null;
function toast(mensaje) {
    let t = $('#toast');
    if (!t.length) {
        $('body').append('<div id="toast" class="toast"></div>');
        t = $('#toast');
    }
    t.text(mensaje).addClass('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.removeClass('visible'), 4000);
}

// ===== Alturas reales de header / barra / tabs (evita encimes en cualquier pantalla) =====
function ajustarLayout() {
    const header = $('.first').first().outerHeight();
    const barra = $('#barra-estado').outerHeight();
    const tabs = $('.tabs').outerHeight();
    if (header) document.documentElement.style.setProperty('--header-h', Math.round(header) + 'px');
    if (barra) document.documentElement.style.setProperty('--barra-h', Math.round(barra) + 'px');
    if (tabs) document.documentElement.style.setProperty('--tabs-h', Math.round(tabs) + 'px');
}

// ===== Notificaciones locales (feedback al usuario) =====
function notificarLocal(tituloNotif, cuerpo) {
    // Sin permiso se informa con un toast para que el usuario sepa qué pasó
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        toast(tituloNotif + ' — ' + cuerpo);
        return;
    }

    const opciones = {
        body: cuerpo,
        icon: 'img/icons/icon-192x192.png',
        badge: 'img/icons/icon-72x72.png'
    };

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification(tituloNotif, opciones)).catch(() => {
            new Notification(tituloNotif, opciones);
        });
    } else {
        new Notification(tituloNotif, opciones);
    }
}

function pedirPermisoNotificaciones() {
    if (!('Notification' in window)) {
        alert('Este navegador no soporta notificaciones.');
        return Promise.resolve(false);
    }
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    return Notification.requestPermission().then((p) => p === 'granted');
}

// ===== Detalle de un registro para notificaciones y mensajes =====
function detalleRegistro(item) {
    const r = item.registro || item;
    if (item.store === 'inventario') {
        const clave = r.clave ? r.clave + ' · ' : '';
        return r.nombre + ' (' + clave + r.cantidad + ' ' + r.unidad + ')';
    }
    const partes = [r.tipo];
    if (r.ubicacion) partes.push('en ' + r.ubicacion);
    if (r.notas) partes.push('— ' + r.notas);
    return partes.join(' ');
}

// Texto para el cuerpo de la notificación (máx. 3 registros, si hay más se resume)
function resumenNotificacion(pendientes) {
    const visibles = pendientes.slice(0, 3).map(detalleRegistro);
    let cuerpo = visibles.join('  |  ');
    if (pendientes.length > 3) cuerpo += '  |  y ' + (pendientes.length - 3) + ' más';
    return cuerpo;
}

function tituloNotificacion(pendientes) {
    const soloBitacora = pendientes.every((p) => p.store === 'bitacora');
    const soloInventario = pendientes.every((p) => p.store === 'inventario');
    if (soloBitacora) return 'Bitácora sincronizada';
    if (soloInventario) return 'Inventario sincronizado';
    return 'Registros sincronizados';
}

// ===== Estado de conexión =====
function actualizarEstado() {
    const enLinea = navigator.onLine;
    estadoPunto.attr('class', 'punto ' + (enLinea ? 'online' : 'offline'));

    FieldLogDB.contarPendientes().then((n) => {
        estadoTexto.text(enLinea ? 'En línea' : 'Sin conexión');
        pendientesTexto
            .text(n > 0 ? n + ' pendiente' + (n === 1 ? '' : 's') + ' de sincronizar' : 'Todo sincronizado')
            .attr('class', 'pendientes' + (n > 0 ? ' alerta' : ''));
    });
}

// ===== Renderizado =====
function estadoBadge(estado) {
    if (estado === 'pendiente') {
        return '<span class="badge pendiente"><i class="fa fa-cloud-upload-alt"></i> pendiente</span>';
    }
    return '<span class="badge ok"><i class="fa fa-check"></i> sincronizado</span>';
}

function escapar(txt) {
    return $('<div>').text(txt == null ? '' : txt).html();
}

function renderBitacora(registros) {
    listaBitacora.empty();

    registros.forEach((r) => {
        const fecha = new Date(r.creado).toLocaleString('es-MX', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        const html = `
        <li class="tarjeta ${r.estado === 'pendiente' ? 'pendiente' : 'sincronizada'} animated fadeIn fast" data-id="${r.id}">
            <div class="tarjeta-icono"><i class="fa fa-clipboard-list"></i></div>
            <div class="tarjeta-cuerpo">
                <div class="tarjeta-cabecera">
                    <span class="tarjeta-titulo">${escapar(r.tipo)}</span>
                    ${estadoBadge(r.estado)}
                </div>
                <div class="tarjeta-meta"><i class="fa fa-map-marker-alt"></i>${escapar(r.ubicacion || 'Sin ubicación')}</div>
                ${r.notas ? `<div class="tarjeta-notas">${escapar(r.notas)}</div>` : ''}
                <div class="tarjeta-pie">${fecha}</div>
            </div>
        </li>`;
        listaBitacora.append(html);
    });
}

function renderInventario(registros) {
    listaInventario.empty();

    registros.forEach((r) => {
        const fecha = new Date(r.creado).toLocaleString('es-MX', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        const html = `
        <li class="tarjeta ${r.estado === 'pendiente' ? 'pendiente' : 'sincronizada'} animated fadeIn fast" data-id="${r.id}">
            <div class="tarjeta-icono"><i class="fa fa-box-open"></i></div>
            <div class="tarjeta-cuerpo">
                <div class="tarjeta-cabecera">
                    <span class="tarjeta-titulo">${escapar(r.nombre)}</span>
                    ${estadoBadge(r.estado)}
                </div>
                <div class="tarjeta-meta"><i class="fa fa-barcode"></i>${escapar(r.clave || 'Sin clave')}</div>
                <div class="tarjeta-cantidad">${escapar(r.cantidad)}<span>${escapar(r.unidad)}</span></div>
                <div class="tarjeta-pie">${fecha}</div>
            </div>
        </li>`;
        listaInventario.append(html);
    });
}

function render() {
    return FieldLogDB.listar(modulo).then((registros) => {
        if (modulo === 'bitacora') {
            renderBitacora(registros);
        } else {
            renderInventario(registros);
        }

        const vacia = registros.length === 0;
        vacio.toggleClass('oculto', !vacia);
        if (vacia) {
            vacioTexto.html(modulo === 'bitacora'
                ? 'Sin registros de bitácora todavía.<br>Toca <b>+</b> para crear el primero.'
                : 'Inventario vacío.<br>Toca <b>+</b> para dar de alta un artículo.');
        }

        actualizarEstado();
    });
}

// ===== Sincronización =====
let sincronizando = false;

function sincronizar() {
    if (!navigator.onLine || sincronizando) {
        actualizarEstado();
        return Promise.resolve(false);
    }

    return FieldLogDB.todosPendientes().then((pendientes) => {
        if (pendientes.length === 0) {
            actualizarEstado();
            return false;
        }

        sincronizando = true;
        estadoTexto.text('Sincronizando...');

        const cuerpo = {
            registros: pendientes.map((p) => ({
                store: p.store,
                id: p.registro.id,
                datos: p.registro
            }))
        };

        return fetch(API_BASE + '/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo)
        }).then((res) => {
            if (!res.ok) throw new Error('Respuesta no válida del servidor');
            return res.json();
        }).then((data) => {
            console.log('Respuesta de POST /api/sync:', data);

            // Agrupa los ids por store para marcarlos como sincronizados
            const porStore = {};
            pendientes.forEach((p) => {
                porStore[p.store] = porStore[p.store] || [];
                porStore[p.store].push(p.registro.id);
            });

            return Promise.all(Object.keys(porStore).map((store) =>
                FieldLogDB.marcarSincronizado(store, porStore[store])
            )).then(() => {
                const n = data.sincronizados != null ? data.sincronizados : pendientes.length;
                const tituloNotif = tituloNotificacion(pendientes);
                const cuerpoNotif = resumenNotificacion(pendientes);
                console.log('Notificación de sincronización ->', tituloNotif + ': ' + cuerpoNotif);
                notificarLocal(tituloNotif, cuerpoNotif);
                toast(n + (n === 1 ? ' registro sincronizado' : ' registros sincronizados') + ' con el servidor');
                return render();
            });
        }).catch((err) => {
            // Sin servidor o sin red real: los registros se quedan pendientes
            console.warn('Sincronización pospuesta:', err.message);
            toast('No se pudo sincronizar con el server: se reintentará al volver la red.');
            actualizarEstado();
            return false;
        }).then((resultado) => {
            sincronizando = false;
            return resultado;
        });
    });
}

// ===== Alta de registros =====
function guardarRegistro() {
    let datos;

    if (modulo === 'bitacora') {
        datos = {
            tipo: $('#txtTipo').val(),
            ubicacion: $('#txtUbicacion').val().trim(),
            notas: $('#txtNotas').val().trim()
        };
        if (!datos.ubicacion && !datos.notas) {
            toast('Captura al menos una ubicación o unas notas.');
            return;
        }
    } else {
        datos = {
            clave: $('#txtClave').val().trim(),
            nombre: $('#txtNombre').val().trim(),
            cantidad: $('#txtCantidad').val().trim() || '0',
            unidad: $('#txtUnidad').val()
        };
        if (!datos.nombre) {
            toast('Captura el nombre del artículo.');
            return;
        }
    }

    FieldLogDB.agregar(modulo, datos).then((id) => {
        console.log('Registro guardado en IndexedDB (' + modulo + ', id=' + id + '):', datos);
        limpiarFormulario();
        cerrarModal();
        return render();
    }).then(() => {
        if (navigator.onLine) {
            sincronizar();
        } else {
            const detalle = detalleRegistro({ store: modulo, registro: datos });
            console.log('Sin conexión: guardado local de ->', detalle);
            notificarLocal('Guardado sin conexión',
                detalle + ' — se sincronizará cuando haya red.');
            registrarBackgroundSync();
        }
    }).catch((err) => {
        console.error(err);
        toast('No se pudo guardar el registro.');
    });
}

function registrarBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
    navigator.serviceWorker.ready.then((reg) => reg.sync.register('fieldlog-sync')).catch(() => {});
}

function limpiarFormulario() {
    $('#txtUbicacion').val('');
    $('#txtNotas').val('');
    $('#txtClave').val('');
    $('#txtNombre').val('');
    $('#txtCantidad').val('');
}

// ===== Modal =====
function abrirModal() {
    tituloModal.text(modulo === 'bitacora' ? 'Nueva entrada de bitácora' : 'Nuevo artículo');
    camposBitacora.toggleClass('oculto', modulo !== 'bitacora');
    camposInventario.toggleClass('oculto', modulo !== 'inventario');
    nuevoBtn.addClass('oculto');

    modal.removeClass('oculto');
    modal.animate({ marginTop: '-=1000px', opacity: 1 }, 200);
}

function cerrarModal() {
    modal.animate({ marginTop: '+=1000px', opacity: 0 }, 200, function () {
        modal.addClass('oculto');
        limpiarFormulario();
        nuevoBtn.removeClass('oculto');
    });
}

// ===== Cambio de módulo =====
function cambiarModulo(nuevo) {
    modulo = nuevo;
    const esBitacora = modulo === 'bitacora';

    tabBitacora.toggleClass('activo', esBitacora);
    tabInventario.toggleClass('activo', !esBitacora);
    listaBitacora.toggleClass('oculto', !esBitacora);
    listaInventario.toggleClass('oculto', esBitacora);
    titulo.text(esBitacora ? 'FieldLog · Bitácora' : 'FieldLog · Inventario');

    render();
}

// ===== Eventos =====
nuevoBtn.on('click', abrirModal);
cancelarBtn.on('click', cerrarModal);
guardarBtn.on('click', guardarRegistro);
syncBtn.on('click', () => {
    sincronizar();
    toast('Buscando registros pendientes...');
});
tabBitacora.on('click', () => cambiarModulo('bitacora'));
tabInventario.on('click', () => cambiarModulo('inventario'));

// ===== Ayuda / instrucciones de uso =====
const ayuda = $('#ayuda');

function pintarServidorActual() {
    $('#servidor-input').val(API_BASE);
    $('#servidor-actual').text(API_BASE);
}

$('#ayuda-btn').on('click', () => {
    pintarServidorActual();
    ayuda.removeClass('oculto');
});
$('#ayuda-close').on('click', () => ayuda.addClass('oculto'));
$('#ayuda-cerrar-btn').on('click', () => ayuda.addClass('oculto'));

// URL del servidor desde la ayuda (se guarda en el dispositivo)
$('#guardar-servidor-btn').on('click', () => {
    const url = normalizarUrl($('#servidor-input').val());
    if (url && !/^https?:\/\//i.test(url)) {
        toast('La URL debe empezar con http:// o https://');
        return;
    }
    API_BASE = url || API_BASE_POR_DEFECTO;
    try {
        if (url) localStorage.setItem('fieldlog-servidor', API_BASE);
        else localStorage.removeItem('fieldlog-servidor');
    } catch (e) { /* almacenamiento no disponible */ }
    pintarServidorActual();
    console.log('Servidor configurado:', API_BASE);
    toast('Servidor guardado: ' + API_BASE);
    reenviarSuscripcion();
});

$('#probar-notif-btn').on('click', async () => {
    const permitido = await pedirPermisoNotificaciones();
    if (!permitido) {
        toast('Permiso denegado. Habilítalo en la configuración del sitio y recarga.');
        return;
    }
    notificarLocal('FieldLog', '¡Así se verán las notificaciones de sincronización!');
    toast('Notificación enviada. Si no aparece, revisa la sección 5 de la ayuda.');
    actualizarBotonNotificaciones();
});

// ===== Estado del botón de notificaciones =====
async function actualizarBotonNotificaciones() {
    if (!('Notification' in window) || !('PushManager' in window)) {
        notifBtn.addClass('bloqueado').attr('title', 'Este navegador no soporta notificaciones');
        return;
    }

    try {
        const registro = await navigator.serviceWorker.ready;
        const sub = await registro.pushManager.getSubscription();
        const perm = Notification.permission;

        notifBtn.toggleClass('activo', !!sub);
        notifBtn.toggleClass('bloqueado', !sub && perm === 'denied');

        if (sub) {
            notifBtn.attr('title', 'Notificaciones activas (toca para desactivar)');
        } else if (perm === 'denied') {
            notifBtn.attr('title', 'Notificaciones bloqueadas: actívalas en la configuración del sitio');
        } else {
            notifBtn.attr('title', 'Activar notificaciones');
            if (perm === 'default' && !sessionStorage.getItem('fieldlog-aviso-notif')) {
                sessionStorage.setItem('fieldlog-aviso-notif', '1');
                setTimeout(() => toast('Toca la campana 🔔 del título para activar las notificaciones'), 1800);
            }
        }
    } catch (err) {
        console.warn('No se pudo verificar la suscripción:', err);
    }
}

// El server guarda las suscripciones en memoria: si se reinicia las pierde,
// así que reenviamos la suscripción existente cada vez que abrimos la app.
function reenviarSuscripcion() {
    if (!navigator.onLine || !('PushManager' in window)) return;

    navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
            if (!sub) return;
            return fetch(API_BASE + '/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sub)
            }).then((r) => r.json()).then((d) => console.log('Suscripción reenviada al server:', d));
        })
        .catch(() => {});
}

// Suscripción / desuscripción con la campana del título
notifBtn.on('click', async function () {
    if (!('Notification' in window) || !('PushManager' in window)) {
        toast('Este navegador no soporta notificaciones.');
        return;
    }

    try {
        const registro = await navigator.serviceWorker.ready;
        const actual = await registro.pushManager.getSubscription();

        // Segunda tope: desactivar
        if (actual) {
            await actual.unsubscribe();
            fetch(API_BASE + '/api/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: actual.endpoint })
            }).catch(() => {});
            toast('Notificaciones desactivadas.');
            actualizarBotonNotificaciones();
            return;
        }

        const permiso = await pedirPermisoNotificaciones();
        if (!permiso) {
            toast('Permiso de notificaciones denegado. Habilítalo en la configuración del sitio.');
            actualizarBotonNotificaciones();
            return;
        }

        const sub = await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        const respuesta = await fetch(API_BASE + '/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
        });
        const datosSub = await respuesta.json();
        console.log('Respuesta de POST /api/subscribe:', datosSub);

        notificarLocal('Notificaciones activas', 'Recibirás la confirmación de cada sincronización.');
        toast('Notificaciones activadas en este dispositivo ✔');
        actualizarBotonNotificaciones();
    } catch (err) {
        console.error('Error al suscribirse:', err);
        toast('No se pudo suscribir. ¿Está corriendo el server? (npm start)');
    }
});

// Conexión / desconexión
window.addEventListener('online', () => {
    actualizarEstado();
    sincronizar();
});
window.addEventListener('offline', actualizarEstado);

// ===== Registro del Service Worker =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js')
            .then((reg) => {
                if (navigator.onLine) sincronizar();

                // El SW avisa cuando vuelve la red (Background Sync)
                navigator.serviceWorker.addEventListener('message', (e) => {
                    if (e.data && e.data.tipo === 'sincronizar') sincronizar();
                });

                // Nuevo SW disponible: recarga para usarlo
                reg.addEventListener('updatefound', () => {
                    const nuevo = reg.installing;
                    if (!nuevo) return;
                    nuevo.onstatechange = () => {
                        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
                            notificarLocal('Actualización disponible', 'Recarga la página para usar la nueva versión.');
                        }
                    };
                });
            })
            .catch((err) => console.log('Error al registrar el SW:', err));
    });
}

// ===== Inicio =====
if (!('Notification' in window) || !('PushManager' in window)) {
    console.log('Este navegador no soporta notificaciones push');
}

const params = new URLSearchParams(window.location.search);
const moduloInicial = params.get('modulo') === 'inventario' ? 'inventario' : 'bitacora';

function iniciar() {
    ajustarLayout();
    cambiarModulo(moduloInicial);
    actualizarBotonNotificaciones();
    reenviarSuscripcion();
    if (navigator.onLine) sincronizar();
}

window.addEventListener('load', ajustarLayout);
window.addEventListener('resize', ajustarLayout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarLayout);

FieldLogDB.abrir().then(iniciar);
