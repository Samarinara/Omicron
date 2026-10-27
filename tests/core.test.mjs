import test from 'node:test';
import assert from 'node:assert/strict';
import {lessons} from '../src/data.js';
import {KEY,fresh,dayKey,addDays,streak,longestStreak,checkAnswer,validateLesson,parseBackup,makeSession,finish,load,duePhrases,lessonPrompt} from '../src/core.js';
const history=dates=>dates.map(date=>({date,lesson:'hellos',correct:4,total:4,minutes:2}));
test('streak counts calendar days once and allows the current day to be unfinished',()=>{
assert.equal(streak(history(['2026-10-25','2026-10-26','2026-10-26']),'2026-10-27'),2);
assert.equal(streak(history(['2026-10-24','2026-10-26','2026-10-27']),'2026-10-27'),2);
assert.equal(streak(history(['2026-10-25']),'2026-10-27'),0);
assert.equal(longestStreak(history(['2026-10-25','2026-10-26','2026-10-26','2026-10-27','2026-10-20'])),3);
});
test('calendar arithmetic survives month boundaries, leap years and DST',()=>{
assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(addDays('2028-02-28',1),'2028-02-29');
assert.equal(addDays('2026-03-08',1),'2026-03-09');assert.equal(addDays('2026-11-01',-1),'2026-10-31');
assert.equal(dayKey(new Date(2026,9,27,23,59)),'2026-10-27');
});
test('Greek recall accepts accents, punctuation and final sigma without accepting different words',()=>{
assert.ok(checkAnswer('  καλημερα! ','Καλημέρα'));assert.ok(checkAnswer('ΓΕΙΑ ΣΑΣ','Γεια σας'));assert.ok(checkAnswer('Που είναι;','Πού είναι;'));assert.ok(!checkAnswer('Καλησπέρα','Καλημέρα'));
});
test('lesson finish stores unique completion, all results, next review date and cannot count twice',()=>{
const s=fresh(),session=makeSession(s,lessons[0]);session.results=session.phrases.flatMap(p=>[{id:p.id,correct:true},{id:p.id,correct:p.id!=='hello'}]);
const next=finish(s,session,'2026-10-27');assert.equal(next.history.length,1);assert.equal(next.history[0].total,8);assert.equal(next.completed.length,1);
assert.equal(next.vocabulary.hello.level,0);assert.equal(next.vocabulary.hello.due,'2026-10-28');assert.equal(next.vocabulary.goodmorning.level,1);
assert.equal(finish(next,next.session,'2026-10-27').history.length,1);assert.equal(duePhrases(next,'2026-10-28').length,4);
});
test('a later successful review increases spacing and does not advance curriculum',()=>{
let s=fresh();let session=makeSession(s,lessons[0]);session.results=session.phrases.map(p=>({id:p.id,correct:true}));s=finish(s,session,'2026-10-27');
session=makeSession(s,null,true,'2026-10-28');session.results=session.phrases.map(p=>({id:p.id,correct:true}));s=finish(s,session,'2026-10-28');assert.equal(s.completed.length,1);assert.equal(s.vocabulary.hello.due,'2026-10-31');assert.equal(s.history.length,2);
});
const custom={title:'Coffee',note:'Use the polite form.',phrases:[{greek:'Νερό',english:'Water',sound:'neh-RO'},{greek:'Καφές',english:'Coffee',sound:'ka-FES'},{greek:'Τσάι',english:'Tea',sound:'TSA-ee'}]};
test('import validates content, count and duplicate Greek',()=>{assert.equal(validateLesson(custom).phrases.length,3);assert.throws(()=>validateLesson({...custom,phrases:[]}));assert.throws(()=>validateLesson({...custom,phrases:[custom.phrases[0],custom.phrases[0],custom.phrases[1]]}));assert.throws(()=>validateLesson({...custom,note:{bad:true}}));});
test('backup round trip preserves custom phrase identities and rejects invalid data',()=>{const s=fresh(),l=validateLesson(custom);s.customLessons.push(l);s.completed.push(l.id);s.vocabulary[l.phrases[0].id]={level:1,due:'2026-10-28',mistakes:0};const backup=parseBackup(JSON.stringify(s));assert.equal(backup.customLessons[0].id,l.id);assert.equal(backup.customLessons[0].phrases[0].id,l.phrases[0].id);assert.equal(Object.keys(backup.vocabulary).length,1);assert.throws(()=>parseBackup('{}'));assert.throws(()=>parseBackup(JSON.stringify({...s,history:[{date:'2026-02-31'}]})));});
test('storage recovery preserves original corrupt content and resumes an unfinished session',()=>{const corrupt={getItem:()=>'{bad'};assert.ok(load(corrupt).error);const s=fresh();s.session=makeSession(s,lessons[0]);s.session.index=2;const storage={getItem:key=>key===KEY?JSON.stringify(s):null};assert.equal(load(storage).state.session.index,2);assert.equal(load(storage).state.session.phase,'learn');});
test('lesson prompt includes weak phrases and the selected focus without sending data',()=>{const s=fresh();s.vocabulary.hello={level:0,due:'2026-10-28'};const p=lessonPrompt(s,'Food');assert.match(p,/Focus: Food/);assert.match(p,/Γεια σου/);assert.match(p,/JSON object/);});
test('invalid session indices cannot break a valid progress backup',()=>{const s=fresh();s.session=makeSession(s,lessons[0]);s.session.index=50;const result=load({getItem:()=>JSON.stringify(s)});assert.equal(result.state.session,null);assert.equal(result.error,undefined);});
test('pending feedback and typed drafts survive session recovery',()=>{const s=fresh();s.session=makeSession(s,lessons[0]);s.session.phase='quiz';s.session.index=4;s.session.draft='Γεια';assert.equal(load({getItem:()=>JSON.stringify(s)}).state.session.draft,'Γεια');s.session.pending={answer:'Γεια σου',correct:true};s.session.results=[{id:'hello',correct:true}];assert.equal(load({getItem:()=>JSON.stringify(s)}).state.session.pending.correct,true);});
