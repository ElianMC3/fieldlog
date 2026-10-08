// ===== FieldLog - Capa de almacenamiento local (IndexedDB) =====
// Todo lo que se registra aquí vive en el dispositivo y no requiere red.

const FieldLogDB = (() => {

    const NOMBRE = 'fieldlog-db';
    const VERSION = 1;
    const STORES = ['bitacora', 'inventario'];
    let db = null;

    function abrir() {
        if (db) return Promise.resolve(db);

        return new Promise((resolve, reject) => {
            const req = indexedDB.open(NOMBRE, VERSION);

            req.onupgradeneeded = (e) => {
                const base = e.target.result;
                STORES.forEach((store) => {
                    if (!base.objectStoreNames.contains(store)) {
                        const st = base.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
                        st.createIndex('estado', 'estado', { unique: false });
                        st.createIndex('creado', 'creado', { unique: false });
                    }
                });
            };

            req.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };

            req.onerror = (e) => reject(e.target.error);
        });
    }

    function transaccion(store, modo) {
        return abrir().then((base) => base.transaction(store, modo).objectStore(store));
    }

    function promesa(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // Alta de un registro (siempre nace como 'pendiente' de sincronizar)
    function agregar(store, datos) {
        const registro = Object.assign({}, datos, {
            estado: 'pendiente',
            creado: Date.now()
        });
        return transaccion(store, 'readwrite').then((st) => promesa(st.add(registro)));
    }

    // Listado completo, del más reciente al más antiguo
    function listar(store) {
        return transaccion(store, 'readonly').then((st) => promesa(st.getAll())).then((lista) => {
            return lista.sort((a, b) => b.id - a.id);
        });
    }

    // Registros que aún no se han enviado al servidor
    function pendientes(store) {
        return listar(store).then((lista) => lista.filter((r) => r.estado === 'pendiente'));
    }

    function todosPendientes() {
        return Promise.all(STORES.map((store) =>
            pendientes(store).then((lista) => lista.map((r) => ({ store: store, registro: r })))
        )).then((listas) => [].concat.apply([], listas));
    }

    function contarPendientes() {
        return todosPendientes().then((lista) => lista.length);
    }

    // Marca registros como sincronizados
    function marcarSincronizado(store, ids) {
        return abrir().then((base) => {
            return new Promise((resolve, reject) => {
                const tx = base.transaction(store, 'readwrite');
                const st = tx.objectStore(store);
                ids.forEach((id) => {
                    const req = st.get(id);
                    req.onsuccess = () => {
                        const reg = req.result;
                        if (reg) {
                            reg.estado = 'sincronizado';
                            reg.sincronizado = Date.now();
                            st.put(reg);
                        }
                    };
                });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        });
    }

    function eliminar(store, id) {
        return transaccion(store, 'readwrite').then((st) => promesa(st.delete(id)));
    }

    return { abrir, agregar, listar, pendientes, todosPendientes, contarPendientes, marcarSincronizado, eliminar, STORES };
})();
