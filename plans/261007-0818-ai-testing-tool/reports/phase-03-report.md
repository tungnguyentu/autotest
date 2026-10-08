# Báo cáo Phase 3: Skill AI và ghi step

Trạng thái: xong phần làm được trên máy này. Bước "Chạy thử trên staging trong Claude Code" chờ tester và chưa đánh dấu trong Todo. `npm run typecheck` sạch, `npm test` 77/77 pass (53 test cũ cộng 24 test mới), chạy xanh 9 lần liên tiếp.

## Việc đã làm

- `tool/core/redact.ts`: đọc `.env` bằng `util.parseEnv`, che đệ quy mọi chuỗi trong JSON, giá trị từ 3 ký tự. Thay bằng một regex duy nhất, giá trị dài trước, để chỗ đã thay không bị thay lần hai (bản thay tuần tự đầu tiên làm hỏng `<secret:KEY>` khi một giá trị là chuỗi con của chữ `secret`, test bắt được).
- `tool/core/agent-browser.ts`: gọi `execFile` (không qua shell), đường dẫn từ `AGENT_BROWSER_BIN`, luôn `--session ui-check-<feature> --json`. Thông báo lỗi tự dựng từ JSON hoặc stderr rồi che credential, vì `err.message` của Node chứa nguyên dòng lệnh, kể cả mật khẩu.
- `tool/core/ai-run-store.ts`: tìm đợt, tạo, đọc, thêm step (số step phải đúng số kế tiếp), ghi `ai_result`. `--run-dir` phải nằm trong evidence root.
- `tool/cli/`: `run-start`, `record-step`, `fill-secret`, `run-finish`, thêm `validate-testcases`. Đăng ký trong `tool/cli.ts`, có trong `help`.
- `tool/cli/__tests__/fake-agent-browser.mjs` và `record-step.test.ts` (24 test chung với `redact.test.ts`): navigate, click, tra thuộc tính, `get attr` lỗi bị bỏ qua, assert, `--target-json`, đầu vào sai không ghi step, lỗi chụp ảnh giữ step, thiếu agent-browser, fill-secret không lộ giá trị trong file lẫn lỗi, run-start, run-finish.
- Ba skill trong `.claude/skills/` (84, 115, 67 dòng) cộng `run-testcase/references/agent-browser-recipes.md`, `to-playwright/references/playwright-conversion.md`, `_shared/report-template.md`.
- Cập nhật `CLAUDE.md` (mục Test case, AI chạy thử, Chuyển sang Playwright), `docs/README.md` (bảng lệnh và mục skill), `docs/schemas.md` (ghi rõ `record-step` điền trường nào, `assert_*` ghi vào `note`). Schema `ai-run` không đổi. Chỉ thêm `parseAiResult` vào `schemas.ts`.

## Lệnh đã chạy và kết quả

| Lệnh | Kết quả |
| --- | --- |
| `npm run typecheck` | Sạch |
| `npm test` 9 lần liên tiếp | 9/9 xanh, kết quả dán bên dưới bảng |
| Server test 40 lần liên tiếp khi 6 tiến trình ngốn CPU chạy nền | 40/40 pass (trước khi sửa: 1 fail trong 12 lần, và 1 fail trong 14 lần của bản gỡ lỗi) |
| `run-start`, `record-step`, `fill-secret`, `run-finish` với agent-browser thật | Xem bên dưới |
| `agent-browser session list` sau khi thử | `No active sessions`. Không còn Chromium hay daemon của agent-browser |

Vòng lặp 8 lần `npm test` (mỗi dòng là mã thoát của một lần chạy toàn bộ), cộng lần thứ chín chạy riêng:

```
run 1 rc=0
run 2 rc=0
run 3 rc=0
run 4 rc=0
run 5 rc=0
run 6 rc=0
run 7 rc=0
run 8 rc=0
ℹ tests 77
ℹ pass 77
ℹ fail 0
ℹ duration_ms 8724.580333
```

### Chạy thật trên https://example.com (feature tạm `tmpreal`, đã xóa)

`record-step --action click --ref e1 --wait-url "**iana.org**"` ghi step:

```json
{
  "n": 3,
  "action": "click",
  "target": { "role": "link", "name": "Learn more", "label": null, "placeholder": null, "css": null },
  "value": null,
  "url_before": "https://example.com/",
  "url_after": "https://www.iana.org/help/example-domains",
  "screenshot": "screenshots/TC_TMP_001/03.png",
  "note": ""
}
```

