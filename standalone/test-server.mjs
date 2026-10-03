import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformServer, hashPassword } from './server.mjs';
import { openDatabase } from './sqlite-adapter.mjs';

const password='A-strong-test-password-only';
const passwordHash=await hashPassword(password);

async function fixture(t, options={}) {
  const directory=await mkdtemp(join(tmpdir(),'master7-test-'));
  const uiRoot=join(directory,'ui'),publicRoot=join(directory,'public');
  await mkdir(uiRoot);await mkdir(publicRoot);
  await writeFile(join(uiRoot,'public.html'),'<h1>Master7 Customer</h1>');
  await writeFile(join(uiRoot,'admin.html'),'<h1>Private Headquarters</h1>');
  await writeFile(join(publicRoot,'theme.js'),'const brand="Master7";');
  await writeFile(join(directory,'private.txt'),'private-secret');
  await symlink(join(directory,'private.txt'),join(publicRoot,'leak.js'));
  const app=await createPlatformServer({env:{},passwordHash,secureCookies:false,readOnly:true,uiRoot,publicRoot,...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));await rm(directory,{recursive:true,force:true});});
  async function login() {
    const response=await fetch(base+'/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password}),redirect:'manual'});
    assert.equal(response.status,303);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const session=await fetch(base+'/api/session',{headers:{Cookie:cookie}}).then(r=>r.json());
    return {cookie,csrf:session.csrfToken};
  }
  return {...app,base,login};
}

test('public endpoints do not expose owner state or accept forged identity',async t=>{
  const {base,database}=await fixture(t);
  const owner=await database.prepare("SELECT user_id FROM platform_owners WHERE slot='main'").first();
  assert.equal(owner.user_id,'master7-standalone-owner');
  await database.prepare("INSERT INTO platform_audit(tenant_id,actor,action,text,created_at) VALUES('master7','private-owner','test','private-information','now')").run();
  const publicState=await fetch(base+'/api/public').then(r=>r.json());
  assert.equal(publicState.tenants.length,1);
  assert.equal(publicState.tenants[0].brandTitle,'MASTER7');
  assert.equal(publicState.identity,undefined);
  assert.equal(publicState.logs,undefined);
  assert.equal(publicState.assignments,undefined);
  assert.equal(JSON.stringify(publicState).includes('private-information'),false);
  assert.equal(JSON.stringify(publicState).includes(owner.user_id),false);
  assert.equal(publicState.tenants[0].until,undefined);
  for(const field of ['id','name','domain','status','members','balance','ledger','marketing','aiAccess','revision']) assert.equal(publicState.tenants[0][field],undefined);
  assert.equal(publicState.readOnly,true);
  assert.equal((await fetch(base+'/api/control')).status,401);
  assert.equal((await fetch(base+'/admin',{redirect:'manual'})).headers.get('location'),'/login');
  for(const header of ['oai-authenticated-user-id','x-master7-owner-session']) {
    assert.equal((await fetch(base+'/api/control',{headers:{[header]:owner.user_id}})).status,403);
  }
});

test('login is fail-closed when password unset, and cookies have required restrictions',async t=>{
  const disabled=await fixture(t,{passwordHash:''});
  assert.equal((await fetch(disabled.base+'/login')).status,503);
  assert.equal((await fetch(disabled.base+'/api/control')).status,401);
  const enabled=await fixture(t);
  const response=await fetch(enabled.base+'/login',{method:'POST',headers:{Origin:enabled.base,'Content-Type':'application/json'},body:JSON.stringify({password}),redirect:'manual'});
  assert.equal(response.status,303);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.match(response.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await fetch(enabled.base+'/login',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify({password}),redirect:'manual'})).status,403);
});

