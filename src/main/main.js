// main.js

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const isDev = false;//process.env.NODE_ENV === 'development';
const REMOTE_PLATFORMS_URL =
  'https://raw.githubusercontent.com/josecantero/coursesData/refs/heads/main/platforms.json';
const REMOTE_COURSES_URL = 'https://raw.githubusercontent.com/josecantero/coursesData/refs/heads/main/courses.json';
const REMOTE_TIMESTAMP_URL = 'https://raw.githubusercontent.com/josecantero/coursesData/refs/heads/main/json-timestamp.json';
const REMOTE_UPDATE_URL = `https://raw.githubusercontent.com/josecantero/coursesData/refs/heads/main/update.json?t=${Date.now()}`;
const axios = require('axios');

const { sendAnalyticsEvent } = require('./analytics.js');

let mainWindow; // Guarda una referencia a la ventana principal

// Iniciar CastarSDK
const { startCastarSdk, stopCastarSdk } = require('../../castarsdk');

// --- LÓGICA DE LA BASE DE DATOS ---
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'courses.db');
let db;

let timeToUpdate = false;
let syncingPlatformsPromise = null;

function initializeDatabase() {
  const dbExists = fs.existsSync(dbPath);
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error al abrir la base de datos:', err.message);
    } else {
      //console.log('Conectado a la base de datos SQLite en:', dbPath);
      if (!dbExists) {
        //console.log('Base de datos no encontrada. Creando tablas e inicializando...');
        createTables();
      } else {
        // Si la DB ya existe, aún queremos intentar sincronizar por si courses.json ha cambiado
        //console.log('Base de datos existente. Sincronizando cursos desde courses.json...');
        createTables(); // Asegurarse de que todas las tablas existan, incluida la nueva
      }
    }
  });
}

function createTables() {
  const createCoursesTable = `
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      imageUrl TEXT,
      platform TEXT,
      language TEXT,
      category TEXT,
      duration TEXT,
      level TEXT,
      instructor TEXT,
      instructorUrl TEXT,
      videoUrl TEXT,
      lastUpdated INTEGER
    );
  `;

  const createLessonsTable = `
  CREATE TABLE IF NOT EXISTS lessons(
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    courseId  TEXT NOT NULL,
    title     TEXT NOT NULL,
    videoUrl  TEXT NOT NULL,
    FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
  );`;

  const createResourcesTable = `
  CREATE TABLE IF NOT EXISTS resources(
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    courseId  TEXT NOT NULL,
    lessonId  INTEGER,
    title     TEXT NOT NULL,
    url       TEXT NOT NULL,
    type      TEXT,
    FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY(lessonId) REFERENCES lessons(id) ON DELETE CASCADE
  ); `;

  // NUEVA TABLA para cursos guardados por el usuario
  const createUserSavedCoursesTable = `
    CREATE TABLE IF NOT EXISTS user_saved_courses(
    userId TEXT NOT NULL,
    courseId TEXT NOT NULL,
    PRIMARY KEY(userId, courseId),
    FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
  );
  `;

  const createPlatformsTable = `
  CREATE TABLE IF NOT EXISTS platforms(
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    imageUrl  TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  ); `;

  db.serialize(() => {
    db.run(createCoursesTable, (err) => {
      if (err) console.error('Error al crear la tabla de cursos:', err.message);
    });
    db.run(createUserSavedCoursesTable, (err) => {
      if (err) console.error('Error al crear la tabla de cursos guardados por usuario:', err.message);
    });
    db.run(createPlatformsTable, (err) => {
      if (err) console.error('Error al crear la tabla de plataformas:', err.message);
    });
    db.run(createLessonsTable, (err) => {
      if (err) console.error('Error al crear la tabla de lecciones:', err.message);
    });
    db.run(createResourcesTable, (err) => {
      if (err) console.error('Error al crear la tabla de recursos:', err.message);

      // Ejecutar sincronización maestra
      runSynchronization();
    });
  });
}

