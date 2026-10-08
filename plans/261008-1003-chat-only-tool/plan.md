---
title: "Bỏ UI, tester chỉ chat với Claude"
status: completed
priority: P1
created: 2026-10-08
---

# Bỏ UI, tester chỉ chat với Claude

## Mục tiêu

Không còn giao diện web. Tester chỉ chat với Claude Code: kéo file use case vào chat, nói quyết định duyệt bằng lời. Claude chạy lệnh CLI tương ứng. Mọi điểm duyệt của tester vẫn giữ: Claude chỉ ghi quyết định khi tester nói rõ.

## Ràng buộc

- Giữ nguyên các kiểm tra của từng điểm duyệt (draft và reviewed, xác nhận cần ai_result, automated cần spec pass sau lần sửa cuối, healing chỉ đổi locator và có sao lưu, baseline bị chặn khi còn mục chưa quyết định hoặc còn bug).
- Giữ schema file trên disk, evidence không ghi đè.

## Ngoài phạm vi

- Thay đổi quy trình hay skill ngoài việc bỏ chỗ nhắc UI.

## Việc

| # | Việc |
| --- | --- |
| 1 | Chuyển logic điểm duyệt từ `tool/api/` vào `tool/core/`: duyệt test case, quyết định ai-run, automated, áp healing, quyết định ui-diff, baseline, tổng quan và bước tiếp theo |
| 2 | Lệnh CLI: `status`, `testcase-status`, `ai-decision`, `automate`, `heal-apply`, `ui-diff`, `ui-decision`, `baseline`, `regression`, `summary` |
| 3 | Xóa `tool/ui/`, `tool/api/`, `tool/server.ts`, watcher, lệnh `start`, `npm start`, express, chokidar. Chuyển test API sang test core |
| 4 | Sửa `CLAUDE.md`, skill, `docs/` theo cách chat: tester kéo file vào chat, nói quyết định |

## Tiêu chí nghiệm thu

1. Không còn file và phụ thuộc của UI và server. `npm test`, typecheck xanh.
2. Mỗi điểm duyệt có lệnh CLI và test giữ các kiểm tra cũ.
3. `CLAUDE.md` nói rõ câu tester nói nào ứng với lệnh nào, và Claude không tự quyết thay tester.
4. Không skill hay tài liệu nào còn bảo tester mở UI hay gõ lệnh.
