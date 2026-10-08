import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { evidenceRoot, type PathOptions } from "./paths.ts";

export interface ChangeEvent {
  /** Đường dẫn tương đối với gốc project. Evidence ngoài project có tiền tố `evidence/`. */
  path: string;
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
}

export interface Watcher {
  ready: Promise<void>;
  close: () => Promise<void>;
}

/**
 * Bỏ qua node_modules, .env, file tạm và file khóa của ghi nguyên tử, và file Playwright ghi liên tục khi chạy (log đi qua SSE riêng).
 * Các đoạn thư mục chỉ xét theo đường dẫn tương đối với gốc theo dõi: project nằm dưới thư mục tên `test-results` vẫn được theo dõi.
 */
function makeIsIgnored(bases: string[]): (p: string) => boolean {
  return (p) => {
    const base = path.basename(p);
    if (base === ".env" || base.startsWith(".env.") || base.endsWith(".tmp") || base.endsWith(".lock") || base === "playwright-log.txt") return true;
    // Playwright ghi hàng trăm file vào đây khi chạy. Kết thúc lần chạy đã có playwright-last.json báo.
    const rel = bases.map((b) => path.relative(b, p)).find((r) => !r.startsWith("..") && !path.isAbsolute(r)) ?? p;
    return rel.split(path.sep).some((seg) => seg === "node_modules" || seg === "test-results" || seg === "playwright-report");
  };
}

/**
 * Theo dõi features/, evidence/, tests/, auth/ và gom sự kiện trong `debounceMs`.
 * Chỉ báo đường dẫn và loại thay đổi, không đọc nội dung file.
 */
export function startWatcher(
  ctx: PathOptions & { env?: NodeJS.ProcessEnv },
  onEvents: (events: ChangeEvent[]) => void,
  debounceMs = 300,
): Watcher {
  const root = ctx.root ?? process.cwd();
  const evRoot = evidenceRoot(ctx);
  const targets = [path.join(root, "features"), evRoot, path.join(root, "tests"), path.join(root, "auth")];

  // Thư mục chưa tồn tại được chokidar theo dõi gián tiếp qua thư mục cha. Đường đó mất sự kiện khi
  // thư mục con tạo ngay sau thư mục cha (máy đang tải nặng), nên tạo sẵn các thư mục gốc để chokidar
  // gắn watcher trực tiếp. Thư mục rỗng không ảnh hưởng gì tới tool.
  for (const dir of targets) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn(`[watcher] Không tạo được ${dir}: ${(err as Error).message}`);
    }
  }

  const label = (abs: string): string => {
    const underEvidence = path.relative(evRoot, abs);
    if (!underEvidence.startsWith("..") && !path.isAbsolute(underEvidence)) {
      const viaRoot = path.relative(root, abs);
      return viaRoot.startsWith("..") ? path.join("evidence", underEvidence) : viaRoot;
    }
    return path.relative(root, abs);
  };

  const pending = new Map<string, ChangeEvent>();
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    timer = undefined;
    const batch = [...pending.values()];
    pending.clear();
    if (batch.length) onEvents(batch);
  };

  const fsw = chokidar.watch(targets, { ignoreInitial: true, ignored: makeIsIgnored(targets) });
  for (const type of ["add", "change", "unlink", "addDir", "unlinkDir"] as const) {
    fsw.on(type, (abs: string) => {
      const p = label(abs).split(path.sep).join("/");
      pending.set(p, { path: p, type });
      timer ??= setTimeout(flush, debounceMs);
    });
  }
  fsw.on("error", (err) => console.error("[watcher] Lỗi:", err));

  return {
    ready: new Promise((resolve) => fsw.once("ready", () => resolve())),
    close: async () => {
      if (timer) clearTimeout(timer);
      pending.clear();
      await fsw.close();
    },
  };
}
