# Báo cáo Phase 5: So Figma và skill ui-check

Trạng thái: xong, trừ kiểm chứng `/ui-check` trong Claude Code (chờ tester). `npm run typecheck` sạch. `npm test` 125/125 pass, chạy xanh 3 lần liên tiếp (100 test cũ cộng 25 test mới).

## Việc đã làm

- `tool/cli/capture.ts` (chuyển từ `capture.py`): viewport của feature, `deviceScaleFactor` 1, `storageState` khi `auth`, `networkidle` 45 giây, `document.fonts.ready`, `wait_for`, `mask_boxes`, `animations: "disabled"`, `caret: "hide"`. Thiếu Figma, thiếu phiên, chuyển hướng, lỗi chụp đều thành cảnh báo trong `meta.json`. Chụp lại thì xóa kết quả dẫn xuất cũ (actual, figma, diff, side_by_side, metrics, crops), giữ `report.md`, `decisions.json`, `baseline.json`.
- `tool/cli/compare.ts` (từ `compare.py`): `pngjs` cộng `pixelmatch` 8. `diffMask` cho mask diff, `ignoreMask` cho mask box. `downscale` thủ công (trung bình ô). `findRegions` chuyển nguyên thuật toán lưới 8 hướng. Vẽ `diff.png` (xám mờ, pixel đỏ, khung đánh số), `side_by_side.png`, `crops/region_NN.png`, `metrics.json`. Meta warnings được chép vào `metrics.warnings`.
- Lệnh `capture` và `compare` trong `tool/cli.ts`, có HELP.
- `tool/core/ui-diff-store.ts`, `tool/api/ui-diff.ts`, mount trong `server.ts`. Job chụp và so chạy trong tiến trình server, một job mỗi lúc (409 khi bận), tiến độ qua SSE event `ui-diff`. Server đóng thì hủy job và đóng Chromium.
- Baseline: `POST /api/runs/:run/ui-diff/:screen/baseline` gọi thẳng `runner.start({extraArgs: ["--update-snapshots"], onFinish})`. Không mở `extraArgs` trên `POST playwright/run`. Exit 0 và ảnh đã có thì ghi `baseline.json`.
- UI: `ui-diff-viewer.js`, `run.html`, `style.css`, `next-step.js` (các trạng thái mới), `features.ts` overview thêm `ui_diff`.
- Skill `.claude/skills/ui-check/SKILL.md` (76 dòng) và `references/checklist.md`.
- `summary.ts`: `uiCheckRows()` đếm Cao/TB/Thấp từ `report.md`, hoặc "chưa đánh giá", hoặc "chưa so được". Screen không so được cũng vào bảng.
- Docs: `docs/README.md` (khu UI diff, lệnh, quy ước export Figma), `docs/schemas.md` (`meta.json`, `report.md`, `decisions.json`, `baseline.json`).
- Test mới: `compare.test.ts` (11), `ui-diff.test.ts` (7), `ui-diff-store.test.ts` (6), một test trong `summary.test.ts`. Sửa assertion cũ "chưa phân loại" thành "chưa đánh giá".
- Phụ thuộc mới: `pngjs`, `pixelmatch`, `@types/pngjs`.

## Chạy thật (example.com, feature tạm, đã xóa)

| Bước | Kết quả |
| --- | --- |
| `capture` CLI, chưa có Figma | `actual.png` và `meta.json` có cảnh báo thiếu Figma, mã thoát 0 |
| Sao `actual.png` thành `figma.png`, vẽ khối xanh 300x120 tại (200,400) và khối đỏ 80x40 tại (900,100) | |
| "Chụp và so" qua API (2 screen, một screen thiếu Figma) | `metrics.json` có 2 vùng: (192,400,320x128, 35448 px) và (896,96,96x48, 3200 px), đúng vị trí đã vẽ. Screen thiếu Figma: có `actual.png`, không so, cảnh báo hiện ở GET |
| Baseline khi chưa có spec và report | 409 kèm hai lý do. Có spec nhưng thiếu quyết định: 409 "còn 1 mục" |
| `report.md` viết tay (thay đầu ra skill), lưu quyết định đủ, gọi baseline | 202, `tests/__screenshots__/<tạm>/home.png` xuất hiện, `baseline.json` có `created_at`, `figma_modified`, `spec`, `screenshot` |
| Regression (không spec) | pass với baseline, exit 0 |
| UI bằng Chromium headless | Chọn screen, "Chụp và so", tiến độ, bảng quyết định, lưu, nút baseline khóa khi có thay đổi chưa lưu hoặc report cũ, 0 lỗi console |

