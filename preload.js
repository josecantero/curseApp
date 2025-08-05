// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Canales para obtener datos de la base de datos
  getAllCourses: () => ipcRenderer.invoke('get-all-courses'),
  getCourseById: (courseId) => ipcRenderer.invoke('get-course-by-id', courseId),
  getAllPlatforms: () => ipcRenderer.invoke('get-all-platforms'),

  // Canal para la navegación
  openCourseDetail: (courseId) => ipcRenderer.send('open-course-detail', courseId)
});