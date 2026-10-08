---
title: "Cook tool AI testing: 6 phase và sửa code review"
date: 2026-10-07
summary: "Sáu phase giao cho Sonnet 5.5, review tìm 21 phát hiện, đã sửa lỗi Cao và 8 lỗi Trung bình, 170 test xanh"
---

# Cook tool AI testing: 6 phase và sửa code review

## What happened

Chạy `/ak:cook plans/261007-0818-ai-testing-tool/plan.md`, mỗi phase giao một subagent Sonnet 5.5, kiểm chứng (typecheck, test nhiều lần) trước khi giao phase sau.

- Phase 1: khung Node, schema zod, `login`, `playwright.config.ts`, `CLAUDE.md`. 27 test.
- Phase 2: server Express cổng 4173, bốn trang HTML thuần, SSE, đăng nhập bằng file cờ. Test flaky 1/5.
- Phase 3: `run-start`, `record-step`, `fill-secret`, `run-finish`, ba skill. Nguyên nhân flaky là lỗi thật: chokidar mất sự kiện khi `evidence/` chưa tồn tại lúc khởi động. `record-step` tự thực hiện action vì ref cũ hết hạn sau click chuyển trang.
- Phase 4: duyệt kết quả AI, chạy spec và regression từ UI. Trace đổi sang `retain-on-failure`.
- Phase 5: `capture`, `compare` bằng pixelmatch, khu UI diff, skill `ui-check`, baseline.
- Phase 6: skill `heal-locator`, `apply-diff.ts`, tài liệu tester. Pilot chờ D5.

Code review (Sonnet 5.5) tìm 21 phát hiện. Lỗi Cao: quyết định cũ của tester vẫn mở khóa baseline sau khi `report.md` đổi. Trung bình gồm stdout chưa che, AI chạy Playwright bỏ qua che credential, tiến trình mồ côi khi SIGHUP, kiểm tra diff healing lỏng, `--update-snapshots` ghi đè baseline màn khác, tên feature `_rN` va chạm tên đợt, ghi `ai-run` không khóa.

## Decision

Sửa mọi lỗi rõ ràng kèm test. Giữ lại ba mục chờ quyết định sản phẩm: che ảnh ô không phải mật khẩu, chính sách report và trace có credential, chặn baseline khi còn dòng "bug".

Kết quả: typecheck sạch, 170 test xanh nhiều lần, cổng trống, không tiến trình mồ côi.

## Next steps

- Tester: baseURL và tài khoản staging có OTP, chạy ba lệnh trong `reports/session-compat.md`.
- Chạy năm skill trong Claude Code trên staging.
- Kiểm M3 và M6 với Playwright thật.
- D5 đưa use case để pilot Phase 6.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
