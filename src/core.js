import {lessons,allPhrases} from './data.js';
export const KEY='omicron.progress.v1';
export const fresh=()=>({version:1,settings:{name:'',minutes:7,transliteration:true,audio:true,theme:'light'},completed:[],history:[],vocabulary:{},customLessons:[],session:null});
export const dayKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function addDays(key,n){const [y,m,d]=key.split('-').map(Number);return dayKey(new Date(y,m-1,d+n,12))}
export function streak(history,today=dayKey()) {const days=new Set(history.map(x=>x.date));let cursor=days.has(today)?today:addDays(today,-1),count=0;while(days.has(cursor)){count++;cursor=addDays(cursor,-1)}return count}
export function longestStreak(history){const days=[...new Set(history.map(x=>x.date))].sort();let best=0,run=0,last;for(const day of days){run=last&&addDays(last,1)===day?run+1:1;best=Math.max(best,run);last=day}return best}
export const normalize=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('el').replace(/ς/g,'σ').replace(/[.,;!?·;’'“”"«»]/g,'').replace(/\s+/g,' ').trim();
export function checkAnswer(answer,expected){return normalize(answer)===normalize(expected)}
export function duePhrases(state,today=dayKey()){const phrases=[...allPhrases,...state.customLessons.flatMap(l=>l.phrases)];return phrases.filter(p=>state.vocabulary[p.id]&&state.vocabulary[p.id].due<=today).sort((a,b)=>state.vocabulary[a.id].due.localeCompare(state.vocabulary[b.id].due))}
export function validateLesson(input){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Paste one lesson object.');
const str=(value,label,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label} must be text under ${max} characters.`);return value.trim()};
const title=str(input.title,'Title',100),note=str(input.note,'Lesson note',1500);
if(!Array.isArray(input.phrases)||input.phrases.length<3||input.phrases.length>8)throw Error('A lesson needs 3 to 8 phrases.');
const unique=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const id=`custom-${unique}`;
const phrases=input.phrases.map((p,i)=>({id:`${id}-${i}`,greek:str(p.greek,'Greek',200),english:str(p.english,'English',200),sound:str(p.sound,'Pronunciation',250),note:typeof p.note==='string'?p.note.slice(0,500):''}));
if(new Set(phrases.map(p=>normalize(p.greek))).size!==phrases.length)throw Error('Use a different Greek phrase for each entry.');
return {id,title,note,phrases,symbol:'ο',subtitle:'Created with ChatGPT. Review the language before studying.',topic:'Your lessons'};}
const isDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dayKey(new Date(s+'T12:00:00'))===s;
export function parseBackup(raw){const data=JSON.parse(raw);if(data?.version!==1||!Array.isArray(data.completed)||!Array.isArray(data.history)||!data.settings||!data.vocabulary||typeof data.vocabulary!=='object'||Array.isArray(data.vocabulary)||!Array.isArray(data.customLessons)||data.customLessons.length>100)throw Error('This is not an Omicron v1 backup.');
const state=fresh();
if(data.completed.length>500||data.history.length>20000||data.history.some(h=>!isDay(h.date)||!Number.isInteger(h.correct)||!Number.isInteger(h.total)||h.correct<0||h.total<1||h.correct>h.total||typeof h.lesson!=='string'))throw Error('The backup has invalid lesson history.');
state.settings={name:typeof data.settings.name==='string'?data.settings.name.slice(0,40):'',minutes:[5,7,10].includes(data.settings.minutes)?data.settings.minutes:7,transliteration:data.settings.transliteration!==false,audio:data.settings.audio!==false,theme:data.settings.theme==='dark'?'dark':'light'};
state.customLessons=data.customLessons.map(l=>{if(typeof l.id!=='string'||!/^custom-[\w-]{1,80}$/.test(l.id))throw Error('Invalid custom lesson.');const checked=validateLesson(l);return {...checked,id:l.id,phrases:checked.phrases.map((p,i)=>({...p,id:`${l.id}-${i}`}))}});
const known=new Set([...lessons,...state.customLessons].map(l=>l.id));state.completed=[...new Set(data.completed.filter(x=>known.has(x)))];state.history=data.history.map(h=>({date:h.date,correct:h.correct,total:h.total,lesson:h.lesson,minutes:typeof h.minutes==='number'?Math.max(0,Math.min(120,h.minutes)):0}));
const phraseIds=new Set([...allPhrases,...state.customLessons.flatMap(l=>l.phrases)].map(p=>p.id));for(const [id,v]of Object.entries(data.vocabulary)){if(phraseIds.has(id)&&v&&isDay(v.due)&&Number.isInteger(v.level)&&v.level>=0&&v.level<=6)state.vocabulary[id]={due:v.due,level:v.level,mistakes:Number.isInteger(v.mistakes)?Math.max(0,v.mistakes):0}}return state;
}
function validSession(s,state){
if(!s||typeof s!=='object'||!['learn','quiz','done'].includes(s.phase)||!Number.isInteger(s.index)||s.index<0||typeof s.lessonId!=='string'||typeof s.title!=='string'||s.title.length>100||typeof s.note!=='string'||s.note.length>1500||!Number.isFinite(s.started)||!Array.isArray(s.phrases)||s.phrases.length<1||s.phrases.length>16)return false;
const catalog=[...allPhrases,...state.customLessons.flatMap(l=>l.phrases)];
if(!s.phrases.every(p=>catalog.some(c=>c.id===p.id&&c.greek===p.greek&&c.english===p.english)))return false;
if(s.index>=(s.phase==='learn'?s.phrases.length:s.phrases.length*2)&&s.phase!=='done')return false;
if(!Array.isArray(s.results)||s.results.length>s.phrases.length*2||!s.results.every(r=>s.phrases.some(p=>p.id===r.id)&&typeof r.correct==='boolean'))return false;
if(s.pending&&(typeof s.pending.answer!=='string'||typeof s.pending.correct!=='boolean'||s.pending.answer.length>1000))return false;
return true;
}
export function load(storage){try{const raw=storage.getItem(KEY);if(!raw)return {state:fresh()};const state=parseBackup(raw);const saved=JSON.parse(raw).session;if(validSession(saved,state))state.session=saved;return {state}}catch{return {state:fresh(),error:'Your saved data could not be read. Export the original data in Settings before replacing it.'}}}
export function makeSession(state,lesson,review=false,today=dayKey()){
let phrases=review?duePhrases(state,today).slice(0,state.settings.minutes===5?4:6):lesson.phrases;
if(!review&&state.settings.minutes>=7){const ids=new Set(phrases.map(p=>p.id));phrases=[...phrases,...duePhrases(state,today).filter(p=>!ids.has(p.id)).slice(0,state.settings.minutes===10?4:2)]}
if(!phrases.length)return null;
return {lessonId:review?'review':lesson.id,title:review?'A little revision':lesson.title,note:review?'Bring these phrases back to mind. You have met them before.':lesson.note,phrases,phase:review?'quiz':'learn',index:0,results:[],started:Date.now()};
}
export function finish(state,session,today=dayKey()){
if(session.recorded)return state;
const vocabulary={...state.vocabulary};for(const p of session.phrases){const results=session.results.filter(r=>r.id===p.id);if(!results.length)continue;const correct=results.every(r=>r.correct);const prev=vocabulary[p.id]||{level:0,mistakes:0};const level=correct?Math.min(prev.level+1,6):0;vocabulary[p.id]={level,due:addDays(today,correct?[0,1,3,7,14,30,60][level]:1),mistakes:prev.mistakes+(correct?0:1)}}
return {...state,vocabulary,completed:session.lessonId==='review'?[...state.completed]:[...new Set([...state.completed,session.lessonId])],history:[...state.history,{date:today,lesson:session.lessonId,correct:session.results.filter(r=>r.correct).length,total:session.results.length,minutes:Math.max(1,Math.round((Date.now()-session.started)/60000))}],session:{...session,phase:'done',recorded:true}};
}
export function lessonPrompt(state,focus='Everyday conversation'){
const known=[...allPhrases,...state.customLessons.flatMap(l=>l.phrases)].filter(p=>state.vocabulary[p.id]);const weak=known.filter(p=>state.vocabulary[p.id].level<=1);return `You are my patient Modern Greek tutor. Make today's ${state.settings.minutes}-minute lesson. I am a beginner from Canada, learning Greek for real conversation. Focus: ${focus}.\nKnown phrases: ${known.map(p=>p.greek).join('; ')||'Greetings, my name is Sam, I am from Canada, please, thank you'}.\nPhrases needing review: ${weak.map(p=>p.greek).join('; ')||'None recorded yet'}.\nTeach 4 useful phrases, combine a little review with a small next step, explain polite versus informal usage where relevant, and avoid claiming personal history. Use accurate Modern Greek accents. Pronunciation hints must use familiar English approximations and mark stressed syllables with capitals. Mention that approximations are not exact phonetics. Return ONLY a JSON object, without Markdown, matching this structure, for import into Omicron:\n{"title":"Short lesson title","note":"A useful grammar or usage explanation in English, maximum 1500 characters","phrases":[{"greek":"Καλημέρα","english":"Good morning","sound":"ka-lee-MEH-ra","note":"Usage note"}]}\nUse 3 to 8 unique Greek phrases. Each greek and english value must be under 200 characters. Do not include links or HTML. I will practice and track my streak in Omicron.`;
}
