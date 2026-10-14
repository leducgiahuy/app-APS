import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

test('workforce API saves to isolated storage, rereads records and rejects invalid input without overwriting', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aps-workforce-'));
  const file = path.join(directory, 'db.json');
  const oldPath = process.env.APS_DB_PATH;
  process.env.APS_DB_PATH = file;
  fs.writeFileSync(file, JSON.stringify({ projects: [{ id: 'p' }], employees: [], ganttItems: [], tasks: [] }));
  let server;
  try {
    const { default: routes } = await import('../src/routes/api.js');
    const app = express();
    app.use(express.json()); app.use('/api', routes);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.on('listening', resolve));
    const sessionResponse=await fetch(`http://127.0.0.1:${server.address().port}/api/delivery/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'demo@aps.vn',password:'APS@2026'})});
    const token=(await sessionResponse.json()).data.token;
    const headers={ 'Content-Type':'application/json',Authorization:`Bearer ${token}` };
    const url = `http://127.0.0.1:${server.address().port}/api/workforce-plan`;
    const patch = body => fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
    assert.equal((await (await fetch(url,{headers})).json()).data.demands.length, 0);
    let response = await patch({ kind: 'demands', data: { position: 'MEP', projectId: 'p', startDate: '2027-01-01', endDate: '2027-01-31', hours: 350, probability: 80 } });
    assert.equal(response.status, 200);
    const id = (await response.json()).data.demands[0].id;
    response = await patch({ kind: 'recruitments', data: { position: 'MEP', needMonth: '2027-01', status: 'Phỏng vấn', openedAt: '2026-12-01', expectedStart: '2027-01-10', temporary: 'Thuê ngoài' } });
    assert.equal(response.status, 200);
    const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(persisted.workforcePlan.demands[0].id, id);
    assert.equal(persisted.workforcePlan.recruitments[0].temporary, 'Thuê ngoài');
    assert.equal(persisted.projects[0].id, 'p');
    response = await patch({ kind: 'settings', data: { position: 'MEP', leadDays: -2 } });
    assert.equal(response.status, 400);
    assert.equal((await (await fetch(url,{headers})).json()).data.recruitments[0].status, 'Phỏng vấn');
    response = await patch({ kind: 'demands', id, remove: true });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.demands.length, 0);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (oldPath === undefined) delete process.env.APS_DB_PATH; else process.env.APS_DB_PATH = oldPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
