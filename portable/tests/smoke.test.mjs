import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');

async function launch(dir) {
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd: root, env: { ...process.env, HOST:'127.0.0.1', PORT:'0', DATA_DIR:dir,
      COOKIE_SECURE:'0', ADMIN_PASSWORD:'test-only-admin-password-123',
      COOKIE_SECRET:'test-only-random-secret-with-32-plus-characters' },
    stdio:['ignore','pipe','pipe']
  });
  const port = await new Promise((resolve,reject) => {
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => reject(new Error('Start timeout: '+stderr)), 12000);
    proc.stdout.on('data', d => {
      stdout += d.toString();
      const match = stdout.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', e => { clearTimeout(timeout); reject(e); });
    proc.on('exit', code => { clearTimeout(timeout); reject(new Error('Exited: '+code+' '+stderr)); });
  });
  return { proc, base:'http://127.0.0.1:'+port };
}
test('portable CMS: login, create, upload, publish, reorder, delete, persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(),'enwan-test-'));
  let app;
  try {
    app = await launch(dir);
    const request = async (path, opts = {}) => {
      const response = await fetch(app.base + path, opts);
      return { status:response.status, headers:response.headers, data: await response.json() };
    };
    let r = await request('/api/health');
    assert.equal(r.status,200);
    r = await request('/api/categories');
    assert.equal(r.data.length,9);
    r = await request('/api/works');
    assert.equal(r.status,200);
    assert.equal(r.data.length,9);
    assert.ok(r.data.every(w => w.cover.startsWith('/images/') && w.details.length === 0));
    r = await request('/api/admin/works');
    assert.equal(r.status,401);

    const action = {'X-Enwan-Action':'1'};
    const loginBody = password => ({ method:'POST', headers:{ ...action, 'Content-Type':'application/json' }, body:JSON.stringify({ password }) });
    r = await request('/api/admin/login',loginBody('bad-password-guess'));
    assert.equal(r.status,401);
    const authResponse = await fetch(app.base+'/api/admin/login',loginBody('test-only-admin-password-123'));
    assert.equal(authResponse.status,200);
    const cookie = authResponse.headers.get('set-cookie').split(';')[0];
    const json = (method,data) => ({ method,headers:{ ...action, Cookie:cookie, 'Content-Type':'application/json' },body:JSON.stringify(data) });
    const auth = { ...action, Cookie:cookie };
    r = await request('/api/admin/works',json('POST',{ title:'测试作品',category:'korean' }));
    assert.equal(r.status,201);
    const id=r.data.id;
    assert.equal(r.data.published,false);
    const upload = (role) => ({method:'POST',headers:{...auth,'Content-Type':'image/png'},body:image});
    r = await request('/api/admin/works/'+id+'/images?role=cover',upload('cover'));
    assert.equal(r.status,201);
    assert.ok(r.data.src.startsWith('/uploads/'));
    r = await request('/api/admin/works/'+id+'/images?role=detail',upload('detail'));
    assert.equal(r.status,201);
    r = await request('/api/admin/works/'+id+'/images?role=detail',upload('detail'));
    assert.equal(r.status,201);
    r = await request('/api/admin/works/'+id,json('PATCH',{published:true,title:'韩式婚礼测试',category:'korean'}));
    assert.equal(r.status,200);
    r = await request('/api/works');
    assert.equal(r.data.length,10);
    const item = r.data.find(w=>w.id===id);
    assert.equal(item.details.length,2);
    const reordered=item.details.map(d=>d.id).reverse();
    r = await request('/api/admin/works/'+id+'/details-order',json('PATCH',{ids:reordered}));
    assert.equal(r.status,200);
    r = await request('/api/admin/export',{headers:{Cookie:cookie}});
    const updated=r.data.works.find(w=>w.id===id);
    assert.deepEqual(updated.details.map(d=>d.id),reordered);
    r = await request('/api/admin/works/'+id+'/images/'+updated.details[0].id,{method:'DELETE',headers:auth});
    assert.equal(r.status,200);
    r = await request('/api/admin/works/'+id,{method:'DELETE',headers:auth});
    assert.equal(r.status,200);
    r = await request('/api/works');
    assert.equal(r.data.length,9);
    const persisted=JSON.parse(await readFile(join(dir,'works.json'),'utf8'));
    assert.equal(persisted.works.length,9);
    assert.equal(persisted.version,1);
    const html = await fetch(app.base+'/admin').then(res=>res.text());
    assert.ok(html.includes('作品管理后台'));
  } finally {
    if (app?.proc) app.proc.kill();
    await rm(dir,{recursive:true,force:true});
  }
});
