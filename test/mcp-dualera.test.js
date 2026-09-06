// yotta-memory MCP dual-era（2026-07-28 modern + 2025-11-25 legacy）测试
// Run: node test/mcp-dualera.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const tmpRoot = path.join(os.tmpdir(), 'yottamem-dualera-' + Date.now());
fs.mkdirSync(tmpRoot, { recursive: true });
process.env.USERPROFILE = tmpRoot;
if (process.platform !== 'win32') process.env.HOME = tmpRoot;
process.env.YOTTA_AGENT_ID = 'codex';
process.env.YOTTA_MEMORY_HOME = path.join(tmpRoot, 'lib-main');
const engine = require(path.join(process.cwd(), 'bin/yotta-memory.js'));

let pass = 0, fail = 0;
function chk(name, cond, detail) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, detail !== undefined ? ':: ' + detail : ''); }
}
const MODERN_META = {
  _meta: {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  },
};

// ========== A. handleMessage 层（stdio 语义） ==========
// A1 legacy initialize（平铺 params、无 _meta）
const li = engine.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, { agent: 'codex' });
chk('legacy initialize protocolVersion=2025-11-25', li.result && li.result.protocolVersion === '2025-11-25', JSON.stringify(li));
chk('legacy initialize serverInfo', li.result && li.result.serverInfo && li.result.serverInfo.name === 'yotta-memory', JSON.stringify(li));
chk('legacy initialize 无 resultType（旧形状）', li.result && li.result.resultType === undefined, JSON.stringify(li));
// A2 legacy ping
const lp = engine.handleMessage({ jsonrpc: '2.0', id: 2, method: 'ping' }, { agent: 'codex' });
chk('legacy ping result={}', JSON.stringify(lp.result) === '{}', JSON.stringify(lp));
// A3 legacy tools/list
const ll = engine.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, { agent: 'codex' });
chk('legacy tools/list 旧形状（无 resultType）', Array.isArray(ll.result.tools) && ll.result.tools.length > 0 && ll.result.resultType === undefined, JSON.stringify(ll).slice(0, 120));
// A4 modern discover
const md = engine.handleMessage({ jsonrpc: '2.0', id: 10, method: 'server/discover', params: MODERN_META }, { agent: 'codex' });
chk('modern discover resultType=complete', md.result && md.result.resultType === 'complete', JSON.stringify(md));
chk('modern discover supportedVersions', md.result && JSON.stringify(md.result.supportedVersions) === '["2026-07-28"]', JSON.stringify(md.result && md.result.supportedVersions));
chk('modern discover capabilities.tools', md.result && md.result.capabilities && md.result.capabilities.tools, JSON.stringify(md.result && md.result.capabilities));
chk('modern discover _meta.serverInfo', md.result && md.result._meta && md.result._meta['io.modelcontextprotocol/serverInfo'].name === 'yotta-memory', JSON.stringify(md.result && md.result._meta));
chk('modern discover ttlMs/cacheScope', md.result && md.result.ttlMs > 0 && md.result.cacheScope === 'public', JSON.stringify(md.result));
chk('modern discover instructions 含 2026-07-28', md.result && md.result.instructions && md.result.instructions.indexOf('2026-07-28') !== -1, JSON.stringify(md.result && md.result.instructions));
// A5 modern tools/list
const ml = engine.handleMessage({ jsonrpc: '2.0', id: 11, method: 'tools/list', params: MODERN_META }, { agent: 'codex' });
chk('modern tools/list resultType+ttlMs', ml.result && ml.result.resultType === 'complete' && ml.result.tools.length > 0 && ml.result.ttlMs > 0, JSON.stringify(ml).slice(0, 120));
// A6 modern tools/call（agent_info 只读身份，不依赖记忆库内容）
const mc = engine.handleMessage({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: Object.assign({}, MODERN_META, { name: 'agent_info', arguments: {} }) }, { agent: 'codex' });
chk('modern tools/call resultType=complete', mc.result && mc.result.resultType === 'complete', JSON.stringify(mc));
chk('modern tools/call isError=false', mc.result && mc.result.isError === false, JSON.stringify(mc));
chk('modern tools/call 内容为文本', mc.result && mc.result.content && mc.result.content[0] && mc.result.content[0].type === 'text', JSON.stringify(mc).slice(0, 120));
// A7 modern 版本不支持
const m4 = engine.handleMessage({ jsonrpc: '2.0', id: 13, method: 'server/discover', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2025-11-25' } } }, { agent: 'codex' });
chk('modern 版本不支持 -32022', m4.error && m4.error.code === -32022, JSON.stringify(m4));
chk('-32022 data supported/requested', m4.error && m4.error.data && m4.error.data.supported[0] === '2026-07-28' && m4.error.data.requested === '2025-11-25', JSON.stringify(m4.error && m4.error.data));
// A8 modern initialize rejected
const mz = engine.handleMessage({ jsonrpc: '2.0', id: 14, method: 'initialize', params: MODERN_META }, { agent: 'codex' });
chk('modern initialize -32601', mz.error && mz.error.code === -32601, JSON.stringify(mz));
chk('modern initialize message 列 supported', mz.error && mz.error.message.indexOf('2026-07-28') !== -1, JSON.stringify(mz.error && mz.error.message));
// A9 modern 未知 method
const mu = engine.handleMessage({ jsonrpc: '2.0', id: 15, method: 'bad/method', params: MODERN_META }, { agent: 'codex' });
chk('modern 未知 method -32601', mu.error && mu.error.code === -32601, JSON.stringify(mu));

// ========== B. HTTP 层（Streamable HTTP：header 校验 / 兼容 GET） ==========
function httpReq(options, body) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(new Error('httpReq timeout')); }, 8000);
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, headers: res.headers, body: data }); });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    if (body !== undefined) req.write(body);
    req.end();
  });
}
function freePort() {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}
function probeGet(port) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'GET' }, (res) => {
      const ct = res.headers['content-type'] || '';
      res.destroy();
      resolve({ status: res.statusCode, ct: ct });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}
