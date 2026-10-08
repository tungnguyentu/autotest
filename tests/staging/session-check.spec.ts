import { expect, test } from "@playwright/test";
import { readFeature } from "../../tool/core/feature-store.ts";

// Kiểm tra phiên đăng nhập do `login` lưu còn dùng được: mở mọi screen auth,
// không bị chuyển sang trang khác và không thấy ô mật khẩu.
const feature = readFeature("staging");

for (const [key, screen] of Object.entries(feature.screens).filter(([, s]) => s.auth)) {
  test(`SESSION ${key}: phiên còn đăng nhập`, async ({ page }) => {
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(new URL(page.url()).pathname.replace(/\/+$/, "")).toBe(screen.path.replace(/\/+$/, ""));
    await expect(page.locator('input[type="password"]:visible')).toHaveCount(0);
  });
}