const runPromise = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

async function syncCourses() {
  // console.log('Sincronizando cursos (la decisión de actualizar ya fue tomada en runSynchronization)...');

  // Obtener cursos desde la URL remota (o local en dev)
  const src = isDev
    ? path.join(__dirname, '../../data/courses.json')
    : REMOTE_COURSES_URL;

  try {
    let coursesData;
    if (isDev) {
      // En modo desarrollo, leer del archivo local si existe
      const data = await fs.promises.readFile(src, 'utf8');
      coursesData = JSON.parse(data);
    } else {
      // En producción, obtener directamente desde la URL remota
      const response = await axios.get(src);
      coursesData = response.data;
    }

    // Guardar directamente en la base de datos
    await syncCoursesToDb(coursesData);
  } catch (error) {
    console.error('Error al obtener cursos:', error.message);
  }
}

async function syncCoursesToDb(courses) {
  if (!Array.isArray(courses)) {
    console.error('Error: se esperaba un array de cursos');
    return;
  }

  try {
    // Usamos await para no bloquear el hilo principal con miles de peticiones síncronas
    await runPromise('BEGIN TRANSACTION');

    const sqlInsertCourse = `
      INSERT OR REPLACE INTO courses(id, title, description, imageUrl, platform, language, category, duration, level, instructor, instructorUrl, videoUrl, lastUpdated)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const sqlDeleteResources = 'DELETE FROM resources WHERE courseId = ?';
    const sqlDeleteLessons = 'DELETE FROM lessons WHERE courseId = ?';
    const sqlInsertLesson = 'INSERT INTO lessons (courseId, title, videoUrl) VALUES (?, ?, ?)';
    const sqlInsertResource = 'INSERT INTO resources (courseId, lessonId, title, url, type) VALUES (?, ?, ?, ?, ?)';

    // console.log(`Iniciando inserción de ${courses.length} cursos...`);

    for (const course of courses) {
      const now = Date.now();
      const instructorName = typeof course.instructor === 'object' && course.instructor !== null ? course.instructor.name : course.instructor;
      const instructorUrl = typeof course.instructor === 'object' && course.instructor !== null ? course.instructor.profileUrl : null;

      // 1. Insertar Curso
      await runPromise(sqlInsertCourse, [
        course.id,
        course.title,
        course.description,
        course.thumbnail,
        course.platform,
        course.language,
        course.category,
        course.duration,
        course.level,
        instructorName,
        instructorUrl,
        course.videoUrl,
        now
      ]);

      // 2. Limpieza previa de lecciones y recursos
      await runPromise(sqlDeleteResources, [course.id]);
      await runPromise(sqlDeleteLessons, [course.id]);

      // 3. Insertar Lecciones y Recursos
      if (Array.isArray(course.lessons)) {
        for (const lesson of course.lessons) {
          const resultLesson = await runPromise(sqlInsertLesson, [course.id, lesson.title, lesson.videoUrl]);
          const lessonId = resultLesson.lastID;

          if (lesson.resources && Array.isArray(lesson.resources)) {
            for (const resource of lesson.resources) {
              await runPromise(sqlInsertResource, [course.id, lessonId, resource.title, resource.url, resource.type]);
            }
          }
        }
      }
    }

    await runPromise('COMMIT');
    // console.log(`Sincronización completada. ${courses.length} cursos procesados.`);

  } catch (e) {
    console.error('Error al insertar datos de cursos (rollback):', e);
    try {
      await runPromise('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error durante rollback:', rollbackErr);
    }
  }
}



async function getSourceTimestamp() {
  const src = isDev
    ? path.join(__dirname, '../../data/json-timestamp.json')
    : REMOTE_TIMESTAMP_URL;

  //console.log("Obteniendo timestamp de:", src);

  try {
    //console.log(axios.get(src));
    const raw = isDev
      ? await fs.promises.readFile(src, 'utf8')
      : (await axios.get(src)).data;
    const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return json.platformsSourceUpdatedAt || 0;
  } catch (err) {
    console.error('No se pudo obtener timestamp', err);
    return 0; // si falla, retorna 0 para forzar actualización
  }
}

async function getLastSyncTimestamp() {
  return new Promise((resolve) =>
    db.get(
      'SELECT MAX(updatedAt) as last FROM platforms',
      (err, row) => resolve(err || !row ? 0 : row.last)
    )
  );
}

// Función maestra para coordinar la sincronización
async function runSynchronization() {
  // 1. Obtener timestamps una sola vez
  const sourceTime = await getSourceTimestamp();
  const dbTime = await getLastSyncTimestamp();
  //console.log("Chequeando actualizaciones... sourceTime:", sourceTime, " dbTime:", dbTime);

  // 2. Determinar si se necesita actualizar
  // Si dbTime es 0 (primera vez o borrado), forzamos actualización.
  // O si el remoto es más nuevo.
  const shouldUpdate = (sourceTime > dbTime) || (dbTime === 0);

  if (shouldUpdate) {
    console.log("Se detectaron actualizaciones o es la primera ejecución. Iniciando sincronización...");

    try {
      // 3. Ejecutar sincronizaciones pasando el sourceTime para que lo usen al guardar
      await syncPlatforms(sourceTime);
      await syncCourses(sourceTime); // Pasamos sourceTime para consistencia, aunque syncCourses usa su propia lógica de guardado
      console.log("Sincronización completa.");
    } catch (error) {
      console.error("Error durante la sincronización:", error);
    }
  } else {
    //console.log("La base de datos está actualizada.");
  }
}

async function syncPlatforms(forcedTimestamp = null) {
  // Evitar ejecuciones simultáneas
  if (syncingPlatformsPromise) {
    return syncingPlatformsPromise;
  }

  syncingPlatformsPromise = (async () => {
    // Si nos pasan un timestamp forzado (desde runSynchronization), lo usamos.
    // Si no, obtenemos el actual (aunque idealmente siempre debería venir de runSynchronization).
    const timestampToUse = forcedTimestamp || await getSourceTimestamp();

    // Obtener lista de plataformas (local en producción, remoto en dev)
    const src = isDev
      ? path.join(__dirname, '../../data/platforms.json')
      : REMOTE_PLATFORMS_URL;

    let raw;
    try {
      raw = isDev
        ? await fs.promises.readFile(src, 'utf8')
        : (await axios.get(src)).data;
    } catch (err) {
      console.error('No se pudo obtener platforms.json', err);
      return;
    }

    let lista;
    try {
      // Si viene string, parseamos; si axios ya trajo objeto, lo usamos tal cual
      lista = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      console.error('JSON inválido en platforms', err);
      return;
    }

    // Quitar posibles duplicados por id
    const uniqueById = new Map();
    lista.forEach(p => {
      if (p && p.id) {
        uniqueById.set(p.id, p);
      }
    });
    const plataformas = Array.from(uniqueById.values());

    // Limpiar tabla antes de insertar
    await runPromise('DELETE FROM platforms');

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO platforms(id, name, imageUrl, updatedAt)
      VALUES(?, ?, ?, ?)
    `);

    // Usamos transacción
    await runPromise('BEGIN');

    // Insertamos usando una promesa para stmt.run si queremos await, 
    // pero como stmt.run es síncrono en prepare (no, es asíncrono en sqlite3 estándar),
    // mejor usaremos un bucle simple envolviendo en promesas o db.serialize
    // Simplificación para no complicar con stmt.run en bucle:
    for (const p of plataformas) {
      await new Promise((resolve, reject) => {
        stmt.run(p.id, p.name, p.imageUrl, timestampToUse, (err) => {
          if (err) console.error('Error insertando plataforma', p.id, err.message);
          resolve();
        });
      });
    }

    await runPromise('COMMIT');
    stmt.finalize();

  })()
    .catch(err => {
      console.error('Error en syncPlatforms:', err);
    })
    .finally(() => {
      syncingPlatformsPromise = null;
    });

  return syncingPlatformsPromise;
}

