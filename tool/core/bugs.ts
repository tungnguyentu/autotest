import fs from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "./feature-store.ts";

const HEADING = "# Nghi ngờ bug";

export interface BugEntry {
  /** Mã test case. Mỗi test case có tối đa một mục, ghi lại thì thay mục cũ. */
  id: string;
  title: string;
  suspected: string;
  /** Ghi chú của tester khi quyết định. */
  note: string;
  decidedAt: string;
}

const clean = (s: string) => s.replace(/\r/g, "").trim();

function renderEntry(e: BugEntry): string {
  const lines = [
    `## ${e.id} - ${clean(e.title).replace(/\s+/g, " ")}`,
    "",
    `- Thời điểm: ${e.decidedAt}`,
    `- Nghi bug: ${clean(e.suspected).replace(/\n/g, "\n  ")}`,
    ...(clean(e.note) ? [`- Ghi chú tester: ${clean(e.note).replace(/\n/g, "\n  ")}`] : []),
    `- Evidence: ai-run/${e.id}.json`,
  ];
  return lines.join("\n");
}

/** Thêm (hoặc thay) mục của test case vào `<đợt>/bugs.md`. Các mục khác giữ nguyên. */
export function addBug(runDir: string, entry: BugEntry): void {
  const file = path.join(runDir, "bugs.md");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const sections = existing
    .split(/^(?=## )/m)
    .map((s) => s.trimEnd())
    .filter((s) => s && !s.startsWith(HEADING));
  const mine = `## ${entry.id} - `;
  const kept = sections.filter((s) => !s.startsWith(mine));
  writeTextAtomic(file, [HEADING, ...kept, renderEntry(entry)].join("\n\n") + "\n");
}
