/** Loopback-only, never serve production or mutate canonical app. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,dirname,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT??4179);if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
createServer(async(req,res)=>{
 let path;
 try { path=decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
 catch { res.writeHead(400,{'content-type':'text/plain; charset=utf-8','x-morro-mode':'isolated-fixture-only'});res.end('INVALID_REQUEST_PATH');return; }
 const filename=resolve(root,path==='/'?'preview/index.html':path.slice(1));
 if(filename!==root&&!filename.startsWith(root+sep)){res.writeHead(403);res.end('FORBIDDEN');return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('READ_ONLY');return}
 try {const file=await readFile(filename);res.writeHead(200,{'content-type':mime[extname(filename)]??'application/octet-stream','cache-control':'no-store','x-morro-mode':'isolated-fixture-only','content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self'"});res.end(req.method==='HEAD'?undefined:file)}
 catch{res.writeHead(404);res.end('NOT_FOUND')}
}).listen(port,'127.0.0.1',()=>console.log(`ISOLATED LAB PREVIEW http://127.0.0.1:${port}/`));
