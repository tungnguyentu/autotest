---
title: "Tool AI Testing có UI cho tester"
description: "Web app local bằng Node cho tester, kết hợp skill trong Claude Code. Sinh test case, chạy thử bằng agent-browser, chuyển sang Playwright, so UI với Figma."
status: in-progress
priority: P1
effort: 13d
tags: [feature, frontend, backend, testing, playwright]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Tool AI Testing có UI cho tester

## Overview

Tool chạy trên máy tester, mở ở localhost. Tool làm mọi bước không cần AI. Các bước cần AI chạy trong Claude Code mà tester đã đăng nhập bằng subscription, qua bốn skill trong project. Hai phần dùng chung một bộ file trên disk. Tester kiểm tra đầu ra ở mọi bước, AI chỉ đề xuất.

Hợp đồng gốc: `plans/reports/brainstorm-261007-1453-ai-testing-pipeline.md`. Kế hoạch này giữ nguyên outcome, constraints, non-goals và 11 tiêu chí nghiệm thu trong đó.

## Kiến trúc

```
Tester ──────────────── Trình duyệt: http://localhost:4173 ─────┐
   │                                                            │
   │  copy lệnh từ UI                                   Node tool (Express + static UI)
   ▼                                                    - đọc/ghi features/, tests/, evidence/, auth/
Claude Code (subscription) ─ skill ─▶ agent-browser     - chạy Playwright (chụp, spec, regression)
   .claude/skills/gen-testcases                          - so ảnh pixelmatch
   .claude/skills/run-testcase ──▶ node tool/cli record-step
   .claude/skills/to-playwright                          - SSE báo file đổi cho UI
   .claude/skills/ui-check                               - không gọi Claude
   .claude/skills/heal-locator
            │
            ▼
   cùng một bộ file trên disk (nguồn sự thật)
```

Quy ước đường dẫn giữ nguyên như kế hoạch của Alex: `features/<feature>/`, `tests/<feature>/`, `auth/<feature>.json`, `$EVIDENCE_ROOT/<YYYY-MM-DD>_<feature>[_rN]/`.

## Quyết định kỹ thuật

| Chủ đề | Quyết định | Lý do |
| --- | --- | --- |
| Server | Node 26, TypeScript chạy bằng `tsx`, Express 5 | Playwright đã là Node, không thêm runtime |
| UI | HTML tĩnh cộng JavaScript thuần, không framework, không bước build | Tester chỉ cần `npm install` và `npm start` |
| Cập nhật UI | `chokidar` theo dõi file, đẩy qua Server-Sent Events | Claude Code ghi file xong, UI tự tải lại |
| So ảnh | `pixelmatch` cộng `pngjs`, gộp vùng theo lưới như `compare.py` | Giữ logic đã có, bỏ Python |
| AI chạy thử | agent-browser 0.34.0 qua CLI, phiên riêng tên `ui-check-<feature>` | Đã cài, file state cùng hình dạng Playwright |
| Gọi Claude | Không. Tester chạy skill trong Claude Code | Subscription không được dùng cho Agent SDK |
| Cổng | 4173, báo lỗi rõ khi cổng bận, không tự đổi cổng | Theo quy tắc quản lý process |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tester chạy `npm start`, quản lý tính năng, duyệt test case, đăng nhập tay, chạy regression từ UI | P1 |
| 2 | Bốn skill trong Claude Code sinh test case, chạy thử, chuyển spec, đọc ảnh diff theo cùng schema với tool | P1 |
| 3 | So UI với ảnh Figma: tool tạo diff, skill đánh giá, tester duyệt và tạo baseline | P1 |
| 4 | Pilot một tính năng từ D5 với số đo, thử healing, tài liệu cho tester | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Nền tảng và schema](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Server và UI lõi](./phase-02-tool-server-and-core-ui.md) | Pending |
| 3 | [Phase 3: Skill AI và ghi step](./phase-03-ai-skills-and-step-recorder.md) | Pending |
| 4 | [Phase 4: Duyệt kết quả AI và Playwright](./phase-04-ai-result-review-and-playwright.md) | Pending |
| 5 | [Phase 5: So Figma và skill ui-check](./phase-05-figma-compare-and-ui-check.md) | Pending |
| 6 | [Phase 6: Pilot, healing và tài liệu](./phase-06-pilot-healing-and-docs.md) | Pending |

