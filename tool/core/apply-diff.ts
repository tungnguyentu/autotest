// Áp unified diff cho một file văn bản, và kiểm tra diff của healing chỉ chạm dòng locator.
// Không gọi `git apply` hay `patch`: tool chạy được khi project chưa dùng git.

export interface DiffLine {
  kind: " " | "-" | "+";
  text: string;
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export class DiffError extends Error {}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Tách các hunk. Bỏ qua phần đầu (`---`, `+++`, `diff`, `index`) và dòng `\ No newline at end of file`. */
export function parseUnifiedDiff(text: string): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  let oldSeen = 0;
  let newSeen = 0;
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  if (rawLines.at(-1) === "") rawLines.pop(); // dấu xuống dòng cuối file diff
  for (const raw of rawLines) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      if (cur) assertComplete(cur, oldSeen, newSeen);
      cur = {
        oldStart: Number(header[1]),
        oldCount: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      };
      hunks.push(cur);
      oldSeen = 0;
      newSeen = 0;
      continue;
    }
    if (!cur) continue; // phần đầu của diff
    if (raw.startsWith("\\")) continue;
    const complete = oldSeen >= cur.oldCount && newSeen >= cur.newCount;
    if (complete) {
      // Sau hunk đủ dòng chỉ được còn dòng trống hoặc phần đầu của file kế tiếp.
      continue;
    }
    const kind = raw[0];
    if (kind === " " || kind === "-" || kind === "+") {
      cur.lines.push({ kind, text: raw.slice(1) });
      if (kind !== "+") oldSeen++;
      if (kind !== "-") newSeen++;
    } else if (raw === "") {
      // Editor hay cắt khoảng trắng đầu dòng của dòng ngữ cảnh trống.
      cur.lines.push({ kind: " ", text: "" });
      oldSeen++;
      newSeen++;
    } else {
      throw new DiffError(`Dòng diff không hợp lệ: "${raw.slice(0, 60)}"`);
    }
  }
  if (cur) assertComplete(cur, oldSeen, newSeen);
  if (!hunks.length) throw new DiffError("Diff không có hunk nào (thiếu dòng @@ -a,b +c,d @@).");
  return hunks;
}

function assertComplete(h: Hunk, oldSeen: number, newSeen: number): void {
  if (oldSeen !== h.oldCount || newSeen !== h.newCount) {
    throw new DiffError(`Hunk @@ -${h.oldStart} +${h.newStart} @@ khai báo ${h.oldCount}/${h.newCount} dòng nhưng có ${oldSeen}/${newSeen}.`);
  }
}

/**
 * Áp diff lên `source`. Mỗi hunk phải khớp chính xác dòng ngữ cảnh và dòng bị xóa,
 * tại vị trí khai báo, hoặc tại vị trí khớp duy nhất khác trong file (lệch số dòng nhẹ).
 * Lỗi thì ném `DiffError` và không trả kết quả một phần.
 */
export function applyUnifiedDiff(source: string, diff: string): string {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = source.endsWith("\n");
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (hadTrailingNewline) lines.pop();

  let shift = 0;
  let minNext = 0;
  for (const hunk of parseUnifiedDiff(diff)) {
    const oldBlock = hunk.lines.filter((l) => l.kind !== "+").map((l) => l.text);
    const newBlock = hunk.lines.filter((l) => l.kind !== "-").map((l) => l.text);
    // oldStart là 0 khi file cũ rỗng và hunk chỉ thêm dòng.
    const expected = Math.max(hunk.oldStart - 1, 0) + shift;
    const at = locate(lines, oldBlock, expected, minNext);
    if (at < 0) throw new DiffError(`Hunk @@ -${hunk.oldStart} @@ không khớp spec hiện tại (dòng ngữ cảnh hoặc dòng bị xóa đã khác). Spec có thể đã bị sửa sau khi tạo diff.`);
    lines.splice(at, oldBlock.length, ...newBlock);
    shift += newBlock.length - oldBlock.length;
    minNext = at + newBlock.length;
  }
  return lines.join(eol) + (hadTrailingNewline ? eol : "");
}

function matchesAt(lines: string[], block: string[], at: number): boolean {
  if (at < 0 || at + block.length > lines.length) return false;
  return block.every((b, i) => lines[at + i] === b);
}

function locate(lines: string[], block: string[], expected: number, min: number): number {
  if (expected >= min && matchesAt(lines, block, expected)) return expected;
  if (!block.length) return -1;
  const found: number[] = [];
  for (let i = min; i + block.length <= lines.length; i++) if (matchesAt(lines, block, i)) found.push(i);
  return found.length === 1 ? found[0]! : -1;
}

