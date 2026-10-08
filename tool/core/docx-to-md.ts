import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface DocxImage {
  /** Tên file trong thư mục ảnh, ví dụ `01.png`. */
  file: string;
  data: Buffer;
}

export interface DocxConversion {
  markdown: string;
  images: DocxImage[];
  /** Cảnh báo của bộ chuyển đổi, bỏ cảnh báo về style đoạn văn (không ảnh hưởng nội dung). */
  warnings: string[];
}

function imageExt(contentType: string): string {
  const sub = (contentType.split("/")[1] ?? "bin").toLowerCase().replace(/^x-/, "");
  if (sub === "jpeg") return "jpg";
  return /^[a-z0-9+]{1,10}$/.test(sub) ? sub.replace("+xml", "") : "bin";
}

function markdownService(): TurndownService {
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  td.use(gfm);
  // Word đặt mỗi ô bảng trong <p>. Giữ ô trên một dòng để bảng Markdown không vỡ.
  td.addRule("cellParagraph", {
    filter: (node) => node.nodeName === "P" && /^(TD|TH)$/.test(node.parentNode?.nodeName ?? ""),
    replacement: (content, node) => {
      const text = content.trim().replace(/\s*\n+\s*/g, " <br> ").replace(/\|/g, "\\|");
      return node.nextSibling ? `${text} <br> ` : text;
    },
  });
  // Mammoth sinh <a id> rỗng làm neo cho tiêu đề. Bỏ đi.
  td.addRule("emptyAnchor", {
    filter: (node) => node.nodeName === "A" && !node.getAttribute("href") && !node.textContent,
    replacement: () => "",
  });
  return td;
}

/**
 * Chuyển file Word (.docx) thành Markdown. Ảnh tách ra thành file riêng, link trong Markdown
 * trỏ tới `<imageDir>/<file>` để Claude Code mở được bằng công cụ đọc ảnh.
 */
export async function docxToMarkdown(buffer: Buffer, imageDir: string): Promise<DocxConversion> {
  const images: DocxImage[] = [];
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (img) => {
        const file = `${String(images.length + 1).padStart(2, "0")}.${imageExt(img.contentType)}`;
        images.push({ file, data: await img.readAsBuffer() });
        return { src: `${encodeURI(imageDir)}/${file}`, alt: `Ảnh ${images.length}` };
      }),
    },
  );
  const markdown = markdownService().turndown(result.value).replace(/\n{3,}/g, "\n\n").trim();
  const warnings = result.messages
    .filter((m) => !/^Unrecognised (paragraph|run) style/.test(m.message))
    .map((m) => m.message);
  return { markdown, images, warnings };
}
