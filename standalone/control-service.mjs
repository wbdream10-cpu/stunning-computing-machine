import { InputError, today, fresh, config, mutate, cloneModel, exportModel, importModel, themeColors } from '../lib/platform/model.mjs';
const now=()=>new Date().toISOString();
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uidOf=r=>r.headers.get('x-master7-owner-session');
const ownerClause='EXISTS(SELECT 1 FROM platform_owners WHERE slot=\'main\' AND user_id=?)';
const accessClause=`(${ownerClause} OR EXISTS(SELECT 1 FROM platform_access a WHERE a.tenant_id=platform_tenants.id AND a.user_id=? AND a.role='admin'))`;
async function body(request){
 if(request.headers.get('X-Platform-Request')!=='1'||!(request.headers.get('content-type')||'').startsWith('application/json'))throw new InputError('请求格式无效。',415);
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new InputError('请求来源无效。',403);
 const reader=request.body?.getReader();if(!reader)throw new InputError('请提交操作内容。');let total=0;const parts=[];
 for(;;){const p=await reader.read();if(p.done)break;total+=p.value.byteLength;if(total>65536){await reader.cancel();throw new InputError('内容太大。',413);}parts.push(p.value);}
 const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new InputError('内容不是有效 JSON。');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new InputError('请求内容无效。');return data;
}
export async function handle(request,db){
 let recover=null;
 try{
  if(!db)throw new InputError('后台存储暂时不可用，请稍后重试。',503);
  const uid=uidOf(request);if(!uid)throw new InputError('请先登录后再打开平台。',401);
  const q=(sql,...values)=>db.prepare(sql).bind(...values);
  let ownerRow=await q("SELECT user_id FROM platform_owners WHERE slot='main'").first();
  if(!ownerRow)throw new InputError('后台管理员尚未配置。',503);
  const owner=ownerRow.user_id===uid;
  const demandOwner=()=>{if(!owner)throw new InputError('此操作仅限总部账号。',403);};
  async function row(id){if(typeof id!=='string'||id.length>64)throw new InputError('客户标识无效。');const r=await q(`SELECT * FROM platform_tenants WHERE id=? AND (${ownerClause} OR EXISTS(SELECT 1 FROM platform_access a WHERE a.tenant_id=platform_tenants.id AND a.user_id=?))`,id,uid,uid).first();if(!r)throw new InputError('没有这个客户的访问权限。',403);return r;}
  async function writable(r){if(owner)return;if(r.status!=='active'||r.until<today())throw new InputError('客户平台已暂停、未开通或已到期。',403);const a=await q("SELECT role FROM platform_access WHERE tenant_id=? AND user_id=?",r.id,uid).first();if(a?.role!=='admin')throw new InputError('当前账号只能查看，不能修改。',403);}
  const log=(tenant,action,text)=>q('INSERT INTO platform_audit(tenant_id,actor,action,text,created_at) VALUES(?,?,?,?,?)',tenant,uid,action,text,now());
  async function state(){
   // One SQL statement gives configuration, revision, balance, permissions and
   // ledger one consistent SQLite snapshot even while another request commits.
   const rows=await q(`SELECT t.*,
    (SELECT json_group_array(json_object('id',e.id,'cents',e.cents,'label',e.label,'created_at',e.created_at)) FROM (SELECT id,cents,label,created_at FROM platform_ledger WHERE tenant_id=t.id ORDER BY rowid) e) AS ledger_json,
    (SELECT role FROM platform_access a WHERE a.tenant_id=t.id AND a.user_id=?) AS access_role
    FROM platform_tenants t WHERE ${ownerClause} OR EXISTS(SELECT 1 FROM platform_access a WHERE a.tenant_id=t.id AND a.user_id=?) ORDER BY t.created_at,t.id`,uid,uid,uid).all();
   const items=rows.results.map(r=>{const data=JSON.parse(r.data);return {...data,...themeColors(data),id:r.id,name:r.name,domain:r.domain,until:r.until,status:r.status,revision:r.revision,balance:r.balance,role:owner?'owner':r.access_role,ledger:JSON.parse(r.ledger_json||'[]')};});
   const logs=await q(`SELECT text,created_at AS time,actor,tenant_id FROM platform_audit WHERE ${ownerClause} OR tenant_id IN(SELECT tenant_id FROM platform_access WHERE user_id=?) ORDER BY id DESC LIMIT 80`,uid,uid).all();
   const assignments=owner?(await q('SELECT tenant_id,user_id,role FROM platform_access ORDER BY tenant_id,user_id').all()).results:[];
   return {tenants:items,logs:logs.results,assignments,identity:{userId:uid,owner},version:'2.0'};
  }
  if(request.method==='GET'){
   return reply(await state());
  }
  if(request.method!=='POST')throw new InputError('不支持此请求。',405);
  const p=await body(request),action=p.action;
  const key=p.requestKey;if(typeof key!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(key))throw new InputError('操作识别码无效。');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p))))).map(n=>n.toString(16).padStart(2,'0')).join('');
  recover=async()=>{const saved=await q('SELECT * FROM platform_requests WHERE user_id=? AND request_key=?',uid,key).first();if(!saved||saved.digest!==digest)return null;await row(saved.tenant_id);return reply({...(await state()),selected:saved.tenant_id,notice:'这次操作已保存，没有重复执行。'});};
  const previous=await q('SELECT * FROM platform_requests WHERE user_id=? AND request_key=?',uid,key).first();
  if(previous){if(previous.digest!==digest)throw new InputError('操作识别码已用于不同内容。',409);await row(previous.tenant_id);return reply({...(await state()),selected:previous.tenant_id,notice:'这次操作已经保存，没有重复执行。'});}
  const marker=crypto.randomUUID();
  const record=(id)=>q('INSERT INTO platform_requests(user_id,request_key,digest,tenant_id,action,created_at) VALUES(?,?,?,?,?,?)',uid,key,digest,id,action,now());
  const recordConditional=(id)=>q('INSERT INTO platform_requests(user_id,request_key,digest,tenant_id,action,created_at) SELECT ?,?,?,id,?,? FROM platform_tenants WHERE id=? AND last_op=?',uid,key,digest,action,now(),id,marker);
  if(action==='create'||action==='clone'||action==='import'){
   demandOwner();const count=await q('SELECT count(*) AS n FROM platform_tenants').first();if(count.n>=100)throw new InputError('客户平台已达本阶段上限 100 个。');
   const id=crypto.randomUUID();let x;
   if(action==='clone'){
    const r=await row(p.tenantId),src=JSON.parse(r.data);let n=count.n+1;
    while(await q('SELECT id FROM platform_tenants WHERE name=? OR domain=?','客户 '+n,'client-'+n+'.example').first())n++;
    x=cloneModel(src,id,'客户 '+n,'client-'+n+'.example');
   }else if(action==='import')x=importModel(p.template,id,p.name,p.domain);
   else {const c=config(p.config);if(c.until<today())throw new InputError('新平台租期不能早于今天。');x={...fresh(id,c.name,c.domain),...c};}
   const created=await db.batch([
    q('INSERT INTO platform_tenants(id,name,domain,until,status,data,revision,balance,last_op,created_at) SELECT ?,?,?,?,?,?,1,0,?,? WHERE (SELECT count(*) FROM platform_tenants)<100',id,x.name,x.domain,x.until,x.status,JSON.stringify(x),marker,now()),
    q('INSERT INTO platform_audit(tenant_id,actor,action,text,created_at) SELECT id,?,?,?,? FROM platform_tenants WHERE id=? AND last_op=?',uid,action,'建立客户配置；会员、账目、授权和 AI 计划为空',now(),id,marker),recordConditional(id)
   ]);
   if(!created[0].meta.changes)throw new InputError('客户平台已达本阶段上限 100 个。');
   return reply({...(await state()),selected:id,notice:'客户配置已保存；独立网址和游戏接口仍未开通。'});
  }
  if(action==='grant'||action==='revoke'){
   demandOwner();const r=await row(p.tenantId);
   if(typeof p.userId!=='string'||!/^[-a-zA-Z0-9_:|.]{4,200}$/.test(p.userId))throw new InputError('请输入登录后显示的账号识别码。');
   if(p.userId===ownerRow.user_id)throw new InputError('总部权限由系统绑定，无需分配。');
   if(action==='grant'){if(!['admin','viewer'].includes(p.role))throw new InputError('请选择客户管理员或只读角色。');await db.batch([q('INSERT INTO platform_access(tenant_id,user_id,role) VALUES(?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role',r.id,p.userId,p.role),log(r.id,action,'分配客户权限：'+p.role),record(r.id)]);}
   else await db.batch([q('DELETE FROM platform_access WHERE tenant_id=? AND user_id=?',r.id,p.userId),log(r.id,action,'撤回客户权限'),record(r.id)]);
   return reply({...(await state()),notice:'客户权限已保存。客户管理员登录系统尚未启用；配置授权不会开放后台访问。'});
  }
  const r=await row(p.tenantId);
  if(action==='export'){demandOwner();return reply({template:exportModel(JSON.parse(r.data))});}
  await writable(r);
  const ledgerActions={'sample':{cents:10000,label:'示例测试入账'},'mock-deposit':{cents:10000,label:'模拟存款'},'mock-withdraw':{cents:-4000,label:'模拟提款申请'},'sample-fee':{cents:-200,label:'示例手续费'}};
  if(ledgerActions[action]){
   if(r.status!=='active'||r.until<today())throw new InputError('平台状态或租期不允许模拟记账。',403);
   // Amount, direction and currency are fixed by the server, never client input.
   const entry=ledgerActions[action];const duplicate=await q('SELECT cents,label,actor FROM platform_ledger WHERE tenant_id=? AND request_key=?',r.id,key).first();
   if(duplicate)throw new InputError('操作识别码已经使用，请重新载入。',409);
   if(['cents','amount','balance','currency'].some(k=>Object.hasOwn(p,k)))throw new InputError('模拟金额和币种由后台固定，请勿提交自定义金额。');
   if(!Number.isInteger(p.revision)||p.revision!==r.revision)throw new InputError('另一处已修改这份资料，请重新载入后再操作。',409);
   if(r.balance+entry.cents<0)throw new InputError('模拟余额不足，未记账。');
   const size=await q('SELECT count(*) AS n FROM platform_ledger WHERE tenant_id=?',r.id).first();if(size.n>=5000)throw new InputError('示例流水已达本阶段上限。');
   const time=now();const result=await db.batch([
    q(`UPDATE platform_tenants SET balance=balance+?,revision=revision+1,last_op=? WHERE id=? AND revision=? AND balance+?>=0 AND status='active' AND until>=? AND ${accessClause}`,entry.cents,marker,r.id,p.revision,entry.cents,today(),uid,uid),
    q('INSERT INTO platform_ledger(id,tenant_id,request_key,cents,label,actor,created_at) SELECT ?,id,?,?,?,?,? FROM platform_tenants WHERE id=? AND last_op=? ON CONFLICT(tenant_id,request_key) DO NOTHING',crypto.randomUUID(),key,entry.cents,entry.label,uid,time,r.id,marker),
    q('INSERT INTO platform_audit(tenant_id,actor,action,text,created_at) SELECT id,?,?,?,? FROM platform_tenants WHERE id=? AND last_op=?',uid,action,'保存模拟流水；无真实资金',time,r.id,marker),recordConditional(r.id)
   ]);
   if(!result[0].meta.changes)throw new InputError('资料已更新或权限已变更，请重新载入。',409);
   return reply({...(await state()),notice:'模拟流水已保存到后台，没有真实收付款。'});
  }
  if(!Number.isInteger(p.revision)||p.revision!==r.revision)throw new InputError('另一处已修改这份资料，请重新载入后再操作。',409);
  const data=JSON.parse(r.data),label=mutate(data,action,p,owner);
  const result=await db.batch([
   q(`UPDATE platform_tenants SET name=?,domain=?,until=?,status=?,data=?,revision=revision+1,last_op=? WHERE id=? AND revision=? AND ${accessClause}`,data.name,data.domain,data.until,data.status,JSON.stringify(data),marker,r.id,p.revision,uid,uid),
   q('INSERT INTO platform_audit(tenant_id,actor,action,text,created_at) SELECT id,?,?,?,? FROM platform_tenants WHERE id=? AND last_op=?',uid,action,label,now(),r.id,marker),recordConditional(r.id)
  ]);
  if(!result[0].meta.changes)throw new InputError('资料已更新或权限已变更，请重新载入。',409);
  return reply({...(await state()),notice:label+'，已保存。'});
 }catch(e){
  if(recover&&(e?.status===409||String(e?.message).includes('UNIQUE constraint'))){try{const saved=await recover();if(saved)return saved;}catch{}}
  if(e instanceof InputError)return reply({error:e.message},e.status);
  if(String(e?.message).includes('UNIQUE constraint'))return reply({error:'客户名称、网址或操作记录已存在，请检查后重试。'},409);
  console.error('Platform request failed',e?.message);return reply({error:'后台暂时无法完成操作，请保留内容后重试。'},503);
 }
}
