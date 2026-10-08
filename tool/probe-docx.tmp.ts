import fs from "node:fs";
import mammoth from "mammoth";
import TurndownService from "turndown";
// @ts-ignore
import { gfm } from "turndown-plugin-gfm";
const buf = fs.readFileSync(process.argv[2]!);
let n = 0;
const r = await mammoth.convertToHtml({ buffer: buf }, {
  convertImage: mammoth.images.imgElement(async (img) => {
    n++; const b = await img.readAsBuffer(); return { src: `IMG${n}.${img.contentType}.${b.length}`, alt: "" };
  }),
});
console.log(r.value);
const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }); td.use(gfm);
console.log("----\n" + td.turndown(r.value));
console.log("----merged");
console.log(td.turndown("<table><tr><td>A</td><td>B</td></tr><tr><td colspan=2>C</td></tr></table>"));
