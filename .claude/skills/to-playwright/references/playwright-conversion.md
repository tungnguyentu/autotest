# Chuyển ai-run sang Playwright

Đầu vào: `<đợt>/ai-run/<id>.json` của test case tester đã xác nhận (`tester.decision === "confirmed"`).
Đầu ra: `tests/<feature>/<id>.spec.ts`. Tester xem lại trước khi đưa vào regression.

Schema step: `n`, `action`, `target` (`role`, `name`, `label`, `placeholder`, `css`, mỗi trường có thể `null`), `value`, `url_before`, `url_after`, `screenshot`, `note`. Chi tiết: `docs/schemas.md`.

## Ánh xạ action

| `action` | Playwright |
| --- | --- |
| `navigate` | `await page.goto('<đường dẫn>')`. `value` là đường dẫn thì dùng nguyên. `value` là URL đầy đủ cùng origin với `baseURL` thì chỉ lấy đường dẫn và query. URL khác origin thì giữ URL đầy đủ |
| `click` | `await <locator>.click()` |
| `fill` | `await <locator>.fill(<giá trị>)` |
| `press` | Có `target`: `await <locator>.press('<phím>')`. Không có: `await page.keyboard.press('<phím>')` |
| `select` | `await <locator>.selectOption('<giá trị>')` (khớp theo value hoặc label) |
| `check` | `await <locator>.check()` |
| `assert_url` | `await expect(page).toHaveURL(<regex>)`. Giá trị có `*` là glob: `**/dashboard` thành `/\/dashboard$/`. Không có `*`: regex chứa chuỗi đó, đã escape |
| `assert_text` | Có `target`: `await expect(<locator>).toContainText('<giá trị>')`. Không có: `await expect(page.getByText('<giá trị>').first()).toBeVisible()` |

`url_before`, `url_after`, `screenshot`, `note` chỉ để hiểu ngữ cảnh. Không đưa vào spec. Step có `note` nhắc tới bước thất bại hoặc lệnh ngoài schema thì hỏi tester trước khi chuyển.

Giá trị `<secret:KEY>` trong `value` thành `process.env.KEY!`. Ví dụ `fill` với `<secret:USER_PASSWORD>` thành `.fill(process.env.USER_PASSWORD!)`.

## Chọn locator (KHÔNG dùng data-testid)

Từ `target` của step, lấy cái đầu tiên có dữ liệu:

1. `role` và `name`: `page.getByRole('<role>', { name: '<name>' })`. Role là `textbox`, `button`, `link`, `checkbox`, `combobox`, `heading`, `tab`...
2. `label`: `page.getByLabel('<label>')`
3. `placeholder`: `page.getByPlaceholder('<placeholder>')`
4. Chữ hiển thị tĩnh (không phải dữ liệu động): `page.getByText('<text>', { exact: true })`. `target` không có trường text, dùng khi `name` là chữ hiển thị của phần tử không có role rõ.
5. `css` ổn định: `#id` (id không giống sinh tự động), `[name="..."]`: `page.locator('<css>')`
6. Xpath hoặc selector yếu: chỉ khi không còn cách, kèm `// TODO locator: <lý do>`

Quy tắc phụ:

- `getByRole` mặc định khớp tên theo chuỗi con, không phân biệt hoa thường. Nhiều phần tử khớp (strict mode violation) thì thêm `exact: true`, hoặc dùng bước 2 đến 5 cho cùng element.
- Bước 1 đến 3 không đủ phân biệt hai element giống nhau: thêm `// TODO locator: nhiều element trùng tên, cần tester chọn`.
- Tránh: class sinh tự động (`.css-1x2y3z`), `nth-child`, text chứa dữ liệu thay đổi.
- Thiếu thông tin để chọn locator tốt: mở trang bằng Playwright và xem cây accessibility thay vì đoán. Không bịa tên.

## Phiên đăng nhập

- `playwright.config.ts` đã nạp `auth/<feature>.json` (`storageState`) và `features/<feature>/.env`. Spec không có bước đăng nhập và không đọc `.env`.
- Ngoại lệ: test case kiểm tra chính chức năng đăng nhập (các step đầu là `navigate` tới trang login rồi `fill` với `<secret:...>`). Thêm `test.use({ storageState: { cookies: [], origins: [] } });` ở đầu file để bắt đầu từ trạng thái chưa đăng nhập.

## Assertion

- Mỗi dòng `expected` của test case có ít nhất một `expect()`. Đối chiếu từng dòng với step `assert_*` và với `ai_result.per_expected[].observation`:
  - Có step `assert_*` tương ứng: dùng đúng giá trị của step.
  - Không có: suy ra từ quan sát (URL cuối, chữ AI đã thấy, phần tử hiển thị) thành `expect()` cùng mức chặt, đặt comment `// expected: <nguyên văn dòng expected>`, và liệt kê trong báo cáo là "assertion suy ra, tester xem lại". Không suy ra được thì dừng và hỏi tester.
- Các kiểu thường dùng: chuyển trang `toHaveURL`, hiển thị `toBeVisible()`, nội dung `toHaveText()` hoặc `toContainText()`, lỗi validation `expect(page.getByText('...')).toBeVisible()`.
- Giữ nguyên chặt-lỏng của lúc AI kiểm: không đổi `toContainText` thành `toBeVisible`, không bỏ assertion vì khó chạy.
- Màn hình có trong `feature.json` (`screens`) và đã có baseline `tests/__screenshots__/<feature>/<screen>.png`: thêm `await expect(page).toHaveScreenshot('<screen>.png', { mask: [page.locator('<mask>')], maxDiffPixelRatio: 0.01 })` với `mask` lấy từ `feature.json`. Chưa có baseline thì không thêm (lần chạy đầu sẽ fail vì chưa có ảnh gốc, và baseline chỉ tạo sau khi tester duyệt UI). Ghi vào báo cáo màn nào còn thiếu.
- Cấm `page.waitForTimeout`. Chờ bằng auto-wait của Playwright hoặc `expect(...)`.

## Mẫu

```ts
import { expect, test } from '@playwright/test';

// Test case kiểm tra chính chức năng đăng nhập nên bắt đầu không có phiên.
test.use({ storageState: { cookies: [], origins: [] } });

test('TC_LOGIN_001 - Đăng nhập thành công với tài khoản hợp lệ', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(process.env.USER_EMAIL!);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(process.env.USER_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  // expected: Chuyển tới trang tổng quan
  await expect(page).toHaveURL(/\/dashboard$/);
  // expected: Thấy lời chào
  await expect(page.getByRole('heading', { name: 'Xin chào' })).toBeVisible();
});
```

Test case không cần phiên riêng thì bỏ dòng `test.use(...)`.

## Sau khi sinh

1. Chạy: `npm run cli -- run-spec --feature <feature> --id <id> --run-dir <đợt>` (không chạy `npx playwright test` trực tiếp, log chỉ được che credential qua lệnh này)
2. Fail: báo tester kèm thông báo lỗi. Không nới hay xóa assertion để ép pass.
3. Liệt kê cho tester: số locator theo từng loại, các `// TODO locator`, các assertion suy ra.
