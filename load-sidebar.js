// load-sidebar.js

document.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) {
        console.error('No se encontró el elemento .app-container. El menú lateral no se puede cargar.');
        return;
    }

    try {
        // Cargar el HTML del sidebar
        const response = await fetch('sidebar.html');
        if (!response.ok) {
            throw new Error(`Error al cargar sidebar.html: ${response.statusText}`);
        }
        const sidebarHtml = await response.text();
        
        // Crear un div temporal para contener el HTML del sidebar y luego moverlo
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = sidebarHtml;
        const sidebarElement = tempDiv.firstElementChild; // Obtener el <aside>

        // Insertar el sidebar al inicio del app-container
        appContainer.prepend(sidebarElement);

        /* =====  COLLAPSE / EXPAND SIDEBAR  ===== */
        const sidebarToggleBtn = document.getElementById('sidebar-toggle');
        const icon = sidebarToggleBtn.querySelector('i');   // <i class="fas fa-bars"></i>
        const sidebar = document.querySelector('aside.sidebar');

        /* read last choice (true = collapsed) */
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed) sidebar.classList.add('sidebar-minimized');

        console.log(isCollapsed);

        /* click handler */
        sidebarToggleBtn.addEventListener('click', () => {
            const nowCollapsed = sidebar.classList.toggle('sidebar-minimized');
            localStorage.setItem('sidebarCollapsed', nowCollapsed);

            /* swap Font-Awesome icon */
            icon.classList.toggle('fa-bars',  !nowCollapsed);
            icon.classList.toggle('fa-arrow-right', nowCollapsed);
        });

        // --- Lógica para resaltar el elemento del menú activo ---
        const currentPagePath = window.location.pathname.split('/').pop(); // Obtener el nombre del archivo HTML actual
        const menuItems = document.querySelectorAll('.menu-list .menu-item a');

        menuItems.forEach(item => {
            // Remover la clase 'active' de todos los elementos primero
            item.parentElement.classList.remove('active');

            // Comprobar si el href del enlace coincide con la página actual
            // o si el atributo data-page coincide (para enlaces que quizás no cambien el URL directamente)
            const itemHref = item.getAttribute('href');
            const itemDataPage = item.dataset.page;

            if (itemHref === currentPagePath || itemDataPage === currentPagePath) {
                item.parentElement.classList.add('active');
            }
        });

        

    } catch (error) {
        console.error('Error al cargar o inicializar el menú lateral:', error);
    }
});
