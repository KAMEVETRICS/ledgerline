import assert from 'node:assert/strict';
import test from 'node:test';
const m = await import('./model.ts').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const need = name => { assert.equal(typeof m[name], 'function', `${name} must exist`); return m[name]; };
const p = (t, v) => ({t, v});
const holding = (instrument, valueUsd) => ({instrument, admin:null, amount:5, valueUsd});

test('liquidity derives metrics from chronological observations and retains real zero', () => {
  const cc = {priceUsd:[p('2026-10-02',0.2),p('2026-10-01',0.1)], supply:[p('2026-10-02',100)], transferVolumeDailyCC:[p('2026-10-01',0),p('2026-10-02',20)]};
  assert.deepEqual(need('liquidityMetrics')(cc), {price:0.2, change:100, supply:100, marketCap:20, averageVolume:10, observedDays:2});
  assert.equal(m.liquidityMetrics({...cc,priceUsd:[p('2026-10-01',0.1),p('2026-10-02',0)]}).change,-100);
});
test('empty, singleton, zero denominators and overflow never fabricate numeric observations', () => {
  assert.deepEqual(need('liquidityMetrics')({priceUsd:[],supply:[],transferVolumeDailyCC:[]}), {price:null,change:null,supply:null,marketCap:null,averageVolume:null,observedDays:0});
  assert.equal(m.liquidityMetrics({priceUsd:[p('2026-10-01',1)],supply:[],transferVolumeDailyCC:[]}).change,null);
  assert.equal(m.percentage(2,0),null); assert.equal(m.percentage(null,2),null); assert.equal(m.percentage(0,2),0);
  assert.equal(m.percentage(Number.MAX_VALUE,0.01),null);
  assert.equal(m.liquidityMetrics({priceUsd:[p('2026-10-01',Number.MAX_VALUE)],supply:[p('2026-10-01',2)],transferVolumeDailyCC:[]}).marketCap,null);
});
test('pool and holding sorting keep nulls last without mutating contract arrays', () => {
  const pools = [{id:'a',venue:'A',pair:'A/B',tvlUsd:null,volume24hUsd:1},{id:'b',venue:'B',pair:'A/B',tvlUsd:0,volume24hUsd:1},{id:'c',venue:'C',pair:'A/B',tvlUsd:10,volume24hUsd:null}];
  assert.deepEqual(need('sortPools')(pools).map(p=>p.id),['c','b','a']);
  assert.deepEqual(m.sortPools(pools,'asc').map(p=>p.id),['b','c','a']);
  assert.equal(pools[0].id,'a');
  assert.deepEqual(m.sortHoldings([holding('unknown',null),holding('zero',0),holding('valued',20)]).map(h=>h.instrument),['valued','zero','unknown']);
});
test('partial USD valuation sums only known values and allocates only valued assets', () => {
  const summary = need('portfolioValue')([holding('CC',225),holding('USD',340),holding('BTC',null)]);
  assert.equal(summary.total,565); assert.equal(summary.unvalued,1); assert.equal(summary.valued,2);
  assert.equal(summary.allocatable,true);
  assert.equal(m.percentage(225,summary.total),225/565*100);
  assert.deepEqual(m.portfolioValue([holding('CC',null)]),{total:null,unvalued:1,valued:0,allocatable:false});
  assert.deepEqual(m.portfolioValue([holding('CC',0)]),{total:0,unvalued:0,valued:1,allocatable:false});
  assert.equal(m.portfolioValue([holding('CC',-1),holding('USD',2)]).allocatable,false);
});
test('party IDs obey gateway characters/length and require the party separator', () => {
  for (const s of ['','abc','a b::cc','<tag>::abc','../a::x','a::x?','é::abc','x'.repeat(511)+'::']) assert.equal(need('normalizeParty')(s),null,s);
  assert.equal(m.normalizeParty(' sample-party::12200000 '),'sample-party::12200000');
  assert.equal(m.normalizeParty('a::'),'a::');
  assert.equal(m.normalizeParty('a'.repeat(510)+'::'),'a'.repeat(510)+'::');
});
test('shared hash round trips encoded parties and leaves unrelated routes alone', () => {
  const id='sample-party::12200000';
  const hash=need('portfolioHash')(id);
  assert.equal(hash,'#/network/portfolio?party=sample-party%3A%3A12200000');
  assert.equal(m.partyFromHash(hash),id);
  assert.equal(m.partyFromHash('#/network/liquidity?party='+id),'');
  assert.equal(m.partyFromHash('#/network/portfolio'),'');
});
test('recent lookups deduplicate, cap five, reject malformed storage and survive blocked storage', () => {
  const ids=Array.from({length:7},(_,i)=>`party-${i}::1220`);
  assert.deepEqual(need('recentWith')(ids,ids[2]),[ids[2],ids[0],ids[1],ids[3],ids[4]]);
  const store={getItem:()=>JSON.stringify([ids[0],ids[0],'invalid',ids[1]]),setItem:()=>{throw Error('blocked')}};
  assert.deepEqual(m.readRecent(()=>store),[ids[0],ids[1]]);
  assert.deepEqual(m.readRecent(()=>{throw Error('blocked')}),[]);
  assert.deepEqual(m.readRecent(()=>({...store,getItem:()=>'{broken'})),[]);
  assert.doesNotThrow(()=>m.writeRecent(()=>store,ids));
});
test('number/ID formatting preserves missing values and shows the full short identity', () => {
  assert.equal(need('formatValue')(null,String),'—'); assert.equal(m.formatValue(0,String),'0'); assert.equal(m.formatValue(NaN,String),'—');
  assert.equal(m.usd4(0.125715),'$0.1257'); assert.equal(m.percent(12.5,true),'+12.5%');
  assert.equal(m.shortId('party::abc'),'party::abc');
  assert.equal(m.shortId('very-long-party::'+'a'.repeat(64)).includes('…'),true);
});
