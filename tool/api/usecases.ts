import fs from "node:fs";
import path from "node:path";
import express, { Router } from "express";
import { docxToMarkdown } from "../core/docx-to-md.ts";
import { readFeature } from "../core/feature-store.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";
import { featureDir } from "../core/paths.ts";

export interface UsecaseInfo {
  name: string;
  size: number;
  mtime: string;
  /** Có khi file .md do tool chuyển từ file Word cùng tên. */
  source?: string;
  /** Số ảnh tách từ file Word, nằm ở `<tên>.images/`. */
  images?: number;
}

const NAME = /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,120}\.md$/u;
const DOCX_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,120}\.docx$/u;
const usecasesDir = (feature: string, ctx: ToolContext) => path.join(featureDir(feature, ctx), "usecases");

const safeName = (name: unknown, re: RegExp): name is string =>
  typeof name === "string" && path.basename(name) === name && !name.includes("..") && re.test(name);

export function listUsecases(feature: string, ctx: ToolContext): UsecaseInfo[] {
  const dir = usecasesDir(feature, ctx);
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

/** Ghi file mới, không ghi đè. Trả lỗi 409 nếu đã có. */
function writeNew(file: string, data: string | Buffer, label: string): void {
  try {
    fs.writeFileSync(file, data, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new HttpError(409, `Đã có use case tên "${label}". Đổi tên file rồi tải lại.`);
    }
    throw err;
  }
}

export function usecasesRouter(ctx: ToolContext): Router {
  const r = Router({ mergeParams: true });

  r.get("/", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx);
    res.json(listUsecases(feature, ctx));
  });

  // Tải một file Markdown lên. Không ghi đè file có sẵn.
  r.post("/", (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx);
    const { name, content } = (req.body ?? {}) as { name?: unknown; content?: unknown };
    if (!safeName(name, NAME)) {
      throw new HttpError(400, "Tên file phải là Markdown (.md), không chứa đường dẫn hay ký tự đặc biệt.");
    }
    if (typeof content !== "string" || !content.trim()) throw new HttpError(400, "File rỗng.");
    const dir = usecasesDir(feature, ctx);
    fs.mkdirSync(dir, { recursive: true });
    writeNew(path.join(dir, name), content, name);
    res.status(201).json(listUsecases(feature, ctx));
  });

  // Tải file Word lên (thân request là nội dung file, tên ở `?name=`). Tool chuyển sang `<tên>.md`,
  // tách ảnh vào `<tên>.images/`, giữ file gốc. Không ghi đè file có sẵn.
  r.post("/docx", express.raw({ type: () => true, limit: "30mb" }), async (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx);
    const name = req.query.name;
    if (!safeName(name, DOCX_NAME)) {
      throw new HttpError(400, "Tên file phải là Word (.docx), không chứa đường dẫn hay ký tự đặc biệt.");
    }
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || !body.length) throw new HttpError(400, "File rỗng.");
    const base = name.slice(0, -5);
    const mdName = `${base}.md`;
    const imgDirName = `${base}.images`;

    let conv;
    try {
      conv = await docxToMarkdown(body, imgDirName);
    } catch {
      throw new HttpError(400, `Không đọc được "${name}". File phải là Word .docx (không phải .doc cũ), không đặt mật khẩu.`);
    }
    if (!conv.markdown.trim()) throw new HttpError(400, `"${name}" không có nội dung chữ.`);

    const dir = usecasesDir(feature, ctx);
    fs.mkdirSync(dir, { recursive: true });
    for (const taken of [mdName, name, imgDirName]) {
      if (fs.existsSync(path.join(dir, taken))) {
        throw new HttpError(409, `Đã có use case tên "${taken}". Đổi tên file rồi tải lại.`);
      }
    }
    const header = `<!-- Tool chuyển tự động từ ${name}. Ảnh trong tài liệu ở thư mục ${imgDirName}/. -->\n\n`;
    writeNew(path.join(dir, mdName), header + conv.markdown + "\n", mdName);
    writeNew(path.join(dir, name), body, name);
    if (conv.images.length) {
      fs.mkdirSync(path.join(dir, imgDirName));
      for (const img of conv.images) fs.writeFileSync(path.join(dir, imgDirName, img.file), img.data, { flag: "wx" });
    }
    res.status(201).json({ usecases: listUsecases(feature, ctx), converted: mdName, images: conv.images.length, warnings: conv.warnings });
  });

  return r;
}
