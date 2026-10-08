# Brainstorm: Tool AI Testing có UI cho tester (Claude Code + Playwright + Figma)

Ngày: 2026-10-07. Nguồn: kế hoạch của Alex (07/10/2026), gói skill `ui-check.skill`, và các làm rõ của người dùng trong phiên này.
Trạng thái: đã chuyển thành kế hoạch `plans/261007-0818-ai-testing-tool/plan.md`.

## 1. Hợp đồng

### Outcome

Một tool chạy trên máy tester, có giao diện web mở ở localhost, chia việc làm hai phần.

- Tool web làm mọi bước không cần AI. Gồm quản lý tính năng và use case, duyệt test case, đăng nhập tay. Gồm xem evidence và ảnh từng step, xác nhận kết quả AI. Gồm chụp màn hình và so ảnh Figma, chạy regression Playwright, xem report, điền kết luận của tester.
- Các bước cần AI chạy trong Claude Code mà tester đã đăng nhập bằng subscription. Project có skill cho từng bước: sinh test case, chạy thử bằng agent-browser, chuyển sang spec, đọc ảnh diff, đề xuất locator. UI hiện sẵn lệnh để tester copy vào Claude Code.

Hai phần dùng chung một bộ file trên disk (`features/`, `tests/`, `evidence/`, `auth/`). UI theo dõi file và tự cập nhật khi Claude Code ghi xong. Tester kiểm tra đầu ra ở mọi bước. AI chỉ đề xuất. Pilot trên tính năng đầu tiên mà tester D5 đưa use case.

### Constraints (quyết định đã chốt, không mở lại)

| Chủ đề | Ràng buộc |
| --- | --- |
| Hình thức | Tool web local, tester chạy `npm start` trên máy mình. Không CI, không server dùng chung |
| Gọi Claude | Tool không gọi Claude. Tester dùng Claude Code (subscription) trong thư mục project. Không Agent SDK, không API key |
| Runtime tool | Chỉ Node. Chụp màn hình bằng Playwright, so ảnh bằng pixelmatch. Không Python |
| Công cụ AI chạy thử | agent-browser (đã cài, 0.34.0), Claude Code gọi qua CLI. browser-use bị loại vì cần Python và vòng LLM thứ hai |
| Luồng AI | AI chạy trước, ghi step, rồi chuyển sang Playwright. Regression chạy thuần Playwright |
| So Figma | Script tạo diff và crop chạy trong tool. Đánh giá bằng mắt theo checklist của `ui-check` chạy trong Claude Code |
| Nguồn Figma | Chỉ ảnh tester export, không Figma MCP hay API |
| Đăng nhập | Tester làm tay trong browser có giao diện mở từ UI, tool lưu `auth/<feature>.json`. Phiên chỉ hết hạn khi logout. AI không vượt SSO/OTP/captcha |
| Use case | Do tester D5 cung cấp dạng Markdown vào `features/<feature>/usecases/`. Không có use case Login |
| Evidence | Trên disk máy tester (`EVIDENCE_ROOT`), không ghi đè, không đồng bộ |
| Locator | Không `data-testid`, không yêu cầu dev sửa code |
| Vai trò | Tester kiểm soát đầu ra. AI không kết luận PASS/FAIL cuối, không đổi baseline, không đổi status sang automated |
| Ngôn ngữ | UI, skill, `CLAUDE.md`, tài liệu viết tiếng Việt |

### Non-goals

- Performance test, security test, API test thuần, mobile native.
- Tự động hóa SSO, OTP, captcha.
- Healing sửa assertion hoặc luồng test. Healing chỉ đề xuất locator.
- Figma MCP, Steve QA Tester, browser-devtools-claude, designfit, Playwright MCP, browser-use.
- Tool tự gọi Claude bằng bất kỳ cách nào (Agent SDK, `claude -p`, API key). Nếu sau này team có API key, đây là phần mở rộng riêng.
- Chạy trên CI, nhiều người dùng chung một server, đăng nhập vào tool, đồng bộ evidence lên cloud.
- Đóng gói thành app desktop (Electron).

