import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectedDate, parseChart} from '../server/public-prices';
import {snapshotSchema} from '../src/schema';
import {demoSnapshot} from '../src/demo';
import {demoAccount} from '../src/demo';
import {calculate} from '../src/engine';
test('祝日・週末・18時前・年末年始を営業日判定から除く',()=>{
 const holidays=new Set(['2026-10-12']);
 assert.equal(expectedDate(new Date('2026-10-13T08:00:00Z'),holidays),'2026-10-09');
 assert.equal(expectedDate(new Date('2026-10-13T09:00:00Z'),holidays),'2026-10-13');
 assert.equal(expectedDate(new Date('2027-01-03T12:00:00Z'),new Set()),'2026-12-30');
});
const chart=(date:string,close:number,volume=100)=>({chart:{result:[{
 timestamp:[Date.parse(`${date}T00:00:00Z`)/1000],
 indicators:{quote:[{close:[close],volume:[volume]}]},
 events:{splits:{a:{date:Date.parse('2026-10-01T00:00:00Z')/1000}}}
}]}});
test('当日のcloseだけを使い、調整後終値や古い価格を混ぜない',()=>{
 const q=parseChart(chart('2026-10-09',2910.5),{code:'7203',name:'トヨタ'},'2026-10-09');
 assert.equal(q.close,'2910.5'); assert.equal(q.actionDate,'2026-10-01');
 assert.throws(()=>parseChart(chart('2026-10-08',2910.5),{code:'7203',name:''},'2026-10-09'));
 assert.throws(()=>parseChart(chart('2026-10-09',2910.5,0),{code:'7203',name:''},'2026-10-09'));
});
test('本人用は未取得を明示できるが一般配信の許諾を偽らない',()=>{
 assert.equal(snapshotSchema.safeParse({...demoSnapshot,complete:false,licensedForRedistribution:false}).success,false);
 assert.equal(snapshotSchema.safeParse({...demoSnapshot,usage:'personal',complete:false,licensedForRedistribution:false}).success,true);
});
test('既存終値キャッシュで権利履歴不明なら入力の確認日まで保留する',()=>{
 const snapshot=structuredClone(demoSnapshot); snapshot.quotes.forEach(q=>Object.assign(q,{corporateActionsChecked:false}));
 const account=structuredClone(demoAccount); account.positions.forEach(p=>p.confirmedThrough='2026-10-08');
 assert.equal(calculate(account,snapshot).ratio,null);
 account.positions.forEach(p=>p.confirmedThrough='2026-10-09');
 assert.equal(calculate(account,snapshot).ratio,'43.36');
});
