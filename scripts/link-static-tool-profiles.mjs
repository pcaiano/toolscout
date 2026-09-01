import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
for(const name of ['tools.html','compare.html']){
  const file=path.join(ROOT,name);
  const before=fs.readFileSync(file,'utf8');
  const after=before.replaceAll('./tool.html?tool=${encodeURIComponent(t.slug)}','./tools/${encodeURIComponent(t.slug)}.html');
  if(after!==before)fs.writeFileSync(file,after);
}
console.log('Static tool-profile links reconciled.');
