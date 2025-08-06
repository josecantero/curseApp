// my-courses-renderer.js

// Mantener un estado de cursos guardados, sincronizado con la DB
const savedCourses = new Set(); // Usamos un Set para IDs únicos de cursos guardados

// Variables globales para los filtros
let allCoursesData = []; // Para almacenar TODOS los cursos cargados desde la DB (para referencia)
let allSavedCourses = []; // Para almacenar solo los cursos que el usuario ha guardado
let allPlatforms = []; // Almacena todas las plataformas cargadas

// Filtros actuales
let currentSearchTerm = '';
let currentPlatformFilter = '';
let currentLanguageFilter = '';
let currentCategoryFilter = '';

/**
 * Muestra una notificación temporal en la interfaz de usuario.
 * @param {string} message - El mensaje a mostrar en la notificación.
 */
function showNotification(message) {
    const notificationElem = document.getElementById('notification-message');
    if (notificationElem) {
        notificationElem.textContent = message;
        notificationElem.classList.add('show');

        setTimeout(() => {
            notificationElem.classList.remove('show');
        }, 2000); // La notificación desaparece después de 2 segundos
    } else {
        console.warn('Elemento de notificación (#notification-message) no encontrado en el DOM.');
    }
}

/**
 * Aplica todos los filtros actuales y renderiza los cursos en la UI.
 * Esta función ahora opera sobre 'allSavedCourses'.
 */
function applyFilters() {
    let filtered = allSavedCourses; // Empezamos con solo los cursos guardados

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

    renderSavedCourses(filtered); // Renderizar los cursos filtrados en la cuadrícula de guardados
}

/**
 * Crea y devuelve un elemento de tarjeta de curso para un curso dado.
 * Esta función es similar a la de renderer.js, pero adaptada para esta vista.
 * @param {Object} course - El objeto del curso.
 * @returns {HTMLElement} La tarjeta de curso como un elemento DOM.
 */
function createCourseCard(course) {
    // En esta vista, siempre asumimos que el curso está "guardado"
    const isSaved = true; 
    const saveIconClass = isSaved ? 'saved' : '';
    const tooltipText = 'Quitar de Guardados'; // Siempre ofrecer quitar en esta vista
    const ariaLabelText = `Quitar curso "${course.title}" de favoritos`;

    const card = document.createElement('div');
    card.classList.add('course-card');
    card.dataset.courseId = course.id;

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

    // Event listener para el icono de guardar (aquí solo para "desguardar")
    const saveIconWrapper = card.querySelector(`.save-icon-wrapper[data-course-id="${course.id}"]`);
    if (saveIconWrapper) {
        saveIconWrapper.addEventListener('click', async (event) => {
            event.stopPropagation();

            const icon = saveIconWrapper.querySelector('.save-course-icon');
            const success = await window.electronAPI.removeCourseFromDb(course.id);
            
            if (success) {
                savedCourses.delete(course.id); // Eliminar del Set local de IDs
                // También eliminar de allSavedCourses para que los filtros funcionen correctamente
                allSavedCourses = allSavedCourses.filter(c => c.id !== course.id); 
                icon.classList.remove('saved'); // Actualizar visualmente
                showNotification(`Curso "${course.title}" desguardado.`);
                applyFilters(); // Re-aplicar filtros para actualizar la vista
            } else {
                showNotification(`Error al desguardar "${course.title}".`);
            }
        });
    }

    // Event listener para ir a la página de detalle del curso
    card.addEventListener('click', () => {
        console.log(`Clic en la tarjeta del curso: ${course.title}`);
        if (window.electronAPI && typeof window.electronAPI.openCourseDetail === 'function') {
            window.electronAPI.openCourseDetail(course.id);
        } else {
            console.warn('window.electronAPI.openCourseDetail no está definido. Redirigiendo con fallback.');
            window.location.href = `course-detail.html?id=${course.id}`;
        }
    });

    return card;
}

/**
 * Renderiza una lista de cursos en el contenedor de la cuadrícula de cursos guardados.
 * @param {Array<Object>} coursesToRender - La lista de cursos a renderizar.
 */
function renderSavedCourses(coursesToRender) {
    const courseGrid = document.getElementById('saved-course-grid-container');
    if (!courseGrid) {
        console.error('El elemento #saved-course-grid-container no fue encontrado.');
        return;
    }
    courseGrid.innerHTML = ''; // Limpiar la cuadrícula
    if (coursesToRender.length === 0) {
        courseGrid.innerHTML = '<p style="text-align: center; width: 100%; color: var(--light-text-color); margin-top: 50px;">No tienes cursos guardados que coincidan con tu búsqueda.</p>';
        return;
    }
    coursesToRender.forEach(course => {
        courseGrid.appendChild(createCourseCard(course));
    });
}

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
        applyFilters(); // Aplicar filtros después de cambiar la plataforma
    }
}

/**
 * Carga las categorías desde los cursos guardados y las renderiza en el dropdown.
 * @param {Array<Object>} courses - La lista de cursos guardados para extraer las categorías.
 */
