const savedCourses = new Set(); // Usamos un Set para IDs únicos de cursos guardados
import { renderCourses } from './courses-renderer.js';
/**
 * Aplica todos los filtros actuales y renderiza los cursos en la UI.
 */
function applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter) {
    let filtered = allCourses;

    // 1. Filtrar por término de búsqueda
    if (currentSearchTerm) {
        const lowerCaseSearchTerm = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(course =>
            course.title.toLowerCase().includes(lowerCaseSearchTerm) ||
            (course.description && course.description.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (course.tags && course.tags.some(tag => tag.toLowerCase().includes(lowerCaseSearchTerm))) ||
            (typeof course.instructor === 'string' && course.instructor.toLowerCase().includes(lowerCaseSearchTerm))
        );
    }

    // 2. Filtrar por plataforma
    if (currentPlatformFilter) {
        filtered = filtered.filter(course => course.platform === currentPlatformFilter);
    }

    // 3. Filtrar por idioma
    if (currentLanguageFilter) {
        filtered = filtered.filter(course => course.language === currentLanguageFilter);
    }

    // 4. Filtrar por categoría
    if (currentCategoryFilter) {
        filtered = filtered.filter(course => course.category === currentCategoryFilter);
    }

    renderCourses(filtered); // Renderizar los cursos filtrados
}








export { applyFilters };
