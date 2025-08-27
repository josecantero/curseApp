// renderer.js

// Variables globales para los filtros
let allCourses = []; // Para almacenar todos los cursos cargados desde la DB
let allPlatforms = []; // Almacena todas las plataformas cargadas
let allCategories = []; // Almacena todas las categorías cargadas
let allLanguages = []; // Almacena todos los idiomas cargados

let currentSearchTerm = '';
let currentPlatformFilter = '';
let currentLanguageFilter = '';
let currentCategoryFilter = ''; // Variable para la categoría seleccionada

import { applyFilters } from './courses-area/filters.js';
import { showNotification } from './notification.js';

window.electronAPI.send("mensaje", { foo: "bar" });// Prueba de comunicación con el proceso principal

applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter)

/**
 * Carga las plataformas desde la API de Electron y las renderiza en la UI.
 */
async function loadAndRenderPlatforms() {
    const platformLogosContainer = document.getElementById('platform-logos-container');
    if (!platformLogosContainer) {
        console.warn('El elemento #platform-logos-container no fue encontrado.');
        return;
    }

    try {
        allPlatforms = await window.electronAPI.getAllPlatforms();
        platformLogosContainer.innerHTML = ''; // Limpiar cualquier contenido existente

        allPlatforms.forEach(platform => {
            const img = document.createElement('img');
            img.src = platform.imageUrl;
            img.alt = platform.name;
            img.classList.add('platform-logo');
            img.dataset.platform = platform.id;
            platformLogosContainer.appendChild(img);
        });

        addPlatformEventListeners();

    } catch (error) {
        console.error('Error al cargar las plataformas:', error);
        platformLogosContainer.innerHTML = '<p style="color: red;">Error al cargar plataformas.</p>';
    }
}

/**
 * Adjunta listeners de eventos a los logos de la plataforma.
 */
function addPlatformEventListeners() {
    const platformLogosContainer = document.getElementById('platform-logos-container');
    if (!platformLogosContainer) return;

    platformLogosContainer.querySelectorAll('.platform-logo').forEach(logo => {
        logo.addEventListener('click', handlePlatformClick);
    });
}

/**
 * Manejador de eventos para clics en los logos de la plataforma.
 * @param {Event} event
 */
function handlePlatformClick(event) {
    const target = event.target;
    if (target.classList.contains('platform-logo')) {
        const platform = target.dataset.platform;

        document.querySelectorAll('.platform-logo').forEach(logo => {
            logo.classList.remove('active');
        });

        if (currentPlatformFilter === platform) {
            currentPlatformFilter = '';
        } else {
            currentPlatformFilter = platform;
            target.classList.add('active');
        }
        applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter);
    }
}

/**
 * Carga las categorías desde los cursos y las renderiza en el dropdown.
 * @param {Array<Object>} courses - La lista de cursos para extraer las categorías.
 */
function loadAndRenderCategories(courses) {
    const categoryDropdownContent = document.getElementById('category-dropdown-content');
    if (!categoryDropdownContent) {
        console.warn('Elemento de dropdown de categorías no encontrado.');
        return;
    }

    // Extraer categorías únicas de los cursos
    const categoriesSet = new Set(courses.map(c => c.category).filter(Boolean));
    allCategories = Array.from(categoriesSet).sort();

    // Limpiar y renderizar las opciones del dropdown
    categoryDropdownContent.innerHTML = '';
    
    // Opción para borrar el filtro
    const clearOption = document.createElement('div');
    clearOption.classList.add('dropdown-option');
    clearOption.textContent = 'Todas';
    clearOption.dataset.category = '';
    categoryDropdownContent.appendChild(clearOption);

    allCategories.forEach(category => {
        const option = document.createElement('div');
        option.classList.add('dropdown-option');
        option.textContent = category;
        option.dataset.category = category;
        categoryDropdownContent.appendChild(option);
    });

    // Llamada para configurar los listeners de las nuevas opciones
    setupCategoryDropdownListeners();
}

/**
 * Carga los idiomas desde los cursos y los renderiza en el dropdown.
 * @param {Array<Object>} courses - La lista de cursos para extraer los idiomas.
 */
