---
phase: 6
title: "Phase 6: Pilot, healing và tài liệu"
status: in-progress
priority: P2
effort: "1.5d"
dependencies: [3, 4, 5]
---

# Phase 6: Pilot, healing và tài liệu

## Overview

Chạy vòng đầy đủ trên tính năng thật mà D5 đưa use case và đo kết quả. Thêm skill đề xuất locator khi UI đổi. Viết tài liệu cho tester. Phase này cần use case thật, các phase trước dùng test case tự viết trên staging.

## Requirements

- [ ] Pilot trên tính năng đầu tiên từ D5: use case → test case → tester review → AI chạy thử → spec → so Figma → regression. Mọi bước qua UI và Claude Code.
- [ ] Số đo ghi trong `summary.md` của đợt pilot. Gồm số test case sinh ra, số phải sửa tay, số spec pass lần đầu. Gồm số locator xpath hoặc `// TODO locator`, và số sai khác UI theo mức.
- [ ] Skill `/heal-locator <feature> <id>` đọc trace hoặc lỗi Playwright, mở trang bằng agent-browser, đề xuất locator mới dưới dạng diff, giữ nguyên assertion. Tester áp dụng bằng tay hoặc bấm "Áp dụng" trên UI.
- [x] `docs/` có hướng dẫn tester đọc được từ đầu đến cuối, không cần đọc code.

## Files to Create / Modify

- Create: `features/<pilot>/feature.json`, `features/<pilot>/usecases/*.md` (từ D5), `features/<pilot>/.env` (không commit), `features/<pilot>/figma/*.png`
- Create: `.claude/skills/heal-locator/SKILL.md`
- Create: `tool/api/heal.ts` (GET đề xuất từ `evidence/<đợt>/heal/<id>.diff`, POST áp dụng bằng cách ghi đè spec sau khi tester xác nhận, giữ bản cũ ở `evidence/<đợt>/heal/<id>.spec.ts.bak`)
- Modify: `tool/ui/run.html` (khu "Spec fail" với nút copy lệnh `/heal-locator` và nút áp dụng)
- Create: `docs/tester-guide.md` (cài đặt, quy trình 6 bước, hai điểm duyệt, cách đăng nhập, cách export Figma, cách đọc report)
- Create: `docs/skills.md` (bốn skill cộng heal, lệnh, đầu vào, đầu ra, điều cấm)
- Modify: `docs/README.md`, `CLAUDE.md` (mục Healing)
- Create: `plans/261007-0818-ai-testing-tool/reports/pilot-<feature>.md`

## Implementation Steps

1. Nhận use case từ D5, tạo tính năng trên UI, nhờ tester đăng nhập, export Figma theo quy ước.
2. Chạy vòng đầy đủ. Ghi lại mọi chỗ tester phải rời UI hoặc phải sửa tay, đây là đầu vào cải tiến.
3. Ghi số đo vào `summary.md` và `reports/pilot-<feature>.md`.
4. Viết skill `heal-locator`: đầu vào là spec fail và `playwright-log.txt`, đầu ra là file diff chỉ đổi dòng locator, kèm lý do mỗi dòng. Không đổi `expect`.
5. Viết `heal.ts` và khu UI. Áp dụng chỉ khi tester bấm, sau đó tool chạy lại spec và hiện kết quả.
6. Thử healing bằng cách cố ý sửa một locator trong spec cho sai, hoặc chờ một lần đổi UI thật trên staging.
7. Viết `docs/tester-guide.md` và `docs/skills.md`. Nhờ một tester đọc và làm theo, sửa chỗ khó hiểu.

## Todo

- [ ] Tính năng pilot và dữ liệu từ D5
- [ ] Vòng đầy đủ và số đo
- [x] Skill `heal-locator` (đã viết, chưa chạy trong Claude Code, chờ tester)
- [x] API và UI healing
- [x] Thử healing một lần (spec cố ý làm sai trên example.com, diff viết tay đúng dạng skill sẽ sinh)
- [x] `docs/tester-guide.md`, `docs/skills.md` (một tester chưa tham gia đọc và làm theo: chưa làm)
- [ ] Báo cáo pilot

## Verification

- `reports/pilot-<feature>.md` có năm số đo và danh sách chỗ tester phải sửa tay.
- Spec của pilot chạy regression pass hai lần liên tiếp trên máy tester.
- `/heal-locator` trên một spec cố ý làm hỏng: diff chỉ chạm dòng locator, spec pass sau khi áp dụng.
- Một tester chưa tham gia dự án cài và chạy được theo `docs/tester-guide.md`.

## Success Criteria

Tool chứng minh được trên một tính năng thật với số đo. Tester có tài liệu để tự vận hành và mở rộng sang module tiếp theo.
