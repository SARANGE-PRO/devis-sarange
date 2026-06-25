import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'public/selecteur-panneaux';
mkdirSync(`${OUT}/fonts`, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const css = await (await fetch(
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  { headers: { 'User-Agent': UA } }
)).text();
const re = /\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
const keep = new Set(['latin', 'latin-ext']);
let out = '';
const jobs = [];
let m;
while ((m = re.exec(css))) {
  const subset = m[1];
  if (!keep.has(subset)) continue;
  let block = m[2];
  const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
  const url = (block.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
  const local = `fonts/Inter-${weight}-${subset}.woff2`;
  jobs.push({ url, local });
  out += `/* ${subset} ${weight} */\n` + block.replace(/url\(https:[^)]+\.woff2\)/, `url(${local})`) + '\n';
}
for (const j of jobs) {
  const buf = Buffer.from(await (await fetch(j.url)).arrayBuffer());
  writeFileSync(`${OUT}/${j.local}`, buf);
  console.log(`saved ${j.local} (${buf.length} bytes)`);
}
writeFileSync(`${OUT}/inter.css`, out);
console.log(`inter.css written with ${jobs.length} faces`);