Ảnh `03.png` là PNG 1280x577 hợp lệ. `assert_url` với `iana.org` ghi `"Kiểm tra: URL khớp \"iana.org\""`. `assert_text` với chữ không có trên trang in `KHÔNG khớp` kèm nội dung thật.

### Credential

Trong feature tạm có `.env` với giá trị `abc123xyz` (và một lần `-abc123xyz` để thử giá trị bắt đầu bằng dấu trừ):

- `fill-secret` chạy thật trên ô `type=password` của một trang `data:`: ô nhận đủ 10 ký tự, step ghi `"value": "<secret:USER_PASSWORD>"`, target `textbox "Mat khau"`, `#pw`.
- Khóa không có (`NOPE`): `Không có khóa NOPE trong features/tmpreal/.env. Các khóa có sẵn: USER_PASSWORD.`
- `grep -rl abc123xyz evidence tests` trả mã 1, không file nào.
- Với agent-browser giả, test kiểm tra: lệnh `fill` nhận đúng giá trị thật, còn mọi file trong đợt, đầu ra của lệnh và thông báo lỗi (agent-browser giả cố ý in lại tham số) đều không chứa giá trị.
- Đã xóa `features/tmpreal`, `evidence/`, `auth/`, file tạm.

## Nguyên nhân test flaky và cách sửa

Test lỗi là `phát sự kiện khi thư mục evidence được tạo sau lúc server chạy` (`server.test.ts` dòng 209, `AssertionError: hết thời gian chờ`). Đo được: 9 lần fail trong khoảng 80 lần `npm test` (khoảng 11%), luôn đúng test này, không bao giờ test login hay test SSE đầu.

Chẩn đoán: thêm một watcher chokidar thứ hai vào đúng test (bản gỡ lỗi, đã xóa). Nó nhận đủ ba sự kiện (`addDir`, `addDir`, `add`) trong 2 mili giây, còn watcher của server thì không phát gì ra SSE. Tức là SSE, debounce và test đều đúng, sự kiện bị mất ở watcher của server. Khác biệt duy nhất: `evidence/` không tồn tại lúc server khởi động. Với đường dẫn chưa có, chokidar theo dõi gián tiếp qua thư mục cha, và khi thư mục con được tạo ngay sau thư mục cha (máy bận) thì mất sự kiện. Thử riêng chokidar trong script độc lập không tái hiện được, chỉ tái hiện khi test chạy cùng các test file khác hoặc khi máy tải nặng.

Cách sửa: `startWatcher` tạo sẵn `features/`, `evidence/`, `tests/`, `auth/` (rỗng, `mkdir -p`, lỗi chỉ cảnh báo) trước khi gắn watcher, nên chokidar luôn gắn trực tiếp. Không sửa test, vì đây là lỗi thật của sản phẩm: UI sẽ không thấy `ai-run/<id>.json` đầu tiên của một đợt mới tạo trong thư mục evidence chưa tồn tại. Các test của Phase 2 đều xanh. Test "tạo sau khi server chạy" vẫn đúng nghĩa, vì thư mục đợt vẫn tạo sau.

Bằng chứng: trước khi sửa 9 fail trong khoảng 80 lần `npm test` không tải thêm, và 2 fail trong 26 lần chạy riêng `server.test.ts` khi tải nặng. Sau khi sửa 40/40 pass khi tải nặng, 9/9 pass khi chạy toàn bộ `npm test`. Xác suất 40 lần sạch nếu tỉ lệ lỗi vẫn là 8% khoảng 3%, nên đây là bằng chứng mạnh nhưng không phải chứng minh tuyệt đối.

## Lệch so với kế hoạch và lý do

