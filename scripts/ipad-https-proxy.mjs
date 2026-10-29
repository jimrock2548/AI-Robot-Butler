// Local HTTPS entrance for Robot Interface only. Keys stay in .tools; only the public CA is downloadable.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const addresses=Object.entries(os.networkInterfaces()).filter(([name])=>!/vethernet|loopback|wsl|docker/i.test(name)).flatMap(([,items])=>items??[]).filter(a=>a.family==='IPv4'&&!a.internal).map(a=>a.address);
const host=arg('host')??addresses.find(ip=>ip.startsWith('192.168.'))??addresses[0];
if(!host||!/^\d{1,3}(\.\d{1,3}){3}$/.test(host))throw Error('Specify the PC LAN IPv4 with --host=192.168.x.x');
const port=Number(arg('port')??3443);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const dir=path.join(root,'.tools/ipad-https');fs.mkdirSync(dir,{recursive:true});
const ca=path.join(dir,'root-ca.pem'),caKey=path.join(dir,'root-ca.key'),cert=path.join(dir,'server.pem'),key=path.join(dir,'server.key');
const openssl=process.env.HERMES_OPENSSL??'C:/Program Files/Git/usr/bin/openssl.exe';
const run=args=>execFileSync(openssl,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
const config=path.join(dir,'openssl.cnf');
fs.writeFileSync(config,'[req]\ndistinguished_name=dn\n[dn]\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
if(fs.existsSync(ca)!==fs.existsSync(caKey))throw Error('Incomplete CA files; restore them rather than silently replacing a trusted CA');
if(!fs.existsSync(ca))run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',caKey,'-out',ca,'-days','3650','-sha256','-subj','/CN=Hermes Lab Local Root/O=Hermes Local Development','-config',config,'-extensions','v3_ca']);
let valid=false;
if(fs.existsSync(cert)&&fs.existsSync(key)){const x=new X509Certificate(fs.readFileSync(cert));valid=!!x.checkIP(host)&&Date.parse(x.validTo)>Date.now()+86400000;}
if(!valid){
 const csr=path.join(dir,'server.csr'),ext=path.join(dir,'server.ext');
 fs.writeFileSync(ext,`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1,IP:${host}\n`);
 run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',key,'-out',csr,'-subj','/CN=Hermes Robot Interface','-config',config]);
 run(['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,'-CAcreateserial','-out',cert,'-days','365','-sha256','-extfile',ext]);
}
const publicDir=path.join(root,'apps/kiosk/public');fs.mkdirSync(publicDir,{recursive:true});
run(['x509','-in',ca,'-outform','DER','-out',path.join(publicDir,'hermes-lab-root.cer')]);
const info={url:`https://${host}:${port}/ai`,certificate:`http://${host}:3001/hermes-lab-root.cer`,fingerprint:new X509Certificate(fs.readFileSync(ca)).fingerprint256};
fs.writeFileSync(path.join(dir,'connection.json'),JSON.stringify(info,null,2));console.log(JSON.stringify(info,null,2));
if(process.argv.includes('--setup-only'))process.exit(0);
const headers=req=>({...req.headers,'x-forwarded-proto':'https','x-forwarded-host':req.headers.host});
const allowed=req=>req.url?.startsWith('/')&&!req.url.startsWith('//')&&(!req.url.startsWith('/api/')||req.url.startsWith('/api/kiosk/'));
const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
 if(!allowed(req)){res.writeHead(404).end();return;}
 const upstream=http.request({host:'127.0.0.1',port:3001,method:req.method,path:req.url,headers:headers(req)},reply=>{
  res.writeHead(reply.statusCode??502,{...reply.headers,'permissions-policy':'microphone=(self), camera=()'});reply.pipe(res);
 });
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('Robot Interface ยังไม่พร้อม กรุณาเปิดบริการที่พอร์ต 3001');});
 req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
 if(!req.url?.startsWith('/_next/webpack-hmr')){socket.destroy();return;}
 const upstream=http.request({host:'127.0.0.1',port:3001,path:req.url,headers:headers(req)});
 upstream.on('upgrade',(reply,upstreamSocket,upstreamHead)=>{
  socket.write(`HTTP/1.1 ${reply.statusCode} ${reply.statusMessage}\r\n`+Object.entries(reply.headers).flatMap(([k,v])=>Array.isArray(v)?v.map(item=>`${k}: ${item}`):[`${k}: ${v}`]).join('\r\n')+'\r\n\r\n');
  if(head.length)upstreamSocket.write(head);if(upstreamHead.length)socket.write(upstreamHead);
  socket.pipe(upstreamSocket).pipe(socket);socket.on('error',()=>upstreamSocket.destroy());upstreamSocket.on('error',()=>socket.destroy());socket.on('close',()=>upstreamSocket.destroy());
 });upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());upstream.end();
});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>console.log('HTTPS ready; install and trust the lab CA on iPad before using the microphone.'));
