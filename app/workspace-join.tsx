"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowRight,ShieldCheck,UsersRound,X} from "lucide-react";
import {supabase} from "../lib/supabase";
type Preview={organization_name:string;role:string;expires_at:string};
type Props={token:string;onClose:()=>void;onJoined:(organizationId:string)=>Promise<void>};
export default function WorkspaceJoin({token,onClose,onJoined}:Props){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [loading,setLoading]=useState(true),[joining,setJoining]=useState(false);
 const [error,setError]=useState("");
 const dialog=useRef<HTMLElement>(null);
 const close=useRef(onClose);
 useEffect(()=>{close.current=onClose},[onClose]);
 useEffect(()=>{
  let active=true;
  setLoading(true);setPreview(null);setError("");
  void supabase().rpc("tw_preview_join_link",{join_token:token}).then(({data,error})=>{
   if(!active)return;
   if(error)setError(error.message);
   else if(data&&typeof data==="object")setPreview(data as Preview);
   else setError("This invitation could not be found.");
   setLoading(false);
  }).catch(()=>{if(active){setError("Unable to load this invitation. Try again.");setLoading(false)}});
  return()=>{active=false};
 },[token]);
 useEffect(()=>{
  const prior=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const before=document.body.style.overflow;
  document.body.style.overflow="hidden";dialog.current?.focus();
  function handle(event:KeyboardEvent){
   if(event.key==="Escape"&&!joining){event.preventDefault();close.current()}
   if(event.key!=="Tab"||!dialog.current)return;
   const els=Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled])")).filter(el=>el.getClientRects().length>0);
   if(!els.length)return;
   if(event.shiftKey&&(document.activeElement===els[0]||document.activeElement===dialog.current)){event.preventDefault();els[els.length-1].focus()}
   if(!event.shiftKey&&document.activeElement===els[els.length-1]){event.preventDefault();els[0].focus()}
  }
  window.addEventListener("keydown",handle);
  return()=>{document.body.style.overflow=before;window.removeEventListener("keydown",handle);prior?.focus()};
 },[joining]);
 async function join(){
  if(joining||!preview)return;
  setJoining(true);setError("");
  try{
   const {data,error}=await supabase().rpc("tw_accept_join_link",{join_token:token});
   if(error)throw error;
   if(typeof data!=="string")throw new Error("Unable to confirm your membership.");
   await onJoined(data);
  }catch(e){setError(e instanceof Error?e.message:"Couldn't join this workspace. Ask for a fresh link.")}
  finally{setJoining(false)}
 }
 return <div className="twJoinOverlay" onPointerDown={e=>{if(e.target===e.currentTarget&&!joining)onClose()}}>
  <section className="twJoinDialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="twJoinTitle">
   <button className="twJoinClose" type="button" onClick={onClose} disabled={joining} aria-label="Close invitation"><X size={20}/></button>
   <span className="twJoinMark"><UsersRound size={27}/></span><span className="eyebrow blue">YOU'RE INVITED</span>
   <h2 id="twJoinTitle">{loading?"Opening your invitation…":preview?"Join "+preview.organization_name:"Invitation unavailable"}</h2>
   {preview?<><p>You have been invited to join this Trackwise workspace as a <strong>{preview.role}</strong>. You don't need to enter an email address to join.</p><p className="twJoinHint"><ShieldCheck size={16}/> By joining, members of this workspace can see your display name and collaborate with you.</p><button className="primary twJoinAccept" type="button" disabled={joining} onClick={()=>void join()}>{joining?"Joining…":"Join workspace"} <ArrowRight size={18}/></button></>:<p className="muted">{loading?"Please wait.":"Ask the workspace owner for a fresh invitation link."}</p>}
   {error&&<p className="feedback bad" role="alert">{error}</p>}
   <button type="button" className="twJoinCancel" onClick={onClose} disabled={joining}>Not now</button>
  </section>
 </div>;
}
