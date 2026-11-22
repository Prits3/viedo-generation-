// Copies the MP4s of the bundled example lessons into /public/showcase/<id>/ so a host can serve
// them as static files. Serverless functions cap response size (Netlify: about 6 MB), and the
// example videos are 6 to 9 MB. netlify.toml rewrites the download URL of each example to its copy.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const showcase = join(root, "showcase", "lessons");
let n = 0;
for (const id of existsSync(showcase) ? readdirSync(showcase) : []) {
  for (const file of ["vertical.mp4", "landscape.mp4", "caption.txt"]) {
    const src = join(showcase, id, "export", file);
    if (!existsSync(src)) continue;
    const dest = join(root, "public", "showcase", id, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    n++;
  }
}
console.log(`showcase: ${n} export file(s) copied to public/showcase/`);