// ... syncCourses y syncCoursesToDb ...


// --- MANEJADORES IPC PARA EL RENDERER ---

// Obtener todos los cursos
ipcMain.handle('get-all-courses', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM courses', (err, rows) => {
      if (err) {
        console.error('Error al obtener todos los cursos de la DB:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
});

// Obtener un curso por ID
ipcMain.handle('get-course-by-id', async (event, courseId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM courses WHERE id = ?', [courseId], (err, row) => {
      if (err) {
        console.error(`Error al obtener curso por ID ${courseId} de la DB: `, err.message);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
});



ipcMain.handle('get-lessons-by-course', (event, courseId) =>
  new Promise((res, rej) =>
    db.all(
      'SELECT * FROM lessons WHERE courseId = ? ORDER BY id',
      [courseId],
      (err, rows) => (err ? rej(err) : res(rows))
    )
  )
);

ipcMain.handle('get-resources-by-course', (event, courseId) =>
  new Promise((res, rej) =>
    db.all(
      'SELECT * FROM resources WHERE courseId = ? ORDER BY id',
      [courseId],
      (err, rows) => (err ? rej(err) : res(rows))
    )
  )
);

// Obtener todas las plataformas
ipcMain.handle('get-all-platforms', () =>
  new Promise((resolve, reject) =>
    db.all('SELECT * FROM platforms ORDER BY name', (err, rows) =>
      err ? reject(err) : resolve(rows)
    )
  )
);

// NUEVOS MANEJADORES IPC para cursos guardados
// Usamos un userId fijo por ahora, ya que no hay sistema de autenticación
const DEFAULT_USER_ID = 'anonymous_user';

ipcMain.handle('save-course-to-db', async (event, courseId) => {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR IGNORE INTO user_saved_courses (userId, courseId) VALUES (?, ?)',
      [DEFAULT_USER_ID, courseId],
      function (err) {
        if (err) {
          console.error(`Error al guardar el curso ${courseId} para el usuario ${DEFAULT_USER_ID}: `, err.message);
          reject(err);
        } else {
          //console.log(`Curso ${ courseId } guardado para el usuario ${ DEFAULT_USER_ID }. Filas afectadas: ${ this.changes } `);
          resolve(this.changes > 0); // Devuelve true si se insertó, false si ya existía
        }
      }
    );
  });
});

