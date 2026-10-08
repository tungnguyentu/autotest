# Báo cáo Phase 2: Server và UI lõi

Trạng thái: xong. `npm run typecheck` sạch, `npm test` 53/53 pass (27 test cũ cộng 26 test mới).

## Việc đã làm

- `tool/server.ts`: Express 5, cổng 4173, chỉ bind `127.0.0.1`. Cổng bận thì in kết quả `lsof -nP -i :4173` và thoát mã 1. `startServer({root, port, env, spawnLogin})` nhận gốc project và cổng qua tham số nên test chạy được trên cổng 0 với thư mục tạm. Tắt server (SIGINT hoặc SIGTERM) đóng SSE, watcher và dừng nhóm tiến trình login còn mở.
- Chặn request có Host không phải localhost và request ghi có Origin lạ (API ghi file và spawn tiến trình). Static chỉ phục vụ `tool/ui/`, không phục vụ project root.
- `tool/api/` có sáu file.
  - `features.ts`: list, tạo, GET, PUT và `overview` gộp dữ liệu cho UI.
  - `usecases.ts`: tải Markdown lên, không ghi đè.
  - `testcases.ts`: GET, PUT, PATCH.
  - `auth.ts`: start, save, trạng thái.
  - `runs.ts`: liệt kê, tạo, chi tiết, sinh và sửa summary.
  - `http.ts`: lỗi và kiểu `ToolContext`.
- `tool/core/watcher.ts`: chokidar 4 trên `features/`, evidence root, `tests/`, `auth/`. Debounce 300ms. Chỉ phát `{path, type}`. Bỏ `node_modules`, `.env`, `*.tmp`. Thư mục chưa tồn tại lúc khởi động (ví dụ `evidence/`) vẫn được theo dõi khi tạo sau, có test.
- `tool/core/summary.ts`: sinh `summary.md` theo mẫu "Tổng kết đợt", frontmatter đúng schema, giữ "Kết luận của tester" và các trường tester, build, environment khi sinh lại. Lỗi đọc file trong đợt vào mục "Vấn đề kỹ thuật" thay vì làm hỏng việc sinh.
- UI: `index.html`, `feature.html`, `testcases.html`, `run.html`, `app.js`, `next-step.js`, `style.css`. Không framework, không CDN, mọi nội dung từ API vào DOM bằng `textContent`. Mọi nút ghi khóa trong lúc chạy và báo kết quả ở dòng trạng thái.
- Hai sửa kế thừa: `npm start` chạy `tsx tool/server.ts` (lệnh `cli start` cũng gọi cùng hàm). `playwright.config.ts` dùng reporter `list` khi có `--list`, nên không còn tạo thư mục đợt rỗng.
- `feature-store.ts`: thêm `writeTextAtomic`, `writeJsonAtomic` dùng lại nó.
- Phụ thuộc mới: `express@5`, `chokidar@4`, `@types/express`.
- Docs: `docs/README.md` có mục "Chạy tool", `docs/schemas.md` ghi rõ giá trị frontmatter là chuỗi trong nháy kép.

## Lệnh đã chạy và kết quả

| Lệnh | Kết quả |
| --- | --- |
| `npm run typecheck` | Sạch |
| `npm test` | 53 test, 53 pass. Không còn tiến trình mồ côi sau test |
| `npm start` rồi `curl http://localhost:4173/` | 200 |
| `curl /api/features` | JSON có tính năng `staging` |
| `npm start` lần hai khi server đang chạy | In chủ cổng (PID 83450), mã thoát 1, không mở cổng khác |
| `POST /api/features` (tạo `tmpcheck`) | 201, `features/tmpcheck/feature.json` đọc lại qua `readFeature` đúng schema. Đã xóa |
| Ghi tay `testcases.json` khi `curl -N /events` | Nhận `event: change` với `{"path":"features/tmpcheck/testcases.json","type":"add"}` |
| Login thật qua API (`login/start`, chờ, `login/save`) với baseURL example.com | Browser mở, tạo cờ thì lưu `auth/tmpcheck.json` (quyền 600) và `.meta.json`, tiến trình thoát, `GET /login` trả `saved_at` và `final_url` |
| `login/start` rồi SIGTERM server | Chromium, npm, tsx đều dừng, cổng 4173 được giải phóng |
| Playwright headless duyệt cả bốn trang ở 1280x800 | Không lỗi console. Tải use case, duyệt draft thành reviewed, sửa steps, hiện phiên, tạo đợt, lưu kết luận, sinh lại giữ kết luận. Sửa tay `testcases.json` thì UI cập nhật sau 308ms |
| `FEATURE=staging npx playwright test --list` | Liệt kê 1 test, không tạo `evidence/` |

Đã dọn: feature `tmpcheck`, `auth/`, `evidence/`, script kiểm tra tạm. Không còn tiến trình do tôi mở.

## Lệch so với kế hoạch và lý do

