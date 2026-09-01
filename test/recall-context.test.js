const os = require('os');
const path = require('path');
const fs = require('fs');
const home = path.join(os.tmpdir(), 'yottamem-v09-' + Date.now());
fs.mkdirSync(home, { recursive: true });
process.env.YOTTA_MEMORY_HOME = home;
const engine = require(path.join(process.cwd(), 'bin/yotta-memory.js'));

if (typeof engine.runEmbeddingPlugin !== 'function') {
  console.error('FAIL: runEmbeddingPlugin is not exported');
  process.exit(1);
}

const command = 'node -e "const b=[];process.stdin.on(\'data\',d=>b.push(d));process.stdin.on(\'end\',()=>{const x=JSON.parse(b.join(\'\'));process.stdout.write(JSON.stringify({vectors:x.texts.map(()=>[1,0])}))})"';
const vectors = engine.runEmbeddingPlugin(command, ['alpha', 'beta'], 3000);
if (!Array.isArray(vectors) || vectors.length !== 2) {
  console.error('FAIL: embedding plugin returned invalid vectors');
  process.exit(1);
}
console.log('PASS: embedding adapter');

engine.rememberCore('FACT', 'semantic', 'quantum entanglement paper');
const recallCommand = 'node -e "const b=[];process.stdin.on(\'data\',d=>b.push(d));process.stdin.on(\'end\',()=>{const x=JSON.parse(b.join(\'\'));process.stdout.write(JSON.stringify({vectors:x.texts.map(()=>[1,0])}))})"';
const recallResult = engine.recallCore('spooky action', { limit: 1, embedding: recallCommand });
if (!/semantic/.test(recallResult.text)) {
  console.error('FAIL: recallCore did not use embedding candidates');
  process.exit(1);
}
console.log('PASS: recall embedding integration');

engine.rememberCore('FACT', 'task', 'v0.9 recall design');
engine.rememberCore('FACT', 'noise', 'unrelated memory');
const contextResult = engine.contextCore({ focus: 'v0.9 recall design', limit: 10, explain: true });
if (!/v0\.9 recall design/.test(contextResult.text)) {
  console.error('FAIL: contextCore did not include focused memory');
  process.exit(1);
}
if (!/\[included\]/.test(contextResult.text)) {
  console.error('FAIL: contextCore did not emit explain trace');
  process.exit(1);
}
console.log('PASS: context focus and explain');

const marker = path.join(home, 'MCP_EMBEDDING_MARKER.txt');
const maliciousEmbedding = 'node -e "require(\'fs\').writeFileSync(process.argv[1], \'pwned\')" ' + JSON.stringify(marker);
engine.callTool('recall', { query: 'anything', embedding: maliciousEmbedding }, { agent: 'codex' });
if (fs.existsSync(marker)) {
  console.error('FAIL: MCP embedding command executed arbitrary local process');
  process.exit(1);
}
console.log('PASS: MCP embedding command is ignored');
