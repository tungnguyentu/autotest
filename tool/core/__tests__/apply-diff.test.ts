import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyUnifiedDiff, checkLocatorOnly, DiffError, parseUnifiedDiff } from "../apply-diff.ts";

const SPEC = [
  "import { test, expect } from '@playwright/test';",
  "",
  "test('TC_001 mở trang', async ({ page }) => {",
  "  await page.goto('/');",
  "  await page.getByRole('link', { name: 'Learn moar' }).click();",
  "  await expect(page).toHaveURL(/iana/);",
  "});",
  "",
].join("\n");

const FIX = `--- a/spec.ts
+++ b/spec.ts
@@ -3,4 +3,4 @@
 test('TC_001 mở trang', async ({ page }) => {
   await page.goto('/');
-  await page.getByRole('link', { name: 'Learn moar' }).click();
+  await page.getByRole('link', { name: 'Learn more' }).click();
   await expect(page).toHaveURL(/iana/);
`;

describe("applyUnifiedDiff", () => {
  it("áp diff hợp lệ, giữ nguyên dòng cuối", () => {
    const out = applyUnifiedDiff(SPEC, FIX);
    assert.match(out, /name: 'Learn more'/);
    assert.ok(!out.includes("moar"));
    assert.ok(out.endsWith("});\n"));
    assert.equal(out.split("\n").length, SPEC.split("\n").length);
  });

  it("chịu được lệch số dòng khi khối khớp duy nhất", () => {
    const out = applyUnifiedDiff("// thêm một dòng\n" + SPEC, FIX);
    assert.match(out, /Learn more/);
  });

  it("giữ CRLF", () => {
    const out = applyUnifiedDiff(SPEC.replace(/\n/g, "\r\n"), FIX);
    assert.ok(out.includes("Learn more' }).click();\r\n"));
    assert.ok(!/[^\r]\n/.test(out));
  });

  it("áp nhiều hunk với số dòng đổi", () => {
    const src = "a\nb\nc\nd\ne\nf\ng\nh\n";
    const diff = "@@ -1,2 +1,3 @@\n a\n+a2\n b\n@@ -7,2 +8,1 @@\n-g\n h\n";
    assert.equal(applyUnifiedDiff(src, diff), "a\na2\nb\nc\nd\ne\nf\nh\n");
  });

  it("từ chối khi dòng bị xóa đã khác, không trả kết quả một phần", () => {
    assert.throws(() => applyUnifiedDiff(SPEC.replace("Learn moar", "Learn mor"), FIX), DiffError);
  });

  it("từ chối khi khối khớp ở nhiều chỗ và không đúng vị trí khai báo", () => {
    const diff = "@@ -50,1 +50,1 @@\n-x\n+y\n";
    assert.throws(() => applyUnifiedDiff("x\nx\n", diff), /không khớp/);
  });

  it("từ chối diff hỏng: không có hunk, số dòng sai, dòng lạ", () => {
    assert.throws(() => parseUnifiedDiff("chỉ là văn bản"), /không có hunk/);
    assert.throws(() => parseUnifiedDiff("@@ -1,3 +1,3 @@\n a\n-b\n+c\n"), /khai báo/);
    assert.throws(() => parseUnifiedDiff("@@ -1,1 +1,1 @@\n?lạ\n"), /không hợp lệ/);
  });
});

describe("checkLocatorOnly", () => {
  it("chấp nhận diff đổi đúng dòng locator", () => {
    assert.deepEqual(checkLocatorOnly(FIX), []);
  });

  it("từ chối hunk chạm expect(", () => {
    const diff = "@@ -1,1 +1,1 @@\n-  await expect(page.getByRole('link')).toBeVisible();\n+  await expect(page.getByRole('button')).toBeVisible();\n";
    const p = checkLocatorOnly(diff);
    assert.ok(p.some((m) => /expect\(/.test(m)), p.join("|"));
  });

  it("từ chối xóa dòng await", () => {
    const diff = "@@ -1,1 +1,1 @@\n-  await page.getByRole('button', { name: 'Gửi' }).click();\n+  const x = page.getByRole('button', { name: 'Gửi' });\n";
    assert.ok(checkLocatorOnly(diff).some((m) => /xóa dòng await/.test(m)));
  });

  it("từ chối bỏ bước, thêm bước, waitForTimeout và dòng không có locator", () => {
    assert.ok(checkLocatorOnly("@@ -1,2 +1,1 @@\n-  await page.getByRole('button').click();\n a\n").length > 0);
    assert.ok(checkLocatorOnly("@@ -1,1 +1,2 @@\n a\n+  await page.getByRole('button').click();\n").some((m) => /đổi số dòng/.test(m)));
    assert.ok(checkLocatorOnly("@@ -1,1 +1,1 @@\n-  await page.getByRole('a').click();\n+  await page.waitForTimeout(500);\n").some((m) => /waitForTimeout/.test(m)));
    assert.ok(checkLocatorOnly("@@ -1,1 +1,1 @@\n-  await page.goto('/a');\n+  await page.goto('/b');\n").some((m) => /không chứa locator/.test(m)));
  });

  it("từ chối đổi force, giá trị nhập và tên hành động dù dòng vẫn có locator", () => {
    const hunk = (a: string, b: string) => `@@ -1,1 +1,1 @@\n-  ${a}\n+  ${b}\n`;
    const force = checkLocatorOnly(hunk("await page.getByRole('button', { name: 'Gửi' }).click();", "await page.getByRole('button', { name: 'Gửi' }).click({ force: true });"));
    assert.ok(force.length > 0 && force.some((m) => /force/.test(m)), force.join("|"));
    const fill = checkLocatorOnly(hunk("await page.getByLabel('Email').fill('a@b.vn');", "await page.getByLabel('Email').fill('khac@b.vn');"));
    assert.ok(fill.some((m) => /đổi nhiều hơn biểu thức locator/.test(m)), fill.join("|"));
    const action = checkLocatorOnly(hunk("await page.getByRole('button').click();", "await page.getByRole('button').first().dblclick();"));
    assert.ok(action.some((m) => /đổi nhiều hơn biểu thức locator/.test(m)), action.join("|"));
  });

  it("vẫn chấp nhận đổi locator có ngoặc lồng và ngoặc trong chuỗi, kèm chú thích TODO locator", () => {
    assert.deepEqual(
      checkLocatorOnly("@@ -1,1 +1,1 @@\n-  await page.getByRole('button', { name: 'Gửi (cũ)' }).fill('x)y');\n+  await page.locator('#send').filter({ hasText: 'Gửi' }).first().fill('x)y'); // TODO locator: yếu\n"),
      [],
    );
  });

  it("từ chối diff không phân tích được", () => {
    assert.ok(checkLocatorOnly("không phải diff").length > 0);
  });
});
