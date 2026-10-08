---
title: Lập kế hoạch tool AI testing có UI cho tester
date: 2026-10-07
summary: "Brainstorm từ kế hoạch của Alex và gói ui-check.skill, đổi kiến trúc ba lần theo làm rõ của người dùng, tạo plan 6 phase"
---

# Lập kế hoạch tool AI testing có UI cho tester

## What happened

Phiên bắt đầu bằng `/ak-brainstorm` với hai đầu vào: kế hoạch "Pipeline AI Testing (Claude + Playwright + Figma)" của Alex và gói `ui-check.skill` (SKILL.md, login.py, capture.py, compare.py, run_testcase.py, hai reference). Thư mục project trống.

Kiểm tra môi trường: Node 26.7, Claude Code 2.1.292 (subscription), agent-browser 0.34.0 đã cài, Python 3.14 nhưng thiếu browser-use, playwright, Pillow. Thử `agent-browser state save` cho file JSON với hai khóa `cookies` và `origins`, cùng hình dạng storageState của Playwright. `snapshot -i --json` trả về `refs: { e1: { name, role } }`, đủ để ghi step có role và name.

Người dùng làm rõ bốn lần, mỗi lần đổi hợp đồng:
1. Không chạy CI. Tester chạy trên máy mình và kiểm tra đầu ra.
2. Phiên đăng nhập chỉ hết hạn khi logout. Không có use case Login. Use case do tester D5 đưa.
3. Mục tiêu là một tool có UI cho tester.
4. Tài khoản Claude của tester chỉ là subscription, không có API key.

Điểm 4 buộc đổi kiến trúc. Tài liệu Agent SDK ghi: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." Tài liệu headless ghi `--bare` chỉ nhận API key. Người dùng chọn: tool web không gọi Claude, phần AI chạy trong Claude Code của tester qua skill trong project.

## Decision

- Tool web local bằng Node (Express, HTML cộng JavaScript thuần, không build) làm mọi bước không cần AI.
- Bốn skill trong `.claude/skills/` (gen-testcases, run-testcase, to-playwright, ui-check) cộng heal-locator ở Phase 6, chạy trong Claude Code.
- agent-browser qua CLI, không browser-use. Tool có lệnh `record-step` và `fill-secret` để skill ghi step đúng schema và không lộ credential.
- So ảnh bằng pixelmatch trong Node, logic gộp vùng chuyển từ compare.py.
- Validation: HTML thuần, phát triển trên site staging của tester (không demo công khai), spike đăng nhập với username, password, OTP do tester làm tay, chưa dùng git.

Kế hoạch: `plans/261007-0818-ai-testing-tool/plan.md`, 6 phase, 72 việc, ước lượng 13 ngày. `ak plan validate` OK. Báo cáo brainstorm: `plans/reports/brainstorm-261007-1453-ai-testing-pipeline.md`.

## Next steps

- Cần hai đầu vào từ tester: baseURL, screen và tài khoản staging có OTP (trước Phase 1 bước 7), và use case từ D5 (trước Phase 6).
- Chạy `/ak:cook plans/261007-0818-ai-testing-tool/plan.md`. `ak plan use` không chạy được vì không có git, nên phải truyền đường dẫn plan rõ ràng.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
