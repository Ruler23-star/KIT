import { copyFile, cp, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const nextTarget = path.join(standalone, ".next");
const runtimeTarget = path.join(root, ".desktop-runtime");
const serverTarget = path.join(root, ".desktop-server");

await mkdir(nextTarget, { recursive: true });
await mkdir(runtimeTarget, { recursive: true });
await rm(serverTarget, { recursive: true, force: true });
await Promise.all([
  cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true }),
  cp(path.join(root, ".next", "static"), path.join(nextTarget, "static"), { recursive: true }),
  copyFile(process.execPath, path.join(runtimeTarget, "node.exe")),
]);

// Do not package development data. The Electron app always uses its own user-data directory.
await rm(path.join(standalone, "data"), { recursive: true, force: true });

// electron-builder excludes directories named node_modules from extraResources.
// Preserve the standalone dependency tree under a neutral name and expose it
// through NODE_PATH when the bundled server starts.
await cp(standalone, serverTarget, { recursive: true, dereference: true });
await rename(path.join(serverTarget, "node_modules"), path.join(serverTarget, "server_modules"));
