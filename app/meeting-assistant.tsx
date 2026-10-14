"use client";

import {useState,type ChangeEvent} from "react";
import {supabase as makeClient} from "../lib/supabase";
import type {MeetingPriority,MeetingReview,MeetingSuggestion} from "../lib/meeting-review";
import {MEETING_MAX_TEXT} from "../lib/meeting-review";

type KnownTask={id:string;title:string;description:string|null;due_at:string|null;priority:string;owner_id:string|null;project_id:string|null};
type Project={id:string;name:string};
type Member={user_id:string;display_name:string;role:string};
type Props={
 organizationId:string;
 userId:string;
 tasks:KnownTask[];
 projects:Project[];
 members:Member[];
 onSaved:()=>Promise<void>|void;
};
type Draft={
 title:string;
 description:string;
 due_date:string;
 priority:MeetingPriority;
 owner_id:string;
 project_id:string;
};
const MAX_FILE_SIZE=8*1024*1024;
const EXTENSIONS=new Set(["txt","md","csv","pdf","docx"]);
const db=makeClient();
const editingFields=(suggestion:MeetingSuggestion,tasks:KnownTask[]):Draft=>{
 const original=suggestion.kind==="update_task"?tasks.find(t=>t.id===suggestion.existing_id):null;
 return {
  title:original?.title??suggestion.title,
  description:suggestion.description||(original?.description??""),
  due_date:suggestion.due_date??original?.due_at?.slice(0,10)??"",
  priority:(original?.priority&&["low","normal","high","urgent"].includes(original.priority) && suggestion.priority==="normal"
   ?original.priority:suggestion.priority) as MeetingPriority,
  owner_id:suggestion.owner_id??original?.owner_id??"",
  project_id:suggestion.project_id??original?.project_id??""
 };
};
function cleanError(err:unknown,otherwise="Unable to complete this action"){
 if(err instanceof Error&&err.message)return err.message;
 if(err&&typeof err==="object"&&"message" in err)return String(err.message);
 return otherwise;
}
function dueTimestamp(date:string){
 return date?new Date(date+"T23:59:00").toISOString():null;
}
async function readDocument(file:File):Promise<string>{
 const ext=file.name.split(".").pop()?.toLowerCase()??"";
 if(!EXTENSIONS.has(ext))throw new Error("Use a PDF, DOCX, TXT, MD, or CSV file. Older .doc files should be converted to .docx first.");
 if(file.size===0)throw new Error("The selected document is empty.");
 if(file.size>MAX_FILE_SIZE)throw new Error("This document exceeds 8 MB. Split it into shorter meeting notes.");
 if(["txt","md","csv"].includes(ext))return await file.text();
 if(ext==="docx"){
  const mammoth=await import("mammoth");
  const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
  return result.value;
 }
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true}).promise;
 if(pdf.numPages>50)throw new Error("This PDF is too long. Use a document of 50 pages or fewer.");
 const lines:string[]=[];
 try{
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
   const page=await pdf.getPage(pageNumber);
   const textContent=await page.getTextContent();
   const text=textContent.items.map(item=>("str" in item?String(item.str):"")).join(" ");
   lines.push("Page "+pageNumber+"\n"+text);
  }
 }finally{await pdf.destroy()}
 return lines.join("\n\n");
}
const nameFor=(people:Member[],id:string|null)=>people.find(p=>p.user_id===id)?.display_name??"Not assigned";
export default function MeetingAssistant({organizationId,userId,tasks,projects,members,onSaved}:Props){
 const [notes,setNotes]=useState("");
 const [sourceName,setSourceName]=useState("");
 const [consent,setConsent]=useState(false);
 const [loadingFile,setLoadingFile]=useState(false);
 const [analyzing,setAnalyzing]=useState(false);
 const [working,setWorking]=useState(false);
 const [result,setResult]=useState<MeetingReview|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [saved,setSaved]=useState<string[]>([]);
 const [addedProjects,setAddedProjects]=useState<Project[]>([]);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const activeProjects=[...projects,...addedProjects.filter(project=>!projects.some(p=>p.id===project.id))];
 const writableMembers=members.filter(member=>["admin","leader","member"].includes(member.role));

 function draftChange(id:string,patch:Partial<Draft>){
  setDrafts(current=>({...current,[id]:{...current[id],...patch}}));
 }
 function discardResults(){
  setResult(null);setSelected([]);setDrafts({});setSaved([]);
 }
 async function receiveFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  setLoadingFile(true);setError("");setNotice("");
  try{
   const text=await readDocument(file);
   if(!text.trim()||text.trim().length<35)
    throw new Error("I couldn't extract enough text. For scanned or photographed notes, paste the transcript as text instead.");
   if(text.length>MEETING_MAX_TEXT)
    throw new Error("The extracted notes are longer than 40,000 characters. Shorten them or analyze the meeting in parts.");
   setNotes(text.trim());setSourceName(file.name);discardResults();
   setNotice("Text extracted from "+file.name+". Review the text below, then select Analyze.");
  }catch(e){setError(cleanError(e,"Could not read this file"))}
  finally{setLoadingFile(false)}
 }
 async function analyze(){
  if(analyzing||working)return;
  if(notes.trim().length<35){setError("Add at least a few sentences of meeting notes.");return}
  if(notes.length>MEETING_MAX_TEXT){setError("The notes exceed 40,000 characters.");return}
  setAnalyzing(true);setError("");setNotice("");discardResults();
  try{
   const {data:session,error:authError}=await db.auth.getSession();
   if(authError||!session.session?.access_token)
    throw new Error("Please sign in again before analyzing the meeting.");
   const response=await fetch("/api/meeting-review",{
    method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.session.access_token},
    body:JSON.stringify({organization_id:organizationId,notes:notes.trim(),consent_ai:consent})
   });
   const responseData=await response.json() as MeetingReview&{error?:string};
   if(!response.ok)throw new Error(responseData.error||"The analysis could not be completed.");
   if(!Array.isArray(responseData.suggestions))throw new Error("Analysis returned invalid suggestions. Try again.");
   setResult(responseData);
   const edits:Record<string,Draft>={};
   for(const suggestion of responseData.suggestions)edits[suggestion.id]=editingFields(suggestion,tasks);
   setDrafts(edits);
   if(responseData.suggestions.length===0)setNotice("No clear action items were found. You can edit the notes and try again.");
  }catch(e){setError(cleanError(e,"Couldn't analyze the meeting."))}
  finally{setAnalyzing(false)}
 }
 async function apply(suggestion:MeetingSuggestion):Promise<void>{
  const draft=drafts[suggestion.id];
  if(!draft||draft.title.trim().length<2)throw new Error("Check the title before saving.");
  if(!["low","normal","high","urgent"].includes(draft.priority))throw new Error("Choose a valid priority.");
  if(suggestion.kind==="create_project"){
   const {data,error}=await db.from("tw_projects")
    .insert({organization_id:organizationId,name:draft.title.trim(),description:draft.description.trim()||null})
    .select("id,name").single();
   if(error)throw error;
   if(data)setAddedProjects(current=>[...current,data]);
   return;
  }
  if(suggestion.kind==="create_goal"){
   const {error}=await db.from("tw_goals")
    .insert({organization_id:organizationId,title:draft.title.trim(),
      description:draft.description.trim()||null,target_date:draft.due_date||null});
   if(error)throw error;
   return;
  }
  if(suggestion.kind==="create_task"){
   const {error}=await db.from("tw_tasks").insert({
    organization_id:organizationId,created_by:userId,title:draft.title.trim(),
    description:draft.description.trim()||null,due_at:dueTimestamp(draft.due_date),
    owner_id:draft.owner_id||null,project_id:draft.project_id||null,priority:draft.priority
   });
   if(error)throw error;
   return;
  }
  if(suggestion.kind==="update_task"){
   const target=suggestion.existing_id;
   if(!target||!tasks.some(task=>task.id===target))throw new Error("The linked task is no longer available. Reanalyze the meeting.");
   const {error}=await db.rpc("tw_apply_meeting_task_edit",{
    target_task:target,task_title:draft.title.trim(),task_description:draft.description.trim(),
    task_priority:draft.priority,task_due:dueTimestamp(draft.due_date),
    task_project:draft.project_id||null,task_owner:draft.owner_id||null
   });
   if(error)throw error;
  }
 }
 async function saveSelected(){
  if(!result||working||analyzing)return;
  const pending=result.suggestions.filter(s=>selected.includes(s.id)&&s.kind!=="already_tracked"&&!saved.includes(s.id));
  if(!pending.length){setError("Select at least one new or changed item to save.");return}
  if(!window.confirm("Save "+pending.length+" approved suggestion(s) to this organization? You can still edit these records afterward."))return;
  setWorking(true);setError("");setNotice("");
  const done:string[]=[];
  try{
   for(const suggestion of pending){
    await apply(suggestion);
    done.push(suggestion.id);
    setSaved(current=>[...current,suggestion.id]);
    setSelected(current=>current.filter(id=>id!==suggestion.id));
   }
   setNotice("Saved "+done.length+" approved update(s) to Trackwise. Your meeting notes themselves were not saved.");
  }catch(e){
   setError(cleanError(e,"Couldn't save this suggestion.")+" "+(done.length?"Earlier "+done.length+" item(s) were saved; review the remaining selections.":"No later items were saved."));
  }finally{
   if(done.length)await onSaved();
   setWorking(false);
  }
 }
 const proposed=result?.suggestions.filter(s=>s.kind!=="already_tracked")??[];
 const matching=result?.suggestions.filter(s=>s.kind==="already_tracked")??[];
 const pendingCount=proposed.filter(s=>selected.includes(s.id)&&!saved.includes(s.id)).length;
 return <div className="meetingAssistant">
  <section className="card meetingIntro">
   <div className="sectionHead"><div><span className="eyebrow blue">MEETINGS → ACTION</span><h2>Meeting notes assistant</h2></div><span className="chip">Review before saving</span></div>
   <p>Upload meeting notes or a transcript, then compare the action items with tasks, projects, and goals already saved in Trackwise. Choose which suggested changes to add—nothing updates automatically.</p>
   <label htmlFor="meetingNotesFile">Upload meeting notes or transcript</label>
   <input id="meetingNotesFile" type="file" accept=".pdf,.docx,.txt,.md,.csv" disabled={loadingFile||analyzing||working} onChange={e=>void receiveFile(e)}/>
   <small className="muted">PDF, Word (.docx), text, Markdown, or CSV • 8 MB maximum • 50 PDF pages • text-based PDFs only</small>
   {sourceName&&<p className="muted meetingSource">Selected document: <strong>{sourceName}</strong></p>}
   <label htmlFor="meetingNotesText">Or paste and edit meeting notes</label>
   <textarea id="meetingNotesText" rows={11} maxLength={MEETING_MAX_TEXT} value={notes} disabled={loadingFile||analyzing||working}
    onChange={e=>{setNotes(e.target.value);setSourceName("");discardResults()}}
    placeholder={"Meeting: Regional Project Planning\nDate: ...\n\nAction: Prepare an outreach letter by Friday.\nDecision: Begin planning the community project.\nFollow-up: Review the existing assigned tasks."}/>
   <div className="meetingMeta"><small>{notes.length.toLocaleString()} / {MEETING_MAX_TEXT.toLocaleString()} characters</small>{notes&&<button type="button" className="textAction" disabled={analyzing||working} onClick={()=>{setNotes("");setSourceName("");discardResults()}}>Clear notes</button>}</div>
   <label className="meetingConsent"><input type="checkbox" checked={consent} disabled={analyzing||working} onChange={e=>setConsent(e.target.checked)}/>
    <span>Allow the AI service to analyze these notes if an AI model is configured. This sends the meeting text and relevant tracker records to OpenAI for analysis. Leave unchecked for a basic keyword-based preview.</span>
   </label>
   <button type="button" className="primary meetingAnalyze" disabled={analyzing||working||loadingFile||notes.trim().length<35} onClick={()=>void analyze()}>
    {loadingFile?"Reading document…":analyzing?"Comparing with Trackwise…":"Analyze meeting & compare with Trackwise"}
   </button>
   <p className="muted meetingPrivacy">The uploaded document is read locally and its extracted text is sent securely to Trackwise for analysis. Notes are not stored as a meeting record. AI analysis requires an administrator-configured API key and your consent; AI API usage may incur charges.</p>
  </section>
  {error&&<p className="feedback bad" role="alert">{error}</p>}
  {notice&&<p className="feedback good" role="status">{notice}</p>}
  {result&&<section className="card meetingResults" aria-live="polite">
   <div className="sectionHead"><div><span className="eyebrow blue">REVIEW SUGGESTIONS</span><h2>{result.mode==="ai"?"AI meeting review":"Basic action-item preview"}</h2></div><span className="chip">{proposed.length} proposals · {matching.length} existing</span></div>
   <p>{result.summary}</p>
   <p className="muted">{result.notice}</p>
   <p className="muted">Compared {result.checked.tasks} saved tasks, {result.checked.projects} projects, and {result.checked.goals} goals. Suggested titles, owners, and deadlines may need correction.</p>
   {result.open_questions.length>0&&<div className="meetingQuestions"><h3>Questions to resolve</h3><ul>{result.open_questions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}
   {proposed.length>0?<><div className="meetingSelectBar">
    <button type="button" disabled={working} onClick={()=>setSelected(proposed.filter(s=>!saved.includes(s.id)).map(s=>s.id))}>Select all unsaved proposals</button>
    <button type="button" disabled={working} onClick={()=>setSelected([])}>Clear selection</button>
    <strong>{pendingCount} selected</strong>
   </div>
   <div className="meetingSuggestionList">{proposed.map(s=>{
    const draft=drafts[s.id];
    const accepted=saved.includes(s.id);
    const existingTask=s.kind==="update_task"?tasks.find(task=>task.id===s.existing_id):null;
    if(!draft)return null;
    return <article className={"meetingSuggestion "+(accepted?"meetingAccepted":"")} key={s.id}>
     <div className="meetingSuggestionHead"><label><input type="checkbox" disabled={working||accepted} checked={accepted||selected.includes(s.id)}
      onChange={e=>setSelected(current=>e.target.checked?[...new Set([...current,s.id])]:current.filter(id=>id!==s.id))}/>
      <strong>{s.kind==="create_task"?"New task":s.kind==="update_task"?"Update existing task":s.kind==="create_project"?"New project":"New goal"}</strong></label><small>{accepted?"Saved":s.confidence>=0.8?"Suggested":"Verify details"}</small>
     </div>
     {existingTask&&<p className="muted">Existing task: <strong>{existingTask.title}</strong> · Current owner: {nameFor(members,existingTask.owner_id)}</p>}
     <div className="meetingEditGrid">
      <div className="span2"><label htmlFor={"ms-title-"+s.id}>Title</label><input id={"ms-title-"+s.id} required minLength={2} maxLength={180} disabled={working||accepted} value={draft.title}
        onChange={e=>draftChange(s.id,{title:e.target.value})}/></div>
      <div className="span2"><label htmlFor={"ms-description-"+s.id}>Description / context</label><textarea id={"ms-description-"+s.id} rows={3} maxLength={3500} disabled={working||accepted} value={draft.description} onChange={e=>draftChange(s.id,{description:e.target.value})}/></div>
      {(s.kind==="create_task"||s.kind==="update_task")&&<>
       <div><label htmlFor={"ms-due-"+s.id}>Due date</label><input id={"ms-due-"+s.id} type="date" disabled={working||accepted} value={draft.due_date} onChange={e=>draftChange(s.id,{due_date:e.target.value})}/></div>
       <div><label htmlFor={"ms-priority-"+s.id}>Priority</label><select id={"ms-priority-"+s.id} disabled={working||accepted} value={draft.priority} onChange={e=>draftChange(s.id,{priority:e.target.value as MeetingPriority})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
       <div><label htmlFor={"ms-owner-"+s.id}>Assign to</label><select id={"ms-owner-"+s.id} disabled={working||accepted} value={draft.owner_id} onChange={e=>draftChange(s.id,{owner_id:e.target.value})}><option value="">Unassigned</option>{writableMembers.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></div>
       <div><label htmlFor={"ms-project-"+s.id}>Project</label><select id={"ms-project-"+s.id} disabled={working||accepted} value={draft.project_id} onChange={e=>draftChange(s.id,{project_id:e.target.value})}><option value="">No project</option>{activeProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      </>}
      {s.kind==="create_goal"&&<div><label htmlFor={"ms-goal-"+s.id}>Target date</label><input id={"ms-goal-"+s.id} type="date" disabled={working||accepted} value={draft.due_date} onChange={e=>draftChange(s.id,{due_date:e.target.value})}/></div>}
     </div>
     {s.evidence&&<blockquote className="meetingEvidence">From notes: “{s.evidence}”</blockquote>}
     {s.reason&&<p className="muted meetingWhy">{s.reason}</p>}
    </article>})}</div>
   <div className="meetingSaveBar"><p className="muted">Only selected suggestions will be saved. Existing tasks and projects won't be duplicated automatically.</p><button className="primary" disabled={working||pendingCount===0} onClick={()=>void saveSelected()}>{working?"Saving selected updates…":"Approve & save "+pendingCount+" selected"}</button></div>
   </>:<p className="muted">No new or changed work was confidently identified. Review the matching records below, or clarify the notes and analyze again.</p>}
   {matching.length>0&&<details className="meetingExisting"><summary>Already tracked in Trackwise ({matching.length})</summary>{matching.map(s=><div className="meetingMatch" key={s.id}><strong>{s.title}</strong><span>{s.matched_type??"Item"} already exists</span>{s.evidence&&<small>From notes: “{s.evidence}”</small>}</div>)}</details>}
  </section>}
 </div>;
}
