"use client";

import {useState,type FormEvent} from "react";
import {supabase as createDb} from "../lib/supabase";
import {similarity,type MeetingReview,type MeetingSuggestion,type MeetingKind} from "../lib/meeting-review";

type Task={id:string;title:string;description:string|null;status:string;priority:string;due_at:string|null;owner_id:string|null;project_id:string|null};
type Project={id:string;name:string};
type Goal={id:string;title:string};
type Member={user_id:string;display_name:string;role:string};
type Props={
 organizationId:string;
 tasks:Task[];
 projects:Project[];
 goals:Goal[];
 directory:Member[];
 onSaved:()=>void|Promise<void>;
};
const TYPES:Record<MeetingKind,string>={
 create_task:"New task",update_task:"Update existing task",
 create_project:"New project",create_goal:"New goal",already_tracked:"Already tracked"
};
function isoDate(input:string|null|undefined){
 if(!input)return null;
 return /^\d{4}-\d{2}-\d{2}/.exec(input)?.[0]??null;
}
function dueTimestamp(date:string|null){
 return date?new Date(date+"T23:59:00").toISOString():null;
}
function getError(value:unknown){
 if(value instanceof Error)return value.message;
 if(value&&typeof value==="object"&&"message" in value)return String(value.message);
 return "The requested change couldn't be saved.";
}
function normalizeDraft(item:MeetingSuggestion,tasks:Task[]):MeetingSuggestion{
 if(item.kind!=="update_task"||!item.existing_id)return item;
 const match=tasks.find(t=>t.id===item.existing_id);
 if(!match)return item;
 return {
  ...item,title:match.title,
  priority:item.priority==="normal"&&match.priority!=="normal"?match.priority as MeetingSuggestion["priority"]:item.priority,
  due_date:item.due_date??isoDate(match.due_at),
  project_id:item.project_id??match.project_id,
  owner_id:item.owner_id??match.owner_id
 };
}
export default function MeetingReviewPanel({organizationId,tasks,projects,goals,directory,onSaved}:Props){
 const [meetingFile,setMeetingFile]=useState<File|null>(null);
 const [notes,setNotes]=useState("");
 const [allowAi,setAllowAi]=useState(false);
 const [analyzing,setAnalyzing]=useState(false);
 const [progress,setProgress]=useState("");
 const [report,setReport]=useState<MeetingReview|null>(null);
 const [drafts,setDrafts]=useState<Record<string,MeetingSuggestion>>({});
 const [saved,setSaved]=useState<Record<string,boolean>>({});
 const [savingId,setSavingId]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 function chooseFile(file:File|null){
  setError("");setNotice("");setReport(null);
  if(file&&!/\.(pdf|docx|txt|md|csv|vtt|srt)$/i.test(file.name)){
   setMeetingFile(null);
   setError("Choose a PDF, Word (.docx), TXT, Markdown, CSV, VTT, or SRT document.");
   return;
  }
  if(file&&file.size>5*1024*1024){
   setMeetingFile(null);setError("Meeting documents must be smaller than 5 MB.");return;
  }
  setMeetingFile(file);
 }
 async function sessionToken(){
  const {data:{session},error:sessionError}=await createDb().auth.getSession();
  if(sessionError||!session?.access_token)throw new Error("Your session expired. Sign in and try again.");
  return session.access_token;
 }
 async function analyze(event:FormEvent){
  event.preventDefault();
  if(analyzing)return;
  if(!meetingFile&&!notes.trim()){setError("Upload meeting notes or paste a transcript first.");return}
  setAnalyzing(true);setError("");setNotice("");setReport(null);
  setSaved({});setDrafts({});
  try{
   const token=await sessionToken();
   let text=notes.trim();
   if(meetingFile){
    setProgress("Reading "+meetingFile.name+"…");
    const data=new FormData();
    data.append("organization_id",organizationId);
    data.append("file",meetingFile);
    const parsed=await fetch("/api/meeting-text",{
     method:"POST",headers:{Authorization:"Bearer "+token},body:data,cache:"no-store"
    });
    const details=await parsed.json() as {text?:string;error?:string};
    if(!parsed.ok||!details.text)throw new Error(details.error||"Couldn't read this document.");
    text=[text,details.text].filter(Boolean).join("\n\n");
   }
   if(text.length>40000)throw new Error("Combined notes are too long. Analyze up to 40,000 characters at once.");
   if(text.length<35)throw new Error("Provide at least 35 characters of meeting content.");
   setProgress("Comparing meeting actions with existing work…");
   const analysis=await fetch("/api/meeting-review",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({organization_id:organizationId,notes:text,consent_ai:allowAi}),
    cache:"no-store"
   });
   const result=await analysis.json() as MeetingReview&{error?:string};
   if(!analysis.ok||result.error)throw new Error(result.error||"Unable to analyze meeting.");
   if(!Array.isArray(result.suggestions))throw new Error("The analysis wasn't in a usable format.");
   const defaults:Record<string,MeetingSuggestion>={};
   for(const suggestion of result.suggestions){
    defaults[suggestion.id]=normalizeDraft(suggestion,tasks);
   }
   setDrafts(defaults);setReport(result);
   setNotice(result.notice);
  }catch(cause){
   setError(getError(cause));
  }finally{setAnalyzing(false);setProgress("")}
 }
 function edit(id:string,changes:Partial<MeetingSuggestion>){
  setDrafts(old=>old[id]?{...old,[id]:{...old[id],...changes}}:old);
 }
 async function save(id:string){
  const item=drafts[id];
  if(!item||item.kind==="already_tracked"||savingId||saved[id])return;
  if(item.title.trim().length<2){setError("Give the suggested item a title of at least two characters.");return}
  if(item.kind==="update_task"&&!item.existing_id){setError("The matching task couldn't be found. Analyze again.");return}
  const similar=item.kind==="create_task"
   ?tasks.find(t=>similarity(t.title,item.title)>=0.83)
   :item.kind==="create_project"
   ?projects.find(p=>similarity(p.name,item.title)>=0.83)
   :item.kind==="create_goal"
   ?goals.find(g=>similarity(g.title,item.title)>=0.83)
   :undefined;
  if(similar&&!window.confirm("Similar work is already saved: “"+("title" in similar?similar.title:similar.name)+"”. Create another item anyway?"))return;
  if(item.kind==="update_task"&&!window.confirm("Apply your reviewed meeting changes to the existing task? The previous task will remain in the activity history."))return;
  setSavingId(id);setError("");setNotice("");
  const db=createDb();
  try{
   if(item.kind==="create_task"){
    const {data:{user}}=await db.auth.getUser();
    if(!user)throw new Error("Please sign in again.");
    const {error:dbError}=await db.from("tw_tasks").insert({
     organization_id:organizationId,created_by:user.id,
     title:item.title.trim(),description:item.description.trim()||null,
     priority:item.priority,project_id:item.project_id||null,owner_id:item.owner_id||null,
     due_at:dueTimestamp(item.due_date)
    });
    if(dbError)throw dbError;
   }else if(item.kind==="create_project"){
    const {error:dbError}=await db.from("tw_projects").insert({
     organization_id:organizationId,name:item.title.trim(),description:item.description.trim()||null
    });
    if(dbError)throw dbError;
   }else if(item.kind==="create_goal"){
    const {error:dbError}=await db.from("tw_goals").insert({
     organization_id:organizationId,title:item.title.trim(),
     description:item.description.trim()||null,target_date:item.due_date||null
    });
    if(dbError)throw dbError;
   }else if(item.kind==="update_task"){
    const original=tasks.find(t=>t.id===item.existing_id);
    if(!original)throw new Error("The existing task is no longer available. Refresh Trackwise.");
    const proposedDescription=item.description.trim();
    const mergedDescription=[original.description?.trim()??"",proposedDescription
     ?("Meeting follow-up: "+proposedDescription):""].filter(Boolean).join("\n\n");
    if(mergedDescription.length>3500)throw new Error("This task has a long description. Shorten the meeting follow-up before saving.");
    const {error:dbError}=await db.rpc("tw_apply_meeting_task_edit",{
     target_task:original.id,task_title:item.title.trim(),task_description:mergedDescription,
     task_priority:item.priority,task_due:dueTimestamp(item.due_date),
     task_project:item.project_id||null,task_owner:item.owner_id||null
    });
    if(dbError)throw dbError;
   }
   setSaved(previous=>({...previous,[id]:true}));
   await onSaved();
   setNotice("Saved “"+item.title+"” to Trackwise.");
  }catch(cause){
   setError(getError(cause));
  }finally{setSavingId("")}
 }

 const actionable=report?.suggestions.filter(item=>item.kind!=="already_tracked")??[];
 const tracked=report?.suggestions.filter(item=>item.kind==="already_tracked")??[];
 const complete=actionable.filter(item=>saved[item.id]).length;
 return <div className="meetingReview">
  <section className="card meetingIntro">
   <div className="sectionHead"><div><span className="eyebrow blue">MEETING FOLLOW-UPS</span><h2>Turn meeting notes into tracked work</h2></div><span className="chip">Review before saving</span></div>
   <p>Upload minutes or a transcript, or paste your notes. Trackwise compares possible actions with existing tasks, projects and goals so you can avoid duplicates.</p>
   <form onSubmit={analyze} className="meetingForm">
    <div><label htmlFor="meetingFile">Meeting document (optional)</label><input type="file" id="meetingFile" accept=".pdf,.docx,.txt,.md,.csv,.vtt,.srt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={e=>chooseFile(e.target.files?.[0]??null)}/>
     <small>PDF, Word (.docx), TXT, Markdown, CSV, VTT or SRT · up to 5 MB. For scanned PDFs, paste the extracted text.</small>
     {meetingFile&&<small className="meetingFileName">Selected: {meetingFile.name}</small>}
    </div>
    <div><label htmlFor="meetingNotesText">Or paste meeting notes / transcript</label>
     <textarea id="meetingNotesText" rows={7} maxLength={40000} value={notes} placeholder="Example: Action: Prepare the outreach invitations by Friday. Javaughn will review the budget. The team agreed to update the existing event project…" onChange={e=>{setNotes(e.target.value);setReport(null)}}/>
    </div>
    <label className="meetingConsent"><input type="checkbox" checked={allowAi} onChange={e=>setAllowAi(e.target.checked)}/>
     <span><strong>Use AI analysis when available</strong><small>If an OpenAI API key is configured, meeting text and relevant organization details will be sent to OpenAI for analysis. Otherwise a limited rule-based preview is provided. Your meeting file is not saved automatically.</small></span>
    </label>
    <button className="primary" type="submit" disabled={analyzing||(!meetingFile&&!notes.trim())}>{analyzing?"Analyzing…":"Analyze meeting and compare with tracker →"}</button>
    {progress&&<p className="muted" role="status">{progress}</p>}
   </form>
  </section>

  {error&&<p className="feedback bad" role="alert">{error}</p>}
  {notice&&<p className="feedback good" role="status">{notice}</p>}
  {report&&<>
   <section className="card">
    <div className="sectionHead"><h2>Meeting review</h2><span className="chip">{report.mode==="ai"?"AI analysis":"Basic preview"}</span></div>
    <p>{report.summary}</p>
    <p className="muted">Compared with {report.checked.tasks} tasks, {report.checked.projects} projects, and {report.checked.goals} goals.</p>
    <p className="muted">No items were added or changed during analysis. Approve individual suggestions below.</p>
    {report.open_questions.length>0&&<div className="meetingQuestions"><h3>Questions to clarify</h3><ul>{report.open_questions.map((question,i)=><li key={i}>{question}</li>)}</ul></div>}
   </section>
   <section className="card">
    <div className="sectionHead"><h2>Suggested additions and changes</h2><span className="chip">{complete}/{actionable.length} approved</span></div>
    {actionable.length===0&&<p className="muted">No clear new actions were detected. If your transcript contains commitments, try adding labels such as “Action:” or enabling AI analysis.</p>}
    <div className="meetingSuggestions">{actionable.map(item=>{
     const draft=drafts[item.id]??item;
     const original=item.kind==="update_task"?tasks.find(t=>t.id===item.existing_id):null;
     return <article className={"meetingSuggestion "+(saved[item.id]?"meetingSaved":"")} key={item.id}>
      <div className="meetingSuggestionHead"><strong>{TYPES[item.kind]}</strong><span>{Math.round(item.confidence*100)}% confidence</span></div>
      {original&&<p className="muted">Updates existing task: <strong>{original.title}</strong></p>}
      <div className="meetingEditFields">
       <div><label htmlFor={"meetingTitle-"+item.id}>{item.kind==="create_project"?"Project name":item.kind==="create_goal"?"Goal title":"Task title"}</label><input id={"meetingTitle-"+item.id} value={draft.title} maxLength={180} minLength={2} disabled={!!saved[item.id]} onChange={e=>edit(item.id,{title:e.target.value})}/></div>
       <div><label htmlFor={"meetingDesc-"+item.id}>Description / follow-up</label><textarea id={"meetingDesc-"+item.id} rows={3} maxLength={2200} disabled={!!saved[item.id]} value={draft.description} onChange={e=>edit(item.id,{description:e.target.value})}/></div>
       {(item.kind==="create_task"||item.kind==="update_task")&&<div className="meetingEditGrid">
        <div><label htmlFor={"meetingOwner-"+item.id}>Person responsible</label><select id={"meetingOwner-"+item.id} disabled={!!saved[item.id]} value={draft.owner_id??""} onChange={e=>edit(item.id,{owner_id:e.target.value||null})}><option value="">Unassigned</option>{directory.filter(m=>["admin","leader","member"].includes(m.role)).map(m=><option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></div>
        <div><label htmlFor={"meetingProject-"+item.id}>Project</label><select id={"meetingProject-"+item.id} disabled={!!saved[item.id]} value={draft.project_id??""} onChange={e=>edit(item.id,{project_id:e.target.value||null})}><option value="">No linked project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label htmlFor={"meetingPriority-"+item.id}>Priority</label><select id={"meetingPriority-"+item.id} disabled={!!saved[item.id]} value={draft.priority} onChange={e=>edit(item.id,{priority:e.target.value as MeetingSuggestion["priority"]})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
        <div><label htmlFor={"meetingDue-"+item.id}>Due date</label><input type="date" id={"meetingDue-"+item.id} disabled={!!saved[item.id]} value={draft.due_date??""} onChange={e=>edit(item.id,{due_date:e.target.value||null})}/></div>
       </div>}
       {item.kind==="create_goal"&&<div><label htmlFor={"meetingGoalTarget-"+item.id}>Target date</label><input type="date" id={"meetingGoalTarget-"+item.id} value={draft.due_date??""} disabled={!!saved[item.id]} onChange={e=>edit(item.id,{due_date:e.target.value||null})}/></div>}
      </div>
      {item.evidence&&<p className="meetingEvidence"><strong>From the meeting:</strong> “{item.evidence}”</p>}
      {item.reason&&<p className="muted meetingReason">{item.reason}</p>}
      <button type="button" className="primary" disabled={!!saved[item.id]||!!savingId} onClick={()=>void save(item.id)}>{saved[item.id]?"✓ Saved":savingId===item.id?"Saving…":item.kind==="update_task"?"Approve task update":"Approve and add to Trackwise"}</button>
     </article>;
    })}</div>
   </section>
   {tracked.length>0&&<section className="card"><h2>Already tracked — no duplicate needed</h2>
    {tracked.map(item=><div className="meetingExisting" key={item.id}><strong>{item.title}</strong><small>Matches an existing {item.matched_type??"item"}. No changes were made.</small>{item.evidence&&<p className="muted">{item.evidence}</p>}</div>)}
   </section>}
  </>}
 </div>;
}
