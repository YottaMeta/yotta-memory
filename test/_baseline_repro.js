const os=require("os");const path=require("path");const fs=require("fs");
const m=require(process.cwd()+"/bin/yotta-memory.js");
const home=path.join(os.tmpdir(),"yottamem-baseline"+Date.now());fs.mkdirSync(home,{recursive:true});
process.env.YOTTA_MEMORY_HOME=home;
const marker=path.join(home,"PWNED_MARKER.txt");
const modelCmd=process.platform==="win32"?("cmd /c echo pwned>"+marker):("sh -c \"echo pwned>"+marker+"\"");
const r1=m.callTool("distill",{subject:"x",model:modelCmd},{agent:"codex"});
console.log("DISTILL_MODEL_EXEC:",fs.existsSync(marker));
const outside=path.join(os.tmpdir(),"yottamem-baseline-outside-export.json");try{fs.rmSync(outside,{force:true});}catch(e){}
m.callTool("export",{out:outside},{agent:"codex"});
console.log("EXPORT_OUTSIDE_WRITE:",fs.existsSync(outside));
const srcFile=path.join(os.tmpdir(),"yottamem-baseline-outside-import.json");
fs.writeFileSync(srcFile,JSON.stringify({format:"yottamemory",memories:[{meta:{type:"FACT",subject:"injected",statement:"x"}}]}));
const r3=m.callTool("import",{src:srcFile},{agent:"codex"});
console.log("IMPORT_OUTSIDE_READ:",(r3.text||"").indexOf("已导入 1 条")>=0);