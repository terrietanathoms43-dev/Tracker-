/**
 * Pure, testable meeting-review preparation.
 * Meeting content is evidence, never a source of instructions to the app.
 */
export type MeetingKind="create_task"|"update_task"|"create_project"|"create_goal"|"already_tracked";
export type MeetingPriority="low"|"normal"|"high"|"urgent";
export type MeetingSuggestion={
 id:string;
 kind:MeetingKind;
 title:string;
 description:string;
 due_date:string|null;
 priority:MeetingPriority;
 owner_id:string|null;
 project_id:string|null;
 existing_id:string|null;
 matched_type:"task"|"project"|"goal"|null;
 evidence:string;
 reason:string;
 confidence:number;
};
export type ExistingWork={
 tasks:{id:string;title:string;description?:string|null;status?:string;project_id?:string|null}[];
 projects:{id:string;name:string}[];
 goals:{id:string;title:string}[];
 members:{user_id:string;display_name:string;role:string}[];
};
export type MeetingReview={
 mode:"ai"|"basic";
 summary:string;
 suggestions:MeetingSuggestion[];
 open_questions:string[];
 checked:{tasks:number;projects:number;goals:number};
 notice:string;
};
export const MEETING_MAX_TEXT=40000;
export const MEETING_MAX_SUGGESTIONS=24;
const STOP_WORDS=new Set(["the","and","for","with","from","this","that","into","will","need","needs","have","having","about","team","task","project","our","are","was","were","they","their","some","work","new","due","to","a","an","of","on","in","by","at","is","be","we","it","all","as","do","an"]);
export function searchableWords(input:string):string[]{
 return [...new Set(input.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>2&&!STOP_WORDS.has(w)))];
}
export function similarity(a:string,b:string):number{
 const ta=new Set(searchableWords(a));
 const tb=new Set(searchableWords(b));
 if(!ta.size||!tb.size)return 0;
 const intersection=[...ta].filter(w=>tb.has(w)).length;
 const overlap=intersection/Math.min(ta.size,tb.size);
 const jaccard=intersection/(ta.size+tb.size-intersection);
 return Math.max(jaccard,overlap>=0.85?overlap*0.9:0);
}
export function closestExisting(title:string,existing:ExistingWork){
 const candidates=[
  ...existing.tasks.map(item=>({id:item.id,type:"task" as const,title:item.title})),
  ...existing.projects.map(item=>({id:item.id,type:"project" as const,title:item.name})),
  ...existing.goals.map(item=>({id:item.id,type:"goal" as const,title:item.title}))
 ];
 return candidates.map(item=>({...item,score:similarity(title,item.title)}))
  .sort((a,b)=>b.score-a.score)[0]??null;
}
function textLimit(value:unknown,length:number):string{
 return typeof value==="string"?value.trim().slice(0,length):"";
}
function validDate(input:unknown):string|null{
 if(typeof input!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(input))return null;
 const d=new Date(input+"T12:00:00Z");
 return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==input?null:input;
}
export function prepareSuggestions(raw:unknown,source:string,existing:ExistingWork):MeetingSuggestion[]{
 if(!Array.isArray(raw))return [];
 const seen=new Set<string>();
 const allowedKind=new Set<MeetingKind>(["create_task","update_task","create_project","create_goal","already_tracked"]);
 const knownOwners=new Set(existing.members.filter(m=>["admin","leader","member"].includes(m.role)).map(m=>m.user_id));
 const knownProjects=new Set(existing.projects.map(p=>p.id));
 const tasks=new Map(existing.tasks.map(t=>[t.id,t]));
 const projects=new Set(existing.projects.map(p=>p.id));
 const goals=new Set(existing.goals.map(g=>g.id));
 const sourceLower=source.toLowerCase();
 const output:MeetingSuggestion[]=[];
 for(const record of raw.slice(0,MEETING_MAX_SUGGESTIONS*2)){
  if(!record||typeof record!=="object")continue;
  const item=record as Record<string,unknown>;
  let kind=allowedKind.has(item.kind as MeetingKind)?item.kind as MeetingKind:"create_task";
  const title=textLimit(item.title,180);
  if(title.length<2)continue;
  const description=textLimit(item.description,3500);
  const best=closestExisting(title,existing);
  let existingId=typeof item.existing_id==="string"?item.existing_id:null;
  let matchedType=item.matched_type==="project"||item.matched_type==="goal"||item.matched_type==="task"?item.matched_type:null;
  if(kind==="update_task"){
   if(!existingId||!tasks.has(existingId))continue;
   matchedType="task";
  }else if(kind==="already_tracked"){
   if(existingId&&tasks.has(existingId))matchedType="task";
   else if(existingId&&projects.has(existingId))matchedType="project";
   else if(existingId&&goals.has(existingId))matchedType="goal";
   else if(best&&best.score>=0.72){existingId=best.id;matchedType=best.type}
   else continue;
  }else{
   existingId=null;matchedType=null;
   const exactType=kind==="create_project"?"project":kind==="create_goal"?"goal":"task";
   if(best&&best.type===exactType&&best.score>=0.82){
    kind="already_tracked";existingId=best.id;matchedType=best.type;
   }
  }
  const evidenceCandidate=textLimit(item.evidence,230);
  const evidence=evidenceCandidate&&sourceLower.includes(evidenceCandidate.toLowerCase())?evidenceCandidate:"";
  const priority=["low","normal","high","urgent"].includes(String(item.priority))?item.priority as MeetingPriority:"normal";
  const ownerId=typeof item.owner_id==="string"&&knownOwners.has(item.owner_id)?item.owner_id:null;
  const projectId=typeof item.project_id==="string"&&knownProjects.has(item.project_id)?item.project_id:null;
  const dedupe=kind+":"+(existingId??title.toLowerCase().replace(/\W/g,""));
  if(seen.has(dedupe))continue;
  seen.add(dedupe);
  const conf=typeof item.confidence==="number"?Math.min(1,Math.max(0,item.confidence)):0.55;
  output.push({
   id:"review-"+output.length,kind,title,description,due_date:validDate(item.due_date),
   priority,owner_id:ownerId,project_id:projectId,existing_id:existingId,
   matched_type:matchedType,evidence,reason:textLimit(item.reason,400),
   confidence:conf
  });
  if(output.length>=MEETING_MAX_SUGGESTIONS)break;
 }
 return output;
}
/** Conservative preview when no paid external AI model has been configured. */
export function basicMeetingSuggestions(source:string,existing:ExistingWork):MeetingSuggestion[]{
 const lines=source.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(line=>line.trim()).filter(Boolean);
 const raw:unknown[]=[];
 const taskPattern=/\b(action(?:\s+item)?|todo|to-do|follow[- ]?up|assigned|must|need(?:s)?\s+to|agreed\s+to|will\s+(?:prepare|send|draft|submit|complete|review|organize|contact|create|update|provide|schedule|finish|share|deliver|check)|responsible\s+for)\b/i;
 for(const line of lines){
  if(line.length<12)continue;
  let kind:MeetingKind="create_task";
  if(/^\s*(?:new\s+)?project\s*[:–-]/i.test(line))kind="create_project";
  else if(/^\s*(?:new\s+)?goal\s*[:–-]/i.test(line))kind="create_goal";
  else if(!taskPattern.test(line))continue;
  const cleaned=line.replace(/^\s*(?:\[[ xX]\]\s*)?(?:(?:action(?:\s+item)?|to-?do|project|goal)\s*[:–-]\s*)/i,"")
   .replace(/^\s*(?:[A-Za-z][A-Za-z .'-]{0,35}:\s*)(?=.{12})/,"").trim();
  if(cleaned.length<5)continue;
  raw.push({kind,title:cleaned.slice(0,170),description:line.slice(0,1000),evidence:line.slice(0,230),
   reason:"Possible action or commitment identified by keyword rules; verify it against the meeting context.",confidence:0.4});
  if(raw.length>=MEETING_MAX_SUGGESTIONS)break;
 }
 return prepareSuggestions(raw,source,existing);
}
