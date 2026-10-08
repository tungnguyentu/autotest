# Tài liệu Tool AI Testing

Tool chạy trên máy tester. Không có giao diện web. Tester chỉ chat với Claude Code, Claude chạy mọi lệnh CLI.
Lệnh CLI (tool Node) và skill (Claude Code) dùng chung một bộ file trên disk.

## Mục lục

- [tester-guide.md](./tester-guide.md): hướng dẫn từ đầu đến cuối cho tester, không cần đọc code.
- [skills.md](./skills.md): sáu skill, lệnh CLI liên quan, đầu vào, đầu ra, điều cấm.
- [schemas.md](./schemas.md): mô tả từng trường của mọi file tool và skill dùng chung.

Cách dùng: xem mục [Cách dùng](#cách-dùng).

## Cài đặt

Máy tester: `bash install.sh` (hoặc `curl -fsSL https://raw.githubusercontent.com/tungnguyentu/autotest/master/install.sh | bash` khi chưa có project). Script kiểm tra và cài những gì còn thiếu: git, Node 26 (qua fnm, không cần sudo), `npm ci`, Chromium cho Playwright, agent-browser 0.34.0, Claude Code. Hỗ trợ macOS và Linux có apt, dnf hoặc yum. Máy đã dùng fnm với bản Node khác: script chỉ cài thêm Node 26, không đổi bản mặc định.

Cập nhật trên máy tester: `bash update.sh`. Script dừng nếu file của tool bị sửa, tải bản mới bằng `git pull --ff-only`, rồi chạy lại `install.sh` của bản mới.

Dùng `npm ci`, không dùng `npm install`, để `package-lock.json` trên máy tester không đổi. Đổi phiên bản Node, agent-browser hay thêm công cụ hệ thống: sửa `install.sh` và `.node-version`, vì tester nhận thay đổi qua `update.sh`.

## Cách dùng

Tester mở Claude Code ở thư mục project rồi chat. Tester không gõ lệnh. Claude chạy mọi lệnh qua `npm run cli -- <lệnh>` và trả lời bằng tiếng Việt.

- Quy tắc cho Claude (đăng nhập qua chat, kéo file vào chat, bảng "tester nói gì thì chạy lệnh nào"): [CLAUDE.md](../CLAUDE.md). Đây là nguồn chuẩn của quy trình chat.
- Hướng dẫn cho tester: [tester-guide.md](./tester-guide.md).
- Các lệnh ghi quyết định của tester chỉ chạy khi tester nói rõ trong chat. Lệnh từ chối thì Claude đọc lại thông báo cho tester, không tìm cách lách.
- Hỏi tiến độ: `npm run cli -- status --feature <f>`. Lệnh in dòng "Việc tiếp theo".
- Nhà phát triển có thể chạy lệnh trực tiếp ở terminal. Xem `npm run cli -- help` cho tùy chọn đầy đủ.

Tool không có tiến trình nền lâu dài. Ngoại lệ duy nhất là cửa sổ trình duyệt của lệnh `login`, đang chờ tester đăng nhập.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `features/<feature>/feature.json` | Cấu hình tính năng: service, baseURL, viewport, screens. Tạo bằng `feature-init` |
| `features/<feature>/usecases/*.md` | Use case do tester D5 cung cấp. Tester kéo file vào chat, Claude thêm bằng `usecase-add`. File Word: tool lưu `<tên>.docx` gốc, `<tên>.md` đã chuyển, ảnh ở `<tên>.images/` |
| `features/<feature>/testcases.json` | Test case |
| `features/<feature>/figma/<screen>.png` | Ảnh thiết kế tester export. Tester kéo ảnh vào chat, Claude chép vào đúng chỗ |
| `features/<feature>/.env` | Credential. Không in, không sao chép |
| `auth/<feature>.json` | Phiên đăng nhập do lệnh `login` lưu. Không in, không sao chép |
| `auth/<feature>.meta.json` | Thời điểm lưu phiên và URL cuối |
| `tests/<feature>/<id>.spec.ts` | Spec Playwright |
| `tests/__screenshots__/<feature>/` | Ảnh baseline của Playwright |
| `$EVIDENCE_ROOT/<YYYY-MM-DD>_<feature>[_rN]/` | Evidence của một đợt test. Mặc định `./evidence` |

Project dùng git. Tool không sao chép và không in `features/*/.env` và `auth/`.

## Phát hành bản mới, tránh conflict cho tester

Nhiều tester cùng `git pull` repo này. Repo chỉ chứa tool. Dữ liệu của tester nằm trong thư mục git bỏ qua, nên pull không bao giờ chạm vào dữ liệu đó.

| Git theo dõi (chỉ người phát triển sửa) | Git bỏ qua (dữ liệu trên từng máy tester) |
| --- | --- |
| `tool/`, `.claude/`, `CLAUDE.md`, `docs/`, `plans/`, `package.json`, `package-lock.json`, `playwright.config.ts`, `tsconfig.json`, `.gitignore` | `features/`, `tests/`, `evidence/`, `auth/`, `settings.local.json`, `agent-browser.json`, `CLAUDE.local.md`, `.claude/settings.local.json`, `node_modules/` |

Khi phát hành:

- Không commit file vào `features/` hay `tests/`. Tính năng mẫu hoặc dữ liệu test của tool đặt trong `tool/**/__tests__/`.
- Cập nhật `package-lock.json` cùng `package.json` trong một commit. Tester cài bằng `npm ci`, lệnh này đọc đúng lock file và không sửa nó.
- Đổi schema của file trong `features/`, `tests/`, `evidence/`: giữ đọc được file cũ (trường mới phải tùy chọn hoặc có mặc định). Không đọc được thì thêm lệnh chuyển đổi và ghi trong commit.
- Push lên `master` theo kiểu fast-forward, không viết lại lịch sử đã push (`push -f`). Tester pull bằng `git pull --ff-only`.

Tester nói "cập nhật tool" thì Claude làm theo mục "Cập nhật tool, tránh conflict" trong [CLAUDE.md](../CLAUDE.md): kiểm tra file của tool có bị sửa không, `git pull --ff-only`, `npm ci`.

## Lệnh

Mọi lệnh chạy qua `npm run cli -- <lệnh>`. Tùy chọn đầy đủ: `npm run cli -- help`. Bảng dưới chỉ tóm tắt việc làm.

Chuẩn bị và kiểm tra:

| Lệnh | Việc làm |
| --- | --- |
| `login --feature <f> [--start /path] [--wait-flag]` | Mở Chromium có giao diện. Tester đăng nhập tay, rồi `auth/<f>.json` được lưu. Với `--wait-flag`, tạo file cờ `auth/<f>.save` là lưu (Claude làm khi tester nói "xong"). Không có cờ thì bấm Enter ở terminal |
| `check-session --feature <f> --url <url> [--headed \| --headless]` | Nạp `auth/<f>.json` bằng Playwright, mở URL, báo phiên còn dùng được không. Mã thoát 0 là đạt, 2 là không đạt |
| `feature-init --feature <f> --url <url> [--service <tên>] [--screen <key>] [--auth]` | Tạo `features/<f>/feature.json` từ URL. Không ghi đè |
| `usecase-add --feature <f> --file <đường dẫn> [--name <tên>]` | Thêm use case `.md` hoặc `.docx` vào `features/<f>/usecases/`. File Word được chuyển sang `.md`, ảnh tách vào `<tên>.images/`, giữ file gốc. Không ghi đè |
| `validate-testcases --feature <f>` | Kiểm tra `testcases.json` theo schema, in thống kê và cảnh báo. Mã thoát 1 nếu sai schema |
| `evidence-dir --feature <f>` | Tạo và in thư mục đợt mới. Cùng ngày thì thêm `_r2`, `_r3`. Không dùng lại thư mục có sẵn |
| `status [--feature <f>] [--json]` | Tiến độ từng tính năng: use case, test case theo trạng thái, phiên, đợt mới nhất, việc tiếp theo |
| `settings [--headless true\|false]` | Xem hoặc đổi cài đặt trên máy này, lưu ở `settings.local.json`. Xem [schemas.md](./schemas.md) |

AI chạy thử (do skill `run-testcase` gọi):

| Lệnh | Việc làm |
| --- | --- |
| `run-start --feature <f> --id <TC> [--run-dir <d>] [--force]` | Mở một lượt chạy thử: chọn hoặc tạo thư mục đợt, tạo `ai-run/<id>.json` rỗng, in tên session agent-browser. Từ chối test case chưa `reviewed` hoặc `manual` trừ khi có `--force` |
| `record-step --feature <f> --id <TC> --action <a> [--ref e5 \| --target-json '{"css":"#x"}'] [--value <v>] [--note <n>] [--run-dir <d>] [--wait-url <glob>] [--wait-text <chữ>] [--no-settle]` | Làm một thao tác trong agent-browser rồi ghi step (role, name, URL trước và sau, ảnh) vào `ai-run/<id>.json`, che credential |
| `fill-secret --feature <f> --id <TC> --ref e3 --key <TÊN_BIẾN> [--note <n>] [--run-dir <d>]` | Điền giá trị của `TÊN_BIẾN` trong `features/<f>/.env` vào element, ghi step với `<secret:TÊN_BIẾN>`. Không in giá trị |
| `run-finish --feature <f> --id <TC> --result-file <file.json> [--run-dir <d>]` | Ghi `ai_result` vào `ai-run/<id>.json` và đóng session agent-browser. Không đổi status test case |

Bốn lệnh này chạy `agent-browser` qua biến `AGENT_BROWSER_BIN` (mặc định `agent-browser`). Giá trị bắt đầu bằng dấu `-` viết dạng `--value=-abc`.

Chạy Playwright, so UI, kiểm tra giao diện:

| Lệnh | Việc làm |
| --- | --- |
| `run-spec --feature <f> --id <TC> [--run-dir <d>]` | Chạy `tests/<f>/<TC>.spec.ts` qua runner của tool: log in ra đã che credential, `playwright-results.json` được che sau lần chạy, kết quả vào `<đợt>/playwright-last.json`. Mã thoát 0 là pass, 2 là fail |
| `regression --feature <f> [--run-dir <d>]` | Chạy mọi spec trong `tests/<f>/` qua cùng runner |
| `capture --feature <f> --out <đợt>/ui-diff [--screen <key> ...] [--full-page] [--headed \| --headless]` | Chụp các screen trong `feature.json` bằng Playwright (viewport của tính năng, `deviceScaleFactor` 1, phiên `auth/<f>.json` khi screen `auth`, chờ `networkidle` và font). Ghi `<screen>/actual.png`, `figma.png` (bản sao) và `meta.json`. Thiếu ảnh Figma, thiếu phiên hoặc bị chuyển hướng là cảnh báo trong `meta.json`. Mã thoát 2 nếu có screen không chụp được |
| `compare --dir <đợt>/ui-diff/<screen> [--scale <n>] [--threshold 20] [--cell 16] [--cell-ratio 0.03] [--max-regions 15] [--pad 16]` | So `figma.png` với `actual.png`, ghi `diff.png`, `side_by_side.png`, `crops/region_NN.png`, `metrics.json` |
| `ui-diff --feature <f> [--run-dir <d>] [--screen <key> ...] [--full-page] [--headed \| --headless]` | Chạy `capture` rồi `compare` cho từng screen. Không có `--run-dir` thì tạo đợt mới. Đây là lệnh Claude dùng, hai lệnh trên là phần bên trong |
| `audit --feature <f> [--run-dir <đợt>] [--screen <key> ...] [--viewport 1440x900 ...] [--headed \| --headless]` | Kiểm tra giao diện không cần Figma, theo theme trong `feature.json` và viewport (mặc định desktop và mobile 390x844). Ghi `<đợt>/ui-audit/<screen>/` gồm `checks.json`, `shots/`, `review/`. Xem [schemas.md](./schemas.md) |

Lệnh ghi quyết định của tester (Claude chỉ chạy khi tester nói rõ trong chat):

| Lệnh | Việc làm |
| --- | --- |
| `testcase-status --feature <f> (--id <TC> ... \| --all-draft) --status reviewed\|draft` | Duyệt hoặc bỏ duyệt test case. Chỉ đổi giữa `draft` và `reviewed` |
| `ai-decision --feature <f> --id <TC> --decision confirmed\|rejected [--note <n>] [--bug <mô tả>] [--run-dir <d>]` | Xác nhận hoặc từ chối kết quả AI chạy thử. Ghi `tester` vào `ai-run/<id>.json`, status thành `ai-passed` hoặc `ai-failed`. `--bug` thêm một mục vào `<đợt>/bugs.md` |
| `automate --feature <f> --id <TC> [--run-dir <d>]` | Đưa vào regression (`ai-passed` thành `automated`). Chỉ chạy được khi spec pass ở lần chạy gần nhất của đợt, sau lần sửa cuối |
| `heal-apply --feature <f> --id <TC> [--run-dir <d>]` | Áp `<đợt>/heal/<TC>.diff`, sao lưu spec, chạy lại spec. Xem [Sửa locator](#sửa-locator-healing) |
| `ui-decision --feature <f> --screen <key> --item <số>=<bug\|accept\|review>[:ghi chú] ... [--run-dir <d>]` | Quyết định từng mục trong bảng sai khác của `ui-diff/<screen>/report.md`. Ghi `decisions.json` |
| `baseline --feature <f> --screen <key> [--run-dir <d>]` | Tạo baseline `toHaveScreenshot` cho screen. Xem [So UI với Figma](#so-ui-với-figma) |
| `summary --feature <f> [--run-dir <d>] [--tester <tên>] [--environment <môi trường>] [--build <bản>] [--conclusion <kết luận>]` | Sinh lại `<đợt>/summary.md`. Kết luận chỉ ghi đúng lời tester nói. |

Lệnh `help` in trợ giúp đầy đủ.

## Skill trong Claude Code

Skill nằm ở `.claude/skills/`. Tester gọi skill bằng cách nói việc cần làm trong chat, Claude chọn skill phù hợp. Tester cũng có thể gõ lệnh slash nếu muốn. Mọi quyết định của tester đi qua chat (xem [Cách dùng](#cách-dùng)).

| Lệnh | Việc làm |
| --- | --- |
| `/gen-testcases <feature>` | Đọc use case, ghi thêm test case `draft` vào `testcases.json`. Không sửa test case đã có |
| `/run-testcase <feature> <id>` | AI chạy thử test case `reviewed` bằng agent-browser, ghi `ai-run/<id>.json`, ảnh từng step và `ai-run/<id>.md` |
| `/to-playwright <feature> <id>` | Chuyển ai-run đã được tester xác nhận (`tester.decision = "confirmed"`) thành `tests/<feature>/<id>.spec.ts`, chạy thử bằng `run-spec` và báo kết quả |
| `/ui-check <feature> [screen]` | Đọc kết quả `ui-diff`, xem `side_by_side.png` và từng crop, đối chiếu checklist bảy mục, ghi `ui-diff/<screen>/report.md` với bảng sai khác đề xuất. Chưa có kết quả so thì Claude chạy `ui-diff` trước |
| `/ui-audit <url hoặc feature> [screen]` | Kiểm tra giao diện khi không có Figma và use case: sáng và tối, desktop và mobile, theo bộ quy chuẩn AI tự đặt. Ghi `ui-audit/<screen>/report.md` |
| `/heal-locator <feature> <id>` | Đọc lỗi Playwright của spec fail, mở trang bằng agent-browser, ghi `heal/<id>.diff` (chỉ đổi dòng locator) và `heal/<id>.md` (lý do) vào đợt |

Chi tiết từng skill: [skills.md](./skills.md). Hướng dẫn từng bước cho tester: [tester-guide.md](./tester-guide.md).

### Sửa locator (healing)

1. Spec fail. Tester phân loại: bug thật, locator hỏng hay UI đổi có chủ đích.
2. Locator hỏng: skill `heal-locator` ghi `<đợt>/heal/<id>.diff` và `<id>.md`. Claude hiện diff và lý do trong chat.
3. Tester nói "áp dụng sửa locator <id>". Claude chạy `heal-apply --feature <f> --id <id> --run-dir <đợt>`.

`heal-apply` từ chối diff nếu diff không khớp spec hiện tại. Nó cũng từ chối khi diff đụng `expect(`, `waitForTimeout`, `test.skip` hoặc `force:`. Nó từ chối khi diff xóa dòng `await`, đổi số dòng, hoặc đổi dòng không chứa locator. Nó từ chối khi diff đổi phần ngoài biểu thức locator (tên hành động, giá trị nhập). Mã nguồn kiểm tra: `tool/core/heal-apply.ts`, `tool/core/apply-diff.ts`.

Khi được phép: lưu spec sang `<đợt>/heal/<id>.spec.ts.bak`, áp diff, chạy lại spec qua runner. Áp lần hai lưu `.bak.2`, lần ba `.bak.3`: `.bak` luôn là spec trước lần áp đầu tiên. Chạy lại trước khi áp lần nữa thì diff cũ không còn khớp và bị từ chối. Muốn hoàn tác, chép `.bak` đè lên spec.

## Playwright

Chạy spec chỉ bằng lệnh của tool, không chạy `npx playwright test` trực tiếp (log và `playwright-results.json` chỉ được che credential khi qua tool):

```bash
npm run cli -- run-spec --feature staging --id TC_STAGING_001
npm run cli -- regression --feature staging
```

Cấu hình ở `playwright.config.ts`:

- Phải đặt `FEATURE`. Tool đặt biến này khi chạy `run-spec` và `regression`.
- Chưa có `auth/<feature>.json` thì chạy không có phiên, kèm cảnh báo.
- `EVIDENCE_DIR` chỉ định thư mục đợt. Không đặt thì tự chọn tên đợt mới.
- `EVIDENCE_ROOT` đổi thư mục gốc evidence, ví dụ sang ổ dữ liệu khác.
- Reporter: `list` (log), `html` vào `<đợt>/playwright-report/`, `json` vào `<đợt>/playwright-results.json`. Trace giữ khi test fail (`retain-on-failure`).
- Biến `PLAYWRIGHT_BIN` (chỉ dùng trong test) thay `npx playwright` bằng một lệnh khác khi tool chạy Playwright.

Quy ước regression: chạy `regression` hai lần liên tiếp, cả hai phải pass. Đưa test case vào regression bằng `automate` khi tester nói rõ.

## So UI với Figma

Có ba lớp kiểm tra. Lớp một: so trực quan lần đầu (`ui-diff` và skill `ui-check`). Lớp hai: số liệu CSS tùy chọn bằng `toHaveCSS` trong spec. Lớp ba: baseline regression bằng `toHaveScreenshot`.

Quy ước ảnh Figma, tester làm một lần cho mỗi screen:

- Export frame ở tỉ lệ **1x**, định dạng PNG. Chiều rộng bằng đúng `viewport.width` trong `feature.json`. Frame dài hơn viewport thì chụp với `--full-page`.
- Tester kéo ảnh vào chat. Claude chép thành `features/<feature>/figma/<screen>.png`. Tên file là key screen trong `feature.json`.
- Export 2x thì đặt `scale: 2` cho screen đó trong `feature.json`, tool tự thu nhỏ khi so. Nên dùng 1x để tránh sai số do thu nhỏ.
- Ghi link frame Figma và ngày export vào `features/<feature>/figma/README.md` (tester tự tạo file này, tool không đọc). Ngày sửa lần cuối của file PNG được tool ghi vào `meta.json` và `baseline.json`.
- Tool không dùng Figma MCP hay API, chỉ dùng ảnh export.

Quy trình:

1. Claude chạy `ui-diff --feature <f> --screen <screen>`. Mỗi screen chụp rồi so lần lượt. Các lỗi sau thành cảnh báo trong `meta.json`, không bị bỏ qua: thiếu ảnh Figma, thiếu phiên đăng nhập (screen `auth`), bị chuyển hướng (có thể hết phiên), lệch kích thước.
2. Skill `ui-check` ghi `report.md`. Claude liệt kê từng dòng "Sai khác đề xuất" trong chat.
3. Tester trả lời từng mục là bug, chấp nhận hay cần xem. Claude chạy `ui-decision` (ghi `decisions.json`).
4. Tester nói "tạo baseline <screen>". Claude chạy `baseline --feature <f> --screen <screen>`.

`baseline` chỉ chạy được khi đủ năm điều kiện.

- Có spec trong `tests/<feature>/` chứa `toHaveScreenshot('<screen>.png')`.
- Đã có `metrics.json` và `report.md`. `report.md` không cũ hơn `metrics.json`.
- Mọi dòng của bảng đã có quyết định.
- Không dòng nào là "bug". "Cần xem" vẫn được.
- Playwright không đang chạy.

Điều kiện nằm ở `tool/core/ui-diff-gates.ts`. Tool chạy spec với `--update-snapshots`, ảnh ghi vào `tests/__screenshots__/<feature>/<screen>.png`, rồi ghi `baseline.json`. Lần chạy này ghi đè `playwright-log.txt` và `playwright-last.json` của đợt. Còn dòng đánh dấu bug thì baseline bị chặn: báo bug, chờ sửa, chụp và so lại, hoặc đổi quyết định nếu đánh nhầm.

Spec baseline do tester nhờ Claude viết. Ví dụ: `await expect(page).toHaveScreenshot('home.png', { mask: [page.locator('.clock')] });`. Mask trong spec nên cùng selector với `mask` trong `feature.json`. Tên file ảnh phải là `<screen>.png`.

Tham số `compare`: `--threshold` (0 đến 255, mặc định 20) đổi thành ngưỡng `threshold / 255` của pixelmatch, là khoảng cách màu OKLab. Pixelmatch bỏ qua pixel chống răng cưa. Vùng được gộp theo lưới `--cell` (16px). Ô có tỉ lệ pixel khác trên `--cell-ratio` (3%) thì được đánh dấu. Các ô kề nhau (8 hướng) gộp thành một vùng. `diff.png` đánh số vùng bằng font bitmap chữ số 3x5.

## Kiểm tra mã nguồn

```bash
npm run typecheck
npm test
```
