"use client";
import {useCallback,useEffect,useState} from "react";
import {Copy,Link2,Share2,ShieldCheck,UserPlus,X} from "lucide-react";
import {supabase} from "../lib/supabase";

type LinkRow={id:string;role:string;created_at:string;expires_at:string;used_count:number;max_uses:number;revoked_at:string|null};
type Props={organizationId:string;organizationName:string};
const label=(role:string)=>role.charAt(0).toUpperCase()+role.slice(1);
export default function InviteLinks({organizationId,organizationName}:Props){
 const [role,setRole]=useState("member");
 const [records,setRecords]=useState<LinkRow[]>([]);
 const [token,setToken]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const {data,error}=await supabase().rpc("tw_list_join_links",{org_id:organizationId});
   if(error)throw error;
   setRecords((data??[]) as LinkRow[]);
  }catch(e){setError(e instanceof Error?e.message:"Could not load invitation links")}
  finally{setLoading(false)}
 },[organizationId]);
 useEffect(()=>{setToken("");setError("");setNotice("");void load()},[load]);
 const url=typeof window!=="undefined"&&token?window.location.origin+"/?join="+encodeURIComponent(token):"";
 async function create(){
  if(busy)return;
  setBusy(true);setError("");setNotice("");setToken("");
  try{
   const {data,error}=await supabase().rpc("tw_create_join_link",{org_id:organizationId,join_role:role});
   if(error)throw error;
   if(typeof data!=="string"||!data)throw new Error("The invite link could not be created");
   setToken(data);
   setNotice("Link ready! Copy it or share it directly. It works for up to 25 people for 14 days.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Could not create invite link")}
  finally{setBusy(false)}
 }
 async function copy(){
  try{await navigator.clipboard.writeText(url);setNotice("Invitation link copied. Send it to anyone you want to invite.")}
  catch{setError("Copy was blocked. Select and copy the link in the box instead.")}
 }
 async function share(){
  if(!url)return;
  const text="Join "+organizationName+" on Trackwise. Open this link, sign in or create your account, and tap Join workspace.";
  if(navigator.share){
   try{await navigator.share({title:"Join "+organizationName+" on Trackwise",text,url})}
   catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setError("Sharing could not open. Copy the link instead.")}
  }else window.open("https://wa.me/?text="+encodeURIComponent(text+" "+url),"_blank","noopener,noreferrer");
 }
 async function revoke(id:string){
  if(busy||!window.confirm("Turn off this invitation link? Anyone who has not joined with it will no longer be able to use it."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await supabase().rpc("tw_revoke_join_link",{link_id:id});
   if(error)throw error;
   setToken("");setNotice("Link deactivated. Existing members keep their access.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Could not disable the link")}
  finally{setBusy(false)}
 }
 return <section className="card twInviteLinks" id="inviteMembers" aria-labelledby="twInviteHeading">
  <div className="twInviteHead"><div><span className="eyebrow blue">SIMPLE SHARING</span><h2 id="twInviteHeading">Invite people with a link</h2><p className="muted">No email addresses to enter. Create a link and send it by WhatsApp, messages, or anywhere you like.</p></div><span className="twInviteIcon"><Link2 size={25}/></span></div>
  <div className="twInviteCreator"><label htmlFor="twInviteLinkRole">People joining with this link become</label><div className="twInviteInputs"><select id="twInviteLinkRole" value={role} onChange={e=>setRole(e.target.value)} disabled={busy}><option value="member">Member — can work on assigned tasks</option><option value="observer">Observer — read only</option><option value="stakeholder">Stakeholder — read only</option></select><button type="button" className="primary" disabled={busy} onClick={()=>void create()}><UserPlus size={17}/>{busy?"Working…":"Generate invite link"}</button></div></div>
  {url&&<div className="twInviteReady" role="status"><div className="twInviteReadyTitle"><ShieldCheck size={19}/><strong>Your invite link is ready</strong><button type="button" onClick={()=>setToken("")} aria-label="Hide invitation link"><X size={16}/></button></div><p>Send this to your team. Anyone with the link can join as a <strong>{label(role)}</strong> after signing in.</p><input aria-label="Shareable workspace invitation link" value={url} onFocus={e=>e.currentTarget.select()} readOnly/><div className="twInviteShareButtons"><button type="button" className="primary" onClick={()=>void copy()}><Copy size={17}/> Copy link</button><button type="button" onClick={()=>void share()}><Share2 size={17}/> Share link</button><a href={"https://wa.me/?text="+encodeURIComponent("Join "+organizationName+" on Trackwise: "+url)} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a></div></div>}
  {error&&<p role="alert" className="feedback bad">{error}</p>}{notice&&<p role="status" className="feedback good">{notice}</p>}
  <p className="twInviteSafety"><ShieldCheck size={16}/> Links expire in 14 days or after 25 successful joins. Only workspace leaders can create or deactivate them. Share with people you trust.</p>
  <details className="twInviteManage"><summary>Manage existing invite links {records.filter(r=>!r.revoked_at&&new Date(r.expires_at).getTime()>Date.now()&&r.used_count<r.max_uses).length>0?"("+records.filter(r=>!r.revoked_at&&new Date(r.expires_at).getTime()>Date.now()&&r.used_count<r.max_uses).length+" active)":""}</summary>{loading?<p className="muted">Loading links…</p>:records.length===0?<p className="muted">No invite links created yet.</p>:records.map(row=><div key={row.id} className="twInviteRecord"><div><strong>{label(row.role)} link</strong><small>{row.used_count} of {row.max_uses} joins · expires {new Date(row.expires_at).toLocaleDateString()} · {row.revoked_at?"Revoked":new Date(row.expires_at).getTime()<=Date.now()?"Expired":row.used_count>=row.max_uses?"Full":"Active"}</small></div>{!row.revoked_at&&new Date(row.expires_at).getTime()>Date.now()&&row.used_count<row.max_uses&&<button type="button" disabled={busy} onClick={()=>void revoke(row.id)}>Deactivate</button>}</div>)}</details>
 </section>;
}
