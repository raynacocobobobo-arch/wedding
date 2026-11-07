import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
const action={'X-Enwan-Action':'1'};
async function start(dir) {
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd:root, env:{...process.env, HOST:'127.0.0.1',PORT:'0',DATA_DIR:dir,
      ADMIN_PASSWORD:'test-only-admin-password-123',
      COOKIE_SECRET:'test-only-random-secret-with-32-plus-characters',
      COOKIE_SECURE:'0', TRUST_PROXY:'0', WECOM_WEBHOOK:'',
      CONTACT_PHONE:'', CONTACT_WECHAT:'', CONTACT_ADDRESS:''},
    stdio:['ignore','pipe','pipe']
  });
  const port=await new Promise((resolve,reject)=>{
    let s='',err='';
    const timeout=setTimeout(()=>reject(new Error('Startup timeout: '+err)),12000);
    proc.stdout.on('data', chunk=>{
      s+=chunk.toString();
      const match=s.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if(match){clearTimeout(timeout);resolve(Number(match[1]));}
    });
    proc.stderr.on('data', chunk=>{err+=chunk.toString();});
    proc.on('error',e=>{clearTimeout(timeout);reject(e);});
    proc.on('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited '+code+' '+err));});
  });
  return {proc,base:'http://127.0.0.1:'+port};
}

test('Tencent Cloud /wedding/ routing, inquiry, privacy and front-end contracts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'enwan-subpath-'));
  let app;
  try {
    app=await start(dir);
    const request=(url,options)=>fetch(app.base+url,options);
    for(const [url,needle] of [
      ['/wedding/','id="nav-favorites"'],
      ['/wedding/admin','作品管理后台'],
      ['/wedding/admin/','作品管理后台'],
      ['/wedding/assets/site.js','function inquiryPage'],
      ['/wedding/assets/admin.js','safeSrc'],
      ['/wedding/assets/app.css','.inquiry-form'],
    ]){
      const r=await request(url);
      assert.equal(r.status,200,url);
      assert.ok((await r.text()).includes(needle),url+' contains expected content');
    }
    let r=await request('/wedding/images/enwan-logo.webp');
    assert.equal(r.status,200);
    const csp=(await request('/wedding/')).headers.get('content-security-policy');
    assert.match(csp,/base-uri 'self'/);
    r=await request('/wedding/api/site-config');
    assert.deepEqual((await r.json()).contacts,{phone:'待配置',wechat:'待配置',address:'待配置'});
    const payload={name:'测试客户',phone:'13800138000',date:'2026-12-20',place:'任丘酒店',category:'forest',notes:'想了解甜品区布置'};
    const inquiry=(data,withAction=true)=>({method:'POST',headers:{'Content-Type':'application/json',...(withAction?action:{})},body:JSON.stringify(data)});
    r=await request('/wedding/api/inquiry',inquiry(payload,false));
    assert.equal(r.status,403,'Write guard required');
    r=await request('/wedding/api/inquiry',inquiry({...payload,phone:'nope'}));
    assert.equal(r.status,400,'Invalid phone rejected');
    r=await request('/wedding/api/inquiry',inquiry(payload));
    assert.equal(r.status,202);
    assert.equal((await r.json()).accepted,true);
    const persisted=JSON.parse(await readFile(join(dir,'inquiries.json'),'utf8'));
    assert.equal(persisted.inquiries.length,1);
    assert.equal(persisted.inquiries[0].name,payload.name);
    assert.equal(persisted.inquiries[0].phone,payload.phone);
    assert.equal(persisted.inquiries[0].status,'pending','Webhook absent: inquiry persisted for later delivery');
    r=await request('/wedding/api/admin/inquiries');
    assert.equal(r.status,401,'Private inquiries require admin auth');
    const auth=await request('/wedding/api/admin/login',{
      method:'POST',headers:{...action,'Content-Type':'application/json'},
      body:JSON.stringify({password:'test-only-admin-password-123'})
    });
    assert.equal(auth.status,200);
    const cookie=auth.headers.get('set-cookie').split(';')[0];
    r=await request('/wedding/api/admin/inquiries',{headers:{Cookie:cookie}});
    assert.equal(r.status,200);
    assert.equal((await r.json()).length,1);
    const create=await request('/wedding/api/admin/works',{method:'POST',
      headers:{...action,Cookie:cookie,'Content-Type':'application/json'},
      body:JSON.stringify({title:'草稿隐私测试',category:'korean'})});
    assert.equal(create.status,201);
    const {id}=await create.json();
    const up=await request('/wedding/api/admin/works/'+id+'/images?role=cover',{
      method:'POST',headers:{...action,Cookie:cookie,'Content-Type':'image/png'},body:png});
    assert.equal(up.status,201);
    const imagePath=(await up.json()).src;
    r=await request('/wedding'+imagePath);
    assert.equal(r.status,404,'Unpublished image must not be public');
    r=await request('/wedding'+imagePath,{headers:{Cookie:cookie}});
    assert.equal(r.status,200,'Admin may preview unpublished image');
    const publish=await request('/wedding/api/admin/works/'+id,{method:'PATCH',
      headers:{...action,Cookie:cookie,'Content-Type':'application/json'},
      body:JSON.stringify({published:true})});
    assert.equal(publish.status,200);
    r=await request('/wedding'+imagePath);
    assert.equal(r.status,200,'Published image is public');
    const unpublish=await request('/wedding/api/admin/works/'+id,{method:'PATCH',
      headers:{...action,Cookie:cookie,'Content-Type':'application/json'},
      body:JSON.stringify({published:false})});
    assert.equal(unpublish.status,200);
    r=await request('/wedding'+imagePath);
    assert.equal(r.status,404,'Unpublished image becomes private again');
    const page=await request('/wedding/').then(res=>res.text());
    assert.match(page,/<base href="\/wedding\/">/);
    for(const required of ['id="nav-favorites"','id="footer-share"','id="footer-wechat"','id="site-footer-contacts"']){
      assert.ok(page.includes(required),'UI element: '+required);
    }
    assert.doesNotMatch(page,/class="(island|system-right|menu-pill)"/);
    const frontend=await readFile(join(root,'public/assets/site.js'),'utf8');
    const backend=await readFile(join(root,'public/assets/admin.js'),'utf8');
    assert.match(frontend,/s\.slice\(1\)/,'Public image path relative to base');
    assert.match(backend,/String\(value\)\.slice\(1\)/,'Admin image path relative to base');
  } finally {
    if(app?.proc)app.proc.kill();
    await rm(dir,{recursive:true,force:true});
  }
});
