# Schema các file dùng chung

Tool và skill đọc, ghi cùng các file này. Mã kiểm tra nằm ở `tool/core/schemas.ts` (zod). Test ở `tool/core/__tests__/schemas.test.ts`.

Quy ước chung:

- `<feature>`, key screen, `id` chỉ dùng chữ, số, `-` và `_`. Tên bắt đầu bằng chữ hoặc số. Tên `<feature>` không được kết thúc bằng `_r<số>` (trùng tên đợt vòng N của tính năng khác).
- Thời gian dạng ISO 8601 có múi giờ, ví dụ `2026-10-07T15:00:00+07:00`.
- File JSON dùng UTF-8, thụt hai dấu cách.
- Không file nào chứa giá trị credential. Chỗ cần nhắc credential, ghi `<secret:TÊN_BIẾN>`.

## `features/<feature>/feature.json`

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `feature` | chuỗi | có | Tên tính năng. Phải trùng tên thư mục |
| `service` | chuỗi | có | Tên service hiển thị cho tester |
| `baseURL` | URL | có | Địa chỉ gốc của môi trường test |
| `viewport.width` | số nguyên > 0 | có | Chiều rộng viewport. Cũng là kích thước ảnh Figma |
| `viewport.height` | số nguyên > 0 | có | Chiều cao viewport |
| `screens` | object | có | Key là tên screen, giá trị là object bên dưới |
| `theme` | object | không | Cách trang đổi theme sáng và tối, dùng cho lệnh `audit`. Xem bên dưới |

Mỗi screen:

| Trường | Kiểu | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `path` | chuỗi bắt đầu bằng `/` | bắt buộc | Đường dẫn so với `baseURL` |
| `auth` | boolean | `false` | `true` nếu cần phiên đăng nhập |
| `mask` | mảng selector CSS | `[]` | Vùng dữ liệu động, bỏ qua khi so ảnh |
| `scale` | số > 0 | `1` | Tỉ lệ ảnh Figma export (1 hoặc 2) |
| `wait_for` | mảng selector CSS | `[]` | Selector phải xuất hiện trước khi chụp |

Ví dụ:

```json
{
  "feature": "staging",
  "service": "Staging",
  "baseURL": "https://staging.example.com",
  "viewport": { "width": 1440, "height": 900 },
  "screens": {
    "home": { "path": "/", "auth": true, "mask": [], "scale": 1, "wait_for": [] }
  }
}
```

Trường `theme`:

| Trường | Kiểu | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `method` | `localStorage`, `media`, `none` | bắt buộc | `localStorage`: tool ghi `key` trước khi trang chạy script. `media`: trang theo `prefers-color-scheme`. `none`: chỉ một theme |
| `key` | chuỗi | bắt buộc khi `localStorage` | Tên khóa trong `localStorage` |
| `light`, `dark` | chuỗi | `light`, `dark` | Giá trị ghi vào `key` cho từng theme |
| `toggle` | selector CSS | không | Nút đổi theme. Có thì `audit` bấm thử và kiểm tra theme được nhớ sau khi tải lại |

Ví dụ: `"theme": { "method": "localStorage", "key": "theme", "toggle": "[data-testid=\"theme-toggle\"]" }`

## `features/<feature>/testcases.json`

Một mảng. Mỗi phần tử là một test case. `id` không được trùng.

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | chuỗi | có | Mã test case, ví dụ `TC_STAGING_001` |
| `title` | chuỗi | có | Tiêu đề |
| `screen` | chuỗi | không | Key screen trong `feature.json`. Nối với ảnh Figma |
| `preconditions` | mảng chuỗi | có | Điều kiện trước. Có thể rỗng |
| `steps` | mảng chuỗi | có, ít nhất 1 | Các bước, kèm test data cụ thể |
| `expected` | mảng chuỗi | có, ít nhất 1 | Kết quả mong đợi. Mỗi mục thành ít nhất một `expect()` |
| `priority` | `High`, `Medium`, `Low` | có | Độ ưu tiên |
| `type` | `positive`, `negative`, `boundary`, `validation` | có | Loại test |
| `status` | xem bên dưới | có | Trạng thái |
| `manual` | boolean | không | `true` nếu cần OTP hoặc captcha, AI không chạy |
| `tester_note` | chuỗi | không | Ghi chú của tester |

Giá trị `status`:

