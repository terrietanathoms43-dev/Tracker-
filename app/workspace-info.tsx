"use client";
import {useEffect,useRef,useState} from "react";
import {Activity,CalendarDays,ClipboardList,Inbox,Info,UsersRound,X} from "lucide-react";

type Tab="overview"|"members"|"invitations"|"activity";
type Person={user_id:string;display_name:string;role:string};
type Invite={id:string;email:string;role:string;expires_at:string;accepted_at:string|null};
type ActivityItem={id:string;entity_type:string;action:string;created_at:string};
type Target="tasks"|"people"|"settings"|"activity"|"reports";
type Props={
 name:string;createdAt:string;role:string|null;members:Person[];invites:Invite[];activities:ActivityItem[];
 taskCount:number;projectCount:number;canManage:boolean;userId:string;onClose:()=>void;onNavigate:(view:Target)=>void;
};
const tabs:{id:Tab;title:string}[]=[
 {id:"overview",title:"Overview"},{id:"members",title:"Members"},
 {id:"invitations",title:"Invitations"},{id:"activity",title:"Activity"}
];
function title(text:string){return text.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
export default function WorkspaceInfo({name,createdAt,role,members,invites,activities,taskCount,projectCount,canManage,userId,onClose,onNavigate}:Props){
 const [tab,setTab]=useState<Tab>("overview");
 const dialogRef=useRef<HTMLElement>(null);
 const closeRef=useRef(onClose);
 useEffect(()=>{closeRef.current=onClose},[onClose]);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const originalOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  dialogRef.current?.focus();
  function onKey(event:KeyboardEvent){
   if(event.key==="Escape"){event.preventDefault();closeRef.current();return}
   if(event.key!=="Tab"||!dialogRef.current)return;
   const controls=Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]")).filter(el=>el.getClientRects().length>0);
   if(!controls.length)return;
   if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus()}
   if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus()}
  }
  window.addEventListener("keydown",onKey);
  return()=>{document.body.style.overflow=originalOverflow;window.removeEventListener("keydown",onKey);previous?.focus()};
 },[]);
 const pending=invites.filter(i=>!i.accepted_at&&new Date(i.expires_at).getTime()>Date.now());
 return <div className="twInfoOverlay" onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <section ref={dialogRef} tabIndex={-1} className="twInfoDialog" role="dialog" aria-modal="true" aria-labelledby="twInfoTitle">
   <aside className="twInfoSide"><div className="twInfoSideTitle"><strong>Workspace</strong><span>{name}</span></div>
    <nav aria-label="Workspace information sections">{tabs.map(item=><button key={item.id} type="button" className={tab===item.id?"active":""} aria-current={tab===item.id?"page":undefined} onClick={()=>setTab(item.id)}>
     {item.id==="overview"?<Info size={17}/>:item.id==="members"?<UsersRound size={17}/>:item.id==="invitations"?<Inbox size={17}/>:<Activity size={17}/>}
     {item.title}{item.id==="members"&&<span className="twInfoTabCount">{members.length}</span>}</button>)}</nav>
   </aside>
   <div className="twInfoMain">
    <header className="twInfoHeader"><div><h2 id="twInfoTitle">{tabs.find(t=>t.id===tab)?.title} · {name}</h2><p className="muted">Workspace details and quick access to your team.</p></div><button type="button" className="twInfoClose" onClick={onClose} aria-label="Close workspace information"><X size={20}/></button></header>
    <div className="twInfoContent">
    {tab==="overview"&&<><div className="twInfoIdentity"><UsersRound size={27}/><div><h3>{name}</h3><p className="muted"><CalendarDays size={14}/> Created {new Date(createdAt).toLocaleDateString()}</p></div></div>
      <div className="twInfoMetrics"><div><span>Members</span><strong>{members.length}</strong></div><div><span>Tasks</span><strong>{taskCount}</strong></div><div><span>Projects</span><strong>{projectCount}</strong></div><div><span>Your role</span><strong className="twInfoRole">{role?title(role):"Member"}</strong></div></div>
      <div className="twInfoLinks"><button type="button" onClick={()=>onNavigate("tasks")}><ClipboardList size={17}/> Open tasks →</button><button type="button" onClick={()=>onNavigate("reports")}>View detailed reports →</button></div>
     </>}
    {tab==="members"&&<><p className="muted">People who can access this workspace and their roles.</p><div className="twInfoRows">{members.length?members.map(member=><div className="twInfoMember" key={member.user_id}><span className="twInfoAvatar" aria-hidden="true">{member.display_name.slice(0,1).toUpperCase()}</span><div><strong>{member.display_name}{member.user_id===userId?" (You)":""}</strong><small>{title(member.role)}</small></div></div>):<p className="muted">No members to display yet.</p>}</div><button type="button" className="primary twInfoAction" onClick={()=>onNavigate("people")}>{canManage?"Manage people":"View people"} →</button></>}
    {tab==="invitations"&&<><p className="muted">{canManage?"Pending invitations to join this workspace.":"Workspace leaders manage invitations."}</p>{canManage&&<div className="twInfoRows">{pending.length?pending.map(inv=><div className="twInfoInvitation" key={inv.id}><strong>{inv.email}</strong><small>{title(inv.role)} · Expires {new Date(inv.expires_at).toLocaleDateString()}</small></div>):<p className="muted">No pending invitations.</p>}</div>}{canManage&&<button type="button" className="primary twInfoAction" onClick={()=>onNavigate("settings")}>Manage invitations →</button>}</>}
    {tab==="activity"&&<><p className="muted">Recent changes made by your workspace.</p><div className="twInfoRows">{activities.length?activities.slice(0,10).map(item=><div key={item.id} className="twInfoActivity"><strong>{title(item.entity_type.replace("tw_",""))} · {title(item.action)}</strong><small>{new Date(item.created_at).toLocaleString()}</small></div>):<p className="muted">Activity will appear as your team works.</p>}</div><button type="button" className="primary twInfoAction" onClick={()=>onNavigate("activity")}>View activity history →</button></>}
    </div>
   </div>
  </section>
 </div>;
}
