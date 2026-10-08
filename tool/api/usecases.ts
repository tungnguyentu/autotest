import express, { Router } from "express";
import { readFeature } from "../core/feature-store.ts";
import { addDocxUsecase, addMarkdownUsecase, listUsecases, UsecaseError } from "../core/usecase-store.ts";
import { featureParam, HttpError, type ToolContext } from "./http.ts";

export { listUsecases, type UsecaseInfo } from "../core/usecase-store.ts";

const toHttp = (err: unknown): never => {
  if (err instanceof UsecaseError) throw new HttpError(err.status, err.message);
  throw err;
};

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
    try {
      addMarkdownUsecase(feature, name, content, ctx);
    } catch (err) {
      toHttp(err);
    }
    res.status(201).json(listUsecases(feature, ctx));
  });

  // Tải file Word lên (thân request là nội dung file, tên ở `?name=`). Tool chuyển sang `<tên>.md`,
  // tách ảnh vào `<tên>.images/`, giữ file gốc. Không ghi đè file có sẵn.
  r.post("/docx", express.raw({ type: () => true, limit: "30mb" }), async (req, res) => {
    const feature = featureParam(req);
    readFeature(feature, ctx);
    const added = await addDocxUsecase(feature, req.query.name, req.body, ctx).catch(toHttp);
    res.status(201).json({ usecases: listUsecases(feature, ctx), ...added });
  });

  return r;
}
