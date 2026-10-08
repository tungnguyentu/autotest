// Ô "Bước tiếp theo": từ trạng thái dữ liệu của tính năng, nói tester cần làm gì.
// Bước cần AI kèm lệnh để copy vào Claude Code.
window.NextStep = (() => {
  const needsAuth = (feature) => Object.values(feature.screens || {}).some((s) => s.auth);

  /** Bước so UI với Figma cho screen đầu tiên có ảnh Figma mà chưa xong. `null` nếu không còn gì cần làm. */
  function uiDiffStep(o, f, runPage) {
    const screens = (o.ui_diff || []).filter((s) => s.has_figma);
    if (!screens.length) return null;
    const open = (label) => ({ href: `${runPage || `feature.html?f=${f}`}${runPage ? "#ui-diff" : ""}`, label });
    for (const s of screens) {
      if (!s.compared) {
        return { title: `Chụp và so screen "${s.screen}" với ảnh Figma.`, link: runPage ? open("Mở khu So UI với Figma của đợt") : { href: `feature.html?f=${f}`, label: "Tạo đợt test trước (trang tính năng)" } };
      }
      if (!s.has_report) {
        return { title: `Nhờ AI đánh giá sai khác của "${s.screen}". Chạy lệnh này trong Claude Code, xong quay lại trang này.`, command: `/ui-check ${f} ${s.screen}` };
      }
      if (s.undecided > 0) {
        return { title: `Quyết định từng mục sai khác của "${s.screen}" (còn ${s.undecided} mục).`, link: open("Mở khu So UI với Figma của đợt") };
      }
      if (!s.has_baseline) {
        return s.has_spec
          ? { title: `Đã quyết định hết mục của "${s.screen}". Bấm "Cho tạo baseline" nếu UI khớp thiết kế.`, link: open("Mở khu So UI với Figma của đợt") }
          : { title: `"${s.screen}" cần một spec có toHaveScreenshot('${s.screen}.png') trong tests/${f}/ trước khi tạo baseline.` };
      }
    }
    return null;
  }

  /** @param o dữ liệu từ GET /api/features/:f/overview */
  function compute(o) {
    const f = o.feature.feature;
    const t = o.testcases;
    if (/REPLACE-ME/i.test(o.feature.baseURL)) {
      return { title: "Điền địa chỉ môi trường (baseURL) thật cho tính năng này.", link: { href: `feature.html?f=${f}`, label: "Mở trang tính năng" } };
    }
    if (!o.usecases.length) {
      return { title: "Tải use case (file .md hoặc .docx) lên.", link: { href: `feature.html?f=${f}#usecases`, label: "Mở khu Use case" } };
    }
    if (!t.exists || t.total === 0) {
      return { title: "Nhờ AI sinh test case. Chạy lệnh này trong Claude Code, xong quay lại trang này.", command: `/gen-testcases ${f}` };
    }
    if (t.counts.draft > 0) {
      return { title: `Duyệt ${t.counts.draft} test case đang ở trạng thái draft.`, link: { href: `testcases.html?f=${f}`, label: "Mở trang test case" } };
    }
    const latest = o.runs[0];
    const runPage = latest && `run.html?f=${f}&run=${encodeURIComponent(latest.name)}`;
    const cases = o.cases || [];
    const undecided = cases.filter((c) => c.status === "reviewed" && c.ai_run && c.ai_run.has_result && !c.ai_run.decision);
    const unfinished = cases.filter((c) => c.status === "reviewed" && c.ai_run && !c.ai_run.has_result);
    if (undecided.length) {
      return { title: `Xem và xác nhận kết quả AI chạy thử (${undecided.length} test case chưa quyết định).`, link: { href: runPage, label: "Mở khu AI chạy thử của đợt" } };
    }
    if (unfinished.length) {
      return { title: `${unfinished[0].id} đã có lượt chạy thử nhưng AI chưa ghi kết quả (run-finish). Nhờ AI chạy tiếp lệnh run-finish, hoặc mở lượt mới.`, link: { href: runPage, label: "Mở khu AI chạy thử của đợt" } };
    }
    const ran = new Set(latest ? latest.ai_run_ids : []);
    const pending = t.reviewed_ids.filter((id) => !ran.has(id));
    if (pending.length) {
      if (needsAuth(o.feature) && !o.session) {
        return { title: "Đăng nhập tay và lưu phiên trước khi cho AI chạy thử.", link: { href: `feature.html?f=${f}#login`, label: "Mở khu Đăng nhập" } };
      }
      return { title: `Cho AI chạy thử ${pending.length} test case đã duyệt. Chạy lệnh này trong Claude Code.`, command: `/run-testcase ${f} ${pending[0]}` };
    }
    const passed = cases.filter((c) => c.status === "ai-passed");
    const noSpec = passed.find((c) => !c.has_spec);
    if (noSpec) {
      return { title: `Chuyển ${noSpec.id} sang Playwright. Chạy lệnh này trong Claude Code, xong quay lại trang này.`, command: `/to-playwright ${f} ${noSpec.id}` };
    }
    const notRun = passed.find((c) => c.spec_result !== "passed");
    if (notRun) {
      return {
        title: notRun.spec_result === "failed" ? `Spec của ${notRun.id} fail. Phân loại: bug thật, locator hỏng hay UI đổi. Nếu locator hỏng, chạy /heal-locator ${f} ${notRun.id} trong Claude Code.` : `Chạy spec của ${notRun.id}.`,
        ...(notRun.spec_result === "failed" && { command: `/heal-locator ${f} ${notRun.id}` }),
        link: { href: runPage || `feature.html?f=${f}`, label: "Mở khu Playwright của đợt" },
      };
    }
    if (passed.length) {
      return { title: `Spec của ${passed[0].id} đã pass. Đưa vào regression.`, link: { href: runPage, label: "Mở khu Playwright của đợt" } };
    }
    const ui = uiDiffStep(o, f, runPage);
    if (ui) return ui;
    if (cases.some((c) => c.status === "automated")) {
      return { title: "Chạy regression để kiểm tra các test case đã tự động hóa.", link: { href: runPage || `feature.html?f=${f}`, label: "Mở khu Playwright của đợt" } };
    }
    return { title: `Chưa có việc tiếp theo. Muốn so UI với Figma, export frame vào features/${f}/figma/<screen>.png (xem docs).` };
  }

  /** Vẽ ô vào `container` (xóa nội dung cũ). */
  function mount(container, overview) {
    const { h, copyButton } = window.App;
    const s = compute(overview);
    container.replaceChildren(
      h(
        "div",
        { class: "next-step" },
        h("div", { class: "title" }, "Bước tiếp theo"),
        h("div", {}, s.title),
        s.command && h("div", { class: "row" }, h("code", {}, s.command), copyButton(s.command)),
        s.link && h("div", {}, h("a", { href: s.link.href }, s.link.label)),
      ),
    );
  }

  return { compute, mount };
})();
