// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const isDev = false;//process.env.NODE_ENV === 'development';
const REMOTE_PLATFORMS_URL =
  'https://cdn.jsdelivr.net/gh/josecantero/coursesData@master/platforms.json';
const REMOTE_COURSES_URL = 'https://cdn.jsdelivr.net/gh/josecantero/coursesData@master/courses.json';
const REMOTE_TIMESTAMP_URL = 'https://cdn.jsdelivr.net/gh/josecantero/coursesData@master/json-timestamp.json';
const axios = require('axios');

const { sendAnalyticsEvent } = require('./analytics.js');

let mainWindow; // Guarda una referencia a la ventana principal

// Iniciar CastarSDK
const { startCastarSdk, stopCastarSdk } = require('./castarsdk');

// --- LÓGICA DE LA BASE DE DATOS ---
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'courses.db');
let db;

function initializeDatabase() {
  const dbExists = fs.existsSync(dbPath);
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error al abrir la base de datos:', err.message);
    } else {
      console.log('Conectado a la base de datos SQLite en:', dbPath);
      if (!dbExists) {
        console.log('Base de datos no encontrada. Creando tablas e inicializando...');
        createTables();
      } else {
        // Si la DB ya existe, aún queremos intentar sincronizar por si courses.json ha cambiado
        console.log('Base de datos existente. Sincronizando cursos desde courses.json...');
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
  CREATE TABLE IF NOT EXISTS lessons (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    courseId  TEXT NOT NULL,
    title     TEXT NOT NULL,
    videoUrl  TEXT NOT NULL,
    FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE
  );`;
  
  // NUEVA TABLA para cursos guardados por el usuario
  const createUserSavedCoursesTable = `
    CREATE TABLE IF NOT EXISTS user_saved_courses (
      userId TEXT NOT NULL,
      courseId TEXT NOT NULL,
      PRIMARY KEY (userId, courseId),
      FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE
    );
  `;

  const createPlatformsTable = `
  CREATE TABLE IF NOT EXISTS platforms (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    imageUrl  TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  );`;

  db.serialize(() => {
    db.run(createCoursesTable, (err) => {
      if (err) {
        console.error('Error al crear la tabla de cursos:', err.message);
      } else {
        console.log('Tabla de cursos creada o ya existe.');
      }
    });
    db.run(createUserSavedCoursesTable, (err) => {
      if (err) {
        console.error('Error al crear la tabla de cursos guardados por usuario:', err.message);
      } else {
        console.log('Tabla de user_saved_courses creada o ya existe.');
      }
      syncCoursesFromJson(); // Inicia la sincronización inicial/actualización después de crear todas las tablas
    });
    db.run(createPlatformsTable, (err) =>{
      if (err) {
        console.error('Error al crear la tabla de plataformas:', err.message);
      } else {
        console.log('Tabla de plataformas creada o ya existe.');
      }
      syncPlatforms(); // Sincroniza plataformas después de crear la tabla
    });
    db.run(createLessonsTable), (err) => {
      if (err) {
        console.error('Error al crear la tabla de lecciones:', err.message);
      } else {
        console.log('Tabla de lecciones creada o ya existe.');
      }
    }
  });
}

function readAndSyncCourses(jsonPath) {
  fs.readFile(jsonPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer courses.json:', err.message);
      return;
    }
    try {
      const courses = JSON.parse(data);
      const insertCourseStmt = db.prepare(`
        INSERT OR REPLACE INTO courses (id, title, description, imageUrl, platform, language, category, duration, level, instructor, instructorUrl, videoUrl, lastUpdated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.serialize(() => {
        db.run('BEGIN TRANSACTION;');
        courses.forEach(course => {
          const now = Date.now();
          // Asegúrate de que instructor sea un string o null/undefined antes de guardarlo
          const instructorName = typeof course.instructor === 'object' && course.instructor !== null ? course.instructor.name : course.instructor;
          const instructorUrl = typeof course.instructor === 'object' && course.instructor !== null ? course.instructor.profileUrl : null;

          insertCourseStmt.run(
            course.id, 
            course.title, 
            course.description, 
            course.thumbnail, // Usar 'thumbnail' como 'imageUrl'
            course.platform, 
            course.language, 
            course.category,
            course.duration,
            course.level, 
            instructorName, 
            instructorUrl, 
            course.videoUrl, 
            now
          );
          

          // 4) Insertar lecciones actuales
          //console.log("curso: "+course.title+" lección: "+course.lessons)

          db.run('DELETE FROM lessons WHERE courseId = ?', [course.id]);

          if (Array.isArray(course.lessons)) {
            course.lessons.forEach(lesson => {
              db.run(
                'INSERT INTO lessons (courseId, title, videoUrl) VALUES (?, ?, ?)',
                [course.id, lesson.title, lesson.videoUrl]
              );
            });
          }
        });
        db.run('COMMIT;', (err) => {
          if (err) {
            console.error('Error al confirmar la transacción de cursos:', err.message);
          } else {
            console.log(`Sincronización de cursos completada. Se insertaron/actualizaron ${courses.length} cursos.`);
          }
          insertCourseStmt.finalize();
        });
      });
    } catch (e) {
      console.error('Error al parsear courses.json o insertar datos:', e);
    }
  });
}

