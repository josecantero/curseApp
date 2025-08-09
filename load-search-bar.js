// load-search-bar.js

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.querySelector('.search-bar-container');
  if (!container) {
    console.warn('No se encontró el contenedor .search-bar-container');
    return;
  }

  try {
    const response = await fetch('search-bar.html');
    const html = await response.text();
    container.innerHTML = html;
  } catch (error) {
    console.error('Error al cargar search-bar.html:', error);
  }
});