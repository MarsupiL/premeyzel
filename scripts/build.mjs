import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files=['index.html','app.js','model.js','art.js','style.css','manifest.webmanifest','assets'];
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of files)await cp(file,`dist/${file}`,{recursive:true});
const hash=createHash('sha256');for(const file of files.filter(f=>f!=='assets'))hash.update(await readFile(file));
const sw=(await readFile('sw.js','utf8')).replace('premeyzel-static-v1',`premeyzel-static-${hash.digest('hex').slice(0,12)}`);
await writeFile('dist/sw.js',sw);await writeFile('dist/.nojekyll','');
console.log('Static pilot built in dist/');
