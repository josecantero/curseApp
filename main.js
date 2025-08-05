// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

let mainWindow; // Guarda una referencia a la ventana principal

// --- LÓGICA DE LA BASE DE DATOS (NUEVA) ---
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
        syncCoursesFromJson();
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
  db.run(createCoursesTable, (err) => {
    if (err) {
      console.error('Error al crear la tabla de cursos:', err.message);
    } else {
      console.log('Tabla de cursos creada o ya existe.');
      syncCoursesFromJson(); // Inicia la sincronización inicial o de actualización
    }
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
            console.error('Error al confirmar la transacción:', err.message);
          } else {
            console.log(`Sincronización inicial completada. Se insertaron/actualizaron ${courses.length} cursos.`);
          }
          insertStmt.finalize();
        });
      });
    } catch (e) {
      console.error('Error al parsear courses.json o insertar datos:', e);
    }
  });
}

// --- MANEJADORES IPC PARA EL RENDERER (NUEVOS) ---
ipcMain.handle('get-all-courses', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM courses', (err, rows) => {
      if (err) {
        console.error('Error al obtener todos los cursos de la DB:', err.message);
        reject(err);
      } else {
        // --- LOG DE DEPURACIÓN ---
        console.log('Cursos obtenidos de la DB (para depuración de idiomas):');
        rows.forEach(row => {
            console.log(`- Curso ID: ${row.id}, Título: ${row.title}, Idioma: ${row.language}`);
        });
        // --- FIN LOG DE DEPURACIÓN ---
        resolve(rows);
      }
    });
  });
});

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

ipcMain.handle('get-all-platforms', async () => {
    const jsonPath = path.join(__dirname, 'platforms.json');
    try {
        const data = await fs.promises.readFile(jsonPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error al leer platforms.json:', error);
        return [];
    }
});


// --- LÓGICA DE LA VENTANA (EXISTENTE) ---
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


// --- CICLO DE VIDA DE LA APP (EXISTENTE) ---
app.whenReady().then(() => {
  createWindow();
  initializeDatabase(); // Inicializa la DB después de crear la ventana

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


// --- IPC PARA NAVEGACIÓN (EXISTENTE) ---
ipcMain.on('open-course-detail', (event, courseId) => {
    // CAMBIO CLAVE: Pasar el courseId como un parámetro de consulta en el objeto de opciones
    mainWindow.loadFile('course-detail.html', { query: { id: courseId } });
});