function loadAndRenderLanguages(courses) {
    const languageDropdownContent = document.getElementById('language-dropdown-content');
    if (!languageDropdownContent) {
        console.warn('Elemento de dropdown de idiomas no encontrado.');
        return;
    }
    
    // Extraer idiomas únicos de los cursos
    const languagesSet = new Set(courses.map(c => c.language).filter(Boolean));
    allLanguages = Array.from(languagesSet).sort();

    // Limpiar y renderizar las opciones del dropdown
    languageDropdownContent.innerHTML = '';

    // Opción para borrar el filtro
    const clearOption = document.createElement('div');
    clearOption.classList.add('dropdown-option');
    clearOption.textContent = 'Todos';
    clearOption.dataset.lang = ''; // El valor del dataset debe coincidir con el valor real del idioma
    languageDropdownContent.appendChild(clearOption);

    allLanguages.forEach(language => {
        const option = document.createElement('div');
        option.classList.add('dropdown-option');
        option.textContent = language;
        option.dataset.lang = language; // El valor del dataset debe coincidir con el valor real del idioma
        languageDropdownContent.appendChild(option);
    });

    // Llamada para configurar los listeners de las nuevas opciones
    setupLanguageDropdownListeners();
}

/**
 * Configura los listeners de eventos para el dropdown de categorías.
 */
function setupCategoryDropdownListeners() {
    const categoryFilterButton = document.getElementById('category-filter-button');
    const categoryDropdownContent = document.getElementById('category-dropdown-content');

    // Configura el dropdown de categorías
    setupDropdown(categoryFilterButton, categoryDropdownContent, (option) => {
        currentCategoryFilter = option.dataset.category;
        categoryFilterButton.innerHTML = `${option.textContent} <span class="dropdown-arrow">▼</span>`;
        applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter);
    });
}

/**
 * Configura los listeners de eventos para el dropdown de idiomas.
 */
function setupLanguageDropdownListeners() {
    const languageFilterButton = document.getElementById('language-filter-button');
    const languageDropdownContent = document.getElementById('language-dropdown-content');
    
    // Configura el dropdown de idiomas
    setupDropdown(languageFilterButton, languageDropdownContent, (option) => {
        currentLanguageFilter = option.dataset.lang;
        languageFilterButton.innerHTML = `${option.textContent} <span class="dropdown-arrow">▼</span>`;
        applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter);
    });
}

/**
 * Configura la lógica de un dropdown genérico.
 * @param {HTMLElement} button - El botón que abre el dropdown.
 * @param {HTMLElement} content - El contenedor del contenido del dropdown.
 * @param {Function} handler - La función que se ejecuta al seleccionar una opción.
 */
function setupDropdown(button, content, handler) {
    if (!button || !content) {
        console.warn('Elementos de dropdown no encontrados.');
        return;
    }

    // Primero, elimina los listeners existentes para evitar duplicados
    const oldButton = button.cloneNode(true);
    button.parentNode.replaceChild(oldButton, button);
    const newButton = oldButton;
    
    // Adjunta el listener para el botón
    newButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const allDropdowns = document.querySelectorAll('.dropdown-content.show');
        allDropdowns.forEach(dropdown => {
            if (dropdown !== content) {
                dropdown.classList.remove('show');
            }
        });
        content.classList.toggle('show');
    });

    // Adjunta los listeners a las opciones
    content.querySelectorAll('.dropdown-option').forEach(option => {
        // Eliminar listeners previos para evitar duplicados
        const oldOption = option.cloneNode(true);
        option.parentNode.replaceChild(oldOption, option);
        const newOption = oldOption;
        
        newOption.addEventListener('click', (event) => {
            event.stopPropagation();
            handler(newOption);
            content.classList.remove('show');
        });
    });
}

/**
 * Inicializa el estado de la aplicación cargando los cursos y el estado guardado.
 */
async function initializeState() {
    try {
        allPlatforms = await window.electronAPI.getAllPlatforms();
        //esperar a que allPlatforms se haya cargado antes de renderizar
        setTimeout(() => {
            loadAndRenderPlatforms();
        }, 10); // Esperar 10 milisegundos para asegurar que las plataformas se hayan cargado.
        
    } catch (error) {
        console.error('Error al cargar plataformas o cursos guardados:', error);
        const platformLogosContainer = document.getElementById('platform-logos-container');
        if (platformLogosContainer) {
            platformLogosContainer.innerHTML = '<p style="color: red;">Error al cargar plataformas.</p>';
        }
    }

    try {
        allCourses = await window.electronAPI.getAllCourses();
        setTimeout(() => {
            loadAndRenderCategories(allCourses);
            loadAndRenderLanguages(allCourses);
        }, 10); // Esperar 10 milisegundos para asegurar que las categorías e idiomas se hayan cargado.
        applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter);
    } catch (error) {
        console.error('Error al cargar los cursos desde la base de datos:', error);
        const courseGrid = document.getElementById('course-grid-container');
        if (courseGrid) {
            courseGrid.innerHTML = '<p>No se pudieron cargar los cursos. Por favor, revisa la base de datos.</p>';
        }
    }
}

