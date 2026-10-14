"use client";

import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {supabase as makeClient} from "../lib/supabase";

const db=makeClient();
const BUCKET="trackwise-task-files";
const MAX_SIZE=10*1024*1024;
const ALLOWED=new Set([
 "image/jpeg","image/png","image/webp","application/pdf","text/plain",
 "application/msword","application/vnd.ms-excel",
 "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
type Member={user_id:string;display_name:string};
type Comment={id:string;body:string;author_id:string;created_at:string};
type Attachment={id:string;file_name:string;storage_path:string;file_size:number;mime_type:string;uploaded_by:string;created_at:string};
type Props={organizationId:string;taskId:string;userId:string;manager:boolean;canComment:boolean;directory:Member[]};

export default function TaskExtras({organizationId,taskId,userId,manager,canComment,directory}:Props){
 const [comments,setComments]=useState<Comment[]>([]);
 const [files,setFiles]=useState<Attachment[]>([]);
 const [commentText,setCommentText]=useState("");
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const fileInput=useRef<HTMLInputElement>(null);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const [c,f]=await Promise.all([
    db.from("tw_task_comments").select("id,body,author_id,created_at").eq("organization_id",organizationId).eq("task_id",taskId).order("created_at",{ascending:false}).limit(100),
    db.from("tw_task_attachments").select("id,file_name,storage_path,file_size,mime_type,uploaded_by,created_at").eq("organization_id",organizationId).eq("task_id",taskId).order("created_at",{ascending:false}).limit(100)
   ]);
   if(c.error)throw c.error;
   if(f.error)throw f.error;
   setComments((c.data??[]).reverse());
   setFiles(f.data??[]);
  }catch(e){setError(e instanceof Error?e.message:"Could not load task conversations and attachments");}
  finally{setLoading(false);}
 },[organizationId,taskId]);
 useEffect(()=>{void refresh()},[refresh]);
 const author=(id:string)=>id===userId?"You":directory.find(m=>m.user_id===id)?.display_name??"Team member";
 async function submitComment(event:FormEvent){
  event.preventDefault();
  if(!canComment||!commentText.trim()||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await db.from("tw_task_comments").insert({organization_id:organizationId,task_id:taskId,author_id:userId,body:commentText.trim()});
   if(error)throw error;
   setCommentText("");
   await refresh();setNotice("Comment posted.");
  }catch(e){setError(e instanceof Error?e.message:"Could not post comment");}
  finally{setBusy(false)}
 }
 async function deleteComment(id:string){
  if(!window.confirm("Remove this comment?"))return;
  setBusy(true);setError("");
  try{
   const {error}=await db.from("tw_task_comments").delete().eq("id",id).eq("task_id",taskId);
   if(error)throw error;
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Could not delete comment");}
  finally{setBusy(false)}
 }
 async function uploadFile(event:FormEvent){
  event.preventDefault();
  if(!canComment||!file||busy)return;
  if(file.size<1||file.size>MAX_SIZE){setError("Choose a file smaller than 10 MB.");return}
  if(!ALLOWED.has(file.type)){setError("Choose a PDF, photo, text, Word, Excel, or PowerPoint file.");return}
  setBusy(true);setError("");setNotice("");
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"attachment";
  const path=organizationId+"/"+taskId+"/"+crypto.randomUUID()+"-"+safeName;
  let uploaded=false;
  try{
   const {error:uploadError}=await db.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type});
   if(uploadError)throw uploadError;
   uploaded=true;
   const {error:saveError}=await db.from("tw_task_attachments").insert({
    organization_id:organizationId,task_id:taskId,uploaded_by:userId,
    file_name:file.name.slice(0,180),storage_path:path,mime_type:file.type,file_size:file.size
   });
   if(saveError)throw saveError;
   setFile(null);if(fileInput.current)fileInput.current.value="";
   await refresh();setNotice("File attached securely.");
  }catch(e){
   if(uploaded)await db.storage.from(BUCKET).remove([path]);
   setError(e instanceof Error?e.message:"Could not attach the file");
  }finally{setBusy(false)}
 }
 async function openFile(item:Attachment){
  setError("");
  const {data,error}=await db.storage.from(BUCKET).createSignedUrl(item.storage_path,60);
  if(error||!data?.signedUrl){setError(error?.message??"Could not open the file");return}
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 }
 async function removeFile(item:Attachment){
  if(!window.confirm("Remove this attachment for everyone?"))return;
  setBusy(true);setError("");
  try{
   const {error:removeError}=await db.storage.from(BUCKET).remove([item.storage_path]);
   if(removeError)throw removeError;
   const {error}=await db.from("tw_task_attachments").delete().eq("id",item.id).eq("task_id",taskId);
   if(error)throw error;
   await refresh();setNotice("Attachment removed.");
  }catch(e){setError(e instanceof Error?e.message:"Could not remove attachment");}
  finally{setBusy(false)}
 }
 return <div className="taskExtras">
  {error&&<p className="feedback bad" role="alert">{error}</p>}
  {notice&&<p className="feedback good" role="status">{notice}</p>}
  <section className="taskExtraSection" aria-label="Task discussion">
   <div className="sectionHead"><h3>Discussion <span className="count">{comments.length}</span></h3><button type="button" className="textAction" disabled={loading} onClick={()=>void refresh()}>↻ Refresh</button></div>
   <p className="muted">Keep questions and updates together with the task.</p>
   {loading?<p className="muted">Loading discussion…</p>:comments.length?
    <div className="taskCommentFeed">{comments.map(c=><article className="taskComment" key={c.id}>
     <div className="commentTop"><strong>{author(c.author_id)}</strong><small>{new Date(c.created_at).toLocaleString()}</small></div>
     <p>{c.body}</p>
     {(manager||c.author_id===userId)&&<button type="button" className="textAction" disabled={busy} onClick={()=>void deleteComment(c.id)}>Remove</button>}
    </article>)}</div>:
    <p className="muted">No comments yet. Start the conversation below.</p>}
   {canComment?<form className="taskCommentForm" onSubmit={submitComment}>
    <label htmlFor="taskComment">Add a comment</label>
    <textarea id="taskComment" rows={3} maxLength={3000} required value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Ask a question or share an update…"/>
    <button className="primary" type="submit" disabled={busy||!commentText.trim()}>{busy?"Working…":"Post comment"}</button>
   </form>:<p className="muted">Your role allows you to read the discussion.</p>}
  </section>
  <section className="taskExtraSection" aria-label="Task files">
   <div className="sectionHead"><h3>Attachments <span className="count">{files.length}</span></h3></div>
   <p className="muted">Share files with your organization. Only organization members can open them.</p>
   {loading?<p className="muted">Loading attachments…</p>:files.length?
    <div className="taskFileList">{files.map(item=><div key={item.id} className="taskFileRow">
     <div><strong>{item.file_name}</strong><small>{(item.file_size/1024/1024).toFixed(2)} MB · {author(item.uploaded_by)} · {new Date(item.created_at).toLocaleDateString()}</small></div>
     <div className="fileActions"><button type="button" disabled={busy} onClick={()=>void openFile(item)}>Open ↗</button>
     {(manager||item.uploaded_by===userId)&&<button type="button" disabled={busy} onClick={()=>void removeFile(item)}>Remove</button>}</div>
    </div>)}</div>:
    <p className="muted">No files attached yet.</p>}
   {canComment&&<form className="taskUploadForm" onSubmit={uploadFile}>
    <label htmlFor="taskAttachment">Attach a file (10 MB maximum)</label>
    <input ref={fileInput} id="taskAttachment" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx,.pptx" onChange={e=>setFile(e.target.files?.[0]??null)}/>
    <small className="muted">PDFs, images, text documents, Word, Excel, or PowerPoint.</small>
    <button type="submit" className="primary" disabled={busy||!file}>{busy?"Uploading…":"Attach file"}</button>
   </form>}
  </section>
 </div>
}
