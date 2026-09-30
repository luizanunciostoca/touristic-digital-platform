import { createServer } from 'node:http';
import { readFile,realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const known={'/':'preview/index.html'};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const port=Number(process.env.P08_PORT??42187);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_LOOPBACK_PORT');
const server=createServer(async(req,res)=>{
 const headers={'X-Morro-Mode':'isolated-fixture-only','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; base-uri 'none'; form-action 'self'",'Access-Control-Allow-Origin':'none'};
 const done=(status,msg)=>{res.writeHead(status,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?'':msg);};
 if(!['GET','HEAD'].includes(req.method))return done(405,'READ_ONLY_PREVIEW');
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return done(400,'INVALID_URL');}
 if(pathname.includes('..')||pathname.includes('\\')||pathname.includes('\0'))return done(403,'PATH_DENIED');
 const relative=known[pathname]??pathname.replace(/^\//,'');
 if(!/^(src|preview)\/[a-z0-9_./-]+$/i.test(relative))return done(404,'NOT_FOUND');
 const candidate=resolve(ROOT,relative);
 if(!candidate.startsWith(ROOT+sep))return done(403,'PATH_DENIED');
 const contentType=mime[extname(candidate)];if(!contentType)return done(404,'NOT_FOUND');
 try{const canonical=await realpath(candidate);if(!canonical.startsWith(ROOT+sep))return done(403,'PATH_DENIED');
 const bytes=await readFile(canonical);res.writeHead(200,{...headers,'Content-Type':contentType});res.end(req.method==='HEAD'?'':bytes);
 }catch{return done(404,'NOT_FOUND');}
});
server.listen(port,'127.0.0.1',()=>console.log('P08_PREVIEW http://127.0.0.1:'+port));
