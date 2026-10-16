"use client";
import {useCallback,useEffect,useState} from "react";
import {Copy,Link2,Plus,Share2,Trash2} from "lucide-react";
import {supabase} from "../lib/supabase";

type JoinLink={
 id:string;token:string;role:string;created_at:string;expires_at:string;
 max_uses:number;used_count:number;revoked_at:string|null;
};
type Props={organizationId:string;organizationName:string};
const publicUrl=(token:string)=>typeof window==="undefined"?"":window.location.origin+"/?join="+encodeURIComponent(token);
const active=(link:JoinLink)=>!link.revoked_at&&new Date(link.expires_at).getTime()>Date.now()&&link.used_count<link.max_uses;

export default function WorkspaceInviteLinks({organizationId,organizationName}:Props){
 const [links,setLinks]=useState<JoinLink[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [chosen,setChosen]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  const db=supabase();
  const {data,error:loadError}=await db.from("tw_workspace_invite_links")
   .select("id,token,role,created_at,expires_at,max_uses,used_count,revoked_at")
   .eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(40);
  if(loadError)throw loadError;
  setLinks(data??[]);
 },[organizationId]);
 useEffect(()=>{
  let live=true;
  setLinks([]);setChosen("");setError("");setNotice("");setLoading(true);
  const db=supabase();
  void db.from("tw_workspace_invite_links")
   .select("id,token,role,created_at,expires_at,max_uses,used_count,revoked_at")
   .eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(40)
   .then(({data,error:loadError})=>{
    if(!live)return;
    if(loadError)setError("Join links are not available yet. Check that the latest Supabase migration has been applied.");
    else setLinks(data??[]);
    setLoading(false);
   });
  return()=>{live=false};
 },[organizationId]);
 async function create(){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data,error:dbError}=await supabase().rpc("tw_create_workspace_link",{org_id:organizationId});
   if(dbError)throw dbError;
   if(typeof data!=="string")throw new Error("Could not create a join link.");
   await refresh();setChosen(data);setNotice("Join link created. Share it with your teammates.");
  }catch(e){setError(e instanceof Error?e.message:"Could not create a join link.")}
  finally{setBusy(false)}
 }
 async function copy(token:string){
  try{await navigator.clipboard.writeText(publicUrl(token));setNotice("Join link copied. You can paste it into WhatsApp or any chat.");setError("")}
  catch{setError("Automatic copying is unavailable. Select the link above to copy it.")}
 }
 async function share(token:string){
  const url=publicUrl(token),message="Join "+organizationName+" on Trackwise. Open this link and sign in or create an account to join.";
  if(navigator.share){
   try{await navigator.share({title:organizationName+" · Trackwise invitation",text:message,url})}
   catch(e){if(!(e instanceof Error)||e.name!=="AbortError")setError("Sharing failed. Try copying the link.")}
  }else{window.open("https://wa.me/?text="+encodeURIComponent(message+" "+url),"_blank","noopener,noreferrer")}
 }
 async function revoke(id:string){
  if(busy||!window.confirm("Deactivate this link? It will stop admitting new people. Existing members will keep access."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error:rpcError}=await supabase().rpc("tw_revoke_workspace_link",{link_id:id});
   if(rpcError)throw rpcError;
   await refresh();setChosen("");setNotice("Join link deactivated.");
  }catch(e){setError(e instanceof Error?e.message:"Could not deactivate the join link.")}
  finally{setBusy(false)}
 }
 const selected=links.find(link=>link.token===chosen);
 return <div className="twLinkInvites">
  <div className="twLinkInviteHeading"><div><span className="eyebrow blue">FASTEST WAY TO ADD PEOPLE</span>
   <h3>Invite with a link</h3><p className="muted">No email required. Share through WhatsApp, Messages, or any app. The person signs in and chooses Join.</p></div>
   <button type="button" className="primary" disabled={busy||loading} onClick={()=>void create()}><Plus size={17}/>{busy?"Please wait…":"Create join link"}</button>
  </div>
  <p className="twLinkInviteSafety">For safety, each link works for up to 25 people for 14 days. Anyone you share it with can join as a <strong>member</strong>. Deactivate links when you're finished inviting.</p>
  {error&&<p className="feedback bad" role="alert">{error}</p>}
  {notice&&<p className="feedback good" role="status">{notice}</p>}
  {selected&&active(selected)&&<div className="twLinkInviteReady">
   <label htmlFor="twLinkInviteCopy">Your shareable workspace link</label>
   <input id="twLinkInviteCopy" type="text" readOnly onFocus={e=>e.currentTarget.select()} value={publicUrl(selected.token)}/>
   <div className="twLinkInviteActions">
    <button type="button" className="primary" onClick={()=>void copy(selected.token)}><Copy size={17}/> Copy link</button>
    <button type="button" onClick={()=>void share(selected.token)}><Share2 size={17}/> Share link</button>
    <a target="_blank" rel="noopener noreferrer" href={"https://wa.me/?text="+encodeURIComponent("Join "+organizationName+" on Trackwise: "+publicUrl(selected.token))}>WhatsApp ↗</a>
   </div>
  </div>}
  <div className="twLinkInviteHistory">
   <h4>Created join links</h4>
   {loading?<p className="muted">Loading links…</p>:links.length===0?<p className="muted">No join links yet. Create one above to invite people without entering an email.</p>:
   links.map(link=><div key={link.id} className="twLinkInviteRow"><div><strong><Link2 size={15}/> {active(link)?"Active link":link.revoked_at?"Deactivated":"Expired or full"}</strong>
     <small>{link.used_count} of {link.max_uses} joins · Expires {new Date(link.expires_at).toLocaleDateString()}</small></div>
     {active(link)&&<div className="twLinkInviteRowActions"><button type="button" onClick={()=>{setChosen(link.token);setNotice("");setError("")}}>Show link</button><button type="button" disabled={busy} onClick={()=>void revoke(link.id)}><Trash2 size={14}/> Deactivate</button></div>}
   </div>)}
  </div>
 </div>;
}
