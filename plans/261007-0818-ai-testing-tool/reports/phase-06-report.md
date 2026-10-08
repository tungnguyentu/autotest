# Báo cáo Phase 6: Healing và tài liệu (phần không cần dữ liệu tester)

Trạng thái: xong phần làm được trên máy này. Ba việc pilot (tính năng và dữ liệu D5, vòng đầy đủ và số đo, báo cáo pilot) chưa làm, chờ use case và tài khoản staging. `npm run typecheck` sạch, `npm test` 141/141 pass (125 test cũ cộng 16 test mới), xanh 3 lần liên tiếp.

## Việc đã làm

- `tool/core/apply-diff.ts`: `parseUnifiedDiff`, `applyUnifiedDiff` (khớp chính xác dòng ngữ cảnh và dòng xóa, chịu lệch số dòng khi khối khớp duy nhất, giữ CRLF và dòng cuối, lỗi thì không trả kết quả một phần), `checkLocatorOnly` (từ chối `expect(`, `waitForTimeout`, `test.skip/fixme/fail`, dòng đổi không chứa locator, xóa dòng `await` mà không thêm `await` thay thế, số dòng xóa khác số dòng thêm). Không dùng `git` hay `patch`.
- `tool/api/heal.ts`, mount trong `server.ts`: `GET /api/runs/:run/heal/:id` (diff, reason, problems, has_backup) và `POST .../apply` (kiểm tra, sao lưu `.bak`, áp diff, chạy lại qua runner, trả `last` và `passed`). Playwright đang chạy thì 409 trước khi đụng spec. Nếu runner không khởi động được thì spec được trả về nguyên trạng.
- UI: `tool/ui/heal-panel.js` bọc `window.runSlots.playwright` (nạp sau `playwright-panel.js`), thẻ `<script>` trong `run.html`, `.card` trong `style.css`. Mỗi spec fail hiện lệnh `/heal-locator` để copy, lý do, diff tô màu, nút "Áp dụng và chạy lại" (có hộp xác nhận, ẩn khi diff vi phạm và hiện lý do). `next-step.js`: spec fail thì nhắc phân loại và kèm lệnh `/heal-locator`.
- Skill `.claude/skills/heal-locator/SKILL.md` (133 dòng). Tạo diff bằng `diff -u -U2` trên bản sao để số dòng hunk luôn đúng, thay vì viết tay.
- Tài liệu: `docs/tester-guide.md` (161 dòng), `docs/skills.md` (63 dòng), cập nhật `docs/README.md` (mục lục, bảng skill, mục API healing), `docs/schemas.md` (file `heal/`), `CLAUDE.md` (mục Healing).
- Test mới: `tool/core/__tests__/apply-diff.test.ts` (12), `tool/api/__tests__/heal.test.ts` (4).

## Thử healing thật (feature tạm `healtmp`, baseURL example.com)

1. Spec `getByRole('link', { name: 'Learn more' })` chạy qua API: pass.
2. Sửa locator thành `Learn moar`, chạy qua API: fail sau 30 giây, log có `waiting for getByRole('link', { name: 'Learn moar' })` và dòng `>` trỏ đúng dòng 5.
3. `agent-browser snapshot -i` trên example.com thấy `link "Learn more"`. Tạo `heal/TC_HEAL_001.diff` bằng đúng quy trình trong skill (`diff -u -U2`) và viết tay `.md`. Diff chỉ có một dòng `-` và một dòng `+`.
4. Diff khác chạm `expect(`: `POST apply` trả 409 "Hunk 1 chạm vào expect(...", spec nguyên vẹn (so bằng `cmp`), không có `.bak`.
5. Diff đúng: `POST apply` trả 200, `passed: true`, spec đổi thành `Learn more`, `.bak` tồn tại và giống hệt bản cũ.
6. Áp lần hai: 409 vì diff không còn khớp.
7. Duyệt trang đợt bằng Chromium headless khi spec fail và có diff: khu "Sửa locator" hiện lệnh, lý do, diff, không có lỗi console.
8. Dọn: đã xóa `features/healtmp`, `tests/healtmp`, `evidence/2026-10-07_healtmp`. Server dừng, cổng 4173 trống, không còn tiến trình `tool/server.ts` hay Chromium.

## Lệch so với kế hoạch

