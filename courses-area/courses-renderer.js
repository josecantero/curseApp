import { initializeSavedCourses, createCourseCard } from './courses-cards.js';

initializeSavedCourses(); // Inicializar cursos guardados al cargar la aplicación
/**
 * Renderiza una lista de cursos en el contenedor de la cuadrícula.
 * @param {Array<Object>} coursesToRender - La lista de cursos a renderizar.
 */
function renderCourses(coursesToRender) {
    const courseGrid = document.getElementById('course-grid-container');
    if (!courseGrid) {
        console.error('El elemento #course-grid-container no fue encontrado.');
        return;
    }
    courseGrid.innerHTML = ''; // Limpiar la cuadrícula
    if (coursesToRender.length === 0) {
        courseGrid.innerHTML = '<p style="text-align: center; width: 100%; color: var(--light-text-color); margin-top: 50px;">No se encontraron cursos que coincidan con tu búsqueda.</p>';
        return;
    }
    coursesToRender.forEach(course => {
        courseGrid.appendChild(createCourseCard(course));
    });
}

export { renderCourses };