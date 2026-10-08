#!/usr/bin/env bash
# Cài mọi thứ tester cần để dùng tool AI Testing: git, Node 26, thư viện của project,
# Chromium cho Playwright, agent-browser, Claude Code. Chạy lại nhiều lần không sao: thứ đã có thì bỏ qua.
#
# Cách chạy:
#   - Máy chưa có project (chưa có git):
#       curl -fsSL https://raw.githubusercontent.com/tungnguyentu/autotest/master/install.sh | bash
#     Project được tải về ~/autotest. Muốn chỗ khác: ... | bash -s -- /đường/dẫn/thư-mục
#   - Đã có project: mở terminal trong thư mục project, chạy: bash install.sh
#
# Hỗ trợ macOS và Linux có apt, dnf hoặc yum.

set -euo pipefail

REPO_URL="https://github.com/tungnguyentu/autotest.git"
NODE_MAJOR=26
AGENT_BROWSER_VERSION="0.34.0"

step() { printf '\n==> %s\n' "$*"; }
ok() { printf '    OK: %s\n' "$*"; }
warn() { printf '    CẢNH BÁO: %s\n' "$*"; }
fail() {
  printf '\nLỖI: %s\n' "$*" >&2
  exit 1
}
has() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
case "$OS" in
  Darwin | Linux) ;;
  *) fail "Hệ điều hành $OS chưa được hỗ trợ. Chỉ hỗ trợ macOS và Linux." ;;
esac

# Trình quản lý gói trên Linux. Cần sudo.
linux_install() {
  if has apt-get; then
    sudo apt-get update -y && sudo apt-get install -y "$@"
  elif has dnf; then
    sudo dnf install -y "$@"
  elif has yum; then
    sudo yum install -y "$@"
  else
    fail "Không tìm thấy apt-get, dnf hay yum. Cài tay: $*"
  fi
}

# Dòng khởi tạo được thêm vào file cấu hình shell, mỗi dòng chỉ thêm một lần.
add_to_profiles() {
  local line="$1" rc
  for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ "$rc" = "$HOME/.zshrc" ] && [ "$OS" != "Darwin" ] && [ ! -f "$rc" ]; then continue; fi
    touch "$rc"
    grep -qxF "$line" "$rc" || printf '\n%s\n' "$line" >>"$rc"
  done
}

# ---------- 1. curl ----------
if ! has curl; then
  step "Cài curl"
  [ "$OS" = "Linux" ] || fail "Không có curl. Cài curl rồi chạy lại."
  linux_install curl
fi

# ---------- 2. git ----------
step "Kiểm tra git"
git_ready() { has git && git --version >/dev/null 2>&1; }
if git_ready; then
  ok "$(git --version)"
elif [ "$OS" = "Darwin" ]; then
  if has brew; then
    brew install git
  else
    # macOS: git đi kèm Command Line Tools. Lệnh này mở hộp thoại cài đặt.
    xcode-select --install >/dev/null 2>&1 || true
    fail "Chưa có git. Một hộp thoại cài Command Line Tools vừa mở: bấm Install, chờ cài xong, rồi chạy lại script này."
  fi
  git_ready || fail "Cài git chưa thành công. Cài tay rồi chạy lại."
  ok "$(git --version)"
else
  linux_install git
  ok "$(git --version)"
fi

# ---------- 3. Node 26 ----------
# Đã có Node đủ mới thì dùng luôn. Chưa có thì cài qua fnm (không cần sudo).
# Máy đã dùng fnm cho dự án khác: chỉ cài thêm Node 26, không đổi bản mặc định của máy.
step "Kiểm tra Node $NODE_MAJOR"
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
FNM_DIR_DEFAULT="$HOME/.fnm"

if has node && [ "$(node_major)" -ge "$NODE_MAJOR" ]; then
  ok "node $(node -v)"
