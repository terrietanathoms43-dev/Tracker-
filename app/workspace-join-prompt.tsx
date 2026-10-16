"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,UsersRound,X} from "lucide-react";
import {supabase} from "../lib/supabase";

type Props={token:string;onJoined:(organizationId:string)=>Promise<void>;onDismiss:()=>void};
type Preview={organization_name:string;invite_role:string;expires_at:string};

export default function WorkspaceJoinPrompt({token,onJoined,onDismiss}:Props){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [checking,setChecking]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  setChecking(true);setPreview(null);setError("");
  void supabase().rpc("tw_workspace_link_preview",{link_token:token})
   .then(({data,error:dbError})=>{
    if(!live)return;
    const first=Array.isArray(data)?data[0]:null;
    if(dbError||!first)setError("This invitation is unavailable or has expired. Ask your leader for a new link.");
    else setPreview(first as Preview);
    setChecking(false);
   });
  return()=>{live=false};
 },[token]);
 async function join(){
  if(!preview||busy)return;
  setBusy(true);setError("");
  try{
   const {data,error:dbError}=await supabase().rpc("tw_join_workspace_link",{link_token:token});
   if(dbError)throw dbError;
   if(typeof data!=="string")throw new Error("Could not confirm that you joined the workspace.");
   await onJoined(data);
  }catch(e){setError(e instanceof Error?e.message:"Couldn't join the workspace. Please try again.");setBusy(false)}
 }
 return <section className="card twJoinPrompt" aria-label="Workspace invitation" aria-live="polite">
  <div className="twJoinPromptHeading"><span className="twJoinPromptIcon"><UsersRound size={23}/></span>
   <div><span className="eyebrow blue">YOU'RE INVITED</span><h2>{preview?.organization_name??"Join a Trackwise workspace"}</h2>
    <p className="muted">{checking?"Checking your invitation…":preview?"This link lets you join as a "+preview.invite_role+". Your tasks and team will appear here once you join.":"This join link can't be used right now."}</p></div>
   <button type="button" onClick={onDismiss} className="twJoinDismiss" aria-label="Dismiss workspace invitation"><X size={18}/></button>
  </div>
  {preview&&<div className="twJoinPromptActions"><button type="button" className="primary" disabled={busy} onClick={()=>void join()}><CheckCircle2 size={18}/>{busy?"Joining…":"Join workspace"}</button><small>Invitation expires {new Date(preview.expires_at).toLocaleDateString()}</small></div>}
  {error&&<p role="alert" className="feedback bad">{error}</p>}
 </section>;
}