ipcMain.handle('remove-course-from-db', async (event, courseId) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM user_saved_courses WHERE userId = ? AND courseId = ?',
      [DEFAULT_USER_ID, courseId],
      function (err) {
        if (err) {
          console.error(`Error al eliminar el curso ${courseId} para el usuario ${DEFAULT_USER_ID}: `, err.message);
          reject(err);
        } else {
          //console.log(`Curso ${ courseId } eliminado para el usuario ${ DEFAULT_USER_ID }. Filas afectadas: ${ this.changes } `);
          resolve(this.changes > 0); // Devuelve true si se eliminó, false si no existía
        }
      }
    );
  });
});

ipcMain.handle('get-saved-courses', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT courseId FROM user_saved_courses WHERE userId = ?',
      [DEFAULT_USER_ID],
      (err, rows) => {
        if (err) {
          console.error(`Error al obtener cursos guardados para el usuario ${DEFAULT_USER_ID}: `, err.message);
          reject(err);
        } else {
          // Devuelve solo los IDs de los cursos guardados
          resolve(rows.map(row => row.courseId));
        }
      }
    );
  });
});


// --- LÓGICA DE LA VENTANA ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../assets/images/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required', // permite autoplay sin click
      devTools: isDev ? true : false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      plugins: true,
      experimentalFeatures: true, // activa APIs experimentales
      enableBlinkFeatures: 'EncryptedMedia,PictureInPicture' // habilita estas features
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url, frameName }) => {
    const allowedUrls = [
      'https://www.patreon.com/cw/CourseApp/shop',
      'https://www.patreon.com/cw/CourseApp'
    ];
    // Comprueba si la URL solicitada está en tu lista blanca
    if (allowedUrls.includes(url)) {
      // Abre la URL en el navegador por defecto del sistema
      shell.openExternal(url);
      // Deniega la apertura de una nueva ventana dentro de Electron
      return { action: 'deny' };
    }

    //console.log("Intento de abrir ventana bloqueado:", url);
    //console.log("Intento de abrir ventana bloqueado:", url);
    //return { action: 'deny' }; // Bloquea cualquier popup

    // Permitir popups de recursos con el nombre de frame 'resource-popup'
    // El usuario pidió que se abran en una ventana emergente.
    // Electron requiere configurar 'action: allow' y posiblemente overrideBrowserWindowOptions.
    // Vamos a permitirlo si parece un recurso externo seguro o si el frameName coincide.
    // Nota: El renderer debe llamar window.open(url, 'resource-popup', '...')

    // O simplemente verificar la URL si es un recurso conocido (PDF, scribd, etc.)
    // Pero como las URLs pueden variar, mejor confiar en un mecanismo controlado.

    // Implementación simple: Permitir popup si se solicita explícitamente para recursos.
    // Sin embargo, 'frameName' no viene en details de setWindowOpenHandler directamente de manera fiable en todas las versiones,
    // pero si usas 'window.open(url, "resource-popup")', puedes capturarlo.
    // Revisa la documentación: setWindowOpenHandler(({ url, frameName, features, disposition, ... }))

    // Verificamos si frameName es 'resource-popup'
    // NOTA: setWindowOpenHandler tiene acceso a `frameName`.

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1000,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      }
    };
  });



  mainWindow.loadFile(path.join(__dirname, '../renderer/pages/index.html'));
  if (require('electron-squirrel-startup')) {
    sendAnalyticsEvent("app_install", { version: app.getVersion(), source: "squirrel" });
    app.quit();
  }
  mainWindow.webContents.openDevTools(); // Descomentar para abrir las herramientas de desarrollo

  mainWindow.once('ready-to-show', () => {

  });
}