/**
 * Configura todos los listeners de eventos para la página principal (index.html).
 */
function setupMainListeners() {
    // Lógica del filtro de búsqueda
    const searchInput = document.getElementById('search-input');
    const searchForm = document.querySelector('.search-form');
    if (searchForm && searchInput) {
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            currentSearchTerm = searchInput.value.trim();
            applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter);
        });
        searchInput.addEventListener('input', () => {
            currentSearchTerm = searchInput.value.trim();
            applyFilters(allCourses, currentSearchTerm, currentPlatformFilter, currentLanguageFilter, currentCategoryFilter);
        });
    }

    // Lógica del carrusel de logos
    const platformLogosContainer = document.getElementById('platform-logos-container');
    const platformScrollLeftBtn = document.getElementById('platform-scroll-left');
    const platformScrollRightBtn = document.getElementById('platform-scroll-right');
    if (platformLogosContainer && platformScrollLeftBtn && platformScrollRightBtn) {
        const scrollAmount = 100;
        platformScrollRightBtn.addEventListener('click', () => {
            platformLogosContainer.scrollLeft += scrollAmount;
        });
        platformScrollLeftBtn.addEventListener('click', () => {
            platformLogosContainer.scrollLeft -= scrollAmount;
        });
    }
    
    // Cerrar dropdowns al hacer clic fuera
    document.addEventListener('click', (event) => {
        const dropdowns = document.querySelectorAll('.dropdown-content.show');
        dropdowns.forEach(dropdown => {
            const button = dropdown.previousElementSibling;
            if (button && !button.contains(event.target) && !dropdown.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });
    });
}

/**
 * Configura los listeners de eventos para la página de detalles del curso (course-detail.html).
 */
async function setupDetailListeners() {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    try {
        const course = await window.electronAPI.getCourseById(courseId); // Llamada a la API de Electron
        if (course) {
            renderCourseDetail(course);
        } else {
            renderCourseNotFound();
        }
    } catch (error) {
        console.error('Error al cargar los detalles del curso:', error);
        renderErrorPage();
    }
}

/**
 * Renderiza los detalles de un curso en la página.
 * @param {Object} course - El objeto del curso a renderizar.
 */
