// yotta-memory v0.8.5 security boundary regression tests
// Run: node test/security-boundary.test.js
// Covers the 3 SkillHub findings (all must now be blocked) + 3 legitimate flows (must still work).
const os=require('os');const path=require('path');const fs=require('fs');

const root=process.cwd();
const home=path.join(os.tmpdir(),'yottamem-sb-'+Date.now());
fs.mkdirSync(home,{recursive:true});
process.env.YOTTA_MEMORY_HOME=home;
const m=require(root+'/bin/yotta-memory.js');

let pass=0,fail=0;
function chk(name,cond){ if(cond){pass++;console.log('PASS:',name);} else {fail++;console.log('FAIL:',name);} }

// ---- 1. MCP command execution blocked (SkillHub finding #1) ----
const marker=path.join(home,'PWNED_MARKER.txt');
const modelCmd=process.platform==='win32'?('cmd /c echo pwned>'+marker):('sh -c "echo pwned>'+marker+'"');
m.callTool('distill',{subject:'x',model:modelCmd},{agent:'codex'});
chk('MCP distill --model rejected (no command exec)', !fs.existsSync(marker));

// ---- 2. MCP export arbitrary path blocked (SkillHub finding #2) ----
const outside=path.join(os.tmpdir(),'yottamem-sb-outside-export.json');
try{fs.rmSync(outside,{force:true});}catch(e){}
const rex=m.callTool('export',{out:outside},{agent:'codex'});
chk('MCP export outside root rejected', !fs.existsSync(outside) && /拒绝/.test(rex.text||''));

// ---- 3. MCP import arbitrary path blocked (SkillHub finding #2) ----
const srcFile=path.join(os.tmpdir(),'yottamem-sb-outside-import.json');
fs.writeFileSync(srcFile,JSON.stringify({format:'yottamemory',memories:[{meta:{type:'FACT',subject:'injected',statement:'x'}}]}));
const rim=m.callTool('import',{src:srcFile},{agent:'codex'});
chk('MCP import outside root rejected', /拒绝/.test(rim.text||''));

// ---- 4. Legitimate MCP export (default) still works ----
m.callTool('remember',{type:'FACT',subject:'s1',statement:'hello'},{agent:'codex'});
const re=m.callTool('export',{},{agent:'codex'});
chk('MCP export default works', /已导出/.test(re.text||''));

// ---- 5. Legitimate MCP import within root still works ----
const inRoot=path.join(home,'ok-import.json');
fs.writeFileSync(inRoot,JSON.stringify({format:'yottamemory',memories:[{meta:{type:'FACT',subject:'s2',statement:'world'}}]}));
const ri=m.callTool('import',{src:'ok-import.json'},{agent:'codex'});
chk('MCP import within root works', /已导入/.test(ri.text||''));

// ---- 6. Legitimate MCP distill (no --model) still works ----
m.callTool('remember',{type:'FACT',subject:'a',statement:'x'},{agent:'codex'});
m.callTool('remember',{type:'PREF',subject:'b',statement:'y'},{agent:'codex'});
const rd=m.callTool('distill',{subject:'t'},{agent:'codex'});
chk('MCP distill (no model) works', /蒸馏/.test(rd.text||''));

console.log('SECURITY_BOUNDARY_RESULTS:',JSON.stringify({pass:pass,fail:fail}));
process.exit(fail?1:0);

