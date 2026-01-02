export function setupOdyseeOverlay(iframeId, overlayId) {
  const iframe = document.getElementById(iframeId);
  const overlay = document.getElementById(overlayId);

  if (!iframe || !overlay) {
    console.error("⚠️ No se encontró el iframe o el overlay.");
    return;
  }

  let overlayVisible = false;

  function showOverlay() {
    if (!overlayVisible) {
      overlay.style.display = "block";
      overlayVisible = true;
      console.log("⏹ Overlay activado (fin del video detectado)");
    }
  }

  function hideOverlay() {
    if (overlayVisible) {
      overlay.style.display = "none";
      overlayVisible = false;
      console.log("▶️ Overlay oculto (play detectado)");
    }
  }

  // --- 1) Vigilar cambios en el iframe (pantalla final de Odysee) ---
  const observer = new MutationObserver(() => {
    // Cuando el iframe se altera (lo hace al terminar el video)
    showOverlay();
  });

  observer.observe(iframe, { attributes: true, childList: true, subtree: true });

  // --- 2) Detectar clics para quitar overlay ---
  window.addEventListener("click", (e) => {
    // Solo si clic ocurre sobre el iframe o su overlay
    const clickedInsideIframe =
      iframe.contains(e.target) || overlay.contains(e.target);

    if (clickedInsideIframe && overlayVisible) {
      hideOverlay();
    }
  });
}