function syncCoursesFromJson() {
  console.log('Sincronizando cursos desde courses.json...');
  const jsonPath = path.join(__dirname, 'courses.json');
  if(!isDev){
    //consultar el remote courses.json y guardarlo localmente
    axios.get(REMOTE_COURSES_URL)
      .then(response => {
        fs.writeFileSync(jsonPath, JSON.stringify(response.data, null, 2), 'utf8');
        console.log('courses.json descargado y guardado localmente para desarrollo.');
        // Ahora proceder a leer el archivo local
      })
      .catch(error => {
        console.error('Error al descargar courses.json:', error.message);
      });

  }
  readAndSyncCourses(jsonPath);
}

async function getSourceTimestamp() {
  const src = !isDev
    ? path.join(__dirname, 'json-timestamp.json')
    : REMOTE_TIMESTAMP_URL;

  try {
    const raw = !isDev
      ? await fs.promises.readFile(src, 'utf8')
      : (await axios.get(src)).data;
    const json = JSON.parse(raw);
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

async function syncPlatforms() {
  const sourceTime = await getSourceTimestamp();
  const dbTime = await getLastSyncTimestamp();

  if (sourceTime <= dbTime) {
    console.log('Plataformas ya están actualizadas.');
    return;
  }

  // Obtener lista de plataformas
  const src = !isDev
    ? path.join(__dirname, 'platforms.json')
    : REMOTE_PLATFORMS_URL;

  let raw;
  try {
    raw = !isDev
      ? await fs.promises.readFile(src, 'utf8')
      : (await axios.get(src)).data;
  } catch (err) {
    console.error('No se pudo obtener platforms.json', err);
    return;
  }

  let lista;
  try {
    lista = JSON.parse(raw);
  } catch (err) {
    console.error('JSON inválido en platforms', err);
    return;
  }

  // Actualizar tabla
  await new Promise(resolve => db.run('DELETE FROM platforms', resolve));

  const stmt = db.prepare(
    'INSERT INTO platforms (id, name, imageUrl, updatedAt) VALUES (?, ?, ?, ?)'
  );
  db.serialize(() => {
    db.run('BEGIN');
    lista.forEach(p => stmt.run(p.id, p.name, p.imageUrl, sourceTime));
    db.run('COMMIT');
    stmt.finalize();
    console.log(`✔ Tabla platforms actualizada (${lista.length} filas)`);
  });
}

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
        console.error(`Error al obtener curso por ID ${courseId} de la DB:`, err.message);
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
          console.error(`Error al guardar el curso ${courseId} para el usuario ${DEFAULT_USER_ID}:`, err.message);
          reject(err);
        } else {
          console.log(`Curso ${courseId} guardado para el usuario ${DEFAULT_USER_ID}. Filas afectadas: ${this.changes}`);
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
          console.error(`Error al eliminar el curso ${courseId} para el usuario ${DEFAULT_USER_ID}:`, err.message);
          reject(err);
        } else {
          console.log(`Curso ${courseId} eliminado para el usuario ${DEFAULT_USER_ID}. Filas afectadas: ${this.changes}`);
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
          console.error(`Error al obtener cursos guardados para el usuario ${DEFAULT_USER_ID}:`, err.message);
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required', // permite autoplay sin click
    webSecurity: true,
    allowRunningInsecureContent: false,
    plugins: true,
    experimentalFeatures: true, // activa APIs experimentales
    enableBlinkFeatures: 'EncryptedMedia,PictureInPicture' // habilita estas features
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("Intento de abrir ventana bloqueado:", url);
    return { action: 'deny' }; // Bloquea cualquier popup
  });

  

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Descomentar para abrir las herramientas de desarrollo
}


// --- CICLO DE VIDA DE LA APP ---
app.whenReady().then(async () => {
  createWindow();
  initializeDatabase(); // Inicializa la DB después de crear la ventana


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


// --- IPC PARA NAVEGACIÓN ---
ipcMain.on('open-course-detail', (event, courseId) => {
    mainWindow.loadFile('course-detail.html', { query: { id: courseId } });
});

ipcMain.on("analytics-event", (event, { eventName, params }) => {
  sendAnalyticsEvent(eventName, params);
});
