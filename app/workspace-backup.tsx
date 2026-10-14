"use client";

import {useEffect,useState} from "react";
import {supabase as makeClient} from "../lib/supabase";
import {decryptWorkspaceData,encryptWorkspaceData} from "../lib/archive-crypto";

/**
 * Client-side, encrypted Trackwise workspace export.
 * This is a portable organization-data snapshot, NOT a PostgreSQL pg_dump.
 * Never claims to include auth.users identities or other users' private notifications.
 */
type Props={organizationId:string;organizationName:string;userId:string};
type TableRow=Record<string,unknown>;
type StorageFile={path:string;mimeType:string;contentsBase64:string;size:number};
const TABLES=[
 "tw_activity","tw_budget_items","tw_goals","tw_invitations","tw_memberships",
 "tw_messages","tw_notifications","tw_organizations","tw_projects","tw_recurring_tasks",
 "tw_requests","tw_task_attachments","tw_task_checklist","tw_task_comments",
 "tw_task_dependencies","tw_task_handovers","tw_task_updates","tw_tasks","tw_teams","tw_team_members"
] as const;
const BATCH_SIZE=250;
const MAX_ARCHIVE_BYTES=40*1024*1024;
const MAX_FILE_BYTES=10*1024*1024;
function base64(bytes:Uint8Array){
 let string="";
 for(let i=0;i<bytes.length;i+=16384)string+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(string);
}
function errorMessage(e:unknown){
 if(e instanceof Error)return e.message;
 if(e&&typeof e==="object"&&"message" in e)return String(e.message);
 return "Unable to create your backup. Please try again.";
}
function safeDate(){return new Date().toISOString().slice(0,10)}
function saveToDevice(file:File){
 const url=URL.createObjectURL(file);
 const anchor=document.createElement("a");
 anchor.href=url;
 anchor.download=file.name;
 document.body.appendChild(anchor);
 anchor.click();
 anchor.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export default function WorkspaceBackup({organizationId,organizationName,userId}:Props){
 const [passphrase,setPassphrase]=useState("");
 const [confirm,setConfirm]=useState("");
 const [archive,setArchive]=useState<File|null>(null);
 const [creating,setCreating]=useState(false);
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [verifyFile,setVerifyFile]=useState<File|null>(null);
 const [verifyPassword,setVerifyPassword]=useState("");
 const [verifying,setVerifying]=useState(false);
 const [verified,setVerified]=useState("");

 useEffect(()=>{
  setArchive(null);setPassphrase("");setConfirm("");setProgress("");
  setError("");setNotice("");setVerified("");
 },[organizationId]);

 async function exportNow(){
  if(creating)return;
  if(passphrase.length<16){setError("Use a private passphrase of at least 16 characters.");return}
  if(passphrase!==confirm){setError("The two passphrases don't match.");return}
  setCreating(true);setError("");setNotice("");setArchive(null);
  const db=makeClient();
  async function fetchTable(table:string):Promise<TableRow[]>{
   const all:TableRow[]=[];
   if(table==="tw_team_members")throw new Error("Team memberships require a team-specific query.");
   for(let offset=0;;offset+=BATCH_SIZE){
    let query=db.from(table).select("*");
    if(table==="tw_organizations")query=query.eq("id",organizationId);
    else query=query.eq("organization_id",organizationId);
    if(table==="tw_notifications")query=query.eq("user_id",userId);
    const {data,error:queryError}=await query.order("id",{ascending:true}).range(offset,offset+BATCH_SIZE-1);
    if(queryError)throw new Error("Couldn't read "+table+": "+queryError.message);
    const batch=(data??[]) as TableRow[];
    all.push(...batch);
    if(batch.length<BATCH_SIZE)break;
    if(all.length>25000)throw new Error("This workspace exceeds the mobile export limit. Use the full database backup script instead.");
   }
   return all;
  }
  try{
   const tables:Record<string,TableRow[]>={};
   for(const table of TABLES){
    setProgress("Collecting "+table.replace("tw_","").replaceAll("_"," ")+"…");
    if(table==="tw_team_members"){
     const ids=(tables.tw_teams??[]).map(row=>row.id).filter((id):id is string=>typeof id==="string");
     const teamRows:TableRow[]=[];
     for(let start=0;start<ids.length;start+=50){
      const slice=ids.slice(start,start+50);
      for(let offset=0;;offset+=BATCH_SIZE){
       const {data,error:teamError}=await db.from("tw_team_members").select("*")
        .in("team_id",slice).order("team_id",{ascending:true}).order("user_id",{ascending:true})
        .range(offset,offset+BATCH_SIZE-1);
       if(teamError)throw new Error("Couldn't read team memberships: "+teamError.message);
       const batch=(data??[]) as TableRow[];
       teamRows.push(...batch);
       if(batch.length<BATCH_SIZE)break;
      }
     }
     tables[table]=teamRows;
    }else tables[table]=await fetchTable(table);
   }
   if(tables.tw_organizations.length!==1){
    throw new Error("The organization couldn't be read completely. Check your administrator role and retry.");
   }
   const uploaded:StorageFile[]=[];
   const attachments=tables.tw_task_attachments??[];
   let totalFilesSize=0;
   for(let index=0;index<attachments.length;index++){
    const entry=attachments[index];
    const path=entry.storage_path;
    if(typeof path!=="string"||!path)throw new Error("An attachment has no valid storage path. The backup was not created.");
    setProgress("Including private attachment "+(index+1)+" of "+attachments.length+"…");
    const {data:file,error:fileError}=await db.storage.from("trackwise-task-files").download(path);
    if(fileError||!file)throw new Error("Couldn't download a private attachment for backup: "+(fileError?.message??path));
    if(file.size>MAX_FILE_BYTES)throw new Error("An attachment exceeds the 10 MB mobile export limit.");
    totalFilesSize+=file.size;
    if(totalFilesSize>MAX_ARCHIVE_BYTES/2)throw new Error("Attachments exceed the 20 MB mobile export limit. Use the database backup procedure on a computer.");
    uploaded.push({
     path,mimeType:file.type||"application/octet-stream",size:file.size,
     contentsBase64:base64(new Uint8Array(await file.arrayBuffer()))
    });
   }
   const timestamp=new Date().toISOString();
   const payload={
    format:"trackwise-workspace-data-v1",
    exportedAt:timestamp,
    organizationId,organizationName,
    tableRows:tables,
    storageFiles:uploaded,
    limitations:[
     "Organization-level data only, as visible to this authenticated administrator",
     "Does not include Supabase Auth password hashes, login identities, or provider credentials",
     "Includes only this user's notifications, not other members' private notifications",
     "Does not include the PostgreSQL schema, server-side functions or scheduled jobs",
     "A full disaster recovery backup requires the separate Supabase CLI pg_dump process"
    ]
   };
   setProgress("Encrypting locally with AES-256-GCM…");
   const length=new TextEncoder().encode(JSON.stringify(payload)).byteLength;
   if(length>MAX_ARCHIVE_BYTES)throw new Error("The workspace archive exceeds 40 MB. Use the computer backup procedure.");
   const sealed=await encryptWorkspaceData(payload,passphrase);
   const file=new File([JSON.stringify(sealed)],"trackwise-"+safeDate()+".twbackup",{type:"application/json"});
   setArchive(file);setPassphrase("");setConfirm("");
   setProgress("");setNotice("Encrypted archive created on this device. Save the same file to your downloads and to Google Drive.");
  }catch(e){
   setError(errorMessage(e));setProgress("");
  }finally{setCreating(false)}
 }
 async function shareArchive(){
  if(!archive)return;
  try{
   if(navigator.share&&navigator.canShare?.({files:[archive]})){
    await navigator.share({title:"Encrypted Trackwise backup",text:"My encrypted Trackwise workspace backup. Store it securely.",files:[archive]});
    setNotice("Sharing opened. Choose Drive in the share sheet and confirm the file was saved.");
   }else{
    saveToDevice(archive);
    setNotice("File downloaded. Open Google Drive, tap + New → Upload, and select "+archive.name+".");
   }
  }catch(e){
   if(e instanceof Error&&e.name==="AbortError")return;
   setError("Sharing wasn't completed. Download the file and upload it in Google Drive.");
  }
 }
 async function checkBackup(){
  if(!verifyFile){setError("Choose an encrypted .twbackup file to verify.");return}
  if(!verifyPassword){setError("Enter the backup's passphrase to verify it.");return}
  setVerifying(true);setError("");setVerified("");
  try{
   if(verifyFile.size>80*1024*1024)throw new Error("This file is too large to verify on a mobile device.");
   const sealed:unknown=JSON.parse(await verifyFile.text());
   const data=await decryptWorkspaceData(sealed,verifyPassword);
   if(!data||typeof data!=="object")throw new Error("Backup contents were not recognized.");
   const record=data as {format?:string;organizationName?:string;exportedAt?:string;tableRows?:Record<string,unknown[]>;storageFiles?:unknown[]};
   if(record.format!=="trackwise-workspace-data-v1"||!record.tableRows||!Array.isArray(record.storageFiles))
    throw new Error("The decrypted file is not a Trackwise workspace archive.");
   const count=Object.values(record.tableRows).reduce((sum,rows)=>sum+(Array.isArray(rows)?rows.length:0),0);
   setVerified("Verified successfully: "+(record.organizationName??"Trackwise workspace")+", "+count+" saved database rows and "+record.storageFiles.length+" attached files. Created "+(record.exportedAt??"unknown date")+".");
   setVerifyPassword("");
  }catch(e){setError(errorMessage(e))}
  finally{setVerifying(false)}
 }
 return <section className="card workspaceBackup" aria-labelledby="workspaceBackupTitle">
  <div className="sectionHead"><div><span className="eyebrow blue">DATA PROTECTION</span><h2 id="workspaceBackupTitle">Encrypted workspace backup</h2></div><span className="chip">Administrator only</span></div>
  <p>Save a password-encrypted copy of your organization data and its linked uploaded files. Encryption happens in your browser; your passphrase is not sent to Trackwise or Supabase.</p>
  <p className="muted">This is a <strong>workspace-data archive, not a complete PostgreSQL disaster-recovery backup.</strong> Account sign-in credentials, other users' private notifications, and database functions are not included. Use the separate full database backup procedure for complete recovery.</p>
  <div className="backupCreateForm">
   <div><label htmlFor="archivePassphrase">Private backup passphrase (minimum 16 characters)</label><input id="archivePassphrase" type="password" autoComplete="new-password" minLength={16} value={passphrase} onChange={e=>{setPassphrase(e.target.value);setArchive(null)}} placeholder="Choose a memorable, long passphrase"/></div>
   <div><label htmlFor="archiveConfirm">Confirm passphrase</label><input id="archiveConfirm" type="password" autoComplete="new-password" minLength={16} value={confirm} onChange={e=>{setConfirm(e.target.value);setArchive(null)}} placeholder="Enter the passphrase again"/></div>
   <p className="muted">Keep the passphrase somewhere separate from both backup copies. There is no password reset for an encrypted backup. Don't send your passphrase in chat.</p>
   <button type="button" className="primary" disabled={creating||passphrase.length<16||passphrase!==confirm} onClick={()=>void exportNow()}>{creating?"Preparing encrypted backup…":"1. Create encrypted backup"}</button>
  </div>
  {progress&&<p role="status" className="backupProgress">{progress}</p>}
  {archive&&<div className="backupSavedActions">
   <strong>Archive ready: {archive.name}</strong>
   <p className="muted">Save both copies of this same encrypted file. Don't share your passphrase along with it.</p>
   <div className="backupButtons"><button type="button" className="primary" onClick={()=>{saveToDevice(archive);setNotice("Encrypted backup downloaded. Check your device's Downloads folder.")}}>2. Save on my device ↓</button><button type="button" onClick={()=>void shareArchive()}>3. Share to Google Drive ↗</button></div>
  </div>}
  <details className="backupVerify"><summary>Verify an encrypted backup</summary>
   <p className="muted">Choose the saved file and enter your backup passphrase. Trackwise checks the file on this device without uploading it.</p>
   <label htmlFor="backupVerifyFile">Encrypted backup file (.twbackup)</label><input id="backupVerifyFile" type="file" accept=".twbackup,application/json" onChange={e=>{setVerifyFile(e.target.files?.[0]??null);setVerified("")}}/>
   <label htmlFor="backupVerifyPassphrase">Backup passphrase</label><input id="backupVerifyPassphrase" type="password" value={verifyPassword} onChange={e=>setVerifyPassword(e.target.value)} autoComplete="off"/>
   <button type="button" disabled={verifying||!verifyFile||!verifyPassword} onClick={()=>void checkBackup()}>{verifying?"Checking…":"Verify backup locally"}</button>
  </details>
  {notice&&<p role="status" className="success">{notice}</p>}
  {verified&&<p role="status" className="success">{verified}</p>}
  {error&&<p role="alert" className="error">{error}</p>}
  <p className="muted backupNote">For a complete Supabase restoration backup, use the <a href="https://github.com/terrietanathoms43-dev/Tracker-/blob/main/docs/PRODUCTION_RUNBOOK.md" target="_blank" rel="noopener noreferrer">Trackwise backup and recovery guide ↗</a> on a trusted computer.</p>
 </section>;
}
