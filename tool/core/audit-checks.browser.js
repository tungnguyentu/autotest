// Chạy trong trình duyệt (page.evaluate hoặc `agent-browser eval`). Trả về một object JSON.
// Không import, không dùng biến ngoài. Chỉ đo, không kết luận.
(() => {
  const W = innerWidth;
  const doc = document.documentElement;
  const sel = (el) => {
    if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
    const own = el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => "." + c).join("");
    const p = el.parentElement;
    if (!p || p === document.body) return own;
    const pc = p.tagName.toLowerCase() + [...p.classList].slice(0, 1).map((c) => "." + c).join("");
    return `${pc} > ${own}`;
  };
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || "");
    if (!m) return null;
    const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (x) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const rgb = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1 && r.width > 0 && r.height > 0;
  };
  /** Màu nền thật phía sau phần tử. Gặp ảnh nền hoặc gradient thì không đo được. */
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const pageY = (el) => Math.round(el.getBoundingClientRect().top + scrollY);

  // Theme đang hiển thị, đoán theo độ sáng nền trang.
  const pageBg = bgOf(document.body) || { r: 255, g: 255, b: 255, a: 1 };
  const shown_theme = lum(pageBg) < 0.2 ? "dark" : "light";

  // Tương phản chữ (WCAG AA)
  const lowContrast = [];
  let textChecked = 0;
  let textSkipped = 0;
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    const text = walker.currentNode.textContent.trim();
    if (!text || !el || seen.has(el) || el.closest("svg,script,style,noscript,[aria-hidden=true]") || !visible(el)) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    const bg = bgOf(el);
    if (!fg || !bg) {
      textSkipped++;
      continue;
    }
    textChecked++;
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (Number(s.fontWeight) >= 700 && size >= 18.66);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) {
      lowContrast.push({ text: text.slice(0, 60), ratio: Math.round(r * 100) / 100, need, color: rgb(fg), background: rgb(bg), font_size: size, selector: sel(el), y: pageY(el) });
    }
  }

  // Phần tử tràn ra ngoài chiều ngang màn hình (không bị cha cắt)
  const overflow = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= W + 1 || r.width > W * 3) continue;
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/hidden|auto|scroll|clip/.test(getComputedStyle(p).overflowX)) {
        clipped = true;
        break;
      }
    }
    if (!clipped) overflow.push({ selector: sel(el), right: Math.round(r.right), y: pageY(el) });
  }

  const imgs = [...document.images];
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
  const heading_skips = [];
  let prev = 0;
  for (const h of headings) {
    const n = Number(h.tagName[1]);
    if (prev && n > prev + 1) heading_skips.push(`${h.tagName} sau H${prev}: ${h.textContent.trim().slice(0, 50)}`);
    prev = n;
  }

  const links = [...document.querySelectorAll("a")].filter(visible);
  const no_target_links = links
    .filter((a) => {
      const h = a.getAttribute("href");
      return !h || h === "#" || h.startsWith("javascript:");
    })
    .map((a) => ({ text: (a.textContent.trim() || a.getAttribute("aria-label") || "").slice(0, 60), selector: sel(a), href: a.getAttribute("href"), y: pageY(a) }));
  const bad_rel = [...document.querySelectorAll("a[rel]")]
    .filter((a) => /[="]/.test(a.getAttribute("rel")))
    .map((a) => ({ text: a.textContent.trim().slice(0, 60), rel: a.getAttribute("rel"), selector: sel(a) }));
  const unnamed_controls = [...document.querySelectorAll("a,button,[role=button]")]
    .filter((e) => visible(e) && !(e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent.trim() || e.querySelector("img[alt]:not([alt=''])")))
    .map(sel);

  // Phần tử nổi: dễ che nội dung, tester cần xem bằng mắt
  const floating = [...document.body.querySelectorAll("*")]
    .filter((e) => /fixed|sticky/.test(getComputedStyle(e).position) && visible(e))
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { selector: sel(e), position: getComputedStyle(e).position, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    })
    .filter((f) => f.width * f.height > 0)
    .slice(0, 15);

  // Theme tối: khối lớn còn nền sáng
  const light_blocks = [];
  if (shown_theme === "dark") {
    for (const el of document.body.querySelectorAll("section,div,header,footer,main,article,aside,nav")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < W * 0.5 || r.height < 150) continue;
      const c = parse(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.5 && lum(c) > 0.6) light_blocks.push({ selector: sel(el), background: rgb(c), y: pageY(el), height: Math.round(r.height) });
    }
  }

  return {
    shown_theme,
    page_background: rgb(pageBg),
    title: document.title,
    page: { width: doc.scrollWidth, viewport_width: doc.clientWidth, height: doc.scrollHeight, horizontal_scroll: doc.scrollWidth > doc.clientWidth + 1 },
    contrast: { checked: textChecked, skipped_on_image: textSkipped, failures: lowContrast.length, items: lowContrast.slice(0, 50) },
    overflow: { total: overflow.length, items: overflow.slice(0, 20) },
    images: {
      total: imgs.length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map((i) => (i.currentSrc || i.src).slice(0, 200)),
      missing_alt: imgs.filter((i) => !i.hasAttribute("alt") && visible(i)).map((i) => (i.currentSrc || i.src).slice(0, 200)),
    },
    headings: { h1: headings.filter((h) => h.tagName === "H1").map((h) => h.textContent.trim().slice(0, 80)), skips: heading_skips },
    links: { no_target: no_target_links.slice(0, 30), bad_rel: bad_rel.slice(0, 30), unnamed_controls: unnamed_controls.slice(0, 30) },
    floating,
    light_blocks_in_dark: light_blocks.slice(0, 20),
  };
})()
