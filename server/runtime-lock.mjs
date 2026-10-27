import {
  mkdirSync,
  chmodSync,
  openSync,
  writeFileSync,
  readFileSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
// Only one runtime may rotate the credentials in a given directory.
export function lockRuntime(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, "runtime.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = openSync(path, "wx", 0o600);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const pid = Number(readFileSync(path, "utf8"));
      if (!Number.isInteger(pid) || pid < 1)
        throw Error(
          "Omicron’s runtime lock is unreadable. It has been left untouched.",
        );
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") {
          unlinkSync(path);
          continue;
        }
        throw error;
      }
      throw Error(
        "Omicron is already running with this credential directory. Use the existing runtime.",
      );
    }
    try {
      writeFileSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
    return () => {
      try {
        if (readFileSync(path, "utf8") === String(process.pid))
          unlinkSync(path);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    };
  }
  throw Error("Omicron could not acquire its runtime lock.");
}