- Skill chưa chạy trong Claude Code. Phần mô phỏng: `.diff` và `.md` do tôi làm tay theo đúng các bước của skill (agent-browser và `diff -u` chạy thật). Việc AI tự phân tích log và chọn locator chưa được kiểm chứng.
- `apply` chờ lần chạy lại xong rồi mới trả lời (có thể vài chục giây khi spec fail), thay vì trả 202. UI khóa nút trong lúc chờ.
- Lỗi nằm trong `expect(page.getByRole(...))` bị từ chối, vì luật cấm đụng `expect(`. Skill hướng dẫn ghi `.md` và dừng.
- `checkLocatorOnly` chặt hơn mô tả của phase: ngoài `expect(` và xóa `await`, còn chặn thêm bớt dòng và dòng không có locator. Nếu quá chặt với thực tế thì nới trong một hằng (`LOCATOR_TOKEN`).
- Diff dùng số hunk khai báo, sai số dòng thì bị từ chối (đó là lý do skill dùng `diff -u`).
- Một lần thử đầu của tôi gõ sai (header zsh không tách từ nên tạo `evidence/2026-10-07_healtmp` cho feature chưa tồn tại). Phát hiện: `POST /api/features/:f/runs` và `playwright/run` không kiểm tra tính năng có tồn tại. Không sửa vì ngoài phạm vi. Đã xóa thư mục thừa.
- Chưa có test tự động cho JavaScript của UI (như các phase trước).
- `ak plan` chưa dùng, trạng thái phase trong `plan.md` giữ nguyên.

## Success Criteria của plan.md

Đã đánh dấu: "docs/ có hướng dẫn tester, schema file, và quy trình từng bước". Để trống: 11 tiêu chí (các mục 4, 5, 6, 7 cần staging thật và Claude Code), vòng đầy đủ trên pilot, và "không có credential" (đã có test che credential, chưa kiểm tra với credential thật).

## Còn chờ tester (gom từ cả sáu phase)

Điều kiện chung: baseURL staging, đường dẫn các screen, tài khoản có OTP, use case D5, ảnh Figma export.

1. Chuẩn bị (Phase 1, 2): sửa `features/staging/feature.json` (baseURL, `screens`), rồi `npm run cli -- login --feature staging` (đăng nhập tay, bấm Enter). Có thể bấm "Mở browser" và "Lưu phiên" trên UI để thử luôn đường UI với cookie và OTP thật.
2. Spike phiên (Phase 1, `reports/session-compat.md`), ba lệnh, điền kết quả vào file:
   - `agent-browser --session spike --state auth/staging.json open "<URL đã đăng nhập>"`, rồi `get url`, `close`
   - `npm run cli -- check-session --feature staging --url "<URL đã đăng nhập>"`
   - `FEATURE=staging npx playwright test`
3. Skill trong Claude Code (Phase 3, chưa chạy lần nào):
   - `/gen-testcases staging`, duyệt trên UI
   - `/run-testcase staging <id>`, xác nhận trên UI. Kiểm tra credential không lọt vào transcript, `ai-run`, spec (Phase 3 đã để trống mục này)
   - `/to-playwright staging <id>` với `ai-run` thật (Phase 3 và 4)
4. So Figma (Phase 5): đặt `features/staging/figma/<screen>.png` (1x, đúng chiều rộng viewport), bấm "Chụp và so", rồi `/ui-check staging <screen>` trong Claude Code, quyết định từng dòng, "Cho tạo baseline" (cần spec có `toHaveScreenshot('<screen>.png')`).
5. Healing (Phase 6): khi có spec fail thật hoặc cố ý làm sai một locator, chạy `/heal-locator staging <id>` trong Claude Code, xem diff trên UI, bấm "Áp dụng và chạy lại". Xác nhận skill tự ghi đúng `heal/<id>.diff` và `.md`, và `diff` chỉ chạm dòng locator.
6. Pilot (Phase 6, ba Todo chưa đánh dấu): nhận use case D5, chạy cả vòng, điền `reports/pilot-template.md` (đổi tên thành `reports/pilot-<feature>.md`), ghi năm số đo vào `summary.md`, chạy regression pass hai lần liên tiếp trên máy tester.
7. Tài liệu: một tester chưa tham gia dự án đọc `docs/tester-guide.md` và làm theo từ đầu, ghi chỗ vướng vào mục "Chỗ khó hiểu trong tài liệu" của báo cáo pilot, rồi sửa tài liệu.
8. Khác: luật "mọi quyết định đều mở baseline" (Phase 5) có thể cần siết, sửa ở `baselineBlockers`. Bản nội dung `pixelmatch` khác bản Python một chút (Phase 5), nên xem vài ảnh diff thật.

Status: DONE_WITH_CONCERNS
Summary: Skill heal-locator, API và UI healing, `apply-diff.ts`, hai tài liệu cho tester đã xong, thử healing thật trên example.com chạy đúng (từ chối diff chạm `expect(`, áp diff đúng thì spec pass lại và có `.bak`). Typecheck sạch, 141 test xanh 3 lần.
Concerns/Blockers: Skill heal-locator chưa chạy trong Claude Code, ba Todo pilot chờ use case D5 và staging, tài liệu chưa có tester ngoài dự án đọc thử.
