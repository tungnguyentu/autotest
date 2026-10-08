// Khu "AI chạy thử" trên run.html: bảng step kèm ảnh, kết quả AI đề xuất, quyết định của tester.
// Đăng ký qua window.runSlots["ai-run"]. Được gọi lại mỗi khi file trong đợt đổi.
(() => {
  const { h, api, status } = window.App;

  const VERDICT_CLASS = { "ĐẠT": "ok", "KHÔNG ĐẠT": "error", "KHÔNG XÁC ĐỊNH": "" };
  const DECISION_TEXT = { confirmed: "Tester đã xác nhận", rejected: "Tester đã từ chối" };
  /** Ghi chú đang gõ dở, giữ qua các lần vẽ lại do file đổi. */
  const drafts = new Map();

  const fileUrl = (run, rel) => `/api/runs/${encodeURIComponent(run)}/files/${rel.split("/").map(encodeURIComponent).join("/")}`;

  function openImage(src) {
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => e.key === "Escape" && close();
    const overlay = h("div", { class: "overlay", onclick: close, role: "dialog", "aria-label": "Ảnh step phóng to" }, h("img", { src, alt: "Ảnh step" }));
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
  }

  function describeTarget(t) {
    if (!t) return "";
    const parts = [];
    if (t.role || t.name) parts.push(`${t.role || "?"} "${t.name || ""}"`);
    if (t.label) parts.push(`label: ${t.label}`);
    if (t.placeholder) parts.push(`placeholder: ${t.placeholder}`);
    if (t.css) parts.push(`css: ${t.css}`);
    return parts.join(" · ");
  }

  function stepsTable(run, steps) {
    if (!steps.length) return h("p", { class: "muted" }, "Chưa có step nào.");
    return h(
      "table",
      {},
      h("thead", {}, h("tr", {}, ["#", "Action", "Target", "Value", "URL sau", "Ảnh"].map((c) => h("th", {}, c)))),
      h(
        "tbody",
        {},
        steps.map((s) =>
          h(
            "tr",
            {},
            h("td", { class: "num" }, s.n),
            h("td", {}, s.action),
            h("td", {}, describeTarget(s.target)),
            h("td", {}, s.value ?? ""),
            h("td", {}, s.url_after ?? "", s.note ? h("div", { class: "muted" }, s.note) : null),
            h(
              "td",
              {},
              s.screenshot
                ? h("img", { class: "thumb", src: fileUrl(run, s.screenshot), alt: `Ảnh step ${s.n}`, loading: "lazy", onclick: () => openImage(fileUrl(run, s.screenshot)) })
                : "",
            ),
          ),
        ),
      ),
    );
  }

  function expectedTable(result) {
    if (!result) return h("p", { class: "muted" }, "AI chưa ghi kết quả (chưa chạy run-finish).");
    return h(
      "table",
      {},
      h("thead", {}, h("tr", {}, ["Mong đợi", "AI đề xuất", "Quan sát"].map((c) => h("th", {}, c)))),
      h(
        "tbody",
        {},
        result.per_expected.map((p) => h("tr", {}, h("td", {}, p.expected), h("td", {}, h("span", { class: `badge ${VERDICT_CLASS[p.verdict] || ""}` }, p.verdict)), h("td", {}, p.observation))),
      ),
    );
  }

  function decisionForm(run, a, reload) {
    const d = drafts.get(a.id) || { note: a.tester.note || "", bug: "" };
    const note = h("textarea", { rows: 2, value: d.note, placeholder: "Ghi chú của tester (lý do xác nhận hoặc từ chối)", oninput: () => (d.note = note.value) });
    const bug = h("input", { type: "text", value: d.bug, placeholder: "Nghi bug: mô tả ngắn, sẽ ghi vào bugs.md", oninput: () => (d.bug = bug.value) });
    drafts.set(a.id, d);
    const locked = a.status === "automated" || a.status === "draft";
    const send = (decision) => async (ev) => {
      const st = status();
      const buttons = ev.target.closest(".decision-form").querySelectorAll("button");
      buttons.forEach((b) => (b.disabled = true));
      st.info("Đang ghi quyết định...");
      try {
        const res = await api("POST", `/api/runs/${encodeURIComponent(run)}/ai-runs/${encodeURIComponent(a.id)}/decision`, {
          decision,
          note: note.value,
          ...(bug.value.trim() && { suspected_bug: bug.value.trim() }),
        });
        drafts.delete(a.id);
        st.ok(`${a.id}: ${decision === "confirmed" ? "đã xác nhận" : "đã từ chối"}, test case thành ${res.status}${res.bug_recorded ? ", đã ghi bugs.md" : ""}`);
        reload();
      } catch (err) {
        st.fail(err);
        buttons.forEach((b) => (b.disabled = false));
      }
    };
    return h(
      "div",
      { class: "decision-form" },
      h("label", {}, "Quyết định của tester"),
      note,
      h("label", {}, "Nghi bug (tùy chọn)"),
      bug,
      h(
        "div",
        { class: "row" },
        h("button", { class: "primary", type: "button", disabled: locked, onclick: send("confirmed") }, "Xác nhận"),
        h("button", { type: "button", disabled: locked, onclick: send("rejected") }, "Từ chối"),
        locked ? h("span", { class: "muted" }, a.status === "automated" ? "Test case đã vào regression, không đổi quyết định ở đây." : "Test case chưa được duyệt (draft).") : null,
      ),
    );
  }

  function aiRunBlock(run, a, reload) {
    const verdict = a.ai_result ? a.ai_result.verdict : "chưa đánh giá";
    const decision = a.tester.decision;
    return h(
      "details",
      { class: "airun", open: !decision },
      h(
        "summary",
        {},
        `${a.id}${a.title ? ` - ${a.title}` : ""} `,
        h("span", { class: `badge ${VERDICT_CLASS[verdict] || ""}` }, `AI: ${verdict}`),
        " ",
        h("span", { class: `badge ${decision === "confirmed" ? "ok" : decision === "rejected" ? "error" : ""}` }, decision ? DECISION_TEXT[decision] : "Tester chưa quyết định"),
        a.status ? h("span", { class: "muted" }, ` · status: ${a.status}`) : null,
      ),
      h("h3", {}, "Các step"),
      stepsTable(run, a.steps),
      h("h3", {}, "Kết quả từng mong đợi (AI đề xuất)"),
      expectedTable(a.ai_result),
      a.md ? h("details", {}, h("summary", {}, `Báo cáo ai-run/${a.id}.md`), h("pre", {}, a.md)) : null,
      decisionForm(run, a, reload),
    );
  }

  window.runSlots["ai-run"] = async (container, runInfo, ctx) => {
    // Đang gõ ghi chú thì không vẽ lại, tránh mất con trỏ. Nội dung gõ dở vẫn nằm trong `drafts`.
    const active = document.activeElement;
    if (active && container.contains(active) && /^(TEXTAREA|INPUT)$/.test(active.tagName)) return;
    const reload = () => window.runSlots["ai-run"](container, runInfo, ctx);
    let data;
    try {
      data = await api("GET", `/api/runs/${encodeURIComponent(ctx.run)}/ai-runs`);
    } catch (err) {
      container.replaceChildren(h("p", { class: "error" }, `Không tải được AI run: ${err.message}`));
      return;
    }
    if (container.contains(document.activeElement) && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) return;
    // Giữ trạng thái mở/đóng của từng test case qua các lần vẽ lại.
    const wasOpen = new Map([...container.querySelectorAll("details.airun")].map((d) => [d.dataset.id, d.open]));
    const blocks = data.ai_runs.map((a) => {
      const block = aiRunBlock(ctx.run, a, reload);
      block.dataset.id = a.id;
      block.open = wasOpen.has(a.id) ? wasOpen.get(a.id) : !a.tester.decision;
      return block;
    });
    container.replaceChildren(
      ...[
      data.ai_runs.length
        ? h("p", { class: "muted" }, "AI chỉ đề xuất. Trạng thái test case chỉ đổi khi tester bấm Xác nhận hoặc Từ chối.")
        : h("p", { class: "muted" }, "Chưa có lần AI chạy thử nào trong đợt này. Chạy ", h("code", {}, `/run-testcase ${ctx.feature} <id>`), " trong Claude Code, rồi quay lại trang này."),
      data.problems.length ? h("div", { class: "banner error" }, data.problems.map((p) => h("div", {}, p))) : null,
      ...blocks,
      ].filter(Boolean),
    );
  };
})();