// Dòng được phép đổi: có chứa cách chọn element.
const LOCATOR_TOKEN = /\bgetBy[A-Z]\w*\s*\(|\.locator\s*\(|\.frameLocator\s*\(|\bxpath\s*=|\.filter\s*\(|\.(?:first|last|nth)\s*\(/;
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\bexpect\s*[(.]/, why: "chạm vào expect(" },
  { re: /\bwaitForTimeout\b/, why: "dùng waitForTimeout" },
  { re: /\btest\.(?:skip|fixme|fail|slow)\b/, why: "bỏ qua hoặc đánh dấu test" },
  { re: /\bforce\s*:/, why: "thêm hoặc đổi force" },
];

// Biểu thức chọn element, từ dấu chấm đứng trước (nếu có) đến dấu đóng ngoặc.
const LOCATOR_CALL = /\.?\s*\b(?:getBy[A-Z]\w*|locator|frameLocator|filter|first|last|nth)\s*\(/g;
const PLACEHOLDER = "\u0000L\u0000";

/** Vị trí dấu `)` đóng của ngoặc mở tại `open`, bỏ qua ngoặc trong chuỗi và ký tự bị escape. -1 nếu không cân. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\") {
      i++;
    } else if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === "`") {
      quote = c;
    } else if (c === "(") {
      depth++;
    } else if (c === ")" && --depth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Thay mỗi biểu thức chọn element (và chuỗi liền nhau của chúng) bằng một dấu giữ chỗ, gộp khoảng trắng.
 * Phần còn lại của dòng (hành động, dữ liệu nhập, tùy chọn) giữ nguyên để so sánh cũ và mới.
 * Ngoặc không cân thì để nguyên, nên so sánh thất bại thay vì bỏ lọt.
 */
export function maskLocators(text: string): string {
  let out = "";
  let pos = 0;
  LOCATOR_CALL.lastIndex = 0;
  for (let m = LOCATOR_CALL.exec(text); m; m = LOCATOR_CALL.exec(text)) {
    if (m.index < pos) continue;
    const end = closingParen(text, m.index + m[0].length - 1);
    if (end < 0) continue;
    out += text.slice(pos, m.index) + PLACEHOLDER;
    pos = end + 1;
    LOCATOR_CALL.lastIndex = pos;
  }
  out += text.slice(pos);
  return out.replace(new RegExp(`(?:\\s*${PLACEHOLDER})+`, "g"), PLACEHOLDER).replace(/\s+/g, " ").trim();
}

/**
 * Trả danh sách lý do từ chối. Mảng rỗng nghĩa là diff chỉ đổi dòng locator.
 * Luật: dòng đổi (+ hoặc -) phải có locator, không có expect, waitForTimeout, force;
 * sau khi bỏ biểu thức locator, phần còn lại của dòng cũ và mới phải giống hệt;
 * không xóa dòng `await` mà không thêm dòng `await` thay thế; mỗi hunk không thêm hoặc bớt dòng nào so với số dòng `await`.
 */
export function checkLocatorOnly(diff: string): string[] {
  const problems: string[] = [];
  let hunks: Hunk[];
  try {
    hunks = parseUnifiedDiff(diff);
  } catch (err) {
    return [(err as Error).message];
  }
  hunks.forEach((h, i) => {
    const n = i + 1;
    const changed = h.lines.filter((l) => l.kind !== " ");
    if (!changed.length) problems.push(`Hunk ${n} không đổi dòng nào.`);
    for (const l of changed) {
      for (const f of FORBIDDEN) if (f.re.test(l.text)) problems.push(`Hunk ${n} ${f.why}: "${l.text.trim().slice(0, 80)}"`);
      if (!LOCATOR_TOKEN.test(l.text)) problems.push(`Hunk ${n} đổi dòng không chứa locator: "${l.text.trim().slice(0, 80)}"`);
    }
    const awaits = (k: "-" | "+") => h.lines.filter((l) => l.kind === k && /^\s*(?:const\s+\w+\s*=\s*)?await\b/.test(l.text)).length;
    if (awaits("-") > awaits("+")) problems.push(`Hunk ${n} xóa dòng await mà không thay bằng dòng await khác.`);
    const removed = h.lines.filter((l) => l.kind === "-").length;
    const added = h.lines.filter((l) => l.kind === "+").length;
    // Sau khi bỏ biểu thức locator, phần còn lại (hành động, giá trị nhập, tùy chọn như force) phải giống hệt.
    // Comment `// TODO locator: ...` đi kèm locator yếu không tính.
    const rest = (k: "-" | "+") =>
      maskLocators(
        h.lines
          .filter((l) => l.kind === k)
          .map((l) => l.text.replace(/\s*\/\/\s*TODO locator\b.*$/, ""))
          .join("\n"),
      );
    if (removed === added && rest("-") !== rest("+")) {
      problems.push(`Hunk ${n} đổi nhiều hơn biểu thức locator (hành động, dữ liệu nhập hoặc tùy chọn): "${rest("-").slice(0, 60)}" thành "${rest("+").slice(0, 60)}".`);
    }
    if (removed !== added) problems.push(`Hunk ${n} đổi số dòng (${removed} xóa, ${added} thêm). Healing chỉ thay dòng locator, không thêm hay bớt bước.`);
  });
  return [...new Set(problems)];
}
