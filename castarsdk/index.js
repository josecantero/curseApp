// castarsdk/index.js
const { spawn, execSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require('fs');

let castarProcess = null;
let castarWindowsSdk = null;
const pidFile = path.join(__dirname, "castarsdk.pid");

let CLIENT_ID_L = "";
let CLIENT_ID_W = "";

// === Leer claves desde castarCI.json ===
try {
    const configPath = path.join(__dirname, "castarCI.json");
    const raw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(raw);

    if (config.clientid_linux) CLIENT_ID_L = config.clientid_linux;
    if (config.clientid_windows) CLIENT_ID_W = config.clientid_windows;
} catch (err) {
    console.error("❌ Error al leer castarCI.json:", err);
}

function isRunningLinux() {
    try {
        const result = execSync("pgrep -f CastarSdk_").toString().trim();
        if (!result) return false;

        const pids = result.split("\n").map(pid => pid.trim());
        for (const pid of pids) {
            try {
                execSync(`kill -0 ${pid}`); // comprueba si el proceso existe
                return true; // si no lanza error, existe
            } catch {
                continue; // PID inválido, lo ignoramos
            }
        }
        return false;
    } catch {
        return false;
    }
}

function getLinuxBinaryPath(arch) {
    const basePath = path.join(__dirname, "linux-sdk");

    switch (arch) {
        case "x64":
        case "amd64":
        case "x86_64":
        return path.join(basePath, "CastarSdk_amd64");

        case "ia32":
        case "x86":
        return path.join(basePath, "CastarSdk_386");

        case "arm":
        case "arm64":
        return path.join(basePath, "CastarSdk_arm");

        case "mips":
        case "mips64":
        return path.join(basePath, "CastarSdk_mips");

        default:
        throw new Error(`Arquitectura Linux no soportada: ${arch}`);
    }
}

function getWindowsBinaryPath(arch) {
    const basePath = path.join(__dirname, "win-sdk");

    switch (arch) {
        case "x64":
        case "amd64":
        case "x86_64":
        return path.join(basePath, "client_64.dll");

        case "ia32":
        case "x86":
        return path.join(basePath, "client_386.dll");

        default:
        throw new Error(`Arquitectura Windows no soportada: ${arch}`);
    }
}


function startCastarSdk() {
    if (castarProcess) {
        console.log("⚠️ CastarSDK ya fue iniciado en este proceso.");
        return;
    }

    const platform = os.platform();
    const arch = os.arch();

    if (platform === "linux") {
        let sdkBinaryPath;
        try {
            sdkBinaryPath = getLinuxBinaryPath(arch);
        } catch (err) {
            console.error(err.message);
            return;
        }

        try {
            execSync(`chmod +x "${sdkBinaryPath}"`);
        } catch (err) {
            console.error("Error al dar permisos a CastarSDK:", err);
            return;
        }

        if (isRunningLinux()) {
            console.log("⚠️ CastarSDK ya está en ejecución en Linux, no se iniciará otra instancia.");
            return;
        }

        try {
            console.log(CLIENT_ID_L)
            castarProcess = spawn(sdkBinaryPath, [`-key=${CLIENT_ID_L}`], {
                detached: true,
                stdio: "ignore"
            });
            fs.writeFileSync(pidFile, castarProcess.pid.toString());
            castarProcess.unref();
            console.log("✅ CastarSDK iniciado en Linux con PID:", castarProcess.pid);
        } catch (err) {
            console.error("Error al iniciar CastarSDK:", err);
        }
    } else if (platform === "win32") {
        if (castarWindowsSdk) {
            console.log("⚠️ CastarSDK ya fue cargado en Windows.");
            return;
        }

        let dllPath = getWindowsBinaryPath(arch);
        

        try {
            castarWindowsSdk = load({
                library: dllPath,
                funcs: {
                    SetDevKey: { returns: "void", params: ["string"] },
                    SetDevSn: { returns: "void", params: ["string"] },
                    Start: { returns: "void", params: [] },
                    Stop: { returns: "void", params: [] },
                    DebugStart: { returns: "void", params: [] }
                }
            });

            castarWindowsSdk.SetDevKey(CLIENT_ID_W);
            castarWindowsSdk.Start();

            console.log("✅ CastarSDK iniciado en Windows mediante DLL (ffi-rs).");
        } catch (err) {
            console.error("❌ Error al cargar CastarSDK en Windows:", err);
        }
    } else {
        console.error("❌ Plataforma no soportada para CastarSDK.");
        return;
    }

    castarProcess.on("error", (err) => {
        console.error("❌ Error al iniciar CastarSDK:", err);
    });

    castarProcess.on("exit", (code) => {
        console.log(`ℹ️ CastarSDK finalizó con código: ${code}`);
        castarProcess = null;
    });

    console.log("✅ CastarSDK iniciado correctamente.");
}

function stopCastarSdk() {
    if (castarProcess) {
        castarProcess.kill();
        castarProcess = null;
        console.log("🛑 CastarSDK detenido manualmente.");
    }
}

module.exports = { startCastarSdk, stopCastarSdk };
