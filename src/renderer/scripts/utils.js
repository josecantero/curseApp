 function copyText() {
    const textToCopy = document.getElementById("btc-wallet").textContent.trim();
    console.log("Copying text: ", textToCopy);

    navigator.clipboard.writeText(textToCopy)
    .then(() => {
        alert("Wallet "+textToCopy+" copiada al portapapeles.");
    })
    .catch(err => {
        console.error("Failed to copy text: ", err);
        alert("Error al copiar al portapapeles.");
    });
}