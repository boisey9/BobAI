// Local structured node:test observations; no signing/transmission/trust registration.
import {run} from 'node:test';import {fileURLToPath} from 'node:url';
const stream=run({files:[fileURLToPath(new URL('./owned-child-lifecycle.test.mjs',import.meta.url))],concurrency:1});const cases=[];
for await(const event of stream){if(event.type==='test:pass'||event.type==='test:fail')cases.push({id:event.data.name,status:event.data.skip||event.data.todo?'skipped':event.type==='test:pass'?'pass':'fail'});}
console.log(JSON.stringify({version:1,cases}));if(cases.length!==8||cases.some(c=>c.status!=='pass'))process.exitCode=1;