| Giá trị | Nghĩa |
| --- | --- |
| `draft` | AI mới sinh, chờ tester duyệt |
| `reviewed` | Tester đã duyệt, được phép chạy thử |
| `ai-passed` | Tester xác nhận kết quả AI chạy thử là đạt |
| `ai-failed` | Tester xác nhận kết quả AI chạy thử là không đạt |
| `automated` | Tester duyệt spec Playwright. Chỉ tester được đặt giá trị này |

## `<đợt>/ai-run/<id>.json`

Ghi lại một lần AI chạy thử. Không phụ thuộc công cụ chạy. `<đợt>` là `$EVIDENCE_ROOT/<YYYY-MM-DD>_<feature>[_rN]`.

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `id` | chuỗi | Mã test case |
| `feature` | chuỗi | Tên tính năng |
| `baseURL` | URL | Môi trường đã chạy |
| `viewport` | `{width, height}` | Viewport đã dùng |
| `started_at` | thời gian | Lúc bắt đầu chạy |
| `steps` | mảng | Các step đã thực hiện, xem bên dưới |
| `ai_result` | object hoặc `null` | Kết quả AI đề xuất. `null` khi chưa đánh giá |
| `tester` | object | Quyết định của tester |

Mỗi phần tử của `steps`:

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `n` | số nguyên > 0 | Số thứ tự step, bắt đầu từ 1 |
| `action` | `navigate`, `click`, `fill`, `press`, `select`, `check`, `assert_text`, `assert_url` | Hành động |
| `target` | object hoặc `null` | Element đích. `null` với `navigate` và `assert_url` |
| `value` | chuỗi hoặc `null` | Giá trị nhập, phím, URL, hoặc chữ cần kiểm. Credential ghi `<secret:TÊN_BIẾN>`. `assert_url` có thể dùng `*` làm glob. Mọi giá trị trùng một giá trị trong `.env` (từ 3 ký tự) đều bị che thành `<secret:TÊN_BIẾN>` |
| `url_before` | chuỗi hoặc `null` | URL trước khi làm |
| `url_after` | chuỗi hoặc `null` | URL sau khi làm |
| `screenshot` | chuỗi hoặc `null` | Đường dẫn ảnh so với `<đợt>`, ví dụ `screenshots/TC_STAGING_001/01.png` |
| `note` | chuỗi | Ghi chú của AI. `assert_url` và `assert_text` thêm kết quả kiểm tra vào đây. Mặc định rỗng |

`target`: các trường `role`, `name`, `label`, `placeholder`, `css`. Mỗi trường là chuỗi hoặc `null`. Lệnh `record-step` điền `role` và `name` từ accessibility snapshot, `label` từ `aria-label`, `placeholder`, và `css` (`#id` hoặc `[name="..."]`) từ thuộc tính của element, bỏ trường nào không đọc được. `css` chỉ dùng khi không có cách khác.

`ai_result`:

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `verdict` | `ĐẠT`, `KHÔNG ĐẠT`, `KHÔNG XÁC ĐỊNH` | Đề xuất tổng của AI |
| `per_expected` | mảng | Mỗi phần tử có `expected`, `verdict` (cùng ba giá trị), `observation` (quan sát cụ thể) |

`tester`:

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `decision` | `confirmed`, `rejected`, `null` | Quyết định của tester. `null` khi chưa quyết |
| `note` | chuỗi | Lý do hoặc ghi chú bug |
| `decided_at` | thời gian hoặc `null` | Lúc quyết định, kèm múi giờ (ví dụ `+07:00`) |

Chỉ tool ghi `tester`, qua UI trang đợt (`POST /api/runs/<đợt>/ai-runs/<id>/decision`). Tool ghi cùng lúc status test case: `confirmed` thành `ai-passed`, `rejected` thành `ai-failed`. `ai-passed` thành `automated` qua `POST /api/features/<f>/testcases/<id>/automate`.

## `<đợt>/playwright-last.json`

