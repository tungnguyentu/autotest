# Tài liệu Tool AI Testing

Tool chạy trên máy tester. Phần không cần AI nằm trong tool Node. Phần cần AI chạy trong Claude Code.
Hai phần dùng chung một bộ file trên disk.

## Mục lục

- [tester-guide.md](./tester-guide.md): hướng dẫn từ đầu đến cuối cho tester, không cần đọc code.
- [skills.md](./skills.md): năm skill, lệnh, đầu vào, đầu ra, điều cấm.
- [schemas.md](./schemas.md): mô tả từng trường của mọi file tool và skill dùng chung.

Chạy tool: xem mục [Chạy tool](#chạy-tool).

## Cài đặt

```bash
npm install
npx playwright install chromium
```

Cần Node 26 trở lên. Không cần Python.

## Chạy tool

```bash
npm install
npx playwright install chromium
npm start
```

Mở http://localhost:4173. Tool chỉ nhận kết nối từ chính máy này và chạy offline, không tải gì từ internet. Bấm Ctrl+C để dừng. Dừng tool cũng đóng cửa sổ đăng nhập đang mở.

Cổng cố định là 4173. Nếu cổng bận, `npm start` in tiến trình đang giữ cổng (kết quả của `lsof -i :4173`) rồi thoát với mã 1. Tool không tự đổi sang cổng khác. Dừng tiến trình cũ rồi chạy lại.

| Trang | Việc làm |
| --- | --- |
| `/` (Trang chủ) | Bảng tính năng: số test case theo trạng thái, phiên đăng nhập, đợt gần nhất. Nút "Tạo tính năng" |
| `/feature.html?f=<f>` | Sửa `feature.json` (service, baseURL, viewport, screens). Tải use case `.md` lên. Mở browser để đăng nhập tay rồi bấm "Lưu phiên". Danh sách đợt và nút "Tạo đợt mới" |
| `/testcases.html?f=<f>` | Xem, sửa test case. Duyệt `draft` thành `reviewed` hoặc trả về `draft`. Các trạng thái khác do bước chạy thử và chuyển spec đặt, UI không đổi được |
| `/run.html?f=<f>&run=<đợt>` | Tổng quan đợt, xem và sửa `summary.md` (mục "Kết luận của tester" do tester điền), sinh lại `summary.md`. Ba khu bên dưới: "AI chạy thử", "Playwright" và "So UI với Figma" |

Khu "AI chạy thử" trên trang đợt: mỗi `ai-run/<id>.json` hiện bảng step (số, action, target, value đã che, URL sau, ảnh thu nhỏ, bấm để xem lớn), bảng kết quả từng mong đợi, nội dung `ai-run/<id>.md`. Tester bấm "Xác nhận" hoặc "Từ chối" kèm ghi chú. Tool ghi `tester` vào `ai-run/<id>.json` và đổi status test case thành `ai-passed` hoặc `ai-failed`. Ô "Nghi bug" thêm một mục vào `<đợt>/bugs.md`. Chỉ test case `reviewed`, `ai-passed`, `ai-failed` đổi được quyết định.

Khu "Playwright": nút "Chạy spec" cho từng test case có `tests/<f>/<id>.spec.ts`, nút "Regression" (chạy cả `tests/<f>/`), nút "Dừng" (SIGTERM, sau 5 giây thì SIGKILL). Mỗi lúc chỉ một tiến trình, bấm chạy thêm báo lỗi 409. Log hiện trực tiếp (500 dòng cuối) và lưu ở `<đợt>/playwright-log.txt`, giá trị trong `features/<f>/.env` bị che. Kết quả gần nhất ở `<đợt>/playwright-last.json`, report HTML hiện trong iframe (`/report/<đợt>/`), trace hiện dạng lệnh `npx playwright show-trace <đường dẫn>` để copy và chạy trong terminal (tool chỉ giữ trace của test fail). Nút "Đưa vào regression" (`ai-passed` thành `automated`) chỉ hiện khi spec đã pass trong lần chạy gần nhất của đợt và spec chưa bị sửa sau đó.

Khu "So UI với Figma" (quy ước ảnh Figma và cách đọc kết quả ở mục [So UI với Figma](#so-ui-với-figma)): tick screen, bấm "Chụp và so", xem `side_by_side`, danh sách vùng kèm crop, bảng "Sai khác đề xuất" lấy từ `report.md`, chọn bug, chấp nhận hoặc cần xem cho từng dòng rồi bấm "Lưu quyết định", và bấm "Cho tạo baseline" khi đủ điều kiện.

Mỗi trang có ô "Bước tiếp theo". Khi bước đó cần AI, ô kèm lệnh để copy vào Claude Code, ví dụ `/gen-testcases <f>`.

Trang tự cập nhật khi file trên disk đổi (server theo dõi `features/`, `evidence/`, `tests/`, `auth/` và báo qua `/events`). Server chỉ báo đường dẫn và loại thay đổi, không gửi nội dung file, và không bao giờ trả nội dung `features/*/.env` hay `auth/<f>.json` qua API.

Khi khởi động, server tạo sẵn các thư mục gốc rỗng `features/`, `evidence/`, `tests/`, `auth/` nếu chưa có để theo dõi file đáng tin cậy. Thư mục đợt chỉ được tạo khi tester bấm "Tạo đợt mới" hoặc khi một lệnh thật sự ghi evidence. Lệnh `npx playwright test --list` không tạo thư mục.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `features/<feature>/feature.json` | Cấu hình tính năng: service, baseURL, viewport, screens |
| `features/<feature>/usecases/*.md` | Use case do tester D5 cung cấp. File Word tải lên qua UI: tool lưu `<tên>.docx` gốc, `<tên>.md` đã chuyển, ảnh ở `<tên>.images/` |
| `features/<feature>/testcases.json` | Test case |
| `features/<feature>/figma/<screen>.png` | Ảnh thiết kế tester export |
| `features/<feature>/.env` | Credential. Không in, không sao chép |
| `auth/<feature>.json` | Phiên đăng nhập do lệnh `login` lưu. Không in, không sao chép |
| `auth/<feature>.meta.json` | Thời điểm lưu phiên và URL cuối |
| `tests/<feature>/<id>.spec.ts` | Spec Playwright |
| `tests/__screenshots__/<feature>/` | Ảnh baseline của Playwright |
| `$EVIDENCE_ROOT/<YYYY-MM-DD>_<feature>[_rN]/` | Evidence của một đợt test. Mặc định `./evidence` |

Project chưa dùng git. Tool không sao chép và không in `features/*/.env` và `auth/`.

## Lệnh

Mọi lệnh chạy qua `npm run cli -- <lệnh>`.

| Lệnh | Việc làm |
| --- | --- |
| `login --feature <f> [--start /path] [--wait-flag]` | Mở Chromium có giao diện. Tester đăng nhập tay, rồi bấm Enter để lưu `auth/<f>.json`. Với `--wait-flag`, tạo file `auth/<f>.save` cũng lưu được |
| `check-session --feature <f> --url <url> [--headed]` | Nạp `auth/<f>.json` bằng Playwright, mở URL, báo phiên còn dùng được không. Mã thoát 0 là đạt, 2 là không đạt |
| `evidence-dir --feature <f>` | Tạo và in thư mục đợt mới. Cùng ngày thì thêm `_r2`, `_r3`. Không bao giờ dùng lại thư mục có sẵn |
| `run-start --feature <f> --id <TC> [--run-dir <d>] [--force]` | Mở một lượt AI chạy thử: chọn hoặc tạo thư mục đợt, tạo `ai-run/<id>.json` rỗng, in tên session `ui-check-<f>`. Từ chối test case chưa `reviewed` hoặc `manual` trừ khi có `--force` |
| `record-step --feature <f> --id <TC> --action <a> [--ref e5] [--value <v>] [--note <n>]` | Làm một thao tác trong agent-browser rồi ghi step (role, name, URL trước và sau, ảnh) vào `ai-run/<id>.json`, che credential. Xem `npm run cli -- help` cho các tùy chọn khác |
| `fill-secret --feature <f> --id <TC> --ref e3 --key <TÊN_BIẾN>` | Điền giá trị của `TÊN_BIẾN` trong `features/<f>/.env` vào element, ghi step với `<secret:TÊN_BIẾN>`. Không in giá trị |
| `run-finish --feature <f> --id <TC> --result-file <file.json>` | Ghi `ai_result` vào `ai-run/<id>.json` và đóng session agent-browser. Không đổi status test case |
| `capture --feature <f> --out <đợt>/ui-diff [--screen <key> ...] [--full-page] [--headed]` | Chụp các screen trong `feature.json` bằng Playwright (viewport của tính năng, `deviceScaleFactor` 1, phiên `auth/<f>.json` khi screen `auth`, chờ `networkidle` và font). Ghi `<screen>/actual.png`, `figma.png` (bản sao) và `meta.json`. Thiếu ảnh Figma, thiếu phiên hoặc bị chuyển hướng là cảnh báo trong `meta.json`. Mã thoát 2 nếu có screen không chụp được |
| `compare --dir <đợt>/ui-diff/<screen> [--scale <n>] [--threshold 20] [--cell 16] [--cell-ratio 0.03] [--max-regions 15] [--pad 16]` | So `figma.png` với `actual.png`, ghi `diff.png`, `side_by_side.png`, `crops/region_NN.png`, `metrics.json`. Nút "Chụp và so" trên UI chạy cùng hai bước này |
| `run-spec --feature <f> --id <TC> [--run-dir <d>]` | Chạy `tests/<f>/<TC>.spec.ts` qua runner của tool: log in ra đã che credential, `playwright-results.json` được che sau lần chạy, kết quả vào `<đợt>/playwright-last.json`. Mã thoát 0 là pass, 2 là fail. Skill dùng lệnh này thay cho `npx playwright test` |
| `validate-testcases --feature <f>` | Kiểm tra `testcases.json` theo schema, in thống kê và cảnh báo |
| `help` | In trợ giúp |

Bốn lệnh `run-start`, `record-step`, `fill-secret`, `run-finish` do skill `run-testcase` gọi. Chúng chạy `agent-browser` qua biến `AGENT_BROWSER_BIN` (mặc định `agent-browser`). Giá trị bắt đầu bằng dấu `-` viết dạng `--value=-abc`.

## Skill trong Claude Code

Skill nằm ở `.claude/skills/`. Tester gõ lệnh trong Claude Code mở ở thư mục project này. Ô "Bước tiếp theo" trên UI đưa sẵn lệnh để copy.

| Lệnh | Việc làm |
| --- | --- |
| `/gen-testcases <feature>` | Đọc use case, ghi thêm test case `draft` vào `testcases.json`. Không sửa test case đã có |
| `/run-testcase <feature> <id>` | AI chạy thử test case `reviewed` bằng agent-browser, ghi `ai-run/<id>.json`, ảnh từng step và `ai-run/<id>.md` |
| `/ui-check <feature> [screen]` | Đọc `metrics.json`, xem `side_by_side.png` và từng crop, đối chiếu checklist bảy mục, ghi `ui-diff/<screen>/report.md` với bảng sai khác đề xuất. Để trống mục "Quyết định của tester". Cần chạy "Chụp và so" trên UI trước |
| `/to-playwright <feature> <id>` | Chuyển ai-run đã được tester xác nhận (`tester.decision = "confirmed"`) thành `tests/<feature>/<id>.spec.ts`, chạy thử và báo kết quả |
| `/heal-locator <feature> <id>` | Đọc lỗi Playwright của spec fail, mở trang bằng agent-browser, ghi `heal/<id>.diff` (chỉ đổi dòng locator) và `heal/<id>.md` (lý do) vào đợt |

Chi tiết từng skill: [skills.md](./skills.md). Hướng dẫn từng bước cho tester: [tester-guide.md](./tester-guide.md).

### Sửa locator (healing)

Khu "Playwright" có mục "Sửa locator". Mỗi spec fail trong `playwright-last.json` hiện lệnh `/heal-locator` để copy. Khi skill đã ghi `<đợt>/heal/<id>.diff`, UI hiện diff, lý do và nút "Áp dụng và chạy lại".

| API | Việc làm |
| --- | --- |
| `GET /api/runs/<đợt>/heal/<id>` | Trả `diff`, `reason` (nội dung `.md`), `problems` (lý do từ chối nếu diff vi phạm), `has_backup`. `diff` là `null` khi chưa có |
| `POST /api/runs/<đợt>/heal/<id>/apply` | Từ chối 409 nếu diff đụng `expect(`, `waitForTimeout`, `test.skip`, xóa dòng `await`, đổi số dòng đổi dòng không chứa locator, thêm `force:`, đổi phần ngoài biểu thức locator (tên hành động, giá trị nhập), nếu diff không khớp spec hiện tại, hoặc nếu Playwright đang chạy. Còn lại: lưu spec sang `<đợt>/heal/<id>.spec.ts.bak`, áp diff bằng `tool/core/apply-diff.ts`, chạy lại spec qua runner và trả `last` kèm `passed` |

Chạy lại trước khi áp dụng lần nữa thì diff cũ không còn khớp và bị từ chối. Muốn hoàn tác, chép `.bak` đè lên spec. Lần áp thứ hai lưu `.bak.2`, thứ ba `.bak.3`: `.bak` luôn là spec trước lần áp đầu tiên.


## Playwright

```bash
FEATURE=staging npx playwright test
```

- Phải đặt `FEATURE`. Thiếu thì lệnh in lỗi và thoát.
- Chưa có `auth/<feature>.json` thì chạy không có phiên, kèm cảnh báo.
- `EVIDENCE_DIR` chỉ định thư mục đợt. Không đặt thì tự chọn tên đợt mới.
- `EVIDENCE_ROOT` đổi thư mục gốc evidence, ví dụ sang ổ dữ liệu khác.
- Reporter: `list` (log), `html` vào `<đợt>/playwright-report/`, `json` vào `<đợt>/playwright-results.json`. Trace giữ khi test fail (`retain-on-failure`).
- Biến `PLAYWRIGHT_BIN` (chỉ dùng trong test) thay `npx playwright` bằng một lệnh khác khi tool chạy Playwright.

## So UI với Figma

Ba lớp kiểm tra: so trực quan lần đầu (bước này), số liệu CSS tùy chọn bằng `toHaveCSS` trong spec, và baseline regression bằng `toHaveScreenshot`.

Quy ước ảnh Figma, tester làm một lần cho mỗi screen:

- Export frame ở tỉ lệ **1x**, định dạng PNG. Chiều rộng bằng đúng `viewport.width` trong `feature.json`. Frame dài hơn viewport thì dùng "Chụp cả trang" khi chụp.
- Đặt tại `features/<feature>/figma/<screen>.png`. Tên file là key screen trong `feature.json`.
- Export 2x thì đặt `scale: 2` cho screen đó trong `feature.json`, tool tự thu nhỏ khi so. Nên dùng 1x để tránh sai số do thu nhỏ.
- Ghi link frame Figma và ngày export vào `features/<feature>/figma/README.md` (tester tự tạo file này, tool không đọc). Ngày sửa lần cuối của file PNG được tool ghi vào `meta.json` và `baseline.json`.
- Tool không dùng Figma MCP hay API, chỉ dùng ảnh export.

Quy trình trên trang đợt:

1. Tick screen, bấm "Chụp và so". Mỗi screen chụp rồi so lần lượt, một job mỗi lúc. Thiếu ảnh Figma, thiếu phiên đăng nhập (screen `auth`), bị chuyển hướng (có thể hết phiên) hay lệch kích thước đều hiện thành cảnh báo, không bị bỏ qua.
2. Ô "Bước tiếp theo" đưa lệnh `/ui-check <feature> <screen>` để copy vào Claude Code. Skill ghi `report.md`.
3. Tester chọn bug, chấp nhận hoặc cần xem cho từng dòng "Sai khác đề xuất", ghi chú, bấm "Lưu quyết định" (ghi `decisions.json`).
4. "Cho tạo baseline" chỉ bật khi: có spec trong `tests/<feature>/` chứa `toHaveScreenshot('<screen>.png')`, đã có `metrics.json` và `report.md` (không cũ hơn `metrics.json`), mọi dòng của bảng đã có quyết định, không dòng nào là "bug" ("cần xem" vẫn được), và Playwright không đang chạy. Tool chạy `npx playwright test <spec> --update-snapshots`, ảnh ghi vào `tests/__screenshots__/<feature>/<screen>.png`, rồi ghi `baseline.json`. Lần chạy này ghi đè `playwright-log.txt` và `playwright-last.json` của đợt. Còn dòng đánh dấu bug thì baseline bị chặn (quyết định 2026-10-07).

Spec baseline do tester viết hoặc nhờ Claude Code viết. Ví dụ: `await expect(page).toHaveScreenshot('home.png', { mask: [page.locator('.clock')] });`. Mask trong spec nên cùng selector với `mask` trong `feature.json`. Tên file ảnh phải là `<screen>.png`.

Tham số `compare`: `--threshold` (0 đến 255, mặc định 20) đổi thành ngưỡng `threshold / 255` của pixelmatch, là khoảng cách màu OKLab nên không tương đương hoàn toàn thang "chênh lệch một kênh màu" của bản Python cũ. Pixelmatch bỏ qua pixel chống răng cưa, thay cho bước làm mờ Gaussian của bản cũ. Vùng được gộp theo lưới `--cell` (16px), ô có tỉ lệ pixel khác trên `--cell-ratio` (3%) thì được đánh dấu, các ô kề nhau (8 hướng) gộp thành một vùng. `diff.png` đánh số vùng bằng font bitmap chữ số 3x5.

## Kiểm tra mã nguồn

```bash
npm run typecheck
npm test
```
