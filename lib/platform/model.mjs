export class InputError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const today=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');};
export const later=()=>new Date(Date.now()+90*86400000).toISOString().slice(0,10);
const text=(x,max,required=false)=>{if(typeof x!=='string'||x.trim().length>max||(required&&!x.trim()))throw new InputError('请检查字段长度与内容。');return x.trim();};
export const THEME_DEFAULTS=Object.freeze({color:'#b49354',deepColor:'#123f67',aquaColor:'#b8deef'});
export function themeColors(source={}){return Object.fromEntries(Object.entries(THEME_DEFAULTS).map(([key,fallback])=>[key,Object.hasOwn(source,key)?source[key]:fallback]));}
export function config(input,base=null,owner=true){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('无效的配置。');
 const x={...THEME_DEFAULTS,...(base||{}),...input};
 if(!owner&&['name','domain','until','status'].some(k=>input[k]!==undefined&&input[k]!==base[k]))throw new InputError('租期、平台状态及网址由总部管理。',403);
 const name=text(x.name,40,true),domain=text(x.domain,100,true).toLowerCase();
 if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw new InputError('请输入有效网址，不要加 https://。');
 if(typeof x.until!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.until)||!Number.isFinite(Date.parse(x.until))||new Date(x.until).toISOString().slice(0,10)!==x.until)throw new InputError('租期日期无效。');
 if(!['active','paused','draft'].includes(x.status))throw new InputError('平台状态无效。');
 if(!['三语','中文','English','Bahasa Melayu'].includes(x.language))throw new InputError('语言标签无效。');
 if(Object.keys(THEME_DEFAULTS).some(key=>typeof x[key]!=='string'||!/^#[a-f0-9]{6}$/i.test(x[key])))throw new InputError('颜色格式无效，请使用完整的六位颜色代码。');
 if(!['seven','none'].includes(x.logo)||!['classic','premium'].includes(x.cover))throw new InputError('封面或 Logo 配置无效。');
 return {name,domain,until:x.until,status:x.status,language:x.language,...themeColors(x),logo:x.logo,cover:x.cover,headline:text(x.headline,60),subtitle:text(x.subtitle,100),brandTitle:text(x.brandTitle,40)};
}
export function fresh(id,name,domain){return {id,name,domain,until:later(),status:'active',...THEME_DEFAULTS,language:'三语',ai:false,members:[],hidden:[],headline:'Welcome',subtitle:'',brandTitle:'',logo:'seven',cover:'premium',marketing:{campaigns:[],optins:[],nextCampaign:1,nextAlias:1},aiAccess:{prepared:false,mode:'assistant',includeFAQ:true,includeDrafts:true,includeReports:false}};}
export function cloneModel(source,id,name,domain){const x=fresh(id,name,domain);Object.assign(x,themeColors(source));for(const k of ['language','hidden','headline','subtitle','brandTitle','logo','cover'])x[k]=structuredClone(source[k]);return x;}
export function exportModel(x){const out={format:'platform-brand-template',version:1,...themeColors(x)};for(const k of ['language','hidden','headline','subtitle','brandTitle','logo','cover'])out[k]=structuredClone(x[k]);return out;}
export function importModel(input,id,name,domain){
 if(!input||input.format!=='platform-brand-template'||input.version!==1)throw new InputError('请使用本平台导出的品牌模板。');
 const x=fresh(id,name,domain),c=config({...x,...input,name,domain,until:x.until,status:'active'});Object.assign(x,c);
 if(!Array.isArray(input.hidden)||input.hidden.length>8||input.hidden.some(n=>!Number.isInteger(n)||n<0||n>=8))throw new InputError('游戏显示配置无效。');x.hidden=[...new Set(input.hidden)];return x;
}
export function mutate(x,action,payload,owner){
 const id=payload.id;
 if(action==='settings'){Object.assign(x,config(payload.config,x,owner));return '保存品牌与平台设置';}
 if(action==='pause'){if(!owner)throw new InputError('仅总部可调整平台状态。',403);x.status=x.status==='paused'?'active':'paused';return '调整平台状态';}
 if(action==='ai-toggle'){if(typeof payload.enabled!=='boolean')throw new InputError('开关无效。');x.ai=payload.enabled;return '保存 AI 演示开关（未连接）';}
 if(action==='game-toggle'){const n=Number(id);if(!Number.isInteger(n)||n<0||n>=8)throw new InputError('游戏入口无效。');x.hidden=x.hidden.includes(n)?x.hidden.filter(v=>v!==n):[...x.hidden,n];return '调整占位游戏显示';}
 if(action==='member-add'){if(!['phone','email'].includes(id))throw new InputError('注册方式无效。');if(x.members.length>=500)throw new InputError('示例会员已达上限。');const n=x.members.length+1;x.members.push({id:crypto.randomUUID(),alias:'DEMO'+String(n).padStart(4,'0'),method:id,active:true});return '新增虚构会员';}
 if(action==='member-toggle'){const m=x.members.find(v=>v.id===id);if(!m)throw new InputError('未找到当前客户的会员。',404);m.active=!m.active;return '调整虚构会员状态';}
 if(action==='ai-plan'){const p=payload.plan;if(!p||!['assistant','support'].includes(p.mode)||['includeFAQ','includeDrafts','includeReports'].some(k=>typeof p[k]!=='boolean')||!(p.includeFAQ||p.includeDrafts||p.includeReports))throw new InputError('请选择有效用途。');x.aiAccess={prepared:true,mode:p.mode,includeFAQ:p.includeFAQ,includeDrafts:p.includeDrafts,includeReports:p.includeReports};return '保存 AI 接入草稿（尚未连接）';}
 if(action==='ai-plan-revoke'){x.aiAccess=fresh('','','').aiAccess;return '撤回 AI 接入草稿';}
 const m=x.marketing;
 if(action==='mk-create'){if(m.campaigns.length>=40)throw new InputError('草稿已达上限。');const c=payload.campaign;if(!c||!['zh','ms','en'].includes(c.language)||!['website','social','telegram'].includes(c.source))throw new InputError('语言或渠道无效。');m.campaigns.push({id:'mkc-'+m.nextCampaign++,title:text(c.title,60,true),content:text(c.content||'',500),language:c.language,source:c.source,clicks:0,registrations:0});return '建立推广文案草稿（未发布）';}
 if(action==='mk-optin-add'){if(m.optins.length>=40)throw new InputError('同意示例已达上限。');const n=m.nextAlias++;m.optins.push({id:'mko-'+n,alias:'示例订阅者 '+String(n).padStart(3,'0'),active:true});return '新增虚构同意记录';}
 if(action==='mk-optin-revoke'){const p=m.optins.find(v=>v.id===id);if(!p)throw new InputError('未找到同意记录。',404);p.active=false;return '撤回虚构同意记录';}
 if(['mk-click','mk-register'].includes(action)){const c=m.campaigns.find(v=>v.id===id);if(!c)throw new InputError('未找到当前客户的草稿。',404);if(action==='mk-click'){if(c.clicks>=999999)throw new InputError('模拟点击已达上限。');c.clicks++;}else{if(c.registrations>=c.clicks)throw new InputError('请先模拟一次点击。');c.registrations++;}return '保存模拟来源统计';}
 throw new InputError('不支持此操作。');
}
