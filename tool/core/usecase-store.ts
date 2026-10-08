import fs from "node:fs";
import path from "node:path";
import { docxToMarkdown } from "./docx-to-md.ts";
import { featureDir, type PathOptions } from "./paths.ts";

export interface UsecaseInfo {
  name: string;
  size: number;
  mtime: string;
  /** Có khi file .md do tool chuyển từ file Word cùng tên. */
  source?: string;
  /** Số ảnh tách từ file Word, nằm ở `<tên>.images/`. */
  images?: number;
}

/** Lỗi do dữ liệu tester đưa vào. `status` theo mã HTTP: 400 dữ liệu sai, 409 trùng tên. */
export class UsecaseError extends Error {
  constructor(
    public status: 400 | 409,
    message: string,
  ) {
    super(message);
  }
}

const NAME = /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,120}\.md$/u;
const DOCX_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,120}\.docx$/u;

export const usecasesDir = (feature: string, opts?: PathOptions) => path.join(featureDir(feature, opts), "usecases");

const safeName = (name: unknown, re: RegExp): name is string =>
  typeof name === "string" && path.basename(name) === name && !name.includes("..") && re.test(name);

export function listUsecases(feature: string, opts?: PathOptions): UsecaseInfo[] {
  const dir = usecasesDir(feature, opts);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md") && e.name.toLowerCase() !== "readme.md")
    .map((e) => {
      const s = fs.statSync(path.join(dir, e.name));
      const info: UsecaseInfo = { name: e.name, size: s.size, mtime: s.mtime.toISOString() };
      const base = e.name.slice(0, -3);
      if (fs.existsSync(path.join(dir, `${base}.docx`))) {
        info.source = `${base}.docx`;
        const imgDir = path.join(dir, `${base}.images`);
        info.images = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).length : 0;
      }
      return info;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Ghi file mới, không ghi đè. */
function writeNew(file: string, data: string | Buffer, label: string): void {
  try {
    fs.writeFileSync(file, data, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UsecaseError(409, `Đã có use case tên "${label}". Đổi tên file rồi thêm lại.`);
    }
    throw err;
  }
}

/** Thêm use case Markdown. Không ghi đè file có sẵn. */
export function addMarkdownUsecase(feature: string, name: unknown, content: unknown, opts?: PathOptions): void {
  if (!safeName(name, NAME)) {
    throw new UsecaseError(400, "Tên file phải là Markdown (.md), không chứa đường dẫn hay ký tự đặc biệt.");
  }
  if (typeof content !== "string" || !content.trim()) throw new UsecaseError(400, "File rỗng.");
  const dir = usecasesDir(feature, opts);
  fs.mkdirSync(dir, { recursive: true });
  writeNew(path.join(dir, name), content, name);
}

export interface DocxAdded {
  converted: string;
  images: number;
  warnings: string[];
}

/**
 * Thêm use case từ file Word: chuyển sang `<tên>.md`, tách ảnh vào `<tên>.images/`, giữ file gốc.
 * Không ghi đè file có sẵn.
 */
export async function addDocxUsecase(feature: string, name: unknown, body: unknown, opts?: PathOptions): Promise<DocxAdded> {
  if (!safeName(name, DOCX_NAME)) {
    throw new UsecaseError(400, "Tên file phải là Word (.docx), không chứa đường dẫn hay ký tự đặc biệt.");
  }
  if (!Buffer.isBuffer(body) || !body.length) throw new UsecaseError(400, "File rỗng.");
  const base = name.slice(0, -5);
  const mdName = `${base}.md`;
  const imgDirName = `${base}.images`;

  let conv;
  try {
    conv = await docxToMarkdown(body, imgDirName);
  } catch {
    throw new UsecaseError(400, `Không đọc được "${name}". File phải là Word .docx (không phải .doc cũ), không đặt mật khẩu.`);
  }
  if (!conv.markdown.trim()) throw new UsecaseError(400, `"${name}" không có nội dung chữ.`);

  const dir = usecasesDir(feature, opts);
  fs.mkdirSync(dir, { recursive: true });
  for (const taken of [mdName, name, imgDirName]) {
    if (fs.existsSync(path.join(dir, taken))) {
      throw new UsecaseError(409, `Đã có use case tên "${taken}". Đổi tên file rồi thêm lại.`);
    }
  }
  const header = `<!-- Tool chuyển tự động từ ${name}. Ảnh trong tài liệu ở thư mục ${imgDirName}/. -->\n\n`;
  writeNew(path.join(dir, mdName), header + conv.markdown + "\n", mdName);
  writeNew(path.join(dir, name), body, name);
  if (conv.images.length) {
    fs.mkdirSync(path.join(dir, imgDirName));
    for (const img of conv.images) fs.writeFileSync(path.join(dir, imgDirName, img.file), img.data, { flag: "wx" });
  }
  return { converted: mdName, images: conv.images.length, warnings: conv.warnings };
}
