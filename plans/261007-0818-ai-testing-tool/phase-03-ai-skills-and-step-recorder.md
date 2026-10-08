---
phase: 3
title: "Phase 3: Skill AI và ghi step"
status: in-progress
priority: P1
effort: "2.5d"
dependencies: [1, 2]
---

# Phase 3: Skill AI và ghi step

## Overview

Ba skill chạy trong Claude Code của tester: sinh test case, chạy thử bằng agent-browser, chuyển sang Playwright. Tool cung cấp hai lệnh CLI để skill ghi step đúng schema và điền credential mà không lộ giá trị.

## Requirements

- [ ] `/gen-testcases <feature>` đọc `features/<f>/usecases/*.md` và ghi `testcases.json` hợp lệ, `status: draft`, phủ positive, negative, boundary, validation, test data cụ thể.
- [ ] `/run-testcase <feature> <id>` chỉ chạy test case `reviewed`, dùng agent-browser với phiên đã lưu, ghi `ai-run/<id>.json`, ảnh từng step, `ai-run/<id>.md`. Gặp màn đăng nhập thì dừng và báo.
- [ ] `/to-playwright <feature> <id>` chỉ chuyển test case có `tester.decision = "confirmed"`. Skill sinh `tests/<f>/<id>.spec.ts` theo quy tắc locator, chạy thử, báo kết quả. Không sửa assertion để ép pass.
- [x] Credential không xuất hiện trong lệnh Claude Code gõ, trong `ai-run`, trong spec, hay trong transcript.

## Files to Create

- Create: `.claude/skills/gen-testcases/SKILL.md`
- Create: `.claude/skills/run-testcase/SKILL.md`, `references/agent-browser-recipes.md`
- Create: `.claude/skills/to-playwright/SKILL.md`, `references/playwright-conversion.md` (lấy từ gói `ui-check.skill`, đổi bảng ánh xạ sang action của schema `ai-run`)
- Create: `.claude/skills/_shared/report-template.md` (ba mẫu báo cáo từ gói `ui-check.skill`)
- Create: `tool/cli/record-step.ts` (lệnh `record-step`)
- Create: `tool/cli/fill-secret.ts` (lệnh `fill-secret`)
- Create: `tool/cli/run-start.ts`, `run-finish.ts` (mở và đóng một `ai-run`)
- Create: `tool/core/ai-run-store.ts` (đọc, ghi, thêm step vào `ai-run/<id>.json`)
- Create: `tool/core/redact.ts` (thay giá trị trong `.env` bằng `<secret:KEY>`)
- Modify: `CLAUDE.md` (mục "AI chạy thử" trỏ vào ba lệnh CLI)
- Create: `tool/cli/__tests__/record-step.test.ts`, `redact.test.ts`

## Lệnh CLI cho skill

```bash
# Mở một ai-run: tạo thư mục đợt nếu chưa có, tạo ai-run/<id>.json rỗng, in tên session agent-browser
npm run cli -- run-start --feature staging --id TC_STAGING_001 [--run-dir evidence/2026-10-07_staging]

# Ghi một step: lấy role, name của @ref từ snapshot --json, chụp ảnh, ghi URL trước và sau
npm run cli -- record-step --feature staging --id TC_STAGING_001 --action click --ref e5 [--value "..."] [--note "..."]

# Điền credential: đọc features/<f>/.env, gọi agent-browser fill, ghi step với value "<secret:KEY>"
npm run cli -- fill-secret --feature staging --id TC_STAGING_001 --ref e3 --key USER_PASSWORD

# Đóng ai-run: ghi ai_result từ file JSON Claude truyền vào, đóng session agent-browser
npm run cli -- run-finish --feature staging --id TC_STAGING_001 --result-file /tmp/result.json
```

`record-step` chạy `agent-browser --session ui-check-<feature> snapshot -i --json` để tra `refs[ref].role` và `refs[ref].name` (đã kiểm tra: kết quả JSON có `refs: { e1: { name, role } }`). Nếu tester cấu hình, lệnh gọi thêm `get attr` cho `label`, `placeholder`, `id`, `name`. Sau khi ghi, lệnh in lại step để Claude kiểm tra.

