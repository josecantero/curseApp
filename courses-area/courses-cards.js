const savedCourses = new Set(); // Usamos un Set para IDs únicos de cursos guardados

/**
 * Crea y devuelve un elemento de tarjeta de curso para un curso dado.
 * @param {Object} course - El objeto del curso.
 * @returns {HTMLElement} La tarjeta de curso como un elemento DOM.
 */
function createCourseCard(course) {
    // Verificar si el curso está guardado usando el Set actualizado desde la DB
    const isSaved = savedCourses.has(course.id);
    const saveIconClass = isSaved ? 'saved' : '';
    const tooltipText = isSaved ? 'Quitar de Guardados' : 'Guardar en Favoritos';
    const ariaLabelText = isSaved ? `Quitar curso "${course.title}" de favoritos` : `Guardar curso "${course.title}" en favoritos`;

    const card = document.createElement('div');
    card.classList.add('course-card');
    card.dataset.courseId = course.id;

    // Se añade una imagen de marcador de posición si la URL es nula o indefinida,
    // para evitar el error de archivo no encontrado.
    const imageUrl = course.imageUrl || 'https://placehold.co/400x200/e0e0e0/ffffff?text=Imagen+no+disponible';

    card.innerHTML = `
        <img src="${imageUrl}" alt="${course.title}">
        <div class="course-card-text">
            <h3>${course.title}</h3>
            <p>${course.description}</p>
            <p class="course-category">Categoría: ${course.category || 'N/A'}</p>
            <p class="course-duration">Plataforma: ${course.platform || 'N/A'}</p>
        </div>
        <div class="save-icon-wrapper tooltip-container" data-course-id="${course.id}" data-tooltip="${tooltipText}">
            <svg class="save-course-icon ${saveIconClass}" viewBox="0 0 24 24" role="img" aria-label="${ariaLabelText}">
                <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
        </div>
    `;

    // Event listener para el icono de guardar
    const saveIconWrapper = card.querySelector(`.save-icon-wrapper[data-course-id="${course.id}"]`);
    if (saveIconWrapper) {
        saveIconWrapper.addEventListener('click', async (event) => { // Marcado como async
            event.stopPropagation(); // Evita que el clic en el icono active el clic de la tarjeta

            const icon = saveIconWrapper.querySelector('.save-course-icon');
            let success = false;

            if (savedCourses.has(course.id)) {
                // Eliminar de la base de datos
                success = await window.electronAPI.removeCourseFromDb(course.id);
                if (success) {
                    savedCourses.delete(course.id);
                    icon.classList.remove('saved');
                    showNotification(`Curso "${course.title}" desguardado.`);
                } else {
                    showNotification(`Error al desguardar "${course.title}".`);
                }
            } else {
                // Guardar en la base de datos
                success = await window.electronAPI.saveCourseToDb(course.id);
                if (success) {
                    savedCourses.add(course.id);
                    icon.classList.add('saved');
                    showNotification(`Curso "${course.title}" guardado.`);
                } else {
                    showNotification(`Error al guardar "${course.title}".`);
                }
            }

            // Actualizar el tooltip y aria-label después de la operación
            const newTooltipText = savedCourses.has(course.id) ? 'Quitar de Guardados' : 'Guardar en Favoritos';
            const newAriaLabelText = savedCourses.has(course.id) ? `Quitar curso "${course.title}" de favoritos` : `Guardar curso "${course.title}" en favoritos`;
            saveIconWrapper.setAttribute('data-tooltip', newTooltipText);
            icon.setAttribute('aria-label', newAriaLabelText);
            
            // Opcional: Re-renderizar los cursos para asegurar que el estado visual sea consistente
            // applyFilters(); 
            // Esto puede ser excesivo si solo se necesita actualizar el icono.
            // El icono ya se actualiza directamente, así que no es estrictamente necesario aquí.
        });
    }

    // Event listener para ir a la página de detalle del curso
    card.addEventListener('click', () => {
        console.log(`Clic en la tarjeta del curso: ${course.title}`);
        // Usa la API de Electron para notificar al proceso principal
        if (window.electronAPI && typeof window.electronAPI.openCourseDetail === 'function') {
            window.electronAPI.openCourseDetail(course.id);
        } else {
            console.warn('window.electronAPI.openCourseDetail no está definido. Redirigiendo con fallback.');
            window.location.href = `course-detail.html?id=${course.id}`;
        }
    });

    return card;
}

export {createCourseCard};