Dọn dẹp: đã xóa `features/<tạm>`, `evidence/`, `tests/<tạm>/`, `tests/__screenshots__/`. Cổng 4173 trống (`lsof` không in gì).

## Lệch so với kế hoạch

- `schemas.ts` (thêm `MetaSchema`, `DecisionsSchema`, `BaselineSchema`), `server.ts`, `features.ts`, `summary.ts`, `helpers.ts` và `fake-playwright.mjs` cùng test được sửa dù không nằm trong danh sách file của phase.
- `pixelmatch` bỏ qua pixel chống răng cưa, thay cho làm mờ Gaussian của bản Python, nên không tương đương 1:1. `--threshold` 0-255 đổi thành `threshold/255` (khoảng cách OKLab), công thức ghi trong code và docs.
- Số trên `diff.png` vẽ bằng font bitmap chữ số 3x5 tự viết.
- Bare `--update-snapshots` của Playwright 1.63 vẫn tạo ảnh còn thiếu và test pass (kiểm chứng thật), nên không cần cờ khác.
- Chọn: mọi giá trị quyết định (kể cả "cần xem" và "bug") đều tính là đã quyết định để mở baseline. UI nhắc khi có mục bug. Nếu muốn chặt hơn (chặn khi còn "cần xem" hoặc "bug") chỉ cần sửa `baselineBlockers`.
- Thêm điều kiện: `report.md` cũ hơn `metrics.json` thì chặn baseline.
- Baseline ghi đè `playwright-log.txt` và `playwright-last.json` của đợt, vì dùng chung runner.
- Cột người duyệt `tester` lấy từ frontmatter `summary.md`, rỗng nếu chưa điền.
- Next-step: bước UI diff chỉ xuất hiện sau chuỗi test case và Playwright, và chỉ với screen đã có ảnh Figma.

## Chưa làm hoặc chờ tester

- `/ui-check` trong Claude Code: chưa chạy được ở đây, chờ tester. Chỉ kiểm tra bảng sai khác bằng `report.md` viết tay theo đúng mẫu.
- Chưa thử trên staging có OTP. Chưa có test tự động cho JavaScript của UI (duyệt tay một lần bằng Chromium headless, script không giữ lại).

## Lưu ý cho Phase 6

- Healing đọc `<đợt>/playwright-log.txt` và `<đợt>/playwright-results.json`; đường dẫn lấy qua `logFile()` và `resultsFile()` trong `tool/core/playwright-runner.ts`. Tóm tắt từng test ở `playwright-last.json` (`readLast()`). Thư mục đợt đúng là đợt đã truyền cho `playwright/run`.
- Lần chạy baseline ghi đè các file trên của đợt, nên healing nên đọc ngay sau lần chạy cần phân tích.
- `runner.start` nhận `onFinish(last)` nếu cần hành động sau khi chạy xong.

Status: DONE_WITH_CONCERNS
Summary: Phase 5 xong và đã chạy thật trên example.com, từ chụp, so, quyết định đến baseline và regression pass. Typecheck sạch, 125 test xanh 3 lần liên tiếp.
Concerns/Blockers: Skill `ui-check` chưa chạy được trong Claude Code, chờ tester. Thang `threshold` và việc bỏ làm mờ Gaussian khiến kết quả không giống hệt bản Python. Luật "mọi quyết định đều mở baseline" có thể cần siết lại.
