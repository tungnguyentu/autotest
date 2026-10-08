import type { ErrorRequestHandler, Request } from "express";
import { SchemaError } from "../core/schemas.ts";
import { assertFeatureName, type PathOptions } from "../core/paths.ts";

/** Ngữ cảnh dùng chung: gốc project và biến môi trường (EVIDENCE_ROOT). */
export interface ToolContext extends PathOptions {
  root: string;
  env: NodeJS.ProcessEnv;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Lấy và kiểm tra tham số :f. Tên sai trả 400 thay vì lọt vào đường dẫn file. */
export function featureParam(req: Request): string {
  try {
    return assertFeatureName(String(req.params.f));
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof SchemaError) {
    res.status(400).json({ error: err.message });
  } else if (err instanceof SyntaxError) {
    res.status(400).json({ error: `Nội dung gửi lên không phải JSON hợp lệ: ${err.message}` });
  } else if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Nội dung quá lớn (tối đa 2MB)." });
  } else if (err instanceof Error && /^Không tìm thấy /.test(err.message)) {
    res.status(404).json({ error: err.message });
  } else {
    console.error("[server] Lỗi không lường trước:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
};
