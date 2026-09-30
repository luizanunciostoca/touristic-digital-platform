import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function http(port,path='/',method='GET') {
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method,timeout:3000},res=>{
      const bytes=[];res.on('data',data=>bytes.push(data));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(bytes).toString(),headers:res.headers}));
    });req.on('error',reject);req.end();
  });
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('preview only binds localhost; fails closed on writes/traversal and recovers from malformed paths',async()=>{
  const port=44000+(process.pid%10000);
  const child=spawn(process.execPath,['tools/preview-server.mjs'],{cwd:ROOT,env:{...process.env,P08_PORT:String(port)},stdio:'ignore'});
  try{
    let ready=false;
    for(let i=0;i<50;i++){
      if(child.exitCode!==null)throw Error('PREVIEW_EXITED');
      try{const r=await http(port);if(r.status===200){ready=true;break;}}catch{}
      await delay(60);
    }
    assert.equal(ready,true);
    const get=await http(port);
    assert.equal(get.status,200);
    assert.equal(get.headers['x-morro-mode'],'isolated-fixture-only');
    assert.ok(get.headers['content-security-policy'].includes("connect-src 'none'"));
    assert.equal((await http(port,'/','HEAD')).status,200);
    for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await http(port,'/',method)).status,405);
    assert.equal((await http(port,'/..%2f..%2fetc%2fpasswd')).status,403);
    assert.equal((await http(port,'/%E0%A4%A')).status,400);
    assert.equal((await http(port)).status,200);
    assert.equal(child.exitCode,null);
  }finally{child.kill('SIGTERM');}
});