- `record-step` tự làm thao tác trong trình duyệt (không chỉ ghi). Kế hoạch ghi "thực hiện action bằng agent-browser, rồi `record-step` ngay sau đó", nhưng sau click điều hướng thì ref đã cũ (role, name sai hoặc mất) và `url_before` không còn. Tra ref và URL trước khi làm là cách duy nhất ghi đúng. Skill dặn không tự chạy `click/fill/open` cho bước của test case. Mọi tùy chọn của kế hoạch giữ nguyên, thêm `--wait-url`, `--wait-text`, `--no-settle`.
- Thêm `tool/core/agent-browser.ts` (dùng chung giữa bốn lệnh), `validate-testcases` (kế hoạch khuyến khích), và `parseAiResult` trong `schemas.ts`.
- `run-start` từ chối thêm test case `manual: true` (kế hoạch chỉ nói status). Phù hợp `docs/schemas.md`: "AI không chạy". `--force` cho qua cả hai.
- `run-start` đóng session agent-browser cũ của tính năng, nên skill dặn mở trình duyệt SAU `run-start`. Cách mở: `open about:blank` kèm `--state`, rồi `set viewport`, rồi `record-step --action navigate`. Thử thật: `set viewport` làm lệnh đầu tiên (chưa có trình duyệt) báo `Failed to connect`, và `--state` chỉ có tác dụng ở lệnh khởi chạy.
- `toHaveScreenshot` trong spec chỉ thêm khi đã có baseline. Spec lần chạy đầu không có ảnh gốc sẽ fail, mà baseline chỉ tạo sau khi tester duyệt. Đã sửa câu tương ứng trong `CLAUDE.md`.
- Thuộc tính lấy qua `get attr` là `aria-label` (vào `label`), `placeholder`, `id` và `name` (vào `css`, bỏ id trông như sinh tự động). Bản thật trả `value: null` khi không có thuộc tính nên không cần xử lý lỗi, nhưng lỗi vẫn bị bỏ qua nếu có.
- `started_at` của ai-run ghi theo giờ máy kèm độ lệch (ví dụ `+07:00`), cùng dạng `saved_at` của phiên.
- `startWatcher` giờ tạo thư mục gốc rỗng khi khởi động (ghi trong `docs/README.md`).

## Lưu ý cho Phase 4

- `run-finish` chỉ ghi `ai_result`, không đổi `status` và không ghi `tester`. Đường đổi sang `ai-passed`, `ai-failed`, `automated` và ghi `tester.decision` vẫn chưa có trên API (PATCH test case vẫn chặn). `to-playwright` đọc `tester.decision === "confirmed"` từ `ai-run/<id>.json`, nên Phase 4 phải ghi đúng trường đó (`decision`, `note`, `decided_at`). Trong lúc chưa có UI, tester sửa tay JSON.
- Hàm dùng lại được: `ai-run-store.ts` (`listRunDirs`, `readAiRun`, `findRunDirOfAiRun`) cho API đọc chi tiết `ai-run`.
- File `ai-run/<id>.md` nằm cạnh `.json`. API và `listDir` hiện chỉ lấy `.json` làm id, nên không bị lẫn. Kết quả tạm của `run-finish` được skill ghi bằng `mktemp` ngoài `evidence/` vì lý do này.
- `next-step.js` đã đúng tên `/gen-testcases <f>` và `/run-testcase <f> <id>`, chưa có nhánh `/to-playwright`.
- Ảnh step là ảnh viewport của trình duyệt. Ô `type=password` bị che bởi trình duyệt, nhưng ô thường (ví dụ email) hiện giá trị thật. Chấp nhận được với tài khoản test, nên nhắc tester khi dùng tài khoản thật.
- Mỗi lần gọi agent-browser giả mất khoảng 50 mili giây vì phải khởi động Node, nên `record-step.test.ts` chạy khoảng 10 đến 20 giây.

## Chưa làm

- Báo cáo Phase 1 không ghi gì về `--state` của agent-browser với file Playwright thật, nên không mâu thuẫn với recipes. Tôi chỉ thử `--state` với file tối thiểu `{"cookies":[],"origins":[]}`. Nạp phiên staging thật (có OTP) vẫn chưa được kiểm chứng ở đâu cả.

- Chạy `/gen-testcases`, `/run-testcase`, `/to-playwright` trong Claude Code của tester trên staging: chờ tester. Todo "Chạy thử trên `staging` trong Claude Code" giữ nguyên chưa đánh dấu. Tôi cũng chưa tự sinh một spec thật bằng `to-playwright` để chạy thử.
- Chưa thử `find role ... click --name` với agent-browser thật. Chỉ kiểm tra bằng agent-browser giả, theo đúng cú pháp trong tài liệu `agent-browser skills get core`.

Status: DONE_WITH_CONCERNS
Summary: Bốn lệnh CLI, ba skill, redact, test và sửa test flaky đã xong. Typecheck sạch, 77 test xanh 9 lần liên tiếp, record-step và fill-secret chạy thật với agent-browser, không lộ credential.
Concerns/Blockers: Chưa chạy skill trong Claude Code trên staging (chờ tester). `to-playwright` chưa được thử với một ai-run thật. `find` của agent-browser chưa được thử với bản thật.
