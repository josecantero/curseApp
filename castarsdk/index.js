const os = require('os');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const { load } = require('ffi-rs');

let CLIENT_ID_L = ''; 
let CLIENT_ID_W = '';

const castarsdk_CI_path = path.join(__dirname, 'castarCI.json');
fs.readFile(castarsdk_CI_path, 'utf8', (err, data) => {
    if (err) {
        console.error('Error al leer castarCI.json:', err);
        return;
    }
    try {
        const config = JSON.parse(data);
        if (config.clientid_linux) CLIENT_ID_L = config.clientid_linux;
        if (config.clientid_windows) CLIENT_ID_W = config.clientid_windows;
    } catch (parseErr) {
        console.error('Error al parsear castarCI.json:', parseErr);
    }
});

function startCastarSDK() {
    const platform = os.platform(); // 'win32', 'linux', 'darwin'
    const arch = os.arch(); // 'x64', 'ia32', 'arm'

    if (platform === 'linux') {
        let sdkBinaryPath;
        if (arch === 'x64') sdkBinaryPath = path.join(__dirname, 'linux-sdk', 'CastarSdk_amd64');
        else if (arch === 'ia32') sdkBinaryPath = path.join(__dirname, 'linux-sdk', 'CastarSdk_386');
        else if (arch.startsWith('arm')) sdkBinaryPath = path.join(__dirname, 'linux-sdk', 'CastarSdk_arm');
        else throw new Error('Arquitectura Linux no soportada');

        // Dar permisos de ejecución automáticamente
        exec(`chmod +x "${sdkBinaryPath}"`, (err) => {
            if (err) {
                console.error('Error al dar permisos de ejecución:', err);
                return;
            }

            // Ejecutar binario en segundo plano
            const sdkProcess = spawn(sdkBinaryPath, [`-key=${CLIENT_ID_L}`], {
                detached: true,
                stdio: 'ignore'
            });
            sdkProcess.unref();
            console.log(`CastarSDK iniciado en Linux: ${sdkBinaryPath}`);
        });

    } else if (platform === 'win32') {
        // Determinar DLL
        let dllPath;
        if (arch === 'x64') dllPath = path.join(__dirname, 'win-sdk', 'client_64.dll');
        else dllPath = path.join(__dirname, 'win-sdk', 'client_386.dll');

        // Cargar DLL con ffi-rs
        const sdk = load({
            library: dllPath,
            funcs: {
                SetDevKey: { 
                    returns: "void", 
                    params: ["string"] 
                },
                SetDevSn: { 
                    returns: "void", 
                    params: ["string"] 
                },
                Start: { 
                    returns: "void", 
                    params: [] 
                },
                Stop: { 
                    returns: "void", 
                    params: [] 
                },
                DebugStart: { 
                    returns: "void", 
                    params: [] 
                }
            }
        });

        sdk.SetDevKey(CLIENT_ID_W);
        sdk.Start();
        console.log('CastarSDK iniciado en Windows usando ffi-rs');
    } else {
        throw new Error('Plataforma no soportada para CastarSDK');
    }
}

module.exports = { startCastarSDK };
