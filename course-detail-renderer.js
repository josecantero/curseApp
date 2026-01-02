// course-detail-renderer.js

import { showNotification } from './notification.js'; // Importa la función de notificación

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar el estado de cursos guardados ANTES de usarlos en la UI
    const savedCourses = new Set();
    // CAMBIO CLAVE: Cargar cursos guardados desde la base de datos al inicio
    try {
        const savedCourseIds = await window.electronAPI.getSavedCourses();
        savedCourses.clear(); // Limpiar el Set actual
        savedCourseIds.forEach(id => savedCourses.add(id));
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
    const courseResourcesSection = document.getElementById('course-resources-section');
    const courseResourcesList = document.getElementById('course-detail-resources');

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
            const resources = await window.electronAPI.getResourcesByCourse(courseId);
            console.log("DEBUG: Resources fetched for course", courseId, resources);

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

            // Función para actualizar recursos según la lección
            const updateResourcesForLesson = (lessonId) => {
                console.log("DEBUG: Updating resources for lessonId:", lessonId);
                if (courseResourcesList && courseResourcesSection) {
                    courseResourcesList.innerHTML = '';
                    if (resources && Array.isArray(resources) && resources.length > 0) {
                        // Filtrar recursos por lessonId (si existe)
                        let validResources = [];
                        if (lessonId === null) {
                            // Si estamos en la vista general (Intro), mostramos TODOS los recursos del curso
                            console.log("DEBUG: LessonId is null (Intro). Showing all resources.");
                            validResources = resources.filter(r => r.title && r.title.trim() !== '');
                        } else {
                            // Si se seleccionó una lección, mostramos solo sus recursos
                            validResources = resources.filter(r => {
                                console.log(`Checking resource '${r.title}': r.lessonId=${r.lessonId} (${typeof r.lessonId}), target=${lessonId} (${typeof lessonId})`);
                                return r.title && r.title.trim() !== '' && r.lessonId == lessonId;
                            });
                        }

                        if (validResources.length > 0) {
                            validResources.forEach(resource => {
                                const li = document.createElement('li');
                                const a = document.createElement('a');
                                a.href = '#';
                                a.textContent = resource.title;
                                a.title = resource.type || 'Recurso';
                                a.className = 'resource-link'; // Add class for styling
                                // Add icon based on type if possible, e.g., using FontAwesome
                                const icon = document.createElement('i');
                                icon.className = 'fas fa-file-download'; // Default icon
                                if (resource.type === 'PDF') icon.className = 'fas fa-file-pdf';
                                a.prepend(icon);

                                a.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    window.open(resource.url, 'resource-popup');
                                });
                                li.appendChild(a);
                                courseResourcesList.appendChild(li);
                            });
                            courseResourcesSection.style.display = 'block';
                        } else {
                            courseResourcesSection.style.display = 'none';
                        }
                    } else {
                        courseResourcesSection.style.display = 'none';
                    }
                }
            };

            if (courseTargetAudienceElem) courseTargetAudienceElem.textContent = course.targetAudience || 'No especificado.';

            /*
            console.log("DEBUG: Checking resources section", { courseResourcesList, courseResourcesSection, resources });
            if (courseResourcesList && courseResourcesSection) {
                // Initial load logic moved to updateResourcesForLesson
            }
            */

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
                // No specific resources for "course intro" video unless we map it to something, or show none
                updateResourcesForLesson(null);
            } else if (course.lessons && course.lessons.length > 0 && course.lessons[0].videoUrl) {
                updateVideoPlayer(course.lessons[0].videoUrl, course.lessons[0].title);
                // Also update resources for the first lesson
                // We need to find the ID of the first lesson. 
                // Since 'lessons' array from DB has 'id', we can use it.
                if (lessons && lessons.length > 0) {
                    updateResourcesForLesson(lessons[0].id);
                }
            } else {
                if (odyseeVideoIframe) odyseeVideoIframe.style.display = 'none';
                if (currentLessonTitleElem) currentLessonTitleElem.textContent = 'No hay contenido de video disponible.';
            }

            const modulesMap = {};

            lessons.forEach((lesson, idx) => {
                const parts = lesson.title.split(' - ', 2);
                let moduleTitle = parts[0]?.trim() || 'Módulo sin nombre';
                if (!modulesMap[moduleTitle]) modulesMap[moduleTitle] = [];
                modulesMap[moduleTitle].push({
                    title: parts[1]?.trim() || lesson.title,
                    videoUrl: lesson.videoUrl,
                    index: idx,
                    id: lesson.id // Preserve lesson ID
                });
            });


            if (lessonsList) {
                lessonsList.innerHTML = '';
                Object.entries(modulesMap)
                    .forEach(([modTitle, modLessons]) => {
                        const modLi = document.createElement('li');
                        modLi.classList.add('module-item');

                        const modHeader = document.createElement('div');
                        modHeader.classList.add('module-header');
                        modHeader.textContent = modTitle;
                        modHeader.addEventListener('click', () => {
                            lessonContainer.classList.toggle('open');
                            modHeader.classList.toggle('open');
                        });

                        const lessonContainer = document.createElement('ul');
                        lessonContainer.classList.add('lesson-container');
                        lessonContainer.style.display = 'none';

                        modLessons.forEach(l => {
                            const lecLi = document.createElement('li');
                            const a = document.createElement('a');
                            a.href = '#';
                            a.textContent = l.title;
                            a.addEventListener('click', (e) => {
                                e.preventDefault();
                                updateVideoPlayer(l.videoUrl, l.title);
                                updateResourcesForLesson(l.id); // Update resources when lesson clicked
                            });
                            lecLi.appendChild(a);
                            lessonContainer.appendChild(lecLi);
                        });

                        modHeader.addEventListener('click', () => {
                            const isOpen = lessonContainer.style.display === 'block';
                            if (isOpen) {
                                modLi.classList.remove('show');
                            } else {
                                modLi.classList.add('show');
                            }
                            lessonContainer.style.display = isOpen ? 'none' : 'block';
                            modHeader.classList.toggle('open', !isOpen);
                        });

                        //modLi.appendChild(modHeader);
                        modLi.appendChild(lessonContainer);
                        lessonsList.appendChild(modHeader);
                        lessonsList.appendChild(modLi);
                    });

                if (Object.keys(modulesMap).length === 0) {
                    lessonsList.innerHTML = '<li>No hay lecciones disponibles para este curso.</li>';
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