### Acceptance criteria

1. Tester cài bằng `npm install` và `npx playwright install chromium`, chạy `npm start`, mở localhost và thấy danh sách tính năng trong `features/`.
2. Từ UI, tester tạo tính năng mới (service, baseURL, viewport, screens, mask) và nạp file use case Markdown.
3. UI có trang "Test case": hiện `testcases.json`, cho sửa, đổi status `draft` thành `reviewed`. Nút "Sinh test case" hiện lệnh `/gen-testcases <feature>` để copy. Sau khi Claude Code ghi file, UI tự cập nhật.
4. Nút "Đăng nhập" mở browser có giao diện, tester đăng nhập tay, bấm lưu trên UI, tool ghi `auth/<feature>.json`. File này nạp được ở cả ba nơi: agent-browser, chụp màn hình, Playwright.
5. Skill chạy thử trong Claude Code dùng agent-browser với phiên đã lưu. Skill ghi `ai-run/<id>.json` theo schema độc lập công cụ, ảnh từng step, và `ai-run/<id>.md`. UI hiện ảnh và kết quả đề xuất. Tester bấm xác nhận hoặc từ chối, status thành `ai-passed` hoặc ghi chú bug.
6. Skill chuyển Playwright sinh `tests/<feature>/<id>.spec.ts` theo quy tắc locator. UI có nút chạy thử spec, hiện kết quả và trace. Tester xem code và quyết định `automated`.
7. Nút "So Figma" trong UI chụp màn hình theo `feature.json`, tạo `diff.png`, `side_by_side.png`, crop vùng khác, `metrics.json`. Skill `ui-check` trong Claude Code đọc ảnh và ghi `report.md`. UI hiện bảng sai khác, tester đánh dấu từng mục và quyết định cho tạo baseline.
8. Nút "Regression" chạy `npx playwright test`, hiện report HTML và trace, ghi vào thư mục đợt.
9. UI sinh `summary.md` của đợt, tester điền mục "Kết luận của tester" trên UI.
10. Không có giá trị credential nào xuất hiện trong UI, log, report, spec, hay history. Claude Code điền credential qua wrapper đọc `.env`, chỉ thấy tên biến.
11. Toàn bộ file tool ghi và file skill ghi dùng chung một schema được ghi thành tài liệu trong `docs/`.

### Trade-offs

**Cách gọi Claude.** Ba hướng đã so, bằng chứng từ tài liệu chính thức đọc ngày 2026-10-07.

- Agent SDK với login subscription: bị cấm. Tài liệu Agent SDK ghi: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." Loại.
- Tool gọi `claude -p` bằng login của tester: tài liệu headless không cấm rõ. Nhưng `--bare` (chế độ khuyến nghị cho script) chỉ nhận API key. Chính sách trên cũng có thể áp dụng. Thất bại sớm nhất khi Anthropic siết chính sách, lúc đó tool mất toàn bộ phần AI. Loại vì rủi ro không kiểm soát được.
- UI cộng Claude Code mở bên cạnh (đã chọn): tester tự chạy Claude Code trong project, tool chỉ xử lý file. Giả định quan trọng nhất: tester chấp nhận chuyển qua lại giữa hai cửa sổ. Thất bại sớm nhất khi tester quên chạy bước AI, nên UI phải hiện rõ trạng thái "đang chờ Claude Code" và lệnh cần chạy. Đúng chính sách, không cần API key, cách đổi rẻ nhất nếu sau này có key.

**Hình thức UI.** Web app local được chọn thay cho Electron (chi phí đóng gói) và TUI (không xem ảnh được).

