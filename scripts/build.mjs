import {rm,mkdir,cp} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist');
for(const file of ['index.html','src']) await cp(file,`dist/${file}`,{recursive:true});
await cp('public','dist',{recursive:true});
console.log('Built static Omicron in dist/');
