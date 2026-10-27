import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const portIndex=process.argv.indexOf('--port');
const root=process.cwd(),port=Number(process.env.PORT||(portIndex>=0?process.argv[portIndex+1]:3000));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p==='/')p='/index.html';const path=resolve(root,'.'+p);if(!path.startsWith(root+'/'))throw Error();let data;try{data=await readFile(path)}catch{data=await readFile(resolve(root,'public','.'+p))}res.writeHead(200,{'Content-Type':types[extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}}).listen(port,'0.0.0.0',()=>console.log(`Omicron on ${port}`));
