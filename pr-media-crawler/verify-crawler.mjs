import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {Worker} from "node:worker_threads";
const source = fs.readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
const extraction = source.slice(source.indexOf("const GOOD_LOCAL"), source.indexOf("async function fetchPage"));
const ctx = vm.createContext({URL});
vm.runInContext(extraction + ";globalThis.extract = extractContacts;globalThis.decode = decodeEntities;", ctx);
assert.equal(ctx.decode("p&#101;d&#114;o@&#x65;xample.org"), "pedro@example.org");
assert.equal(ctx.decode("&#x110000;"), "&#x110000;");
const cf = email => { const key=23; return key.toString(16).padStart(2,"0")+[...email].map(c=>(c.charCodeAt(0)^key).toString(16).padStart(2,"0")).join(""); };
const html = '<p>Jane Doe - Editor <a href="mailto:jane@example.org">Jane Doe</a></p>' +
 '<p>John Roe - Journalist <a data-cfemail="'+cf("john@example.org")+'">[email protected]</a></p>' +
 '<p>Pedro Ylarri - Editor p&#101;d&#114;o@publisher.org</p>' +
 '<p>Public enquiries logo@2x.png samplemail@example.org publicidad@publisher.org subscriptions@publisher.org</p>';
const contacts = ctx.extract(html,"https://publisher.org/contact","publisher.org");
assert.deepEqual(Array.from(contacts,c=>c.email).sort(),["jane@example.org","john@example.org","pedro@publisher.org"]);
assert.equal(ctx.extract('<p>News h.jones@publisher.org</p>',"https://publisher.org/","publisher.org")[0].name,"");
const fixture = `import {parentPort,workerData} from "node:worker_threads";
if(workerData.domain==="fast"){ parentPort.postMessage({domain:"fast",status:"complete",contacts:[],people:[],pages_fetched:1}); }
else { parentPort.postMessage({progress:true,domain:workerData.domain,contacts:[{email:"editor@publisher.org"}],people:[],pages_fetched:2}); if(workerData.domain==="exit")process.exit(0); else while(true){} }`;
const fixtureURL = new URL("data:text/javascript,"+encodeURIComponent(fixture));
const bounded = source.slice(source.indexOf("async function crawlDomainBounded"),source.indexOf("const server = http.createServer"))
 .replace("new URL(import.meta.url)","fixtureURL").replace("60000", "300");
const bounds = vm.createContext({Worker,fixtureURL,setTimeout,clearTimeout});
vm.runInContext(bounded+";globalThis.run=crawlMany;",bounds);
const streamed=[];
const results = await bounds.run(["slow","fast","exit"],r=>streamed.push(r.domain));
assert.equal(streamed[0],"fast");
assert.equal(results[0].status,"timeout");
assert.equal(results[0].retry_required,true);
assert.equal(results[0].contacts[0].email,"editor@publisher.org");
assert.equal(results[2].status,"failed");
assert.equal(results[2].retry_required,true);
assert.equal(results[2].pages_fetched,2);
assert(source.includes("[...discovered, ...priority.map"));
const ownership = vm.createContext({contacts:[{email:"editor@publisher.org",score:3,context:"",source_url:"staff"},{email:"editor@publisher.org",score:3,context:"Jane Doe, Editor, email editor@publisher.org",source_url:"author"}]});
vm.runInContext(source.slice(source.indexOf("  const bestContacts = new Map();"), source.indexOf("  const bestPeople = new Map();"))+";globalThis.best=bestContacts;",ownership);
assert.equal(ownership.best.get("editor@publisher.org").source_url,"author");
console.log("PASS: public encoded mail context, junk/advertising exclusion, no inferred mailbox names, streamed completion and partial preservation on timeout/exit.");