function renderCourseDetail(course) {
    const detailTitle = document.getElementById('course-detail-title');
    if (!detailTitle) return;

    const isSaved = savedCourses.has(course.id);
    const tooltipText = isSaved ? 'Quitar de Guardados' : 'Guardar en Favoritos';
    const ariaLabelText = isSaved ? `Quitar curso "${course.title}" de favoritos` : `Guardar curso "${course.title}" en favoritos`;

    detailTitle.innerHTML = `
        ${course.title}
        <div class="save-icon-wrapper tooltip-container" data-course-id="${course.id}" data-tooltip="${tooltipText}">
            <svg class="save-course-icon ${isSaved ? 'saved' : ''}" viewBox="0 0 24 24" role="img" aria-label="${ariaLabelText}">
                <path d="M17 3H7C5.9 3 5 3.9 5 5V21L12 18L19 21V5C19 3.9 18.1 3 17 3Z"/>
            </svg>
        </div>
    `;

    const detailSaveIconWrapper = document.querySelector('#course-detail-title .save-icon-wrapper');
    if (detailSaveIconWrapper) {
        detailSaveIconWrapper.addEventListener('click', (event) => {
            event.stopPropagation();
            const icon = detailSaveIconWrapper.querySelector('.save-course-icon');
            const newTooltipText = savedCourses.has(course.id) ? 'Guardar en Favoritos' : 'Quitar de Guardados';
            const newAriaLabelText = savedCourses.has(course.id) ? `Guardar curso "${course.title}" en favoritos` : `Quitar curso "${course.title}" de favoritos`;
            
            if (savedCourses.has(course.id)) {
                savedCourses.delete(course.id);
                icon.classList.remove('saved');
                showNotification(`Curso "${course.title}" desguardado.`);
            } else {
                savedCourses.add(course.id);
                icon.classList.add('saved');
                showNotification(`Curso "${course.title}" guardado.`);
            }
            // NOTA: Esta línea ahora es redundante, ya que la lógica de guardado/desguardado se manejará
            // a través de las funciones IPC. Se mantendrá para compatibilidad o si se desea una capa de caché local.
            localStorage.setItem('simulatedSavedCourses', JSON.stringify(Array.from(savedCourses)));
        });
    }

    // Renderizar el resto de los detalles del curso
    document.getElementById('course-detail-description').textContent = course.description || 'Sin descripción.';
    document.getElementById('detail-category').textContent = course.category || 'N/A';
    document.getElementById('detail-duration').textContent = course.duration || 'N/A';
    document.getElementById('detail-language').textContent = (course.language || 'N/A').toUpperCase();
    const platformObj = allPlatforms.find(p => p.id === course.platform);
    document.getElementById('detail-platform').textContent = platformObj ? platformObj.name : (course.platform || 'N/A');
    document.getElementById('detail-instructor-name').textContent = course.instructor || 'N/A';
    const detailInstructorLink = document.getElementById('detail-instructor-link');
    if (detailInstructorLink) {
        if (course.instructorUrl) {
            detailInstructorLink.href = course.instructorUrl;
            detailInstructorLink.style.pointerEvents = 'auto';
        } else {
            detailInstructorLink.removeAttribute('href');
            detailInstructorLink.style.pointerEvents = 'none';
        }
    }
    
    // Renderizar la lista de prerrequisitos, audiencia, etiquetas y lecciones
    ['prerequisites', 'targetAudience'].forEach(listName => {
        const listElement = document.getElementById(`course-detail-${listName}`);
        if (listElement) {
            listElement.innerHTML = '';
            const items = course[listName] && course[listName].length > 0 ? course[listName] : [listName === 'prerequisites' ? 'No se requieren prerrequisitos específicos.' : 'Audiencia general interesada.'];
            items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                listElement.appendChild(li);
            });
        }
    });

    const tagsContainer = document.getElementById('course-tags-container');
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        if (course.tags && course.tags.length > 0) {
            course.tags.forEach(tag => {
                const span = document.createElement('span');
                span.classList.add('tag');
                span.textContent = tag;
                tagsContainer.appendChild(span);
            });
        } else {
            tagsContainer.innerHTML = '<span class="tag">Sin etiquetas</span>';
        }
    }

    const lessonsList = document.getElementById('lessons-list');
    if (lessonsList) {
        lessonsList.innerHTML = '';
        if (course.lessons && course.lessons.length > 0) {
            course.lessons.forEach((lesson, index) => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = `#lesson-${index}`;
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
            lessonsList.innerHTML = '<li>No hay lecciones disponibles para este curso.</li>';
        }
    }

    const videoIframe = document.getElementById('course-video-iframe');
    if (videoIframe) {
        videoIframe.src = course.videoUrl || '';
    }
}

/**
 * Renderiza la página "curso no encontrado".
 */
function renderCourseNotFound() {
    document.body.innerHTML = `
        <div style="text-align: center; padding: 50px;">
            <h1>Curso no encontrado.</h1>
            <p>Lo sentimos, el curso que buscas no pudo ser cargado o no existe.</p>
            <a href="index.html" class="back-button" style="display: inline-flex; margin-top: 20px;">
                <i class="fas fa-arrow-left" style="margin-right: 5px;"></i> Volver a Cursos
            </a>
        </div>
    `;
    const backButton = document.querySelector('.back-button');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.electronAPI && typeof window.electronAPI.closeCourseDetail === 'function') {
                window.electronAPI.closeCourseDetail();
            } else {
                window.location.href = 'index.html';
            }
        });
    }
}

/**
 * Renderiza una página de error genérico.
 */
function renderErrorPage() {
    document.body.innerHTML = `
        <div style="text-align: center; padding: 50px;">
            <h1>Error al cargar detalles.</h1>
            <p>Por favor, revisa la consola para más información.</p>
            <a href="index.html" class="back-button" style="display: inline-flex; margin-top: 20px;">
                <i class="fas fa-arrow-left" style="margin-right: 5px;"></i> Volver a Cursos
            </a>
        </div>
    `;
}

// --- INICIO: LÓGICA PRINCIPAL DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM completamente cargado.');

    await initializeState();

    if (window.location.pathname.endsWith('course-detail.html')) {
        await setupDetailListeners();
    } else {
        setupMainListeners();
    }
});


window.electronAPI.sendEvent("app_started", { version: "1.0.0" });