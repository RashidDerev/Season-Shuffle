/* Run with Node.js: node tests/check.cjs. No third-party dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const G = require('../engine.js');
const baseline = fs.readFileSync(path.join(root, 'reference/prototype-v8.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const context = { module: { exports: {} } };
vm.runInNewContext(baseline, context);
const old = context.module.exports;
const equal = (a,b) => assert.equal(JSON.stringify(a),JSON.stringify(b));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`OK ${name}`); }

check('new games keep all v8 invariants', () => {
  for (let seed=1; seed<=100; seed++) {
    const s = G.create(seed);
    assert(G.valid(s));
    equal(s,old.create(seed));
    assert(s.stacks.every(stack=>stack.length===2 && stack[0].color!==stack[1].color));
  }
});
check('up and down are exact inverses and consume no random values', () => {
  for (let seed=1; seed<=100; seed++) {
    const s = G.create(seed), before=G.clone(s);
    G.rotate(s); G.rotate(s,'down'); equal(s,before);
    for(let i=0;i<3;i++)G.rotate(s); equal(s,before);
    for(let i=0;i<3;i++)G.rotate(s,'down'); equal(s,before);
  }
});
check('horizontal shifts affect only the active row and are reversible', () => {
  const s = G.create(31), before=G.clone(s);
  G.shift(s,'left');
  equal(s.rows[0],before.rows[0]); equal(s.rows[2],before.rows[2]);
  equal(s.stacks,before.stacks); assert.equal(s.rng,before.rng);
  G.shift(s,'right'); equal(s,before);
});
check('drop keeps top and bottom rows and refreshes all four middle positions', () => {
  const s=G.create(79), before=G.clone(s);
  G.drop(s);
  equal(s.rows[0],before.rows[0]); equal(s.rows[2],before.rows[2]);
  assert(s.rows[1].every(t=>!before.rows[1].some(oldToken=>oldToken.id===t.id)));
  assert.equal(s.moves,1); assert(G.valid(s));
});
check('exactly three matching chips clear; cascades settle completely', () => {
  let id=1; const token=color=>({id:id++,color});
  const pair=[token(0),token(0)]; equal(G.settle(pair),[]); assert.equal(pair.length,2);
  const cascade=[token(1),token(1),token(0),token(0),token(0),token(1)];
  const events=G.settle(cascade); assert.equal(events.length,2); assert.equal(cascade.length,0);
});
function fullBoard(rescuable) {
  const s=G.create(92);
  s.stacks[0]=Array.from({length:12},(_,i)=>({id:++s.uid,color:i%4}));
  if(rescuable) { s.stacks[0][10].color=2; s.stacks[0][11].color=2; s.rows[1][0].color=2; }
  else s.rows[1][0].color=0;
  return s;
}
check('a full column can be rescued by its top pair', () => {
  const s=fullBoard(true); const result=G.drop(s);
  assert.equal(result.overflow.length,0); assert.equal(s.stacks[0].length,10); assert(G.valid(s));
});
check('failed overflow is atomic and preserves every row and stack', () => {
  const s=fullBoard(false), before=G.clone(s); const result=G.drop(s);
  assert(result.overflow.includes(0)); assert.equal(s.status,'lost');
  equal(s.stacks,before.stacks); equal(s.rows,before.rows); assert.equal(s.rng,before.rng);
});
check('a cleared column closes and does not receive later chips', () => {
  const s=G.create(88);
  s.stacks[0].forEach(t=>t.color=3); s.rows[1][0].color=3;
  G.drop(s); assert.equal(s.closed[0],true); assert.equal(s.stacks[0].length,0);
  G.drop(s); assert.equal(s.stacks[0].length,0); assert(G.valid(s));
});
check('all four closed columns trigger victory', () => {
  const s=G.create(441);
  s.stacks.forEach((stack,i)=> { stack.forEach(t=>t.color=i); s.rows[1][i].color=i; });
  const result=G.drop(s); assert.equal(result.won,true); assert.equal(s.status,'won'); assert(G.valid(s));
});
check('existing saved v8 games migrate unchanged', () => {
  const s=G.create(621); G.rotate(s); G.shift(s,'right'); G.drop(s);
  equal(G.migrate(s),s);
});
check('1000 seeded games match the original mechanics for existing actions', () => {
  for(let seed=1;seed<=1000;seed++) {
    const a=G.create(seed), b=old.create(seed);
    for(let move=0;move<40 && a.status==='playing';move++) {
      if((seed+move)%2) { G.rotate(a); old.rotate(b); }
      const dir=(seed+move)%3?'left':'right'; G.shift(a,dir); old.shift(b,dir);
      equal(G.drop(a),old.drop(b)); equal(a,b); assert(G.valid(a));
    }
  }
});
check('runtime scripts parse and every local referenced asset exists', () => {
  for(const file of ['engine.js','game.js','server.cjs']) new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if(!match[1].startsWith('data:')) assert(fs.existsSync(path.join(root,match[1])),`Missing ${match[1]}`);
  }
});
console.log(`\n${checks} checks passed.`);