Tool ghi khi một lần chạy Playwright từ UI kết thúc (kể cả bị dừng). Kết quả từng test lấy từ `playwright-results.json` (reporter json).

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `feature` | chuỗi | Tên tính năng |
| `spec` | chuỗi hoặc `null` | Spec đã chạy, ví dụ `tests/staging/TC_001.spec.ts`. `null` là regression |
| `exit_code` | số nguyên hoặc `null` | Mã thoát. `null` khi tiến trình bị dừng bằng tín hiệu |
| `stopped` | boolean | Tester đã bấm Dừng |
| `started_at`, `finished_at` | thời gian | Kèm múi giờ |
| `tests` | mảng | Mỗi phần tử có `file` (tên file spec), `title`, `status` (`passed`, `failed`, `flaky`, `skipped`), `duration_ms`. Rỗng nếu không có kết quả |

Cùng thư mục: `playwright-log.txt` (log đã che credential), `playwright-results.json`, `playwright-report/`, `test-results/` (ảnh và trace của test fail), `bugs.md` (mục "Nghi bug" do tester ghi khi quyết định, mỗi test case một mục `## <id> - <tiêu đề>`).

## `<đợt>/heal/<id>.diff`, `<id>.md`, `<id>.spec.ts.bak`

Do skill `heal-locator` và tool ghi khi sửa locator của spec fail.

| File | Nội dung |
| --- | --- |
| `<id>.diff` | Unified diff (`diff -u`) của `tests/<feature>/<id>.spec.ts`. Chỉ đổi dòng locator, số dòng xóa bằng số dòng thêm, không chạm `expect(`. Tên file trong dòng `---`/`+++` không được dùng, tool luôn áp lên spec của `<id>` |
| `<id>.md` | Lý do bằng tiếng Việt. Có diff: mỗi hunk một mục (cũ, mới, lý do, độ chắc). Không có diff: loại lỗi, bằng chứng, việc tester nên làm |
| `<id>.spec.ts.bak` | Spec ngay trước lần áp dụng gần nhất. Tool ghi khi tester bấm "Áp dụng và chạy lại" |

## `<đợt>/ui-diff/<screen>/metrics.json`

Do lệnh `compare` ghi. Pixel diff chỉ để khoanh vùng, không dùng làm kết luận đạt hay không đạt.

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `screen` | chuỗi | Key screen |
| `figma_size` | `[rộng, cao]` | Kích thước ảnh Figma sau khi chia `scale` |
| `actual_size` | `[rộng, cao]` | Kích thước ảnh chụp thực tế |
| `compared_size` | `[rộng, cao]` | Phần chồng lên nhau đã so |
| `scale` | số > 0 | Tỉ lệ export Figma đã dùng |
| `threshold` | số nguyên 0 đến 255 | Chênh lệch kênh màu tối đa coi là giống |
| `diff_ratio` | số 0 đến 1 | Tỉ lệ pixel khác |
| `regions` | mảng | Các vùng khác, xếp theo số pixel giảm dần |
| `total_regions` | số nguyên | Tổng số vùng tìm thấy, có thể lớn hơn số vùng xuất |
| `masked_boxes` | số nguyên | Số vùng đã mask |
| `warnings` | mảng chuỗi | Cảnh báo, ví dụ kích thước lệch |
| `note` | chuỗi | Nhắc rằng diff không phải kết luận |

Mỗi vùng trong `regions`:

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `id` | số nguyên > 0 | Số vùng, trùng số trên `diff.png` |
| `x`, `y` | số nguyên >= 0 | Góc trên trái, tính bằng pixel |
| `w`, `h` | số nguyên > 0 | Rộng và cao |
| `changed_px` | số nguyên >= 0 | Số pixel khác trong vùng |
| `crop` | chuỗi, tùy chọn | Ảnh crop, ví dụ `crops/region_01.png` |

## `<đợt>/ui-diff/<screen>/meta.json`

Do lệnh `capture` ghi. Ảnh Figma thiếu, thiếu phiên, bị chuyển hướng hay lỗi chụp đều thành một dòng trong `warnings`, không làm lệnh dừng.

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `screen` | chuỗi | Key screen |
| `captured_at` | thời gian | Lúc chụp |
| `viewport` | `{width, height}` | Viewport đã dùng |
| `full_page` | boolean | Có chụp cả trang không |
| `scale` | số > 0 | `scale` của screen trong `feature.json`, `compare` dùng làm mặc định |
| `url`, `final_url` | chuỗi, tùy chọn | URL yêu cầu và URL sau khi tải. Khác nhau thì có cảnh báo chuyển hướng |
| `figma_source` | chuỗi, tùy chọn | Đường dẫn ảnh Figma, tương đối với gốc project. Không có khi thiếu ảnh |
| `figma_modified` | thời gian, tùy chọn | Ngày sửa lần cuối của ảnh Figma |
| `mask_boxes` | mảng | Vùng mask tính từ selector `mask`: `{selector, x, y, width, height}` (đơn vị pixel, làm tròn). `compare` bỏ các vùng này khỏi diff |
| `warnings` | mảng chuỗi | Cảnh báo khi chụp. `compare` chép vào `metrics.json` |

