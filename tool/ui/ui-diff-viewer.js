// Khu "So UI với Figma" trên run.html: chọn screen, chụp và so, xem side_by_side và từng vùng,
// bảng sai khác từ report.md, quyết định của tester từng mục, tạo baseline.
// Đăng ký qua window.runSlots["ui-diff"]. Được gọi lại mỗi khi file trong đợt đổi.
(() => {
  const { h, api, status, action, listen, copyButton } = window.App;

  const DECISIONS = [
    ["bug", "Bug"],
    ["accept", "Chấp nhận"],
    ["review", "Cần xem"],
  ];
  const STEP_LABEL = { capture: "chụp", compare: "so", baseline: "baseline" };
  const STATE_LABEL = { start: "đang chạy...", done: "xong", skipped: "bỏ qua", error: "lỗi" };

  let ctx = null;
  let root = null;
  let data = null;
  /** Lựa chọn của tester, giữ qua các lần vẽ lại. `null` nghĩa là chưa chọn gì, mặc định chọn tất cả. */
  let selected = null;
  let fullPage = false;
  let progress = new Map();
  let jobError = "";
  /** screen -> Map(index -> {decision, note}) đang soạn. */
  const drafts = new Map();
  const dirty = new Set();
  let redrawPending = false;

  const base = () => `/api/runs/${encodeURIComponent(ctx.run)}/ui-diff`;
  const fileUrl = (rel, v) => `/api/runs/${encodeURIComponent(ctx.run)}/files/${rel.split("/").map(encodeURIComponent).join("/")}?v=${encodeURIComponent(v || "")}`;
  const when = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN") : "");

  function draftFor(state) {
    const rows = state.report ? state.report.rows : [];
    if (!drafts.has(state.screen) || !dirty.has(state.screen)) {
      const saved = new Map(((!state.decisions_stale && state.decisions && state.decisions.items) || []).map((i) => [i.index, { decision: i.decision, note: i.note }]));
      drafts.set(state.screen, saved);
    }
    const d = drafts.get(state.screen);
    for (const k of [...d.keys()]) if (k > rows.length) d.delete(k);
    return d;
  }

  function banner(kind, lines) {
    return h("div", { class: `banner ${kind}` }, lines.map((l) => h("div", {}, l)));
  }

  function selector() {
    const screens = data.feature_screens;
    if (!selected) selected = new Set(screens.map((s) => s.key));
    const running = Boolean(data.running);
    if (!screens.length) {
      return h("p", { class: "muted" }, "feature.json chưa khai báo screen nào. Thêm screen ở trang tính năng.");
    }
    return h(
      "div",
      {},
      h(
        "ul",
        { class: "plain" },
        screens.map((s) =>
          h(
            "li",
            {},
            h("label", { class: "inline" }, h("input", { type: "checkbox", checked: selected.has(s.key), onchange: (e) => (e.target.checked ? selected.add(s.key) : selected.delete(s.key)) }), ` ${s.key} `),
            h("code", {}, s.path),
            s.auth ? " · cần đăng nhập " : " ",
            s.has_figma
              ? h("span", { class: "badge ok" }, `có ảnh Figma (${when(s.figma_modified)})`)
              : h("span", { class: "badge error" }, `thiếu features/${ctx.feature}/figma/${s.key}.png`),
          ),
        ),
      ),
      h("label", { class: "inline" }, h("input", { type: "checkbox", checked: fullPage, onchange: (e) => (fullPage = e.target.checked) }), " Chụp cả trang (chỉ khi frame Figma là cả trang dài)"),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "primary",
            type: "button",
            disabled: running,
            onclick: (e) =>
              action(e.currentTarget, status(), "Đã bắt đầu chụp và so", async () => {
                const screensChosen = screens.map((s) => s.key).filter((k) => selected.has(k));
                if (!screensChosen.length) throw new Error("Chọn ít nhất một screen.");
                progress = new Map();
                jobError = "";
                await api("POST", `/api/features/${encodeURIComponent(ctx.feature)}/ui-diff/run`, { run: ctx.run, screens: screensChosen, fullPage });
                await refresh();
              }),
          },
          "Chụp và so",
        ),
        running ? h("span", { class: "muted" }, `Đang chụp và so: ${data.running.screens.join(", ")}`) : null,
      ),
    );
  }

  function progressBox() {
    if (!progress.size && !jobError) return null;
    return h(
      "div",
      { class: "banner" },
      [...progress.entries()].map(([screen, steps]) =>
        h("div", {}, h("strong", {}, screen), ": ", [...steps.entries()].map(([step, s]) => `${STEP_LABEL[step]} ${STATE_LABEL[s.state]}${s.message ? ` (${s.message})` : ""}`).join(" · ")),
      ),
      jobError ? h("div", { class: "error-text" }, `Lỗi: ${jobError}`) : null,
    );
  }

  function regionsList(state) {
    const m = state.metrics;
    if (!m.regions.length) return h("p", { class: "muted" }, "Không có vùng khác nào ở mức ngưỡng hiện tại. Đây chưa phải kết luận UI đúng thiết kế.");
    return h(
      "div",
      { class: "regions" },
      m.regions.map((r) =>
        h(
          "figure",
          { class: "region" },
          r.crop ? h("img", { src: fileUrl(`ui-diff/${state.screen}/${r.crop}`, state.meta && state.meta.captured_at), alt: `Vùng ${r.id}: Figma bên trái, thực tế bên phải`, loading: "lazy" }) : null,
          h("figcaption", {}, `#${r.id} · ${r.w}x${r.h} tại (${r.x}, ${r.y}) · ${r.changed_px} px khác`, h("br"), h("span", { class: "muted" }, "Trái: Figma · Phải: thực tế")),
        ),
      ),
    );
  }

  function decisionsTable(state, draft) {
    const rows = state.report.rows;
    if (!rows.length) return h("p", { class: "muted" }, "Bảng \"Sai khác đề xuất\" trong report.md không có dòng nào.");
    return h(
      "table",
      {},
      h("thead", {}, h("tr", {}, ["#", "Vùng", "Hạng mục", "Figma", "Thực tế", "Mức", "Phân loại (AI)", "Quyết định của tester", "Ghi chú"].map((c) => h("th", {}, c)))),
      h(
        "tbody",
        {},
        rows.map((r) => {
          const cur = draft.get(r.index) || { decision: "", note: "" };
          const set = (patch) => {
            draft.set(r.index, { ...(draft.get(r.index) || { decision: "", note: "" }), ...patch });
            dirty.add(state.screen);
          };
          const name = `d-${state.screen}-${r.index}`;
          return h(
            "tr",
            {},
            h("td", { class: "num" }, r.index),
            h("td", {}, r.region),
            h("td", {}, r.item),
            h("td", {}, r.figma),
            h("td", {}, r.actual),
            h("td", {}, r.level),
            h("td", {}, r.kind),
            h(
              "td",
              {},
              DECISIONS.map(([value, label]) =>
                h("label", { class: "inline" }, h("input", { type: "radio", name, value, checked: cur.decision === value, onchange: () => set({ decision: value }) }), ` ${label} `),
              ),
            ),
            h("td", {}, h("input", { type: "text", value: cur.note, "aria-label": `Ghi chú mục ${r.index}`, oninput: (e) => set({ note: e.target.value }) })),
          );
        }),
      ),
    );
  }

  function baselineBox(state) {
    const b = state.baseline;
    return b
      ? h(
          "div",
          { class: "banner" },
          h("strong", {}, "Baseline đã tạo"),
          h("div", {}, `Lúc ${when(b.created_at)} · ảnh Figma sửa lần cuối ${b.figma_modified ? when(b.figma_modified) : "(không rõ)"} · người duyệt: ${b.tester || "(chưa điền Tester ở summary)"}`),
          h("div", {}, "Spec: ", h("code", {}, b.spec), " · ảnh: ", h("code", {}, b.screenshot)),
        )
      : null;
  }

  function screenBlock(state) {
    const warnings = [...new Set([...((state.metrics && state.metrics.warnings) || []), ...((state.meta && state.meta.warnings) || [])])];
    const draft = draftFor(state);
    const hasBug = [...draft.values()].some((d) => d.decision === "bug");
    const cmd = `/ui-check ${ctx.feature} ${state.screen}`;
    const saveBtn = h(
      "button",
      {
        type: "button",
        disabled: !state.report,
        onclick: (e) =>
          action(e.currentTarget, status(), `Đã lưu quyết định của ${state.screen}`, async () => {
            const items = [...draft.entries()].filter(([, d]) => d.decision).map(([index, d]) => ({ index, decision: d.decision, note: d.note || "" }));
            await api("POST", `${base()}/${encodeURIComponent(state.screen)}/decisions`, { items });
            dirty.delete(state.screen);
            await refresh();
          }),
      },
      "Lưu quyết định",
    );
    const baselineBtn = h(
      "button",
      {
        class: "primary",
        type: "button",
        disabled: state.blockers.length > 0 || dirty.has(state.screen),
        onclick: (e) =>
          action(e.currentTarget, status(), `Đang tạo baseline cho ${state.screen} (xem khu Playwright)`, async () => {
            await api("POST", `${base()}/${encodeURIComponent(state.screen)}/baseline`);
            await refresh();
          }),
      },
      "Cho tạo baseline",
    );
    return h(
      "div",
      { class: "ui-screen" },
      h("h3", {}, state.screen),
      state.problems.length ? banner("error", state.problems) : null,
      warnings.length ? banner("error", warnings) : null,
      state.metrics
        ? h(
            "div",
            {},
            h("p", {}, `Kích thước so: ${state.metrics.compared_size.join("x")} (Figma ${state.metrics.figma_size.join("x")}, thực tế ${state.metrics.actual_size.join("x")}) · ${(state.metrics.diff_ratio * 100).toFixed(2)}% pixel khác · ${state.metrics.total_regions} vùng · ${state.metrics.masked_boxes} vùng mask`),
            h("p", { class: "muted" }, "Pixel diff chỉ khoanh vùng, không phải kết luận. Cột trái Figma, giữa thực tế, phải là diff."),
            state.files.side_by_side ? h("div", { class: "sbs" }, h("img", { src: fileUrl(`ui-diff/${state.screen}/side_by_side.png`, state.meta && state.meta.captured_at), alt: `Figma, thực tế và diff của ${state.screen}` })) : null,
            regionsList(state),
          )
        : h("p", { class: "muted" }, state.files.actual ? "Đã chụp nhưng chưa so được (xem cảnh báo ở trên)." : "Chưa chụp được ảnh (xem cảnh báo ở trên)."),
      state.metrics && !state.report
        ? h("div", { class: "banner" }, h("div", {}, "Chưa có report.md. Chạy lệnh này trong Claude Code, xong quay lại trang này:"), h("div", { class: "row" }, h("code", {}, cmd), copyButton(cmd)))
        : null,
      state.report && state.report.stale ? banner("error", [`report.md cũ hơn lần so gần nhất. Chạy lại ${cmd}.`]) : null,
      state.report && state.decisions_stale ? banner("error", [`report.md đã đổi sau khi quyết định được lưu (lúc ${when(state.decisions.decided_at)}). Quyết định cũ không còn hiệu lực, cần quyết định lại cho từng mục.`]) : null,
      state.report ? h("div", {}, h("h4", {}, "Sai khác đề xuất (từ report.md) và quyết định của tester"), decisionsTable(state, draft), state.decisions && !state.decisions_stale ? h("p", { class: "muted" }, `Đã lưu lúc ${when(state.decisions.decided_at)}`) : null) : null,
      h(
        "div",
        { class: "row" },
        saveBtn,
        baselineBtn,
        dirty.has(state.screen) ? h("span", { class: "muted" }, "Có thay đổi chưa lưu.") : null,
      ),
      state.blockers.length ? h("ul", { class: "muted" }, state.blockers.map((b) => h("li", {}, b))) : null,
      hasBug && !state.baseline ? h("p", { class: "muted" }, "Có mục đánh dấu Bug: không tạo được baseline cho tới khi UI được sửa và so lại, hoặc đổi quyết định.") : null,
      baselineBox(state),
    );
  }

  function draw() {
    redrawPending = false;
    const active = document.activeElement;
    // Đang gõ ghi chú thì chưa vẽ lại, để con trỏ không mất. Vẽ khi rời ô.
    if (active && root.contains(active) && active.tagName === "INPUT" && active.type === "text") {
      redrawPending = true;
      active.addEventListener("blur", () => redrawPending && draw(), { once: true });
      return;
    }
    root.replaceChildren(
      ...[
        h("p", { class: "muted" }, `Ảnh Figma: features/${ctx.feature}/figma/<screen>.png, export 1x, rộng đúng bằng viewport. Chi tiết trong docs.`),
        selector(),
        progressBox(),
        ...(data.screens.length ? data.screens.map(screenBlock) : [h("p", { class: "muted" }, "Đợt này chưa chụp screen nào.")]),
      ].filter(Boolean),
    );
  }

  async function refresh() {
    try {
      data = await api("GET", base());
      draw();
    } catch (err) {
      status().fail(err);
    }
  }

  listen("ui-diff", (ev) => {
    if (!ctx || ev.feature !== ctx.feature || ev.run !== ctx.run) return;
    if (ev.type === "ui-diff-progress") {
      const steps = progress.get(ev.screen) || new Map();
      steps.set(ev.step, { state: ev.state, message: ev.message });
      progress.set(ev.screen, steps);
      if (ev.step === "baseline") {
        if (ev.state === "error") status().fail(new Error(`Baseline ${ev.screen}: ${ev.message}`));
        else if (ev.state === "done") status().ok(`Đã tạo baseline cho ${ev.screen}`);
      }
      if (data) draw();
    } else if (ev.type === "ui-diff-state") {
      if (ev.state === "running") {
        progress = new Map();
        jobError = "";
      } else if (ev.error) {
        jobError = ev.error;
      }
      refresh();
    }
  });

  window.runSlots["ui-diff"] = (container, _run, c) => {
    ctx = c;
    if (!root || !container.contains(root)) {
      root = h("div", {});
      container.replaceChildren(root);
    }
    return refresh();
  };
})();
