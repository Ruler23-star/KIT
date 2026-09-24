import path from "node:path";

/**
 * In the desktop build Electron supplies KIT_DATA_DIR, which keeps personal
 * data outside the installed application files. Browser development keeps the
 * existing project-local data directory for backwards compatibility.
 */
export function getDataDir() {
  return process.env.KIT_DATA_DIR
    ? path.resolve(process.env.KIT_DATA_DIR)
    : path.join(process.cwd(), "data");
}
