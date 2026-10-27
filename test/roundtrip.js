// Run: node test/roundtrip.js [file.psi]   (default: example/example.psi)
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const logic=html.split('<script>')[1].split('//UI')[0];
eval(logic+';globalThis.P=parsePsi;globalThis.Bd=buildPsi;globalThis.C=crc32');
const file=process.argv[2]||path.join(__dirname,'..','example','example.psi');
const txt=fs.readFileSync(file,'utf8');
const m=P(txt);
assert.deepStrictEqual(m.warn,[],'CRC warnings');
assert.strictEqual(Bd(m),txt,'unmodified round-trip must be byte-identical');
console.log('OK round-trip identical:',m.ts.length,'transponders, version',m.ver);
// edit: change frequency, add a transponder, bump version, check CRC/re-parse
m.ver=(m.ver+1)&31;
m.ts[0].descs.find(d=>d.f!==undefined).f='306';
m.ts.push({tsid:9999,onid:m.ts[0].onid,sec:m.ts.at(-1).sec,descs:[{t:0x41,s:[[1,25]]},{t:0x5F,hex:'00000028'},{t:0x83,l:[[1,1,900,31]]}]});
const m2=P(Bd(m));
assert.deepStrictEqual(m2.warn,[]);assert.strictEqual(m2.ts.length,m.ts.length);
assert.strictEqual(m2.ts[0].descs.find(d=>d.f!==undefined).f,'306');
// overflow: many services must be split into several valid sections (<=1021 bytes each)
for(let i=0;i<60;i++)m.ts.push({tsid:2000+i,onid:1,sec:0,descs:[{t:0x41,s:Array(30).fill([1,25])}]});
const m3=P(Bd(m));assert.deepStrictEqual(m3.warn,[]);assert.strictEqual(m3.ts.length,m.ts.length);
console.log('OK edit + section split ->',Math.max(...m3.ts.map(t=>t.sec))+1,'sections, all CRC valid');