async function waitReady(port) {
  for (let i = 0; i < 20; i++) {
    const r = await probeGet(port);
    if (r && r.status === 200) return true;
    await new Promise((res) => setTimeout(res, 200));
  }
  return false;
}
async function testHttp() {
  const port = await freePort();
  const child = spawn(process.execPath, ['bin/yotta-memory.js', 'serve', '--host', '127.0.0.1', '--port', String(port), '--no-auth'], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  try {
    const ready = await waitReady(port);
    chk('HTTP server 启动就绪', ready, logs.slice(0, 300));
    if (!ready) return;
    // H1 modern POST discover（全 header）
    const body1 = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: MODERN_META });
    const r1 = await httpReq({
      host: '127.0.0.1', port, path: '/mcp', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'server/discover' },
    }, body1);
    let j1 = null; try { j1 = JSON.parse(r1.body); } catch (e) {}
    chk('HTTP modern POST 200', r1.status === 200, r1.status + ' ' + r1.body.slice(0, 160));
    chk('HTTP modern discover resultType', j1 && j1.result && j1.result.resultType === 'complete' && j1.result.supportedVersions[0] === '2026-07-28', r1.body.slice(0, 200));
    // H2 header/body 版本不一致
    const body2 = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'server/discover', params: MODERN_META });
    const r2 = await httpReq({
      host: '127.0.0.1', port, path: '/mcp', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25' },
    }, body2);
    let j2 = null; try { j2 = JSON.parse(r2.body); } catch (e) {}
    chk('HTTP header/body 不一致 400', r2.status === 400, r2.status + ' ' + r2.body.slice(0, 160));
    chk('HTTP HeaderMismatch -32020', j2 && j2.error && j2.error.code === -32020, r2.body.slice(0, 200));
    // H3 GET /mcp 兼容端点（deprecated HTTP+SSE；读响应头即断）
    const r3 = await probeGet(port);
    chk('HTTP GET /mcp SSE 兼容（200 + event-stream）', !!r3 && r3.status === 200 && r3.ct.indexOf('text/event-stream') !== -1, JSON.stringify(r3));
  } finally {
    child.kill();
  }
}

(async () => {
  try {
    await testHttp();
  } catch (e) {
    console.log('HTTP 测试异常:', e && e.message);
  }
  console.log('\nMCP_DUALERA_RESULTS: ' + JSON.stringify({ pass, fail }));
  console.log(fail > 0 ? '失败项: ' + fail : '全部通过 ✓');
  process.exit(fail > 0 ? 1 : 0);
})();
