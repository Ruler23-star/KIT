const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { appendFileSync, mkdirSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const port = 31987;
let server;
let serverFailure = "";

function writeStartupLog(message) {
  const logDir = path.join(app.getPath("userData"), "logs");
  mkdirSync(logDir, { recursive: true });
  appendFileSync(path.join(logDir, "startup.log"), `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

function waitForServer(timeout = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeout) reject(new Error(serverFailure || "本地服务启动超时"));
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
  serverFailure = "";
  writeStartupLog(`Starting local server from ${serverFile}`);
  server = spawn(nodeExecutable, [serverFile], {
    cwd: serverDir,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      KIT_DATA_DIR: path.join(app.getPath("userData"), "data"),
      NODE_PATH: [
        path.join(serverDir, "server_modules"),
        path.join(serverDir, "server_modules", ".pnpm", "node_modules"),
        path.join(serverDir, ".next", "node_modules"),
      ].join(path.delimiter),
    },
    windowsHide: true,
  });
  server.stdout.on("data", (data) => writeStartupLog(data.toString().trimEnd()));
  server.stderr.on("data", (data) => {
    serverFailure = data.toString().trim();
    writeStartupLog(serverFailure);
  });
  server.once("error", (error) => {
    serverFailure = error.message;
    writeStartupLog(error.stack || error.message);
  });
  server.once("exit", (code, signal) => {
    if (code !== 0 && !serverFailure) serverFailure = `本地服务异常退出（代码 ${code ?? "未知"}，信号 ${signal ?? "无"}）`;
    writeStartupLog(`Local server exited: code=${code}, signal=${signal}`);
  });
}

async function createWindow() {
  startServer();
  try {
    await waitForServer();
  } catch (error) {
    dialog.showErrorBox("KIT 启动失败", `${error.message}\n\n诊断日志：${path.join(app.getPath("userData"), "logs", "startup.log")}`);
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
