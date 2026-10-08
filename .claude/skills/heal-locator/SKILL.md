---
name: heal-locator
description: Đề xuất sửa locator hỏng của một spec Playwright đã fail, dưới dạng diff chỉ đổi dòng locator, kèm lý do. Dùng khi người dùng gõ /heal-locator <feature> <id>, hoặc nhờ "sửa locator", "spec fail vì không tìm thấy element", "healing", "UI đổi làm hỏng spec". Không sửa assertion, không tự áp dụng.
---

# heal-locator: đề xuất sửa locator cho spec fail

Lệnh: `/heal-locator <feature> <id> [đợt]`. Kết quả là ĐỀ XUẤT: hai file `heal/<id>.diff` và `heal/<id>.md` trong thư mục đợt. Tester xem trên UI (khu Playwright của trang đợt) rồi bấm "Áp dụng và chạy lại", hoặc tự áp tay. Skill không sửa `tests/<feature>/<id>.spec.ts`.

Công thức dưới dùng `F` cho tính năng, `ID` cho mã test case, `S` cho session `ui-check-F`, `RUN` cho thư mục đợt.

## Điều cấm (bắt buộc)

- Không đổi bất kỳ `expect(...)`. Không xóa, không thêm, không đổi thứ tự bước (dòng `await`).
- Không dùng `waitForTimeout`. Không thêm `force: true`. Không bỏ qua test (`test.skip`, `fixme`).
- Không đổi URL, dữ liệu nhập, tên test. Chỉ thay biểu thức chọn element.
- Không đọc, không in `features/F/.env` và `auth/`. Không `state save`. Không tự đăng nhập, không vượt OTP.
- Không đổi spec trực tiếp. Không ghi vào `testcases.json`.

Tool kiểm tra lại các điều cấm này khi tester bấm áp dụng và trả 409 nếu diff vi phạm: dòng đổi không có locator, có `expect(`, `waitForTimeout`, `force:`, `test.skip`, hoặc phần ngoài biểu thức locator (tên hành động như `click` thành `dblclick`, giá trị trong `fill(`, `type(`, tùy chọn) khác dòng cũ. Đừng cố lách.

## Quy trình

### 0. Nhắc tester phân loại trước

Nói ngắn gọn với tester: spec fail có ba nguyên nhân, và skill này chỉ xử lý loại thứ hai.

1. Bug thật: sản phẩm sai. Sửa locator chỉ che lỗi. Ghi bug.
2. Locator hỏng: chức năng vẫn đúng nhưng tên, nhãn, vị trí element đã đổi.
3. UI đổi có chủ đích: luồng hoặc màn hình khác. Cần viết lại test case, không phải đổi locator.

Tester đã nói rõ là loại 2 thì làm tiếp. Chưa rõ thì vẫn điều tra bước 1 đến 3, nhưng kết luận phải nêu căn cứ.

### 1. Tìm đầu vào

Đợt: dùng đợt tester chỉ định, hoặc đợt mới nhất có kết quả Playwright:

```bash
ls -dt "${EVIDENCE_ROOT:-evidence}"/????-??-??_F/playwright-last.json "${EVIDENCE_ROOT:-evidence}"/????-??-??_F_r[0-9]*/playwright-last.json 2>/dev/null | head -1
```

Thư mục đợt là thư mục chứa file đó. Đọc:

- `tests/F/ID.spec.ts`
- `RUN/playwright-log.txt` (thông báo lỗi, dòng code kèm dấu `>`)
- `RUN/playwright-results.json` (`error.message`, `error.location.line` của test thuộc `ID.spec.ts`). Tool đã che credential trong file này và trong log ngay sau lần chạy. Không mở `RUN/playwright-report/` và `RUN/test-results/` (trace, report có thể chứa giá trị đã nhập)
- `features/F/feature.json` (baseURL, viewport, đường dẫn các screen)

Dừng, báo tester, không tạo diff, nếu: không có spec, hoặc `playwright-last.json` không ghi `ID.spec.ts` fail, hoặc log đã bị lần chạy khác ghi đè (spec không còn trong log). Nhờ tester chạy lại spec trên UI rồi gõ lại lệnh.

### 2. Xác định locator hỏng

Từ lỗi và số dòng, tìm dòng spec đầu tiên fail. Loại lỗi:

- `locator resolved to 0 elements`, `Timeout ... waiting for getBy...`: locator có thể hỏng. Tiếp bước 3.
- `strict mode violation` (nhiều element khớp): locator quá rộng. Tiếp bước 3, cần làm hẹp.
- Lỗi ở `expect(...)` (sai text, sai URL, sai số lượng): KHÔNG phải locator. Ghi `.md`, không tạo diff, dừng.
- Lỗi mạng, 500, trang trắng, bị đẩy về trang đăng nhập (phiên hết hạn): không phải locator. Ghi `.md`, nhờ tester kiểm tra hoặc `login` lại, dừng.

