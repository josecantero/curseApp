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

export { showNotification };