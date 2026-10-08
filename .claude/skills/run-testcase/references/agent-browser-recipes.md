# agent-browser: công thức dùng trong run-testcase

Mọi lệnh có `--session ui-check-<feature>`. Đây là trình duyệt riêng của tính năng, không dùng chung với việc khác. Tài liệu đầy đủ: `agent-browser skills get core --full`.

## Mở trình duyệt với phiên đã lưu

Chạy sau `run-start` (lệnh đó đóng trình duyệt cũ):

```bash
agent-browser --session ui-check-staging --state auth/staging.json open about:blank
agent-browser --session ui-check-staging set viewport 1440 900
```

- `--state` chỉ có tác dụng khi trình duyệt mới khởi chạy, nên đặt ở lệnh đầu tiên. File `auth/<f>.json` do tester tạo bằng `login`, cùng dạng với state của Playwright. Không mở file đó ra đọc.
- `set viewport` cần trình duyệt đã chạy, vì thế mở `about:blank` trước. Sau đó vào trang thật bằng `record-step --action navigate`.
- Tính năng không cần đăng nhập: bỏ `--state`.

## Xem trang và chọn ref

```bash
agent-browser --session S snapshot -i          # chỉ phần tử tương tác, kèm @ref
agent-browser --session S snapshot -i -u       # kèm href của link
agent-browser --session S snapshot -s "#main"  # giới hạn trong một vùng
```

Mỗi dòng có dạng `link "Learn more" [ref=e1]`: role, tên, ref. Chọn ref theo role và tên khớp với bước của test case. Ref mất hiệu lực khi trang đổi (điều hướng, mở dialog, render lại). `record-step` tự snapshot lại để tra role và name, nên chỉ cần ref đúng với trang hiện tại.

Phần tử không có trong snapshot: có thể nằm ngoài màn hình hoặc chưa render. Thử `agent-browser --session S scroll down 500` hoặc chờ, rồi snapshot lại. Phần tử trong iframe tự được đưa vào snapshot.

## Chờ

Chọn đúng kiểu chờ. Cách chờ sai là nguyên nhân lỗi thường gặp nhất:

```bash
agent-browser --session S wait @e5                  # chờ phần tử xuất hiện
agent-browser --session S wait --text "Thành công"   # chờ chữ xuất hiện
agent-browser --session S wait --url "**/dashboard"  # chờ URL khớp glob
agent-browser --session S wait --load networkidle    # chờ mạng yên (sau điều hướng SPA)
```

`record-step` có sẵn `--wait-url` và `--wait-text` chạy ngay sau thao tác, và tự chờ network idle sau click, press, select (tắt bằng `--no-settle`). Tránh `wait 2000` cố định.

## Kiểm tra kết quả mong đợi

Có action ghi vào history (dùng `record-step`):

```bash
npm run cli -- record-step --feature F --id ID --action assert_url --value "**/dashboard"
npm run cli -- record-step --feature F --id ID --action assert_text --ref e7 --value "Xin chào"
```

Chỉ để đọc, không ghi step (kết quả đưa vào `observation`):

```bash
agent-browser --session S get url
agent-browser --session S get text @e7
agent-browser --session S get title
agent-browser --session S get count ".error"
agent-browser --session S is visible @e7
agent-browser --session S is enabled @e5
agent-browser --session S is checked @e9
```

Không dùng `get value` trên ô mật khẩu và không `eval` để đọc cookie hay storage.

## Thao tác không nằm trong bảng action của record-step

`hover`, `dblclick`, `upload`, `drag`, kéo thả chưa có action trong schema `ai-run`, nên chưa chuyển được sang Playwright. Gặp bước như vậy: làm bằng agent-browser, ghi rõ trong `observation` và ghi chú cho tester là bước đó cần viết tay trong spec.

## Hộp thoại và tab

```bash
agent-browser --session S dialog status
agent-browser --session S dialog accept        # hoặc: dialog dismiss
agent-browser --session S tab                  # liệt kê tab
agent-browser --session S tab t2               # chuyển sang tab t2
```

`alert` tự đóng. `confirm` hay `prompt` chặn trang cho tới khi `dialog accept` hoặc `dialog dismiss`. Sau khi đổi tab, snapshot lại.

## Khi lệnh lỗi

- `Unknown ref` hoặc `Không thấy @eN`: snapshot lại.
- `Failed to connect`: trình duyệt chưa chạy, mở lại theo mục đầu (sau `run-start`).
- Trình duyệt treo hoặc trạng thái lạ: `agent-browser --session S close` rồi mở lại từ đầu. Nếu đã ghi step thì báo tester và kết thúc bằng `run-finish` với `KHÔNG XÁC ĐỊNH`.
- Nghi cài đặt hỏng: `agent-browser doctor`.

## Dọn dẹp

`run-finish` đóng session. Nếu phải dừng giữa chừng mà chưa chạy được `run-finish`, chạy `agent-browser --session S close`.
