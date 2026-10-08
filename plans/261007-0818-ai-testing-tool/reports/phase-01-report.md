# Báo cáo Phase 1: Nền tảng và schema

Trạng thái: xong, trừ bước 7 (spike phiên trên staging) đang chờ tester.

## Việc đã làm

- Khung project: `package.json` (type module, scripts `start`, `cli`, `typecheck`, `test`), `tsconfig.json`, `.editorconfig`. Cài `zod`, `@playwright/test`, `playwright`, `typescript`, `tsx`, `@types/node`.
- `tool/core/paths.ts`: đường dẫn, `EVIDENCE_ROOT`, tên đợt `_r2`, `_r3`, `createRunDir` dùng mkdir không đệ quy nên không bao giờ trả về thư mục có sẵn, `SENSITIVE_PATHS`, `isSensitivePath`, kiểm tra tên tính năng (chặn `../`).
- `tool/core/schemas.ts`: zod cho `feature.json`, `testcases.json`, `ai-run/<id>.json`, `metrics.json`, frontmatter `summary.md` (chọn dùng frontmatter).
- `tool/core/feature-store.ts`, `tool/core/login.ts`, `tool/cli.ts` (lệnh `login`, `check-session`, `evidence-dir`, `help`, `start` báo chưa có), `tool/cli/check-session.ts`.
- `playwright.config.ts`, `CLAUDE.md`, `features/staging/*`, `docs/README.md`, `docs/schemas.md`.
- `plans/.../reports/session-compat.md` ở trạng thái chờ tester, kèm ba lệnh kiểm tra và chỗ điền kết quả.

## Lệnh đã chạy và kết quả

| Lệnh | Kết quả |
| --- | --- |
| `npm install`, `npx playwright install chromium` | Thành công |
| `npm run typecheck` | Sạch |
| `npm test` | 27 test, 27 pass |
| `npx playwright test --list` (không đặt FEATURE) | In lỗi rõ, thoát mã 1 |
| `FEATURE=staging npx playwright test --list` (chưa có auth) | Cảnh báo, liệt kê 1 test, mã 0 |
| `FEATURE=../x npx playwright test --list` | Từ chối tên, mã 1 |
| `login --feature tmpcheck --wait-flag` (feature tạm, baseURL example.com) | Browser mở, tạo `auth/tmpcheck.save` thì lưu `auth/tmpcheck.json` (quyền 600) và `.meta.json`, process thoát, không còn Chromium |
| `login` và Enter trên stdin | Lưu phiên, `saved_at` có múi giờ `+07:00` |
| `check-session --url https://example.com/` | ĐẠT, mã 0. URL khác origin bị từ chối |
| `FEATURE=tmpcheck npx playwright test` với storageState vừa lưu | 1 passed |

Feature, spec, `auth/` và `evidence/` tạm đã xóa sau khi thử. Chỉ thử với trang công khai, chưa có cookie đăng nhập thật nên chưa chứng minh được tiêu chí "nạp được ở ba nơi". Bước đó nằm ở spike.

## Lệch so với kế hoạch

- Thêm `tests/staging/session-check.spec.ts`. Kiểm tra thứ ba của spike cần một spec kiểm tra URL, mà phase không liệt kê file này.
- `npm start` trỏ tới `cli start`, hiện báo "chưa có, Phase 2" và thoát mã 1, để không có script gãy.
- Không dùng `dotenv`: `playwright.config.ts` dùng `process.loadEnvFile` của Node 26.
- Spike (bước 7) chưa làm, theo chỉ đạo. Mục Todo "Spike phiên" chưa đánh dấu.
- Chưa có `.gitignore` và chưa dùng git, theo quyết định validation. `auth/` và `evidence/` không được bảo vệ khỏi việc copy nhầm cho đến khi có cơ chế khác.

## Lưu ý

- Playwright `--list` vẫn tạo thư mục đợt rỗng chứa `playwright-report` (reporter html). Lần chạy thật sau đó cùng ngày sẽ nhận `_r2`. Ảnh hưởng nhỏ, không ghi đè gì.
- Chưa kiểm tra với cookie đăng nhập thật, OTP: xem `session-compat.md`.
