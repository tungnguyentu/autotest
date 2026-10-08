import fs from "node:fs";
import path from "node:path";
import { runAgentBrowser, type BrowserOptions } from "../core/agent-browser.ts";
import { appendStep, findRunDirOfAiRun, readAiRun, screenshotRelPath } from "../core/ai-run-store.ts";
import type { PathOptions } from "../core/paths.ts";
import { redact, redactText, loadSecrets } from "../core/redact.ts";
import { AI_ACTIONS, AiRunStepSchema, AiRunTargetSchema, type AiRunStep } from "../core/schemas.ts";

type AiAction = (typeof AI_ACTIONS)[number];
type Target = AiRunStep["target"] & {};
type Data = Record<string, unknown>;

export interface RecordStepOptions extends PathOptions {
  feature: string;
  id: string;
  action: string;
  /** Ref từ `snapshot -i`, có hoặc không có @. */
  ref?: string;
  /** Target dạng JSON khi không có ref (ví dụ element tìm bằng `find`). */
  targetJson?: string;
  value?: string;
  note?: string;
  runDir?: string;
  env?: NodeJS.ProcessEnv;
  /** Không chờ network idle sau click, press, select. */
  noSettle?: boolean;
  /** Chờ URL khớp glob sau khi làm (ví dụ "**\/dashboard"). */
  waitUrl?: string;
  /** Chờ chữ xuất hiện sau khi làm. */
  waitText?: string;
}

export interface RecordStepResult {
  runDir: string;
  step: AiRunStep;
  /** Có với assert_url và assert_text: nội dung có khớp giá trị không. */
  assertion?: { passed: boolean; detail: string };
}

/** Giá trị gửi cho trình duyệt có thể khác giá trị ghi vào file (fill-secret). */
export interface ExecOverride {
  execValue: string;
  recordedValue: string;
}

const NEEDS_ELEMENT: AiAction[] = ["click", "fill", "select", "check"];
const SETTLE_ACTIONS: AiAction[] = ["click", "press", "select"];

function asAction(value: string): AiAction {
  if (!(AI_ACTIONS as readonly string[]).includes(value)) {
    throw new Error(`--action không hợp lệ: "${value}". Dùng một trong: ${AI_ACTIONS.join(", ")}.`);
  }
  return value as AiAction;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** CSS dự phòng từ id hoặc name. Bỏ id trông như sinh tự động. */
function cssFromAttrs(id: string | null, name: string | null): string | null {
  if (id && /^[A-Za-z][\w-]*$/.test(id) && !/\d{4,}|^(radix|headlessui|react-aria|ember)/i.test(id)) return `#${id}`;
  if (name && /^[\w.-]+$/.test(name)) return `[name="${name}"]`;
  return null;
}

type Selector =
  | { kind: "ref"; ref: string }
  | { kind: "css"; css: string }
  | { kind: "find"; by: "role" | "label" | "placeholder"; text: string; name?: string };

function selectorFromTarget(t: Target): Selector | null {
  if (t.role && t.name) return { kind: "find", by: "role", text: t.role, name: t.name };
  if (t.label) return { kind: "find", by: "label", text: t.label };
  if (t.placeholder) return { kind: "find", by: "placeholder", text: t.placeholder };
  if (t.css) return { kind: "css", css: t.css };
  return null;
}

/** Ghép lệnh agent-browser cho một thao tác trên element. */
function elementCommand(sel: Selector, verb: string, extra: string[] = []): string[] {
  if (sel.kind === "ref") return [verb, `@${sel.ref}`, ...extra];
  if (sel.kind === "css") return [verb, sel.css, ...extra];
  return ["find", sel.by, sel.text, verb, ...extra, ...(sel.name ? ["--name", sel.name] : [])];
}

function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
}

function matchesUrl(actual: string, expected: string): boolean {
  return expected.includes("*") ? globToRegExp(expected).test(actual) : actual === expected || actual.includes(expected);
}

function resolveUrl(value: string, baseURL: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : new URL(value, baseURL).toString();
}

function normalizeRef(ref: string): string {
  const r = ref.trim().replace(/^@/, "");
  if (!/^e\d+$/.test(r)) throw new Error(`--ref không hợp lệ: "${ref}". Dùng ref từ snapshot, ví dụ e5 hoặc @e5.`);
  return r;
}

function parseTargetJson(text: string): Target {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`--target-json không phải JSON: ${(err as Error).message}`);
  }
  const parsed = AiRunTargetSchema.safeParse(raw);
  if (!parsed.success) throw new Error("--target-json sai dạng. Các trường cho phép: role, name, label, placeholder, css (chuỗi hoặc null).");
  return parsed.data;
}

/**
 * Làm một thao tác trên trình duyệt agent-browser, rồi ghi step vào ai-run/<id>.json.
 * Tra role/name của ref và URL trước khi làm (sau khi làm ref có thể đã cũ), chụp ảnh sau khi làm.
 */
