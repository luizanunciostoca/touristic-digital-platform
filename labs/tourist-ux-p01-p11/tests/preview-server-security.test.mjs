import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as requestHttp } from 'node:http';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const lab=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const request=(port,method,path)=>new Promise((resolve,reject)=>{
 const req=requestHttp({hostname:'127.0.0.1',port,method,path,timeout:1600},res=>{
  const data=[];res.on('data',chunk=>data.push(chunk));
  res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(data).toString(),headers:res.headers}));
 });req.on('error',reject);req.end();
});

test('preview HTTP boundary rejects writes, traversal and malformed URLs without process crash',async()=>{
 const port=43000+(process.pid%12000);
 const server=spawn(process.execPath,['tools/preview-server.mjs'],{cwd:lab,env:{...process.env,PORT:String(port)},stdio:'ignore'});
 try {
  let ready=false;
  for(let i=0;i<45;i++){
   if(server.exitCode!==null)throw Error('PREVIEW_PROCESS_EXITED');
   try {const r=await request(port,'GET','/');if(r.status===200){ready=true;break;}} catch {}
   await pause(60);
  }
  assert.equal(ready,true);
  const home=await request(port,'GET','/');
  assert.equal(home.status,200);assert.equal(home.headers['x-morro-mode'],'isolated-fixture-only');
  assert.equal((await request(port,'HEAD','/')).status,200);
  assert.equal((await request(port,'POST','/')).status,405);
  assert.equal((await request(port,'GET','/..%2F..%2Fetc%2Fpasswd')).status,403);
  assert.equal((await request(port,'GET','/%E0%A4%A')).status,400);
  const after=await request(port,'GET','/');
  assert.equal(after.status,200);assert.equal(server.exitCode,null);
 }finally {server.kill('SIGTERM');}
});