Cùng thư mục: `actual.png`, `figma.png` (bản sao lúc chụp), `diff.png`, `side_by_side.png` (Figma, thực tế, diff từ trái sang phải), `crops/region_NN.png` (Figma trái, thực tế phải), `report.md` (do skill `ui-check` ghi), `decisions.json`, `baseline.json`. `final_url` chỉ gồm origin và đường dẫn, không có query và fragment (có thể chứa token). Chụp lại thì tool xóa `actual.png`, `figma.png`, `diff.png`, `side_by_side.png`, `metrics.json`, `meta.json`, `crops/` của screen đó, giữ `report.md`, `decisions.json`, `baseline.json`. `report.md` cũ hơn `metrics.json` bị UI đánh dấu là cũ.

## `<đợt>/ui-diff/<screen>/report.md`

Mẫu ở `.claude/skills/_shared/report-template.md`. Tool chỉ đọc bảng trong mục `## Sai khác đề xuất` với các cột `#`, `Vùng`, `Hạng mục`, `Figma`, `Thực tế`, `Mức`, `Phân loại` (tìm theo tên cột, bỏ dấu). Mỗi dòng của bảng là một mục, đánh số từ 1 theo thứ tự dòng. Số sai khác theo mức trong `summary.md` đếm các dòng có `Phân loại` là "Sai khác thật".

## `<đợt>/ui-diff/<screen>/decisions.json`

Do tool ghi khi tester bấm "Lưu quyết định". Ghi đè cả file mỗi lần.

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `items` | mảng | Mỗi phần tử: `index` (số dòng của bảng trong `report.md`, từ 1), `decision` (`bug`, `accept`, `review`), `note` (chuỗi, có thể rỗng) |
| `decided_at` | thời gian | Lúc lưu |
| `report_hash` | chuỗi, tùy chọn | sha256 của `report.md` lúc lưu. Thiếu hoặc khác hash của `report.md` hiện tại thì quyết định đã cũ: tool coi mọi mục là chưa quyết định, UI báo "report đã đổi, cần quyết định lại" và chưa cho tạo baseline. File cũ không có trường này cũng bị coi là đã cũ. Không xóa file để vô hiệu hóa |

## `<đợt>/ui-diff/<screen>/baseline.json`

Do tool ghi sau khi `npx playwright test <spec> --update-snapshots` thoát với mã 0 và ảnh baseline đã có trên disk.

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `created_at` | thời gian | Lúc tạo |
| `figma_modified` | thời gian hoặc `null` | Ngày sửa lần cuối của ảnh Figma đã dùng khi so |
| `spec` | chuỗi | Spec đã chạy, ví dụ `tests/staging/TC_STAGING_001.spec.ts` |
| `screenshot` | chuỗi | Ảnh baseline, `tests/__screenshots__/<feature>/<screen>.png` |
| `run` | chuỗi | Tên đợt |
| `tester` | chuỗi | Tên tester lấy từ frontmatter `summary.md` của đợt, rỗng nếu chưa điền |
| `backup` | chuỗi hoặc `null` | Thư mục sao lưu `tests/__screenshots__/<feature>/` trước lần chạy, `<đợt>/baseline-backup/<thời điểm>/`, tương đối với gốc project. `null` khi trước đó chưa có ảnh nào. `--update-snapshots` chạy cả spec, nên sau lần chạy tool khôi phục mọi ảnh trừ `<screen>.png` về bản sao và xóa ảnh mới của screen khác (chưa được tester duyệt). Lần chạy lỗi thì khôi phục cả `<screen>.png` |

## `<đợt>/ui-audit/<screen>/checks.json`

Lệnh `audit` ghi. Skill `ui-audit` đọc và viết `report.md` cùng thư mục.

