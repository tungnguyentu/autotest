import fs from "node:fs";
import { featureFile, type PathOptions } from "../core/paths.ts";
import { writeFeature } from "../core/feature-store.ts";
import type { Feature } from "../core/schemas.ts";

export interface FeatureInitOptions extends PathOptions {
  feature: string;
  url: string;
  service?: string;
  screen?: string;
  auth?: boolean;
}

/** Tạo features/<f>/feature.json từ một URL, khi tester làm việc bằng chat thay vì UI. Không ghi đè. */
export function featureInit(opts: FeatureInitOptions): { file: string; feature: Feature } {
  const file = featureFile(opts.feature, opts);
  if (fs.existsSync(file)) throw new Error(`Đã có ${file}. Sửa file đó thay vì tạo lại.`);
  let u: URL;
  try {
    u = new URL(opts.url);
  } catch {
    throw new Error(`URL không hợp lệ: ${opts.url}`);
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("URL phải bắt đầu bằng http:// hoặc https://");
  const feature: Feature = {
    feature: opts.feature,
    service: opts.service || u.hostname,
    baseURL: u.origin,
    viewport: { width: 1440, height: 900 },
    screens: {
      [opts.screen || "home"]: { path: u.pathname + u.search || "/", auth: Boolean(opts.auth), mask: [], scale: 1, wait_for: [] },
    },
  };
  writeFeature(feature, opts);
  return { file, feature };
}