Chỉ xử lý một dòng fail mỗi lần. Dòng sau có thể hỏng nhưng chưa lộ vì test dừng ở dòng đầu. Nói với tester: sau khi áp dụng, chạy lại, nếu fail ở dòng khác thì gõ lệnh lần nữa.

### 3. Mở trang và tìm element tương đương

```bash
agent-browser --session S --state auth/F.json open <url của trang chứa element>
agent-browser --session S set viewport <w> <h>
agent-browser --session S snapshot -i
```

`<url>` lấy từ `page.goto` gần nhất trước dòng fail, hoặc `path` của screen trong `feature.json`. Chỉ thêm `--state` khi tính năng có phiên (`auth/F.json` tồn tại). Nếu trang đích cần làm các bước trước đó (bấm menu, mở dialog), làm đúng các bước ấy bằng `agent-browser click @ref` theo spec, không thêm bước nào khác. Bước cần credential hoặc OTP: dừng, nhờ tester.

Đọc `snapshot -i` để tìm element làm cùng việc với element trong spec (cùng vai trò, vị trí, nhãn gần giống). Không đoán khi snapshot không có element nào hợp lý: đó là dấu hiệu bug thật hoặc luồng đổi, xem bước 5.

Chọn locator mới theo thứ tự ưu tiên, dùng cái đầu tiên đủ ổn định và duy nhất:

1. `getByRole('<role>', { name: '<tên>' })`
2. `getByLabel('<nhãn>')`
3. `getByPlaceholder('<gợi ý>')`
4. `getByText('<chữ>')`
5. CSS ổn định (`#id`, `[name="..."]`). Không dùng `data-testid`.

Xpath hoặc `nth()` chỉ khi không còn cách, kèm comment `// TODO locator`. Kiểm tra locator mới khớp đúng một element: trong `snapshot -i` chỉ có một dòng role và name đó. Không đưa tên chứa dữ liệu động (ngày, mã, số đếm).

### 4. Ghi diff

Tạo diff bằng `diff -u` để số dòng đúng, không viết tay. Sửa trên bản sao, spec gốc giữ nguyên:

```bash
mkdir -p RUN/heal
cp tests/F/ID.spec.ts RUN/heal/ID.new.ts
# sửa các dòng locator trong RUN/heal/ID.new.ts
diff -u -U2 tests/F/ID.spec.ts RUN/heal/ID.new.ts > RUN/heal/ID.diff
rm RUN/heal/ID.new.ts
```

`diff` trả mã 1 khi có khác biệt, đó là bình thường. Kiểm tra `RUN/heal/ID.diff`: mọi dòng `+` và `-` đều là dòng locator, số dòng `-` bằng số dòng `+`, không dòng nào chứa `expect(`. Sai thì làm lại. Nhiều dòng locator hỏng cùng lúc thì mỗi dòng một hunk.

### 5. Ghi lý do (`RUN/heal/ID.md`)

Viết tiếng Việt, câu ngắn, cho tester không đọc code.

Khi có diff:

```markdown
# Đề xuất sửa locator: ID
Spec fail ở dòng <n>: <thông báo lỗi ngắn>.
Phân loại đề xuất: locator hỏng. Căn cứ: <vì sao chức năng vẫn còn>.

## Hunk 1 (dòng <n>)
- Cũ: `<locator cũ>`
- Mới: `<locator mới>`
- Lý do: <element nay có tên/nhãn gì, thấy ở đâu trong snapshot>
- Độ chắc: cao | trung bình | thấp, vì <...>

## Việc tester cần làm
Xem diff, bấm "Áp dụng và chạy lại" trên UI. Nếu spec vẫn fail ở dòng khác, chạy lại lệnh.
```

Khi KHÔNG có diff (bug thật, element không còn, luồng đổi, lỗi ở `expect`, hết phiên): ghi `.md` nêu loại lỗi, bằng chứng (dòng log, nội dung snapshot, ảnh nếu có), và việc tester nên làm (ghi bug, viết lại test case, đăng nhập lại). Xóa `RUN/heal/ID.diff` nếu có từ lần trước để UI không hiện đề xuất cũ. Không tạo diff. Dừng.

### 6. Dọn và báo cáo

```bash
agent-browser --session S close
```

Báo tester: đợt nào, dòng nào fail, có diff hay không, đường dẫn `RUN/heal/ID.diff` và `.md`, và nhắc xem trên UI trước khi áp dụng. Không tự gọi API áp dụng, không tự chạy lại spec.

## Lệnh CLI và công cụ skill này dùng

- `agent-browser --session S [--state auth/F.json] open | set viewport | snapshot -i | click @ref | close`
- `diff -u` để tạo diff. Không `npm run cli` nào, không `git`.
- Áp dụng do tool làm (`POST /api/runs/<đợt>/heal/<id>/apply`): sao lưu spec sang `RUN/heal/ID.spec.ts.bak`, áp diff, chạy lại spec.
