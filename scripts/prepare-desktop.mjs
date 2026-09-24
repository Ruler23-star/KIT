import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const nextTarget = path.join(standalone, ".next");

await mkdir(nextTarget, { recursive: true });
await Promise.all([
  cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true }),
  cp(path.join(root, ".next", "static"), path.join(nextTarget, "static"), { recursive: true }),
]);

// Do not package development data. The Electron app always uses its own user-data directory.
await rm(path.join(standalone, "data"), { recursive: true, force: true });
