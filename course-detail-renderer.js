// course-detail-renderer.js

// Función para mostrar la notificación (definida fuera del DOMContentLoaded para ser global y reutilizable)
function showNotification(message) {
    const notificationElem = document.getElementById('notification-message');
    if (notificationElem) {
        notificationElem.textContent = message;
        notificationElem.classList.add('show');

        setTimeout(() => {
            notificationElem.classList.remove('show');
        }, 2000);
    } else {
        console.warn('Elemento de notificación (#notification-message) no encontrado en el DOM.');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar el estado de cursos guardados ANTES de usarlos en la UI
    const savedCourses = new Set();
    // CAMBIO CLAVE: Cargar cursos guardados desde la base de datos al inicio
    try {
        const savedCourseIds = await window.electronAPI.getSavedCourses();
        savedCourses.clear(); // Limpiar el Set actual
        savedCourseIds.forEach(id => savedCourses.add(id));
        console.log('Cursos guardados cargados de la DB en detalle:', Array.from(savedCourses));
    } catch (e) {
        console.error('Error al cargar cursos guardados de la DB en la página de detalle:', e);
        // No limpiar localStorage aquí, ya que la fuente de verdad es la DB
    }

    // Obtener referencias a todos los elementos HTML
    const courseTitleElem = document.getElementById('course-detail-title'); // El h1 contenedor
    const courseTitleTextElem = document.getElementById('course-title-text'); // El span dentro del h1

    // Referencia al WRAPPER del icono de guardar y al SVG dentro de él
    const saveIconWrapper = courseTitleElem ? courseTitleElem.querySelector('.save-icon-wrapper') : null;
    const detailSaveIcon = saveIconWrapper ? saveIconWrapper.querySelector('.save-course-icon') : null;

    // Referencia al iframe de Odysee
    const odyseeVideoIframe = document.getElementById('course-video-iframe'); 
    const currentLessonTitleElem = document.getElementById('current-lesson-title');

    // Elementos para la información del curso
    const courseCategoryElem = document.getElementById('course-detail-category');
    const courseDurationElem = document.getElementById('course-detail-duration');
    const courseLessonsCountElem = document.getElementById('course-detail-lessons-count');
    const courseLevelElem = document.getElementById('course-detail-level');
    const courseDescriptionElem = document.getElementById('course-detail-description');
    const courseInstructorNameElem = document.getElementById('course-detail-instructor');
    const instructorWebsiteLink = document.getElementById('instructor-website');
    const coursePrerequisitesList = document.getElementById('course-detail-prerequisites');
    const courseTargetAudienceElem = document.getElementById('course-detail-target-audience');
    const courseTagsContainer = document.getElementById('course-detail-tags');

    const lessonsList = document.getElementById('lessons-list');

    // Función para actualizar el video y su título con el reproductor de Odysee
    const updateVideoPlayer = (videoUrl, videoTitle) => {
        if (odyseeVideoIframe) { // Asegurarse de que el iframe exista
            let embedUrl = videoUrl;
            if (videoUrl.includes('odysee.com/') && !videoUrl.includes('/$/embed/')) {
                embedUrl = videoUrl.replace('odysee.com/', 'odysee.com/$/embed/');
            }
            
            odyseeVideoIframe.src = embedUrl;
        }
        if (currentLessonTitleElem) {
            currentLessonTitleElem.textContent = videoTitle;
        }
        if (odyseeVideoIframe) {
            odyseeVideoIframe.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // 1. Obtener el ID del curso de la URL (priorizando query param, luego hash)
    let courseId = null;
    const urlParams = new URLSearchParams(window.location.search);
    courseId = urlParams.get('id'); 

    if (!courseId && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        courseId = hashParams.get('id'); 
    }

    if (!courseId) {
        if (courseTitleTextElem) courseTitleTextElem.textContent = 'Error: ID de curso no encontrado en la URL.';
        document.title = 'Error: Curso no encontrado';
        console.error('ID de curso no encontrado en la URL. Asegúrate de pasar courseId como parámetro de consulta o en el hash.');
        return;
    }

    try {
        // Usar la API de Electron para obtener el curso por ID
        const course = await window.electronAPI.getCourseById(courseId);

        if (course) {
            const lessons = await window.electronAPI.getLessonsByCourse(courseId);
            document.title = `Curso: ${course.title}`;
            if (courseTitleTextElem) courseTitleTextElem.textContent = course.title;

            if (detailSaveIcon && saveIconWrapper) {
                // Verificar si el curso está guardado usando el Set actualizado desde la DB
                const isSaved = savedCourses.has(course.id);
                detailSaveIcon.classList.toggle('saved', isSaved);
                saveIconWrapper.setAttribute('data-tooltip', isSaved ? 'Quitar de guardados' : 'Guardar este curso');
                detailSaveIcon.setAttribute('aria-label', isSaved ? `Quitar curso "${course.title}" de favoritos` : `Guardar curso "${course.title}" en favoritos`);

                saveIconWrapper.addEventListener('click', async (event) => { // Marcado como async
                    event.stopPropagation();
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
                });
            } else {
                console.warn('Icono de guardar o su wrapper no encontrado en la página de detalles para interactividad.');
            }

            if (courseCategoryElem) courseCategoryElem.textContent = course.category || 'N/A';
            if (courseDurationElem) courseDurationElem.textContent = course.duration || 'N/A';
            if (courseLevelElem) courseLevelElem.textContent = course.level || 'N/A';
            if (lessons) courseLessonsCountElem.textContent = lessons.length ? lessons.length : '0';
            if (courseDescriptionElem) courseDescriptionElem.textContent = course.description || 'No hay descripción disponible.';

            if (courseInstructorNameElem) {
                if (course.instructor && typeof course.instructor === 'object') {
                    courseInstructorNameElem.textContent = course.instructor.name || 'N/A';
                    if (instructorWebsiteLink && course.instructor.profileUrl) {
                        instructorWebsiteLink.href = course.instructor.profileUrl;
                        instructorWebsiteLink.style.display = 'inline-block';
                    } else if (instructorWebsiteLink) {
                        instructorWebsiteLink.style.display = 'none';
                    }
                } else {
                    courseInstructorNameElem.textContent = course.instructor || 'N/A';
                    if (instructorWebsiteLink) instructorWebsiteLink.style.display = 'none';
                }
            }

            if (coursePrerequisitesList) {
                coursePrerequisitesList.innerHTML = '';
                if (course.prerequisites && Array.isArray(course.prerequisites) && course.prerequisites.length > 0) {
                    course.prerequisites.forEach(prereq => {
                        const li = document.createElement('li');
                        li.textContent = prereq;
                        coursePrerequisitesList.appendChild(li);
                    });
                } else {
                    const li = document.createElement('li');
                    li.textContent = 'No se requieren prerrequisitos específicos.';
                    coursePrerequisitesList.appendChild(li);
                }
            }

            if (courseTargetAudienceElem) courseTargetAudienceElem.textContent = course.targetAudience || 'No especificado.';

            if (courseTagsContainer) {
                courseTagsContainer.innerHTML = '';
                if (course.tags && Array.isArray(course.tags) && course.tags.length > 0) {
                    course.tags.forEach(tag => {
                        const span = document.createElement('span');
                        span.classList.add('tag');
                        span.textContent = tag;
                        courseTagsContainer.appendChild(span);
                    });
                } else {
                    courseTagsContainer.textContent = 'No hay etiquetas disponibles.';
                }
            }

            // Cargar el video principal del curso o la primera lección
            if (course.videoUrl) {
                updateVideoPlayer(course.videoUrl, course.title);
            } else if (course.lessons && course.lessons.length > 0 && course.lessons[0].videoUrl) {
                updateVideoPlayer(course.lessons[0].videoUrl, course.lessons[0].title);
            } else {
                if (odyseeVideoIframe) odyseeVideoIframe.style.display = 'none';
                if (currentLessonTitleElem) currentLessonTitleElem.textContent = 'No hay contenido de video disponible.';
            }

            

            // Rellenar Lecciones del curso
            if (lessonsList) {
                lessonsList.innerHTML = '';
                if (Array.isArray(lessons) && lessons.length > 0) {
                    lessons.forEach((lesson, index) => {
                        const li = document.createElement('li');
                        const a = document.createElement('a');
                        a.href = '#';
                        a.textContent = `${index + 1}. ${lesson.title}`;
                        a.dataset.videoUrl = lesson.videoUrl;
                        a.dataset.videoTitle = lesson.title;

                        a.addEventListener('click', (e) => {
                            e.preventDefault();
                            updateVideoPlayer(lesson.videoUrl, lesson.title);
                        });
                        li.appendChild(a);
                        lessonsList.appendChild(li);
                    });
                } else {
                    if (course.videoUrl) {
                        const lessonItem = document.createElement('li');
                        lessonItem.innerHTML = `<a href="#" data-video-url="${course.videoUrl}" data-video-title="${course.title}">${course.title} (Video Principal)</a>`;
                        lessonItem.addEventListener('click', (e) => {
                            e.preventDefault();
                            updateVideoPlayer(course.videoUrl, course.title);
                        });
                        lessonsList.appendChild(lessonItem);
                    } else {
                        const lessonItem = document.createElement('li');
                        lessonItem.textContent = 'No hay lecciones disponibles para este curso.';
                        lessonsList.appendChild(lessonItem);
                    }
                }
            }

        } else {
            if (courseTitleTextElem) courseTitleTextElem.textContent = `Curso con ID "${courseId}" no encontrado.`;
            document.title = 'Curso no encontrado';
            console.error(`Curso con ID "${courseId}" no encontrado en courses.json.`);
        }

    } catch (error) {
        console.error('Error al cargar o procesar los detalles del curso:', error);
        if (courseTitleTextElem) courseTitleTextElem.textContent = 'Error al cargar los detalles del curso.';
        document.title = 'Error de carga';
    }
});
