import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "dist");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of ["index.html", ".nojekyll", "assets", "music", "src"]) {
  await cp(path.join(projectRoot, entry), path.join(outputDir, entry), { recursive: true });
}

console.log(`Build estático pronto em ${path.relative(projectRoot, outputDir)}/`);