## Quy trình skill run-testcase (tóm tắt SKILL.md)

1. Đọc `feature.json`, `testcases.json`. Từ chối nếu status không phải `reviewed`.
2. `run-start`. Mở browser: `agent-browser --session ui-check-<f> --state auth/<f>.json set viewport <w> <h>` rồi `open <baseURL><path>`.
3. Với mỗi bước của test case: `snapshot -i`, chọn `@ref`, thực hiện action bằng agent-browser, rồi `record-step` ngay sau đó. Credential chỉ qua `fill-secret`.
4. Sau mỗi `expected`: kiểm tra bằng `get url`, `get text`, hoặc `is visible`, ghi `record-step --action assert_*`.
5. Gặp trang đăng nhập, OTP, captcha: `run-finish` với verdict `KHÔNG XÁC ĐỊNH` và lý do "CẦN TESTER ĐĂNG NHẬP LẠI", dừng.
6. `run-finish` với `per_expected`. Viết `ai-run/<id>.md` theo mẫu. Trả lời ngắn: thư mục đợt, verdict đề xuất, điểm bất thường.

## Implementation Steps

1. Viết `redact.ts` và test: thay mọi giá trị dài từ 3 ký tự trong `.env`, cả trong JSON lồng nhau.
2. Viết `ai-run-store.ts`: thêm step có khóa, số thứ tự tự tăng, đường dẫn ảnh tương đối thư mục đợt.
3. Viết `record-step.ts`: gọi agent-browser qua `child_process.execFile`, parse JSON, chụp `screenshots/<id>/NN.png`, ghi step. Test bằng cách giả lập `agent-browser` qua biến môi trường `AGENT_BROWSER_BIN` trỏ tới script giả.
4. Viết `fill-secret.ts`: không in giá trị, lỗi khi thiếu khóa.
5. Viết `run-start.ts`, `run-finish.ts`.
6. Viết ba `SKILL.md` bằng tiếng Việt, mỗi skill dưới 200 dòng, phần quy tắc "Không được làm" lấy từ gói `ui-check.skill`.
7. Chuyển `playwright-conversion.md` sang schema mới: `navigate → page.goto`, `click → locator.click`, `fill → locator.fill`, `press → keyboard.press`, `select → selectOption`, `assert_url → toHaveURL`, `assert_text → toBeVisible/toHaveText`. Locator chọn từ `target` theo thứ tự role+name, label, placeholder, text, css.
8. Chạy thử trên `features/staging` với một test case tự viết, trong Claude Code, xem `ai-run/<id>.json` có đủ trường.

## Todo

- [x] `redact.ts` cộng test
- [x] `ai-run-store.ts`
- [x] `record-step.ts` cộng test với agent-browser giả
- [x] `fill-secret.ts`
- [x] `run-start.ts`, `run-finish.ts`
- [x] Skill `gen-testcases`
- [x] Skill `run-testcase` cộng recipes
- [x] Skill `to-playwright` cộng conversion reference
- [x] Cập nhật `CLAUDE.md`
- [ ] Chạy thử trên `staging` trong Claude Code

## Verification

- `npm test` xanh, gồm test `record-step` với agent-browser giả.
- Trong Claude Code: `/gen-testcases staging` tạo `testcases.json` hợp lệ theo `schemas.ts`.
- Đổi một test case sang `reviewed` trên UI, chạy `/run-testcase staging <id>`: `ai-run/<id>.json` có mọi step kèm `target.role` và `target.name`, ảnh mỗi step, `ai-run/<id>.md` theo mẫu.
- Thêm một `.env` giả với `USER_PASSWORD=abc123xyz` và kiểm tra `grep -r abc123xyz evidence/ tests/` không có kết quả.
- `/to-playwright staging <id>` sau khi xác nhận bằng tay trong JSON: spec sinh ra chạy pass với `FEATURE=staging npx playwright test tests/staging/<id>.spec.ts`.

## Success Criteria

Một vòng use case → test case → AI chạy thử → spec pass chạy được trên `staging` bằng ba skill. History đủ thuộc tính để sinh locator không cần xpath.
