// Dev tool: renders PDF pages (or a cropped region) to PNG using pdf.js in headless Chromium.
// usage: node scripts/render-pages.mjs <pdf> <outDir> [scale] [crops.json]
// crops.json: [{ "name": "fig1", "page": 3, "x": 0.1, "y": 0.1, "w": 0.8, "h": 0.5 }]  (page fractions)
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [pdfPath, outDir, scaleArg, cropsPath] = process.argv.slice(2);
if (!pdfPath || !outDir) { console.error("usage: render-pages.mjs <pdf> <outDir> [scale] [crops.json]"); process.exit(2); }
const scale = Number(scaleArg || 1.5);
const crops = cropsPath ? JSON.parse(readFileSync(cropsPath, "utf8")) : null;
mkdirSync(outDir, { recursive: true });

const files = {
  "/pdf.mjs": [join(root, "node_modules/pdfjs-dist/build/pdf.min.mjs"), "text/javascript"],
  "/pdf.worker.mjs": [join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), "text/javascript"],
  "/doc.pdf": [resolve(pdfPath), "application/pdf"],
};
const server = http.createServer((req, res) => {
  const f = files[req.url.split("?")[0]];
  if (req.url === "/") { res.setHeader("content-type", "text/html"); return res.end("<!doctype html><body></body>"); }
  if (!f || !existsSync(f[0])) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", f[1]);
  res.end(readFileSync(f[0]));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto(base + "/");
const jobs = crops ?? null;
const result = await page.evaluate(async ({ scale, jobs }) => {
  const pdfjs = await import("/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
  const doc = await pdfjs.getDocument({ url: "/doc.pdf" }).promise;
  const out = [];
  const renderPage = async (n) => {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await p.render({ canvasContext: c.getContext("2d"), viewport: vp, canvas: c }).promise;
    return c;
  };
  if (jobs) {
    for (const j of jobs) {
      const c = await renderPage(j.page);
      const d = document.createElement("canvas");
      d.width = Math.round(c.width * j.w); d.height = Math.round(c.height * j.h);
      d.getContext("2d").drawImage(c, c.width * j.x, c.height * j.y, d.width, d.height, 0, 0, d.width, d.height);
      out.push({ name: j.name, data: d.toDataURL(j.jpeg ? "image/jpeg" : "image/png", 0.88), w: d.width, h: d.height });
    }
  } else {
    for (let n = 1; n <= doc.numPages; n++) {
      const c = await renderPage(n);
      out.push({ name: "page-" + String(n).padStart(2, "0"), data: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height });
    }
  }
  return out;
}, { scale, jobs });
for (const r of result) {
  const ext = r.data.startsWith("data:image/jpeg") ? "jpg" : "png";
  writeFileSync(join(outDir, `${r.name}.${ext}`), Buffer.from(r.data.split(",")[1], "base64"));
  console.log(r.name, r.w + "x" + r.h);
}
await browser.close();
server.close();