| Trường | Mô tả |
| --- | --- |
| `url`, `audited_at`, `theme`, `viewports` | Trang đã kiểm tra, thời điểm, cấu hình theme, danh sách viewport |
| `variants[]` | Mỗi tổ hợp viewport và theme: `shown_theme` (theme nhìn thấy, đoán theo độ sáng nền), `screenshot`, `viewport_shots`, `checks`, `console`, `page_errors`, `failed_requests`, `warnings` |
| `variants[].checks` | `page` (kích thước, `horizontal_scroll`), `contrast` (`checked`, `skipped_on_image`, `failures`, `items`), `overflow`, `images` (`broken`, `missing_alt`), `headings` (`h1`, `skips`), `links` (`no_target`, `bad_rel`, `unnamed_controls`), `floating` (phần tử fixed hoặc sticky), `light_blocks_in_dark` |
| `theme_toggle` | Trạng thái trước khi bấm, sau khi bấm, sau khi tải lại. `switched`, `remembered`. `null` khi không khai báo `toggle` |
| `os_dark_preference` | Theme hiển thị khi hệ điều hành chọn tối và chưa chọn theme trên trang. `null` khi `method` là `media` hoặc `none` |
| `review_images` | Ảnh sáng và tối cạnh nhau ở `review/<viewport>-NN.png` |
| `warnings` | Thiếu theme, thiếu phiên đăng nhập |

Cùng thư mục: `shots/<viewport>-<theme>.png` (toàn trang, chụp từng khúc rồi ghép nên không bị giới hạn 16384px), `shots/<viewport>-<theme>-top.png` và `-bottom.png` (một màn hình ở đầu và cuối trang), `probe/NN.png` (ảnh skill chụp khi thử link), `report.md` (skill viết). Chạy lại vào cùng đợt thì `shots/` và `review/` bị thay, `report.md` giữ nguyên.

## `<đợt>/summary.md`

Một file Markdown. Đầu file là frontmatter YAML, sau đó là phần thân.

Frontmatter (mỗi giá trị là chuỗi trong nháy kép, ví dụ `tester: "Lan"`):

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `feature` | chuỗi | có | Tên tính năng |
| `date` | `YYYY-MM-DD` | có | Ngày của đợt |
| `run` | chuỗi | có | Tên thư mục đợt, ví dụ `2026-10-07_staging` |
| `tester` | chuỗi | không | Tên tester |
| `environment` | chuỗi | không | URL môi trường |
| `build` | chuỗi | không | Build hoặc commit được test |

Phần thân có các mục: phạm vi, bảng test case kèm kết quả đề xuất, link bug, và mục `## Kết luận của tester`. Skill luôn để trống mục cuối. Chỉ tester điền, trên UI hoặc bằng tay.

## `settings.local.json`

Cài đặt riêng trên máy tester, ở thư mục gốc project. Không commit. Tạo và sửa bằng `npm run cli -- settings`.

| Trường | Kiểu | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `playwright.headless` | boolean | `true` | `true`: chạy ẩn. `false`: mở cửa sổ trình duyệt để xem. Áp dụng cho `capture`, `audit`, `check-session`, spec, regression, và agent-browser. Lệnh `login` luôn mở cửa sổ |

Thứ tự ưu tiên với Playwright: cờ `--headed` hoặc `--headless` của lệnh, rồi biến môi trường `HEADLESS=true|false`, rồi file này.

Lệnh `settings` ghi thêm `headed` vào `agent-browser.json` ở thư mục gốc (cũng không commit). agent-browser tự đọc file này khi chạy từ thư mục gốc. Các khóa khác trong file được giữ nguyên. Session agent-browser đang mở giữ chế độ cũ đến khi đóng.

## `auth/<feature>.json` và `auth/<feature>.meta.json`

`auth/<feature>.json` là storageState của Playwright (khóa `cookies` và `origins`). Chứa token. Không in, không sao chép, không đưa vào report. agent-browser nạp qua `--state`.

`auth/<feature>.meta.json`:

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `feature` | chuỗi | Tên tính năng |
| `saved_at` | thời gian | Lúc lưu phiên |
| `final_url` | chuỗi | URL của trang lúc tester bấm lưu, chỉ origin và đường dẫn (bỏ query và fragment vì có thể chứa token) |

`auth/<feature>.save` là file cờ rỗng. UI tạo file này để báo lệnh `login --wait-flag` lưu phiên. Lệnh xóa file sau khi lưu.