Phụ thuộc: 1 → 2 → 3 → 4 → 5 → 6. Phase 3 và Phase 5 chỉ phụ thuộc Phase 1 về schema, nhưng cần Phase 2 để tester xem kết quả. Chạy tuần tự.

## Ước lượng

| Phase | Ngày | Giả định quyết định |
| --- | --- | --- |
| 1 | 2 | File phiên nạp được ở ba nơi với cookie thật |
| 2 | 3 | Không framework UI, không build |
| 3 | 2.5 | agent-browser ghi step ổn định qua `record-step` |
| 4 | 2 | Playwright report HTML nhúng được trong iframe |
| 5 | 2 | Ảnh Figma export đúng kích thước viewport |
| 6 | 1.5 cộng 1 đến 2 ngày mỗi module | D5 đã đưa use case |

## Rủi ro chính

| Rủi ro | Giảm thiểu |
| --- | --- |
| Tester quên chạy bước AI trong Claude Code | UI hiện trạng thái "chờ Claude Code" và lệnh để copy ở đúng chỗ |
| Claude Code ghi `ai-run` thiếu thuộc tính element | Skill bắt buộc gọi `record-step` sau mỗi action, script lấy role và name từ `snapshot --json` |
| Credential lọt vào transcript hoặc file | Lệnh `fill-secret` đọc `.env`, skill chỉ dùng tên biến, `record-step` che giá trị |
| agent-browser không nạp được `auth/<feature>.json` do Playwright tạo | Spike ở Phase 1, dự phòng: tool chuyển đổi file |
| Pixel diff nhiễu | Diff chỉ khoanh vùng, mask vùng động, skill đánh giá bằng mắt |

## Success Criteria

- [ ] 11 tiêu chí nghiệm thu trong báo cáo brainstorm đều có bằng chứng (lệnh chạy, ảnh, file).
- [ ] Vòng đầy đủ trên tính năng pilot: use case → test case → AI chạy thử → spec pass → so Figma → regression.
- [x] `docs/` có hướng dẫn tester, schema file, và quy trình từng bước. (`docs/tester-guide.md`, `docs/skills.md`, `docs/schemas.md`. Chưa có tester ngoài dự án đọc thử.)
- [ ] Không có credential trong log, report, spec hay history.

## Validation Log

### Phiên 1 (2026-10-07)

| Câu hỏi | Quyết định | Ảnh hưởng |
| --- | --- | --- |
| UI stack | HTML cộng JavaScript thuần, không build | Giữ nguyên Phase 2 |
| Môi trường phát triển | Site staging của tester, không dùng trang demo công khai | Tính năng mẫu đổi từ `demo` thành `staging`, mọi screen `auth: true` |
| Spike đăng nhập | Staging yêu cầu username, password, OTP. Tester đăng nhập trước, tool dùng phiên đã lưu | Phase 1 bước 7 dùng staging |
| Git | Chưa dùng git | Bỏ `git init`, `.gitignore`, `git apply`. Healing ghi đè spec trực tiếp sau khi tester xác nhận. `ak plan use` không chạy được vì cần git |

### Phiên 2 (2026-10-07, sau code review)

| Câu hỏi | Quyết định | Ảnh hưởng |
| --- | --- | --- |
| Che giá trị ô không phải mật khẩu trong ảnh chụp | Không che | Ghi trong `docs/tester-guide.md` mục bảo mật |
| Report HTML và trace có thể chứa credential | Chỉ cảnh báo trong tài liệu | Giữ nguyên trace `retain-on-failure` |
| Baseline khi còn dòng "bug" | Chặn | `baselineBlockers` trả lý do, UI và `docs/README.md` cập nhật, thêm test |

## Câu hỏi chưa giải quyết

- Site staging: baseURL, đường dẫn các screen, và một tài khoản tester có OTP. Cần trước Phase 1 bước 7. Các bước 1 đến 6 của Phase 1 làm được khi chưa có.
- Tính năng pilot đầu tiên là gì và khi nào D5 đưa use case? Phase 1 đến 5 phát triển trên site staging của tester với test case tự viết. Phase 6 cần use case thật.

<!-- slug: ai-testing-tool -->
