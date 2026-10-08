// Tiện ích dùng chung cho mọi trang. Không framework, không build.
// Mọi nội dung từ API được đưa vào DOM bằng textContent, không dùng innerHTML.
window.App = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  /** Tạo phần tử: h("button", {class: "primary", onclick: fn}, "Lưu"). Con là chuỗi, số hoặc phần tử. */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  /** Gọi API. `body` là Blob (File) thì gửi nguyên nội dung file, ngược lại gửi JSON. */
  async function api(method, url, body) {
    const raw = body instanceof Blob;
    const res = await fetch(url, {
      method,
      headers: body === undefined ? {} : { "Content-Type": raw ? "application/octet-stream" : "application/json" },
      body: body === undefined || raw ? body : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // thân rỗng hoặc không phải JSON
    }
    if (!res.ok) throw new Error((data && data.error) || `Lỗi ${res.status} từ server`);
    return data;
  }

  const param = (name) => new URLSearchParams(location.search).get(name) || "";
  const clock = () => new Date().toLocaleTimeString("vi-VN");
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN") : "");

  /** Dòng trạng thái: mọi thao tác ghi báo thành công hoặc lỗi ở đây. */
  function status() {
    const el = $("#status");
    const set = (cls, msg) => {
      el.className = `status ${cls}`;
      el.textContent = msg;
    };
    return { ok: (msg) => set("ok", `${msg} (${clock()})`), fail: (err) => set("error", `Lỗi: ${err.message || err}`), info: (msg) => set("muted", msg) };
  }

  /** Chạy một thao tác ghi: khóa nút trong lúc chạy, báo kết quả. Trả về true nếu thành công. */
  async function action(button, st, okMessage, fn) {
    button.disabled = true;
    st.info("Đang xử lý...");
    try {
      await fn();
      st.ok(okMessage);
      return true;
    } catch (err) {
      st.fail(err);
      return false;
    } finally {
      button.disabled = false;
    }
  }

  // ---- SSE: server báo file đổi, trang tự tải lại phần đang xem ----
  const listeners = new Set();
  const source = new EventSource("/events");
  source.addEventListener("change", (ev) => {
    const e = JSON.parse(ev.data);
    for (const fn of listeners) fn(e);
  });

  /** Gọi `reload` (gộp trong 200ms) khi có file đổi mà `match(path)` đúng. */
  function watch(match, reload) {
    let timer;
    listeners.add((e) => {
      if (!match(e.path)) return;
      clearTimeout(timer);
      timer = setTimeout(reload, 200);
    });
  }

  /** Nghe một loại sự kiện SSE riêng (ví dụ "playwright"). `fn` nhận dữ liệu JSON đã parse. */
  function listen(eventName, fn) {
    source.addEventListener(eventName, (ev) => fn(JSON.parse(ev.data)));
  }

  function copyButton(text) {
    const b = h("button", { class: "small", type: "button" }, "Copy");
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        b.textContent = "Đã copy";
      } catch {
        b.textContent = "Không copy được, hãy chọn và copy tay";
      }
      setTimeout(() => (b.textContent = "Copy"), 2000);
    });
    return b;
  }

  function header(crumbs) {
    const top = $("header.top");
    top.append(
      h("div", { class: "inner" }, h("a", { class: "brand", href: "/" }, "Tool AI Testing"), h("span", { class: "crumbs" }, crumbs || "")),
    );
  }

  const STATUS_LABEL = {
    draft: "draft (chờ duyệt)",
    reviewed: "reviewed (đã duyệt)",
    "ai-passed": "ai-passed",
    "ai-failed": "ai-failed",
    automated: "automated",
  };

  return { $, h, api, param, fmtDate, status, action, watch, listen, copyButton, header, STATUS_LABEL };
})();