test('admin has own session, read-only defaults block mutations, and logout revokes access',async t=>{
  const {base,login}=await fixture(t);
  const {cookie,csrf}=await login();
  const state=await fetch(base+'/api/control',{headers:{Cookie:cookie}}).then(r=>r.json());
  assert.equal(state.identity.owner,true);
  assert.equal(state.tenants.length,1);
  assert.equal(state.tenants[0].name,'Master7');
  assert.equal(state.readOnly,true);
  assert.equal(state.csrfToken,csrf);
  const headers={Cookie:cookie,Origin:base,'Content-Type':'application/json','X-Platform-Request':'1'};
  const body=JSON.stringify({action:'mock-deposit',tenantId:'master7',revision:1,requestKey:'testing-request-key-1'});
  assert.equal((await fetch(base+'/api/control',{method:'POST',headers,body})).status,403);
  assert.equal((await fetch(base+'/api/control',{method:'POST',headers:{...headers,'X-CSRF-Token':csrf,Origin:'https://attacker.example'},body})).status,403);
  assert.equal((await fetch(base+'/api/control',{method:'POST',headers:{...headers,'X-CSRF-Token':csrf},body})).status,503);
  assert.equal((await fetch(base+'/logout',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-CSRF-Token':csrf},body:'{}'})).status,200);
  assert.equal((await fetch(base+'/api/control',{headers:{Cookie:cookie}})).status,401);
});

test('authorized demo mutation is idempotent and never accepts custom money',async t=>{
  const {base,login}=await fixture(t,{readOnly:false});
  const {cookie,csrf}=await login();
  const headers={Cookie:cookie,Origin:base,'Content-Type':'application/json','X-Platform-Request':'1','X-CSRF-Token':csrf};
  const payload={action:'mock-deposit',tenantId:'master7',revision:1,requestKey:'testing-deposit-request-1'};
  const first=await fetch(base+'/api/control',{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal(first.status,200);
  const state=await first.json();
  assert.equal(state.tenants[0].balance,10000);
  assert.equal(state.tenants[0].ledger.length,1);
  const duplicate=await fetch(base+'/api/control',{method:'POST',headers,body:JSON.stringify(payload)}).then(r=>r.json());
  assert.equal(duplicate.tenants[0].balance,10000);
  assert.equal(duplicate.tenants[0].ledger.length,1);
  const custom=await fetch(base+'/api/control',{method:'POST',headers,body:JSON.stringify({...payload,revision:2,requestKey:'testing-deposit-request-2',amount:999999})});
  assert.equal(custom.status,400);
  assert.equal((await fetch(base+'/api/control',{method:'POST',headers,body:'x'.repeat(65537)})).status,413);
});

test('static files cannot traverse folders or follow outside symlinks',async t=>{
  const {base}=await fixture(t);
  assert.equal((await fetch(base+'/assets/theme.js')).status,200);
  assert.equal((await fetch(base+'/assets/leak.js')).status,404);
  assert.equal((await fetch(base+'/assets/%2e%2e%2fprivate.txt')).status,400);
  assert.equal((await fetch(base+'/assets/%5cprivate.txt')).status,400);
  assert.equal((await fetch(base+'/assets/server.mjs')).status,404);
});

test('SQLite batches roll back all prior writes after a failed statement',async()=>{
  const db=openDatabase(':memory:');
  try {
    db.exec('CREATE TABLE checks (value TEXT UNIQUE)');
    await assert.rejects(db.batch([db.prepare('INSERT INTO checks VALUES(?)').bind('one'),db.prepare('INSERT INTO checks VALUES(?)').bind('one')]));
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM checks').first()).count,0);
  } finally {db.close();}
});

test('a file database restarts without resetting owner or saved branding',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'master7-restart-'));
  const databasePath=join(directory,'platform.sqlite');
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const first=await createPlatformServer({env:{},databasePath});
  const row=await first.database.prepare('SELECT data FROM platform_tenants WHERE id=?').bind('master7').first();
  const branding={...JSON.parse(row.data),headline:'Saved independently'};
  await first.database.prepare('UPDATE platform_tenants SET data=? WHERE id=?').bind(JSON.stringify(branding),'master7').run();
  first.database.close();
  const second=await createPlatformServer({env:{},databasePath});
  try {
    const saved=await second.database.prepare('SELECT data FROM platform_tenants WHERE id=?').bind('master7').first();
    assert.equal(JSON.parse(saved.data).headline,'Saved independently');
    assert.equal((await second.database.prepare('SELECT COUNT(*) AS count FROM platform_tenants').first()).count,1);
    assert.equal((await second.database.prepare("SELECT user_id FROM platform_owners WHERE slot='main'").first()).user_id,'master7-standalone-owner');
    assert.equal(second.readOnly,true);
  } finally {second.database.close();}
});

test('login throttles repeated failed passwords before more expensive verification',async t=>{
  const {base}=await fixture(t);
  for (let attempt=0;attempt<5;attempt++) {
    const response=await fetch(base+'/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password:'incorrect'}),redirect:'manual'});
    assert.equal(response.status,401);
  }
  const blocked=await fetch(base+'/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password}),redirect:'manual'});
  assert.equal(blocked.status,429);
  assert.equal(blocked.headers.get('retry-after'),'600');
});
