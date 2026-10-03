import http from 'node:http';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './sqlite-adapter.mjs';
import { handle } from './control-service.mjs';
import { fresh, themeColors } from '../lib/platform/model.mjs';

const scrypt = promisify(scryptCallback);
const root = dirname(fileURLToPath(import.meta.url));
const ownerId = 'master7-standalone-owner';
const cookieName = 'master7_admin';
const sessionTTL = 8 * 60 * 60 * 1000;
const publicFields = ['color','deepColor','aquaColor','hidden','headline','subtitle','brandTitle','logo','cover'];
const mimeTypes = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};
const token = () => randomBytes(32).toString('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, {N:16384,r:8,p:1,maxmem:64*1024*1024});
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function parsePasswordHash(value) {
  if (!value) return null;
  const match = /^scrypt\$(16384)\$(8)\$(1)\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/.exec(value);
  if (!match) throw new Error('ADMIN_PASSWORD_HASH has an unsupported format');
  return {salt:Buffer.from(match[4],'base64url'),hash:Buffer.from(match[5],'base64url')};
}

async function validPassword(password, configuration) {
  if (!configuration || typeof password !== 'string' || password.length < 1 || password.length > 256) return false;
  const actual = await scrypt(password, configuration.salt, 64, {N:16384,r:8,p:1,maxmem:64*1024*1024});
  return timingSafeEqual(configuration.hash, actual);
}

function loginPage(enabled, failed=false) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Master7 · 老板后台</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#174c6a,#071c30 70%);color:#e7f5fa;font:16px system-ui,sans-serif}.card{max-width:360px;width:calc(100% - 64px);padding:32px;border:1px solid #38728b;border-radius:20px;background:#0d2b42}h1{font-size:27px;letter-spacing:.1em;margin-bottom:8px}.sub{color:#9ac4d7;font-size:14px;line-height:1.7}label{display:block;margin:24px 0 8px}input,button{box-sizing:border-box;width:100%;padding:14px;border-radius:10px;border:1px solid #4e91ae;font:inherit}input{background:#071c30;color:white}button{margin-top:16px;background:#a6def0;color:#09283c;font-weight:700;cursor:pointer}a{color:#a6def0}.error{color:#ffccb1}</style></head><body><main class="card"><h1>MASTER7</h1><p class="sub">老板后台 · 独立管理入口</p>${enabled?`${failed?'<p class="error">密码无效或请求未通过验证，请重试。</p>':''}<form action="/login" method="post"><label for="password">管理员密码</label><input id="password" name="password" type="password" maxlength="256" autocomplete="current-password" required><button type="submit">登录后台</button></form>`:'<p class="sub">后台登录尚未启用。请完成管理员密码配置后使用；客户页面可以独立访问。</p>'}<p class="sub"><a href="/">返回 Master7</a></p></main></body></html>`;
}

