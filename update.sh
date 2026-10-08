#!/usr/bin/env bash
# Cập nhật tool lên bản mới nhất: tải code mới từ repo, rồi cài lại những gì bản mới cần.
# Dữ liệu của tester (features/, tests/, evidence/, auth/, cài đặt riêng) không bị đụng tới.
#
# Cách chạy: mở terminal trong thư mục project, chạy: bash update.sh

set -euo pipefail

fail() {
  printf '\nLỖI: %s\n' "$*" >&2
  exit 1
}

cd "$(dirname "${BASH_SOURCE[0]}")"
command -v git >/dev/null 2>&1 || fail "Chưa có git. Chạy bash install.sh trước."
[ -d .git ] || fail "Thư mục này không phải project tải bằng git. Chạy install.sh để tải lại project."

printf '==> Bản đang dùng: %s\n' "$(git log -1 --format='%h %s (%ad)' --date=short)"

# Tester không được sửa file của tool. Có file bị sửa thì dừng, không tự xóa thay đổi.
changed="$(git status --porcelain --untracked-files=no)"
if [ -n "$changed" ]; then
  printf '%s\n' "$changed"
  fail "Các file trên của tool đã bị sửa trên máy này nên chưa cập nhật được. Gửi danh sách này cho người phát triển. Đừng tự xóa."
fi

printf '\n==> Tải code mới\n'
before="$(git rev-parse HEAD)"
# --ff-only: chỉ nhận bản mới, không bao giờ tạo commit gộp hay conflict trên máy tester.
git pull --ff-only || fail "Không tải được bản mới. Gửi thông báo lỗi ở trên cho người phát triển."

if [ "$(git rev-parse HEAD)" = "$before" ]; then
  printf '    Đã là bản mới nhất.\n'
else
  printf '    Thay đổi:\n'
  git log --format='      - %s' "$before..HEAD"
fi

# Cài lại thư viện, Chromium, agent-browser theo bản mới. Dùng install.sh của bản vừa tải.
printf '\n==> Cài lại những gì bản mới cần\n'
exec bash ./install.sh
