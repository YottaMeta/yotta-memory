'use strict';

// 测试用假 provider：只读 stdin、按 argv 模式返回固定响应；不联网、不写文件。
// 放在 test-fixtures/ 而非 test/：元忆 npm test 用裸 `node --test`，test/ 下所有 .js 都会被当测试执行。
const fs = require('fs');

const mode = process.argv[2] || 'ok';
const argData = process.argv[3] || '';
let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch (e) {
  raw = '';
}
let request = null;
try {
  request = JSON.parse(raw || '{}');
} catch (e) {
  request = null;
}

function send(payload) {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

if (mode === 'hang') {
  setTimeout(() => process.exit(0), 10000);
} else if (mode === 'exit') {
  process.exit(3);
} else if (mode === 'invalid') {
  process.stdout.write('not-json');
  process.exit(0);
} else if (mode === 'oversize') {
  process.stdout.write(JSON.stringify({ ok: true, data: { pad: 'x'.repeat(300 * 1024) } }));
  process.exit(0);
} else if (mode === 'license') {
  send({ ok: false, code: 'license_required', message: '需要授权后使用' });
} else if (mode === 'custom') {
  let data = {};
  try {
    data = JSON.parse(argData || '{}');
  } catch (e) {
    data = {};
  }
  send({ ok: true, capability: request && request.capability, data });
} else if (mode === 'dump') {
  if (argData) {
    fs.writeFileSync(argData, JSON.stringify((request && request.payload) || {}), 'utf8');
  }
  const candidates = ((request && request.payload && request.payload.candidates) || []);
  send({ ok: true, capability: request && request.capability, data: { evict: candidates.slice(0, 1).map((item) => item.file) } });
} else {
  const capability = request && request.capability;
  if (capability === 'memory.hook') {
    const candidates = ((request.payload || {}).candidates) || [];
    send({ ok: true, capability, data: { evict: candidates.slice(0, 1).map((item) => item.file) } });
  } else if (capability === 'o1.route') {
    send({ ok: true, capability, data: { skills: [{ slug: 'yotta-memory' }] } });
  } else {
    send({ ok: false, code: 'unsupported', message: '不支持的能力' });
  }
}