export async function executeStep(opts: RecordStepOptions, override?: ExecOverride): Promise<RecordStepResult> {
  const action = asAction(opts.action);
  const ref = opts.ref ? normalizeRef(opts.ref) : undefined;
  const targetFromJson = opts.targetJson ? parseTargetJson(opts.targetJson) : undefined;
  const recordedValue = override?.recordedValue ?? opts.value;
  const execValue = override?.execValue ?? opts.value;

  if (NEEDS_ELEMENT.includes(action) && !ref && !targetFromJson) {
    throw new Error(`--action ${action} cần --ref <ref> hoặc --target-json.`);
  }
  if (["navigate", "fill", "press", "select", "assert_url", "assert_text"].includes(action) && execValue === undefined) {
    throw new Error(`--action ${action} cần --value.`);
  }

  const runDir = findRunDirOfAiRun(opts.feature, opts.id, opts.runDir, opts);
  const run = readAiRun(runDir, opts.id);
  if (run.ai_result) throw new Error(`${opts.id} đã run-finish, không ghi thêm step. Mở lượt chạy mới bằng đợt khác.`);

  const secrets = loadSecrets(opts.feature, opts);
  const safe = (t: string) => redactText(t, secrets);
  const browser: BrowserOptions = { feature: opts.feature, env: opts.env, redactText: safe };
  const ab = (args: string[], timeoutMs?: number) => runAgentBrowser({ ...browser, timeoutMs }, args);
  const tryAb = async (args: string[], timeoutMs?: number): Promise<Data | null> => {
    try {
      return await ab(args, timeoutMs);
    } catch {
      return null;
    }
  };
  const currentUrl = async () => str((await tryAb(["get", "url"]))?.url);

  const n = run.steps.length + 1;
  const notes: string[] = opts.note ? [opts.note] : [];
  const urlBefore = await currentUrl();

  // Tra target trước khi làm.
  let target: Target | null = targetFromJson ?? null;
  let selector: Selector | null = null;
  if (ref) {
    const snap = await ab(["snapshot", "-i"]);
    const refs = (snap.refs ?? {}) as Record<string, { role?: unknown; name?: unknown }>;
    const entry = refs[ref];
    if (!entry) {
      throw new Error(`Không thấy @${ref} trong snapshot hiện tại. Chạy lại \`agent-browser --session ... snapshot -i\` rồi chọn ref mới.`);
    }
    const attr = async (name: string) => str((await tryAb(["get", "attr", `@${ref}`, name]))?.value);
    const [ariaLabel, placeholder, id, nameAttr] = [await attr("aria-label"), await attr("placeholder"), await attr("id"), await attr("name")];
    target = AiRunTargetSchema.parse({
      role: str(entry.role),
      name: str(entry.name),
      label: ariaLabel,
      placeholder,
      css: cssFromAttrs(id, nameAttr),
      ...targetFromJson,
    });
    selector = { kind: "ref", ref };
  } else if (target) {
    selector = selectorFromTarget(target);
    if (!selector && NEEDS_ELEMENT.includes(action)) throw new Error("--target-json cần ít nhất role+name, label, placeholder hoặc css.");
  }

  // Làm thao tác.
  let assertion: RecordStepResult["assertion"];
  switch (action) {
    case "navigate":
      await ab(["open", resolveUrl(execValue!, run.baseURL)]);
      break;
    case "click":
      await ab(elementCommand(selector!, "click"));
      break;
    case "check":
      await ab(elementCommand(selector!, "check"));
      break;
    case "fill":
      await ab(elementCommand(selector!, "fill", [execValue!]));
      break;
    case "select":
      await ab(elementCommand(selector!, "select", [execValue!]));
      break;
    case "press":
      if (selector) await ab(elementCommand(selector, "focus"));
      await ab(["press", execValue!]);
      break;
    case "assert_url":
    case "assert_text":
      break;
  }

  if (SETTLE_ACTIONS.includes(action) && !opts.noSettle) await tryAb(["wait", "--load", "networkidle"], 10_000);
  if (opts.waitUrl && !(await tryAb(["wait", "--url", opts.waitUrl], 30_000))) notes.push(`Không thấy URL khớp "${opts.waitUrl}" sau khi chờ.`);
  if (opts.waitText && !(await tryAb(["wait", "--text", opts.waitText], 30_000))) notes.push(`Không thấy chữ "${opts.waitText}" sau khi chờ.`);

  const urlAfter = await currentUrl();

  if (action === "assert_url") {
    const passed = urlAfter !== null && matchesUrl(urlAfter, execValue!);
    assertion = { passed, detail: safe(passed ? `URL khớp "${execValue}"` : `URL hiện tại là ${urlAfter ?? "(không đọc được)"}, không khớp "${execValue}"`) };
  } else if (action === "assert_text") {
    const scope = selector?.kind === "ref" ? `@${selector.ref}` : selector?.kind === "css" ? selector.css : "body";
    const data = await ab(["get", "text", scope]);
    const text = typeof data.text === "string" ? data.text : "";
    const passed = text.includes(execValue!);
    // `detail` đi ra stdout cho AI đọc, nên che giống file: nội dung trang có thể hiện giá trị credential.
    assertion = { passed, detail: safe(passed ? `Thấy chữ "${execValue}"` : `Không thấy chữ "${execValue}". Nội dung đọc được: ${text.slice(0, 200)}`) };
  }
  if (assertion) notes.push(`Kiểm tra: ${assertion.detail}`);

  // Ảnh: lỗi chụp không làm mất step đã làm xong.
  let screenshot: string | null = screenshotRelPath(opts.id, n);
  try {
    fs.mkdirSync(path.dirname(path.join(runDir, screenshot)), { recursive: true });
    await ab(["screenshot", path.join(runDir, screenshot)]);
  } catch (err) {
    notes.push(`Không chụp được ảnh: ${(err as Error).message}`);
    screenshot = null;
  }

  const step = redact(
    AiRunStepSchema.parse({
      n,
      action,
      target: action === "navigate" || action === "assert_url" ? null : target,
      value: recordedValue ?? null,
      url_before: urlBefore,
      url_after: urlAfter,
      screenshot,
      note: notes.join(" "),
    }),
    secrets,
  );
  appendStep(runDir, opts.id, step);
  return { runDir, step, assertion };
}

export function recordStep(opts: RecordStepOptions): Promise<RecordStepResult> {
  return executeStep(opts);
}
