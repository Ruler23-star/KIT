const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const port = 31987;
let server;

function waitForServer(timeout = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeout) reject(new Error("本地服务启动超时"));
        else setTimeout(probe, 250);
      });
    };
    probe();
  });
}

function startServer() {
  const isPackaged = app.isPackaged;
  const serverDir = isPackaged ? path.join(process.resourcesPath, "next") : path.join(__dirname, "..", ".next", "standalone");
  const serverFile = path.join(serverDir, "server.js");
  const nodeExecutable = isPackaged ? path.join(process.resourcesPath, "node", "node.exe") : process.execPath;
  server = spawn(nodeExecutable, [serverFile], {
    cwd: serverDir,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      KIT_DATA_DIR: path.join(app.getPath("userData"), "data"),
    },
    windowsHide: true,
  });
  server.once("error", (error) => dialog.showErrorBox("KIT 启动失败", error.message));
}

async function createWindow() {
  startServer();
  try {
    await waitForServer();
  } catch (error) {
    dialog.showErrorBox("KIT 启动失败", `${error.message}。请重新安装或联系开发者。`);
    app.quit();
    return;
  }
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: "KIT — knowledge · idea · todo",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { if (server && !server.killed) server.kill(); });