- Thêm `tool/api/http.ts` (lỗi, `ToolContext`) và `tool/api/__tests__/helpers.ts`, `server.test.ts`: dùng chung giữa các router và test, không đặt trong từng file được.
- Thêm `GET /api/features/:f/overview`: một lời gọi cho ô "Bước tiếp theo" và các khu của trang tính năng, tránh bốn lần gọi riêng.
- PATCH nhận cả trường nội dung, không chỉ status. Trường nội dung gồm steps, expected, priority, type, title và ghi chú. Nhờ vậy UI sửa từng test case mà không ghi đè cả mảng khi Claude Code đang sửa file. PUT cả danh sách vẫn có, với cùng luật. Test case có sẵn chỉ đổi giữa `draft` và `reviewed`. Test case mới phải là `draft`. Không xóa được test case ở trạng thái khác.
- Tải use case dùng JSON `{name, content}` (UI đọc file bằng `File.text()`), không dùng multipart, để khỏi thêm `multer`. Use case trùng tên bị từ chối (409), không ghi đè.
- Phiên đăng nhập chỉ lấy từ `.meta.json`. "Có phiên" trên UI nghĩa là có file meta, không kiểm tra file `auth/<f>.json`.
- Bước "Bấm Mở browser trong UI" được thử qua API. Các trang được duyệt bằng Chromium headless. Tôi không bấm tay trên browser thật vì cần OTP thật. Chưa có kiểm tra với staging.
- `wait_for` của screen không có ô sửa trên form (giữ nguyên khi lưu), vì phase không yêu cầu. Muốn sửa thì sửa `feature.json` bằng tay.
- Test của `paths.ts` giữ nguyên. Việc "tạo lười" nằm ở `playwright.config.ts` (đã có sẵn `nextRunDir` không tạo thư mục), nên không cần đổi `paths.ts`.

## Lưu ý cho Phase 4 và 5 (chỗ nối trên `run.html`)

- `run.html` có ba `<section class="slot" data-slot="ai-run|playwright|ui-diff">`. Phase sau thêm file JS và đăng ký `window.runSlots["ai-run"] = (container, run, ctx) => ...`. `container` là `.slot-body`, `run` là kết quả `GET /api/features/:f/runs/:run`, `ctx` là `{feature, run}`. Hàm được gọi lại mỗi lần SSE báo file trong `evidence/` đổi. Cần thêm thẻ `<script>` vào `run.html` (file này chưa có chỗ chèn riêng, thêm trước script chính).
- `GET /runs/:run` đã trả `ai_runs` (id, verdict, decision), `ui_diff_screens`, `has_playwright_report`, `problems`. Phase 4 cần thêm endpoint đọc `ai-run/<id>.json` đầy đủ và ảnh. Chưa có route phục vụ file trong đợt (ảnh, report HTML): thêm có kiểm tra đường dẫn nằm trong thư mục đợt.
- `summary.ts`: `testCaseRows()` và `uiCheckRows()` là hai chỗ mở rộng. Hiện cột "Số sai khác (Cao/TB/Thấp)" ghi "chưa phân loại (n vùng pixel khác, diff_ratio x%)". Phase 5 thay bằng số đếm từ `report.md`. `loadRunData()` đã đọc `ai-run/*.json` và `ui-diff/*/metrics.json`.
- PATCH/PUT test case đang chặn mọi trạng thái ngoài `draft` và `reviewed` (409). Phase 4 cần thêm đường đổi sang `ai-passed`, `ai-failed` và `automated`. Nên dùng endpoint riêng gắn với quyết định của tester. Đừng nới PATCH này.
- `next-step.js` kết thúc bằng "chưa hỗ trợ" khi mọi test case reviewed đã có ai-run. Phase 4 thêm các nhánh duyệt kết quả AI và `/to-playwright`.
- Lệnh `/gen-testcases` và `/run-testcase` trong ô "Bước tiếp theo" là tên skill theo kế hoạch Phase 3, chưa tồn tại. Nếu Phase 3 đặt tên khác thì sửa trong `next-step.js`.

## Việc chưa làm

- Chưa kiểm tra bằng cookie thật và OTP trên staging (vẫn chờ spike Phase 1 bước 7).
- Không có kiểm thử tự động cho phần JavaScript của UI. Đã duyệt thử một lần bằng Playwright headless. Script không được giữ lại.

Status: DONE_WITH_CONCERNS
Summary: Server, API, SSE, đăng nhập bằng file cờ, `summary.md` và bốn trang UI đã chạy thật. Typecheck sạch, 53 test pass, cổng bận được xử lý đúng, `--list` không còn tạo thư mục đợt rỗng.
Concerns/Blockers: Chưa thử đăng nhập trên staging thật (cần OTP, thuộc spike Phase 1). Tên lệnh `/gen-testcases`, `/run-testcase` trong ô "Bước tiếp theo" phụ thuộc Phase 3 đặt đúng tên.
