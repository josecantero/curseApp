// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const isDev = true//process.env.NODE_ENV === 'development';
const REMOTE_PLATFORMS_URL =
  'https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/platforms.json';
const axios = require('axios');

let mainWindow; // Guarda una referencia a la ventana principal

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
      instructor TEXT,
      instructorUrl TEXT,
      videoUrl TEXT,
      lastUpdated INTEGER
    );
  `;
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
  });
}

function syncCoursesFromJson() {
  console.log('Sincronizando cursos desde courses.json...');
  const jsonPath = path.join(__dirname, 'courses.json');
  fs.readFile(jsonPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer courses.json:', err.message);
      return;
    }
    try {
      const courses = JSON.parse(data);
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO courses (id, title, description, imageUrl, platform, language, category, duration, instructor, instructorUrl, videoUrl, lastUpdated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.serialize(() => {
        db.run('BEGIN TRANSACTION;');
        courses.forEach(course => {
          const now = Date.now();
          // Asegúrate de que instructor sea un string o null/undefined antes de guardarlo
          const instructorName = typeof course.instructor === 'object' && course.instructor !== null ? course.instructor.name : course.instructor;
          const instructorUrl = typeof course.instructor === 'object' && course.instructor !== null ? course.instructor.profileUrl : null;

          insertStmt.run(
            course.id, 
            course.title, 
            course.description, 
            course.thumbnail, // Usar 'thumbnail' como 'imageUrl'
            course.platform, 
            course.language, 
            course.category, 
            course.duration, 
            instructorName, 
            instructorUrl, 
            course.videoUrl, 
            now
          );
        });
        db.run('COMMIT;', (err) => {
          if (err) {
            console.error('Error al confirmar la transacción de cursos:', err.message);
          } else {
            console.log(`Sincronización de cursos completada. Se insertaron/actualizaron ${courses.length} cursos.`);
          }
          insertStmt.finalize();
        });
      });
    } catch (e) {
      console.error('Error al parsear courses.json o insertar datos:', e);
    }
  });
}

async function getSourceTimestamp() {
  const src = isDev
    ? path.join(__dirname, 'json_timestamp.json')
    : 'https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/json_timestamp.json';

  try {
    const raw = isDev
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
  const src = isDev
    ? path.join(__dirname, 'platforms.json')
    : 'https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/platforms.json';

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
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Descomentar para abrir las herramientas de desarrollo
}


// --- CICLO DE VIDA DE LA APP ---
app.whenReady().then(async () => {
  createWindow();
  initializeDatabase(); // Inicializa la DB después de crear la ventana

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
