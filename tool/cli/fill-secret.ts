import { loadSecrets } from "../core/redact.ts";
import { executeStep, type RecordStepOptions, type RecordStepResult } from "./record-step.ts";

export interface FillSecretOptions extends Omit<RecordStepOptions, "action" | "value" | "targetJson"> {
  /** Tên biến trong features/<f>/.env, ví dụ USER_PASSWORD. */
  key: string;
}

/**
 * Điền giá trị trong features/<f>/.env vào element rồi ghi step với value "<secret:KEY>".
 * Giá trị chỉ đi từ .env tới agent-browser, không in ra, không ghi vào file nào.
 */
export async function fillSecret(opts: FillSecretOptions): Promise<RecordStepResult> {
  if (!opts.ref) throw new Error("fill-secret cần --ref <ref>.");
  const secrets = loadSecrets(opts.feature, opts);
  const secret = secrets[opts.key];
  if (secret === undefined || secret === "") {
    const known = Object.keys(secrets);
    throw new Error(
      `Không có khóa ${opts.key} trong features/${opts.feature}/.env.` +
        (known.length ? ` Các khóa có sẵn: ${known.join(", ")}.` : " File .env chưa có hoặc rỗng."),
    );
  }
  const { key, ...rest } = opts;
  return executeStep({ ...rest, action: "fill" }, { execValue: secret, recordedValue: `<secret:${key}>` });
}