**Công cụ AI chạy thử.** agent-browser được chốt luôn thay vì spike hai công cụ như kế hoạch gốc. Lý do: browser-use cần Python và vòng LLM thứ hai, cả hai mâu thuẫn với ràng buộc mới. Rủi ro còn lại: Claude Code ghi history thiếu thuộc tính element. Chặn bằng schema `ai-run` và một script ghi step mà skill bắt buộc gọi sau mỗi action.

### Better approaches

Có một hướng tốt hơn bản nháp skill. Tách phần script (chụp, so ảnh, ghi step, lưu phiên) vào tool Node. Skill chỉ chứa hướng dẫn đánh giá và quy tắc. Khi đó Claude Code chỉ gọi lệnh của tool, không tự viết logic xử lý ảnh. Chi phí chuyển: viết lại `capture.py`, `compare.py`, `login.py` sang Node, bỏ `run_testcase.py`, tách `SKILL.md` thành bốn skill nhỏ theo bước. Mẫu báo cáo và checklist giữ nguyên.

## 2. Bằng chứng đã kiểm tra

Thư mục project trống, chưa phải git repo.

| Thành phần | Trạng thái |
| --- | --- |
| Node 26.7, npm 11.19 | Có |
| Claude Code 2.1.292, đăng nhập subscription | Có |
| agent-browser 0.34.0, skill `ak:agent-browser` | Có |
| pixelmatch trên npm | 8.0.0 |
| Python 3.14, chưa có browser-use, playwright, Pillow | Không dùng nữa |

Gói `ui-check.skill`: `SKILL.md` (quy trình bảy bước, checklist đánh giá, điều cấm), `login.py`, `capture.py`, `compare.py`, `run_testcase.py`, `references/playwright-conversion.md`, `references/report-template.md`. Checklist, quy tắc locator, và ba mẫu báo cáo dùng lại nguyên. Script viết lại sang Node.

Thử nghiệm: `agent-browser state save` sinh JSON có hai khóa `cookies` và `origins`, đúng hình dạng storageState của Playwright. Chiều Playwright tạo, agent-browser nạp qua `--state` chưa thử với cookie thật.

## 3. Khoảng trống cần Phase 1 giải quyết

- Kiểm tra `auth/<feature>.json` nạp được qua `agent-browser --state`, Playwright chụp màn hình, và `playwright.config.ts` với cookie thật.
- Định nghĩa schema `ai-run/<id>.json`, `testcases.json`, `feature.json` và cách UI phát hiện file đổi.
- Thử một vòng đầy đủ trên một trang công khai: skill chạy thử ghi step, UI hiện kết quả, skill sinh spec, UI chạy spec.
- Không dùng git (làm rõ ngày 2026-10-07 khi validation kế hoạch). Credential chỉ nằm trong `features/<feature>/.env` và `auth/`.

### Ước lượng sơ bộ (trước spike)

Một người làm toàn thời gian.

| Phase | Ước lượng | Giả định quyết định |
| --- | --- | --- |
| 1. Nền tảng, schema, skill chạy thử, spike phiên | 3 đến 4 ngày | File phiên nạp được ở ba nơi, agent-browser ghi step ổn định |
| 2. UI và pilot tính năng đầu tiên | 5 đến 7 ngày | D5 đã đưa use case, môi trường test ổn định |
| 3. So Figma trên UI và skill `ui-check` | 3 ngày | Ảnh Figma export đúng kích thước viewport |
| 4. Healing và mở rộng | 1 ngày thử healing, cộng 1 đến 2 ngày mỗi module | Có một lần đổi UI thật để thử healing |

## 4. Bàn giao

Bước tiếp theo: `ak:plan` với hợp đồng này. Hướng: web app local bằng Node cho phần không AI. Bốn skill trong `.claude/skills/` cho phần AI chạy trong Claude Code của tester. agent-browser qua CLI. Cùng một bộ file trên disk. Không có cờ `--yagni`.

## Câu hỏi chưa giải quyết

- Tính năng pilot đầu tiên là gì và khi nào D5 đưa use case? Phase 1 không cần, Phase 2 cần ít nhất một file use case.