async function bodyBytes(request, maximum=65536) {
  const chunks=[]; let size=0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) { const error=new Error('请求内容太大。');error.status=413;throw error; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseCookies(value='') {
  return Object.fromEntries(value.split(';').map(part=>part.trim().split('=')).filter(pair=>pair.length===2));
}

export async function createPlatformServer(options={}) {
  const env = options.env ?? process.env;
  const passwordConfiguration = parsePasswordHash(options.passwordHash ?? env.ADMIN_PASSWORD_HASH);
  const secureCookies = options.secureCookies ?? env.ADMIN_COOKIE_SECURE !== 'false';
  const configuredOrigin = options.origin ?? env.SITE_ORIGIN;
  if (configuredOrigin && new URL(configuredOrigin).origin !== configuredOrigin) throw new Error('SITE_ORIGIN must be an exact origin without a path');
  // Explicit durable storage acknowledgement is required before accepting writes.
  const readOnly = options.readOnly ?? !(env.DEMO_READ_ONLY==='false' && env.PERSISTENT_STORAGE_CONFIRMED==='true' && env.DATA_DIR);
  const publicRoot = options.publicRoot ?? resolve(root,'public');
  const uiRoot = options.uiRoot ?? resolve(root,'ui');
  const databasePath = options.databasePath ?? (env.DATA_DIR ? resolve(env.DATA_DIR,'master7.sqlite') : ':memory:');
  if (databasePath !== ':memory:') await mkdir(dirname(databasePath),{recursive:true,mode:0o700});
  const database = openDatabase(databasePath);
  const schema = await readFile(resolve(root,'../drizzle/0000_unknown_ricochet.sql'),'utf8');
  database.exec(schema.replace(/CREATE (TABLE|(?:UNIQUE )?INDEX) /g,'CREATE $1 IF NOT EXISTS '));
  const now = new Date().toISOString();
  await database.prepare("INSERT INTO platform_owners(slot,user_id,created_at) VALUES('main',?,?) ON CONFLICT(slot) DO NOTHING").bind(ownerId,now).run();
  const configuredOwner = await database.prepare("SELECT user_id FROM platform_owners WHERE slot='main'").first();
  if (configuredOwner.user_id !== ownerId) throw new Error('Unexpected owner binding in standalone database');
  const initial = {...fresh('master7','Master7','master7.example'),brandTitle:'MASTER7',headline:'WELCOME TO MASTER7',subtitle:'PREMIUM ENTERTAINMENT EXPERIENCE',color:'#b49354',deepColor:'#073c69',aquaColor:'#91d3ed'};
  await database.prepare('INSERT INTO platform_tenants(id,name,domain,until,status,data,revision,balance,last_op,created_at) VALUES(?,?,?,?,?,?,1,0,?,?) ON CONFLICT(id) DO NOTHING').bind(initial.id,initial.name,initial.domain,initial.until,initial.status,JSON.stringify(initial),'initial',now).run();
  const sessions = new Map();
  const failures = new Map();
  function sessionFor(request) {
    const sessionToken = parseCookies(request.headers.cookie)[cookieName];
    if (!sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return null;
    const session = sessions.get(sessionToken);
    if (!session || session.expires <= Date.now()) { sessions.delete(sessionToken);return null; }
    return { ...session, token:sessionToken };
  }
  function originFor(request) {
    if (configuredOrigin) return configuredOrigin;
    const host = request.headers.host;
    if (!host || !/^[A-Za-z0-9.:[\]-]+$/.test(host)) throw Object.assign(new Error('请求地址无效。'),{status:400});
    // Production deployment should set SITE_ORIGIN to its verified HTTPS URL.
    return `${secureCookies?'https':'http'}://${host}`;
  }
  function checkOrigin(request) {
    if (request.headers.origin !== originFor(request) || request.headers['sec-fetch-site']==='cross-site') throw Object.assign(new Error('请求来源未通过验证。'),{status:403});
  }
  function checkCsrf(request, session) {
    checkOrigin(request);
    const supplied=request.headers['x-csrf-token'];
    if (typeof supplied!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(session.csrfToken))) throw Object.assign(new Error('请重新登录后重试。'),{status:403});
  }
  const server = http.createServer(async (request,response) => {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Referrer-Policy','same-origin');
    response.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    response.setHeader('Cache-Control','no-store');
    if (secureCookies) response.setHeader('Strict-Transport-Security','max-age=31536000');
    const send=(status,data,type='application/json; charset=utf-8')=>{response.statusCode=status;response.setHeader('Content-Type',type);response.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
    const redirect=location=>{response.statusCode=303;response.setHeader('Location',location);response.end();};
    try {
      if (request.headers['oai-authenticated-user-id'] || request.headers['x-master7-owner-session']) return send(403,{error:'请求身份头无效。'});
      const rawPath = request.url.split('?')[0];
      let decodedPath;
      try { decodedPath=decodeURIComponent(rawPath); } catch { return send(400,{error:'请求路径无效。'}); }
      if (decodedPath.includes('\\') || decodedPath.includes('\0') || decodedPath.split('/').some(part=>part==='..'||part==='.')) return send(400,{error:'请求路径无效。'});
      const pathname = new URL(request.url,originFor(request)).pathname;
      const session = sessionFor(request);
      if (pathname==='/healthz' && request.method==='GET') return send(200,{status:'ok',service:'Master7',mode:readOnly?'preview-read-only':'configuration',adminEnabled:Boolean(passwordConfiguration)});
      if (pathname==='/api/public' && request.method==='GET') {
        const row=await database.prepare('SELECT data,status FROM platform_tenants WHERE id=?').bind('master7').first();
        const data=JSON.parse(row.data);
        if (row.status==='paused') return send(503,{error:'平台暂时维护中。'});
        const tenant=Object.fromEntries(publicFields.map(key=>[key,data[key]]));
        Object.assign(tenant,themeColors(data));
        return send(200,{tenants:[tenant],readOnly:true,demo:true});
      }
      if (pathname==='/api/session' && request.method==='GET') return session?send(200,{authenticated:true,csrfToken:session.csrfToken,readOnly}):send(401,{error:'请先登录老板后台。'});
      if (pathname==='/login' && request.method==='GET') return send(passwordConfiguration?200:503,loginPage(Boolean(passwordConfiguration)),'text/html; charset=utf-8');
      if (pathname==='/login' && request.method==='POST') {
        if (!passwordConfiguration) return send(503,{error:'后台登录尚未启用。'});
        checkOrigin(request);
        for (const [key,value] of failures) if (value.until<=Date.now()) failures.delete(key);
        const address=request.socket.remoteAddress||'unknown';
        const window=failures.get(address);
        if (window && window.until>Date.now() && window.attempts>=5) {response.setHeader('Retry-After','600');return send(429,{error:'登录尝试过多，请稍后再试。'});}
        if (!window && failures.size>=1000) return send(503,{error:'后台登录暂时繁忙，请稍后重试。'});
        const bytes=await bodyBytes(request,8192);
        const contentType=request.headers['content-type']||'';
        let password;
        if (contentType.startsWith('application/x-www-form-urlencoded')) password=new URLSearchParams(bytes.toString('utf8')).get('password');
        else if (contentType.startsWith('application/json')) {try{password=JSON.parse(bytes.toString('utf8')).password;}catch{return send(400,{error:'请求内容无效。'});}}
        else return send(415,{error:'请求格式无效。'});
        const previous=failures.get(address)??{attempts:0,until:Date.now()+600000};
        if (previous.attempts>=5) {response.setHeader('Retry-After','600');return send(429,{error:'登录尝试过多，请稍后再试。'});}
        failures.set(address,{attempts:previous.attempts+1,until:previous.until});
        if (!(await validPassword(password,passwordConfiguration))) {
          return send(401,loginPage(true,true),'text/html; charset=utf-8');
        }
        failures.delete(address);
        if (session) sessions.delete(session.token);
        for (const [key,value] of sessions) if(value.expires<=Date.now()) sessions.delete(key);
        if (sessions.size>=100) return send(503,{error:'后台登录暂时繁忙，请稍后重试。'});
        const sessionToken=token();
        sessions.set(sessionToken,{csrfToken:token(),expires:Date.now()+sessionTTL});
        response.setHeader('Set-Cookie',`${cookieName}=${sessionToken}; Path=/; Max-Age=${sessionTTL/1000}; HttpOnly; SameSite=Strict${secureCookies?'; Secure':''}`);
        return redirect('/admin');
      }
      if (pathname==='/logout' && request.method==='POST') {
        if (!session) return send(401,{error:'请先登录。'});
        checkCsrf(request,session);
        sessions.delete(session.token);
        response.setHeader('Set-Cookie',`${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureCookies?'; Secure':''}`);
        return send(200,{ok:true});
      }
      if (pathname==='/api/control') {
        if (!session) return send(401,{error:'请先登录老板后台。'});
        if (!['GET','POST'].includes(request.method)) return send(405,{error:'不支持此请求。'});
        let payload;
        if (request.method==='POST') {
          checkCsrf(request,session);
          if (readOnly) return send(503,{error:'当前为只读预览；持久化存储尚未启用。'});
          payload=await bodyBytes(request);
        }
        const headers={'x-master7-owner-session':ownerId};
        if (payload) Object.assign(headers,{'origin':originFor(request),'Content-Type':request.headers['content-type']||'','X-Platform-Request':request.headers['x-platform-request']||''});
        const result=await handle(new Request(`${originFor(request)}/api/control`,{method:request.method,headers,...(payload?{body:payload}: {})}),database);
        const data=await result.json();
        return send(result.status,{...data,csrfToken:session.csrfToken,readOnly,demo:true});
      }
      if (['/','/admin','/admin/'].includes(pathname) && ['GET','HEAD'].includes(request.method)) {
        if (pathname!=='/' && !session) return redirect('/login');
        const filename=pathname==='/'?'public.html':'admin.html';
        const html=await readFile(resolve(uiRoot,filename));
        return send(200,request.method==='HEAD'?'':html,'text/html; charset=utf-8');
      }
      if (pathname.startsWith('/assets/') && ['GET','HEAD'].includes(request.method)) {
        const relative=decodeURIComponent(pathname.slice('/assets/'.length));
        if (!relative || !/^[A-Za-z0-9_.\/-]+$/.test(relative) || relative.split('/').some(part=>!part||part.startsWith('.'))) return send(404,{error:'文件不存在。'});
        const actualRoot=await realpath(publicRoot);
        const path=await realpath(resolve(publicRoot,relative));
        if (!path.startsWith(actualRoot+sep) || !(await stat(path)).isFile() || !mimeTypes[extname(path).toLowerCase()]) return send(404,{error:'文件不存在。'});
        response.setHeader('Cache-Control','public, max-age=3600');
        return send(200,request.method==='HEAD'?'':await readFile(path),mimeTypes[extname(path).toLowerCase()]);
      }
      return send(404,{error:'页面不存在。'});
    } catch (error) {
      if (error.code==='ENOENT') return send(404,{error:'页面不存在。'});
      if (error.status) return send(error.status,{error:error.message});
      // Do not log request bodies, passwords, cookies or account identifiers.
      console.error('Master7 request failed:',error.code||error.name||'Error');
      return send(503,{error:'服务暂时不可用，请稍后重试。'});
    }
  });
  server.on('close',()=>database.close());
  return {server,database,readOnly};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server}=await createPlatformServer();
  const port=Number(process.env.PORT||3000);
  server.listen(port,'0.0.0.0',()=>console.log(`Master7 service listening on port ${port}`));
}