else
  if [ -x "$FNM_DIR_DEFAULT/fnm" ]; then export PATH="$FNM_DIR_DEFAULT:$PATH"; fi
  fresh_fnm=0
  if ! has fnm; then
    if [ "$OS" = "Linux" ] && ! has unzip; then linux_install unzip; fi
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$FNM_DIR_DEFAULT" --skip-shell --force-no-brew
    export PATH="$FNM_DIR_DEFAULT:$PATH"
    add_to_profiles "export PATH=\"$FNM_DIR_DEFAULT:\$PATH\""
    add_to_profiles 'eval "$(fnm env --use-on-cd)"'
    fresh_fnm=1
  fi
  eval "$(fnm env --shell bash)"
  fnm install "$NODE_MAJOR"
  if [ "$fresh_fnm" = 1 ] || ! fnm list 2>/dev/null | grep -q "default"; then
    fnm default "$NODE_MAJOR"
  else
    warn "Máy đã dùng fnm với bản Node mặc định khác. Script không đổi bản mặc định. Project có file .node-version (Node $NODE_MAJOR): bật 'fnm env --use-on-cd' trong shell, hoặc chạy 'fnm use $NODE_MAJOR' trước khi làm việc."
  fi
  fnm use "$NODE_MAJOR" >/dev/null
  [ "$(node_major)" -ge "$NODE_MAJOR" ] || fail "Cài Node $NODE_MAJOR chưa thành công."
  ok "node $(node -v) (qua fnm)"
fi

# ---------- 4. Project ----------
step "Kiểm tra project"
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/package.json" ] && [ -d "$SCRIPT_DIR/tool" ]; then
  PROJECT_DIR="$SCRIPT_DIR"
  ok "Dùng project tại $PROJECT_DIR"
else
  PROJECT_DIR="${1:-$HOME/autotest}"
  if [ -d "$PROJECT_DIR/.git" ]; then
    ok "Đã có project tại $PROJECT_DIR"
  elif [ -e "$PROJECT_DIR" ] && [ -n "$(ls -A "$PROJECT_DIR" 2>/dev/null)" ]; then
    fail "$PROJECT_DIR đã có file nhưng không phải project. Chọn thư mục khác: ... | bash -s -- /đường/dẫn/khác"
  else
    git clone "$REPO_URL" "$PROJECT_DIR"
    ok "Đã tải project về $PROJECT_DIR"
  fi
fi
cd "$PROJECT_DIR"

# ---------- 5. Thư viện của project ----------
step "Cài thư viện của project (npm ci)"
# npm ci cài đúng theo package-lock.json và không sửa file này, nên lần cập nhật tool sau không bị conflict.
npm ci --no-audit --no-fund
ok "Đã cài thư viện"

# ---------- 6. Chromium cho Playwright ----------
step "Cài Chromium cho Playwright"
if [ "$OS" = "Linux" ]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi
ok "Đã cài Chromium"

# ---------- 7. agent-browser ----------
step "Kiểm tra agent-browser $AGENT_BROWSER_VERSION"
if has agent-browser && [ "$(agent-browser --version 2>/dev/null | awk '{print $2}')" = "$AGENT_BROWSER_VERSION" ]; then
  ok "$(agent-browser --version)"
else
  npm install -g "agent-browser@$AGENT_BROWSER_VERSION" --no-audit --no-fund ||
    fail "Cài agent-browser chưa được. Nếu báo lỗi quyền (EACCES), Node đang cài cho toàn máy: xóa Node đó hoặc chạy lại script sau khi cài Node bằng fnm."
  ok "$(agent-browser --version)"
fi
if [ "$OS" = "Linux" ]; then agent-browser install --with-deps; else agent-browser install; fi

# ---------- 8. Claude Code ----------
step "Kiểm tra Claude Code"
export PATH="$HOME/.local/bin:$PATH"
if has claude; then
  ok "$(claude --version)"
else
  curl -fsSL https://claude.ai/install.sh | bash
  add_to_profiles 'export PATH="$HOME/.local/bin:$PATH"'
  has claude || fail "Cài Claude Code chưa thành công. Xem https://docs.claude.com/en/docs/claude-code/setup"
  ok "$(claude --version)"
fi

# ---------- 9. Kiểm tra cuối ----------
step "Kiểm tra tool"
npm run -s cli -- help >/dev/null
ok "Tool chạy được"

cat <<EOF

Cài đặt xong.

Việc tiếp theo:
  1. Mở terminal mới (để nhận Node và Claude Code vừa cài).
  2. Chạy:  cd "$PROJECT_DIR" && claude
  3. Lần đầu, đăng nhập Claude Code bằng tài khoản của bạn.
  4. Chat với Claude, ví dụ: "test giao diện https://... ở chế độ sáng và tối".

Hướng dẫn đầy đủ: docs/tester-guide.md
EOF
