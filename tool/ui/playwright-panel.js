// Khu "Playwright" trên run.html: chạy từng spec hoặc cả regression, log trực tiếp, kết quả, report, trace.
// Đăng ký qua window.runSlots.playwright. DOM dựng một lần, các lần gọi lại chỉ cập nhật nội dung
// để log và iframe không bị vẽ lại mỗi khi file trong đợt đổi.
(() => {
  const { h, api, status, action, listen, copyButton } = window.App;
  const MAX_LINES = 500;
  const RESULT_LABEL = { passed: "pass", failed: "fail", flaky: "flaky", skipped: "bỏ qua" };

  let ctx = null;
  let ui = null;
  let lines = [];
  let data = { running: null, specs: [], last: null, has_report: false, traces: [], testcases: [] };
  let logTimer = null;

  const base = () => `/api/features/${encodeURIComponent(ctx.feature)}`;
  const quote = (p) => (/\s/.test(p) ? `"${p}"` : p);

  function drawLog() {
    logTimer = null;
    const atBottom = ui.log.scrollTop + ui.log.clientHeight >= ui.log.scrollHeight - 8;
    ui.log.textContent = lines.length ? lines.join("\n") : "(chưa có log)";
    if (atBottom) ui.log.scrollTop = ui.log.scrollHeight;
  }
  const scheduleLog = () => (logTimer ??= setTimeout(drawLog, 100));

  function build(container) {
    ui = {
      root: h("div", {}),
      toolbar: h("div", { class: "row" }),
      state: h("p", { class: "muted" }),
      cases: h("div", {}),
      log: h("pre", { class: "log", "aria-live": "off" }),
      last: h("div", {}),
      report: h("div", {}),
      traces: h("div", {}),
    };
    ui.root.append(
      ui.toolbar,
      ui.state,
      ui.cases,
      h("h3", {}, "Log trực tiếp (500 dòng cuối)"),
      ui.log,
      h("h3", {}, "Kết quả lần chạy gần nhất"),
      ui.last,
      h("h3", {}, "Report"),
      ui.report,
      h("h3", {}, "Trace"),
      ui.traces,
    );
    container.replaceChildren(ui.root);
    drawLog();
  }

  const runHere = () => data.running && data.running.run === ctx.run && data.running.feature === ctx.feature;

  function start(button, spec) {
    return action(button, status(), spec ? `Đã bắt đầu chạy ${spec}` : "Đã bắt đầu chạy regression", async () => {
      lines = [];
      scheduleLog();
      await api("POST", `${base()}/playwright/run`, { run: ctx.run, ...(spec && { spec }) });
      await refresh();
    });
  }

  function specResult(file) {
    const mine = ((data.last && data.last.tests) || []).filter((t) => t.file === file);
    if (!mine.length) return null;
    return mine.every((t) => t.status === "passed") ? "passed" : mine.some((t) => t.status === "failed") ? "failed" : mine[0].status;
  }

  function draw() {
    const busy = Boolean(data.running);
    ui.state.textContent = busy
      ? `Đang chạy ${data.running.spec || "toàn bộ spec"} (${data.running.feature}, đợt ${data.running.run}) từ ${new Date(data.running.started_at).toLocaleTimeString("vi-VN")}.`
      : data.specs.length
        ? `Có ${data.specs.length} spec trong tests/${ctx.feature}/.`
        : `Chưa có spec nào trong tests/${ctx.feature}/. Chạy /to-playwright ${ctx.feature} <id> trong Claude Code.`;

    const regression = h("button", { class: "primary", type: "button", disabled: busy || !data.specs.length, onclick: (e) => start(e.currentTarget, null) }, "Regression (chạy mọi spec)");
    const stop = h(
      "button",
      {
        type: "button",
        disabled: !busy || data.running.feature !== ctx.feature,
        onclick: (e) => action(e.currentTarget, status(), "Đã gửi lệnh dừng", async () => {
          await api("POST", `${base()}/playwright/stop`);
          await refresh();
        }),
      },
      "Dừng",
    );
    ui.toolbar.replaceChildren(regression, stop);

    const rows = data.testcases.filter((t) => data.specs.includes(`${t.id}.spec.ts`));
    ui.cases.replaceChildren(
      ...(rows.length
        ? [h(
            "table",
            {},
            h("thead", {}, h("tr", {}, ["Test case", "Status", "Kết quả gần nhất", ""].map((c) => h("th", {}, c)))),
            h(
              "tbody",
              {},
              rows.map((t) => {
                const file = `${t.id}.spec.ts`;
                const result = specResult(file);
                const canPromote = t.status === "ai-passed" && result === "passed";
                return h(
                  "tr",
                  {},
                  h("td", {}, `${t.id} - ${t.title}`),
                  h("td", {}, t.status),
                  h("td", {}, result ? h("span", { class: `badge ${result === "passed" ? "ok" : "error"}` }, RESULT_LABEL[result] || result) : "chưa chạy trong đợt này"),
                  h(
                    "td",
                    {},
                    h("button", { class: "small", type: "button", disabled: busy, onclick: (e) => start(e.currentTarget, `tests/${ctx.feature}/${file}`) }, "Chạy spec"),
                    " ",
                    canPromote
                      ? h(
                          "button",
                          {
                            class: "small primary",
                            type: "button",
                            onclick: (e) =>
                              action(e.currentTarget, status(), `${t.id} đã vào regression (automated)`, async () => {
                                await api("POST", `${base()}/testcases/${encodeURIComponent(t.id)}/automate`, { run: ctx.run });
                                await refresh();
                              }),
                          },
                          "Đưa vào regression",
                        )
                      : null,
                  ),
                );
              }),
            ),
          )]
        : []),
    );

    const last = data.last;
    ui.last.replaceChildren(
      last
        ? h(
            "div",
            {},
            h(
              "p",
              {},
              `${last.spec || "Toàn bộ spec"} · mã thoát ${last.exit_code === null ? "(bị dừng)" : last.exit_code}${last.stopped ? " · tester đã dừng" : ""} · xong lúc ${new Date(last.finished_at).toLocaleString("vi-VN")}`,
            ),
            last.tests.length
              ? h(
                  "table",
                  {},
                  h("thead", {}, h("tr", {}, ["Spec", "Test", "Kết quả", "Thời gian"].map((c) => h("th", {}, c)))),
                  h(
                    "tbody",
                    {},
                    last.tests.map((t) =>
                      h("tr", {}, h("td", {}, t.file), h("td", {}, t.title), h("td", {}, h("span", { class: `badge ${t.status === "passed" ? "ok" : t.status === "skipped" ? "" : "error"}` }, RESULT_LABEL[t.status])), h("td", { class: "num" }, `${(t.duration_ms / 1000).toFixed(1)}s`)),
                    ),
                  ),
                )
              : h("p", { class: "muted" }, "Không có kết quả từng test (xem log ở trên)."),
          )
        : h("p", { class: "muted" }, "Đợt này chưa chạy Playwright."),
    );

    // Chỉ đổi src khi lần chạy đổi, để iframe không tải lại vô ích.
    const src = data.has_report ? `/report/${encodeURIComponent(ctx.run)}/?t=${encodeURIComponent(last ? last.finished_at : "")}` : "";
    const frame = ui.report.querySelector("iframe");
    if (!src) {
      ui.report.replaceChildren(h("p", { class: "muted" }, "Chưa có report HTML."));
    } else if (!frame || frame.dataset.src !== src) {
      const f = h("iframe", { class: "report", src, title: "Playwright report" });
      f.dataset.src = src;
      ui.report.replaceChildren(f);
    }

    ui.traces.replaceChildren(
      ...(data.traces.length
        ? data.traces.map((t) => {
            const cmd = `npx playwright show-trace ${quote(t)}`;
            return h("div", { class: "row" }, h("code", {}, cmd), copyButton(cmd));
          })
        : [h("p", { class: "muted" }, "Chưa có trace (chỉ giữ trace của test fail). Lệnh mở trace sẽ hiện ở đây, chạy trong terminal.")]),
    );
  }

  async function refresh() {
    try {
      const [pw, tcs] = await Promise.all([api("GET", `${base()}/playwright?run=${encodeURIComponent(ctx.run)}`), api("GET", `${base()}/testcases`)]);
      data = { ...pw, testcases: tcs.testcases };
      draw();
    } catch (err) {
      status().fail(err);
    }
  }

  async function loadLogTail() {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(ctx.run)}/files/playwright-log.txt`);
      if (!res.ok || lines.length) return;
      lines = (await res.text()).split("\n").filter(Boolean).slice(-MAX_LINES);
      scheduleLog();
    } catch {
      // chưa có log
    }
  }

  listen("playwright", (ev) => {
    if (!ctx || ev.feature !== ctx.feature || ev.run !== ctx.run) return;
    if (ev.type === "playwright-log") {
      lines.push(ev.line);
      if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
      scheduleLog();
    } else if (ev.type === "playwright-state") {
      if (ev.state === "running") lines = [];
      refresh();
    }
  });

  window.runSlots.playwright = (container, _run, c) => {
    const first = !ui;
    ctx = c;
    if (first || !container.contains(ui.root)) build(container);
    if (first) loadLogTail();
    return refresh();
  };
})();