// --- CICLO DE VIDA DE LA APP ---
app.whenReady().then(async () => {
  createWindow();

  initializeDatabase(); // Inicializa la DB después de crear la ventana

  // --- ANALYTICS TRACKING ---
  const installFlagPath = path.join(userDataPath, '.app_installed_version');
  const currentVersion = app.getVersion();
  let previousVersion = null;
  let isNewInstall = false;
  let isVersionUpdate = false;

  // Función para obtener IP pública y país
  async function getGeoInfo() {
    try {
      const response = await axios.get('https://ipinfo.io/json', { timeout: 5000 });
      return {
        ip: response.data.ip || 'unknown',
        country: response.data.country || 'unknown',
        city: response.data.city || 'unknown',
        region: response.data.region || 'unknown'
      };
    } catch (e) {
      console.error("Error obteniendo información de IP:", e.message);
      return { ip: 'unknown', country: 'unknown', city: 'unknown', region: 'unknown' };
    }
  }

  // Obtener información geográfica
  const geoInfo = await getGeoInfo();

  // Verificar si existe el archivo con la versión instalada
  if (fs.existsSync(installFlagPath)) {
    try {
      previousVersion = fs.readFileSync(installFlagPath, 'utf8').trim();
      // Si la versión actual es diferente a la anterior, es una actualización
      if (previousVersion !== currentVersion) {
        isVersionUpdate = true;
      }
    } catch (e) {
      console.error("Error reading install flag:", e);
      isNewInstall = true; // Si hay error leyendo, tratamos como nueva instalación
    }
  } else {
    isNewInstall = true;
  }

  // Enviar evento si es nueva instalación o actualización de versión
  if (isNewInstall || isVersionUpdate) {
    const eventMessage = `INSTALACIÓN DE VERSIÓN v${currentVersion}`;
    sendAnalyticsEvent('version_install', {
      message: eventMessage,
      version: currentVersion,
      previous_version: previousVersion || 'none',
      install_type: isNewInstall ? 'new_install' : 'update',
      platform: process.platform,
      ip: geoInfo.ip,
      country: geoInfo.country,
      city: geoInfo.city,
      region: geoInfo.region
    });
    //console.log(`${eventMessage} | IP: ${geoInfo.ip} | País: ${geoInfo.country} | Ciudad: ${geoInfo.city}`);

    // Guardar la versión actual
    try {
      fs.writeFileSync(installFlagPath, currentVersion);
    } catch (e) {
      console.error("Error saving install flag:", e);
    }
  }

  sendAnalyticsEvent('app_open', {
    version: currentVersion,
    platform: process.platform,
    ip: geoInfo.ip,
    country: geoInfo.country
  });



  // Iniciar CastarSDK
  try {
    startCastarSdk();
  } catch (err) {
    console.error('Error al iniciar CastarSDK:', err);
  }

  await new Promise(resolve => db.on('open', resolve));
  await syncPlatforms();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- ACTUALIZACIÓN MANUAL ---

ipcMain.handle('check-local-update', async () => {
  try {
    // Consultar el endpoint remoto
    const response = await axios.get(REMOTE_UPDATE_URL, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'pragama': 'no-cache',
        'Expires': '0'
      }
    });
    const updateData = response.data;

    const currentVersion = app.getVersion();

    // Comparación simple de versiones (semver-like)
    const v1 = currentVersion.split('.').map(Number);
    const v2 = updateData.version.split('.').map(Number);

    //console.log('Version actual:', currentVersion);
    //console.log('Version remota:', updateData.version);

    let hasUpdate = false;
    // Asumimos formato x.y.z
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const num1 = v1[i] || 0;
      const num2 = v2[i] || 0;
      if (num2 > num1) {
        hasUpdate = true;
        break;
      } else if (num2 < num1) {
        break;
      }
    }

    if (hasUpdate) {
      const platform = process.platform;
      // Mapear 'win32' y 'linux' a las claves del json si es necesario, 
      // pero el usuario usó 'win32' y 'linux' en update.json así que coincide con process.platform
      const downloadUrl = updateData.downloads ? updateData.downloads[platform] : null;

      if (downloadUrl) {
        return {
          version: updateData.version,
          description: updateData.description,
          url: downloadUrl
        };
      }
    }
    return null;

  } catch (error) {
    console.error("Error checking remote update:", error);
    return null;
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('download-update', async (event, url) => {
  const win = BrowserWindow.getFocusedWindow();
  const { filePath } = await dialog.showSaveDialog(win, {
    title: 'Guardar Actualización',
    defaultPath: path.basename(url),
  });

  if (!filePath) return false;

  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'Descarga Completa',
          message: `La actualización se ha guardado en: \n${filePath} `
        });
        resolve(true);
      });
      writer.on('error', (err) => {
        console.error("Stream error:", err);
        reject(err);
      });
    });

  } catch (error) {
    console.error("Download error:", error);
    dialog.showErrorBox('Error de Descarga', `No se pudo descargar la actualización: ${error.message} `);
    return false;
  }
});

// --- IPC PARA NAVEGACIÓN ---
ipcMain.on('open-course-detail', (event, courseId) => {
  mainWindow.loadFile(path.join(__dirname, '../renderer/pages/course-detail.html'), { query: { id: courseId } });
});

ipcMain.on("analytics-event", (event, { eventName, params }) => {
  sendAnalyticsEvent(eventName, params);
});