function loadAndRenderCategories(courses) {
    const categoryDropdownContent = document.getElementById('category-dropdown-content');
    if (!categoryDropdownContent) {
        console.warn('Elemento de dropdown de categorías no encontrado.');
        return;
    }

    // Extraer categorías únicas de los cursos guardados
    const categoriesSet = new Set(courses.map(c => c.category).filter(Boolean));
    const allCategories = Array.from(categoriesSet).sort();

    // Limpiar y renderizar las opciones del dropdown
    categoryDropdownContent.innerHTML = '';
    
    // Opción para borrar el filtro
    const clearOption = document.createElement('button'); // Usar button para accesibilidad
    clearOption.classList.add('dropdown-option');
    clearOption.textContent = 'Todas';
    clearOption.dataset.category = '';
    categoryDropdownContent.appendChild(clearOption);

    allCategories.forEach(category => {
        const option = document.createElement('button'); // Usar button para accesibilidad
        option.classList.add('dropdown-option');
        option.textContent = category;
        option.dataset.category = category;
        categoryDropdownContent.appendChild(option);
    });

    // Llamada para configurar los listeners de las nuevas opciones
    setupCategoryDropdownListeners();
}

/**
 * Carga los idiomas desde los cursos guardados y los renderiza en el dropdown.
 * @param {Array<Object>} courses - La lista de cursos guardados para extraer los idiomas.
 */
function loadAndRenderLanguages(courses) {
    const languageDropdownContent = document.getElementById('language-dropdown-content');
    if (!languageDropdownContent) {
        console.warn('Elemento de dropdown de idiomas no encontrado.');
        return;
    }
    
    // Extraer idiomas únicos de los cursos guardados
    const languagesSet = new Set(courses.map(c => c.language).filter(Boolean));
    const allLanguages = Array.from(languagesSet).sort();

    // Limpiar y renderizar las opciones del dropdown
    languageDropdownContent.innerHTML = '';

    // Opción para borrar el filtro
    const clearOption = document.createElement('button'); // Usar button para accesibilidad
    clearOption.classList.add('dropdown-option');
    clearOption.textContent = 'Todos';
    clearOption.dataset.lang = ''; // El valor del dataset debe coincidir con el valor real del idioma
    languageDropdownContent.appendChild(clearOption);

    allLanguages.forEach(language => {
        const option = document.createElement('button'); // Usar button para accesibilidad
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
        applyFilters();
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
        applyFilters();
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
 * Inicializa la página de cursos guardados cargando los datos desde la DB.
 */
async function initializeSavedCoursesPage() {
    try {
        // 1. Cargar TODOS los cursos desde la DB (necesario para obtener sus detalles)
        allCoursesData = await window.electronAPI.getAllCourses();

        // 2. Cargar los IDs de los cursos guardados desde la DB
        const savedCourseIdsArray = await window.electronAPI.getSavedCourses();
        savedCourses.clear(); // Limpiar el Set local
        savedCourseIdsArray.forEach(id => savedCourses.add(id));
        console.log('IDs de cursos guardados cargados de la DB:', Array.from(savedCourses));

        // 3. Filtrar allCoursesData para obtener solo los cursos guardados
        allSavedCourses = allCoursesData.filter(course => savedCourses.has(course.id));
        
        // 4. Cargar los detalles completos de las plataformas
        allPlatforms = await window.electronAPI.getAllPlatforms();
        loadAndRenderPlatforms(); // Renderizar logos de plataformas

        // 5. Cargar y renderizar las opciones de categorías e idiomas basadas SÓLO en los cursos guardados
        loadAndRenderCategories(allSavedCourses);
        loadAndRenderLanguages(allSavedCourses); 

        // 6. Aplicar los filtros iniciales (si los hay) y renderizar los cursos
        applyFilters();

    } catch (error) {
        console.error('Error al inicializar la página de cursos guardados:', error);
        const courseGrid = document.getElementById('saved-course-grid-container');
        if (courseGrid) {
            courseGrid.innerHTML = '<p style="text-align: center; width: 100%; color: red; margin-top: 50px;">Error al cargar tus cursos guardados.</p>';
        }
    }
}

/**
 * Configura todos los listeners de eventos para la página "Mis cursos" (my-courses.html).
 */
function setupMyCoursesListeners() {
    // Lógica del filtro de búsqueda
    const searchInput = document.getElementById('search-input');
    const searchForm = document.querySelector('.search-form');
    if (searchForm && searchInput) {
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            currentSearchTerm = searchInput.value.trim();
            applyFilters();
        });
        searchInput.addEventListener('input', () => {
            currentSearchTerm = searchInput.value.trim();
            applyFilters();
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

// --- LÓGICA PRINCIPAL DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM completamente cargado para Mis Cursos.');
    await initializeSavedCoursesPage();
    setupMyCoursesListeners(); // Configurar los listeners después de la inicialización de datos
});
