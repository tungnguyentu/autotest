// Khu "Sửa locator" nằm cuối khu Playwright của run.html. Với mỗi spec fail trong playwright-last.json:
// lệnh /heal-locator để copy, và khi skill đã ghi heal/<id>.diff thì hiện diff, lý do, nút áp dụng.
// Bọc window.runSlots.playwright nên phải nạp sau playwright-panel.js.
(() => {
  const { h, api, status, action, copyButton } = window.App;
  const basePanel = window.runSlots.playwright;
  let root = null;

  const idOf = (file) => file.replace(/\.spec\.ts$/, "");

  function diffView(diff) {
    const pre = h("pre", { class: "log" });
    for (const line of diff.split("\n")) {
      const cls = line.startsWith("+") && !line.startsWith("+++") ? "ok" : line.startsWith("-") && !line.startsWith("---") ? "error" : "";
      pre.append(h("span", { class: cls }, line + "\n"));
    }
    return pre;
  }

  async function card(ctx, id, refresh) {
    const cmd = `/heal-locator ${ctx.feature} ${id}`;
    const heal = await api("GET", `/api/runs/${encodeURIComponent(ctx.run)}/heal/${encodeURIComponent(id)}`);
    const parts = [h("h4", {}, id), h("div", { class: "row" }, h("code", {}, cmd), copyButton(cmd))];
    if (heal.reason) parts.push(h("pre", { class: "log" }, heal.reason));
    if (heal.diff === null) {
      parts.push(h("p", { class: "muted" }, "Chưa có đề xuất. Phân loại lỗi trước, chỉ chạy lệnh trên nếu locator hỏng."));
    } else {
      parts.push(diffView(heal.diff));
      if (heal.problems.length) {
        parts.push(h("p", { class: "status error" }, `Không áp dụng được: ${heal.problems.join("; ")}`));
      } else {
        parts.push(
          h(
            "button",
            {
              class: "primary",
              type: "button",
              onclick: (e) => {
                if (!confirm(`Sửa tests/${ctx.feature}/${id}.spec.ts theo diff này và chạy lại spec? Bản cũ lưu ở heal/${id}.spec.ts.bak.`)) return;
                action(e.currentTarget, status(), `Đã áp dụng cho ${id}`, async () => {
                  const res = await api("POST", `/api/runs/${encodeURIComponent(ctx.run)}/heal/${encodeURIComponent(id)}/apply`, {});
                  if (!res.passed) throw new Error(`Đã sửa spec nhưng ${id} vẫn chưa pass. Xem log ở trên, bản cũ lưu ở ${res.backup}.`);
                  await refresh();
                });
              },
            },
            "Áp dụng và chạy lại",
          ),
        );
      }
    }
    return h("div", { class: "card" }, ...parts);
  }

  async function draw(ctx, refresh) {
    const pw = await api("GET", `/api/features/${encodeURIComponent(ctx.feature)}/playwright?run=${encodeURIComponent(ctx.run)}`);
    const failed = [...new Set(((pw.last && pw.last.tests) || []).filter((t) => t.status === "failed").map((t) => idOf(t.file)))];
    const body = failed.length
      ? [
          h("p", {}, "Phân loại từng spec fail: bug thật, locator hỏng hay UI đổi có chủ đích. Chỉ khi locator hỏng mới chạy lệnh trong Claude Code."),
          ...(await Promise.all(failed.map((id) => card(ctx, id, refresh)))),
        ]
      : [h("p", { class: "muted" }, "Không có spec fail trong lần chạy gần nhất của đợt.")];
    root.replaceChildren(h("h3", {}, "Sửa locator (healing)"), ...body);
  }

  window.runSlots.playwright = async (container, run, ctx) => {
    await basePanel(container, run, ctx);
    if (!root) root = h("div", {});
    if (!container.contains(root)) container.append(root);
    const refresh = () => draw(ctx, refresh);
    try {
      await refresh();
    } catch (err) {
      status().fail(err);
    }
  };
})();
