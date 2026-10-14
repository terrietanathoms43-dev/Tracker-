"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {
 ArrowLeft,ArrowRight,BookOpen,Check,ChevronDown,Compass,HelpCircle,Lightbulb,RotateCcw,
 Search,Sparkles,X,
 type LucideIcon,
 Building2,FolderKanban,UsersRound,ListTodo,LayoutDashboard,CheckCheck,MessageCircle,
 CalendarDays,ChartNoAxesCombined,PartyPopper,MessageSquareText,Inbox,FolderOpen,
 Contact,Target,Repeat2,Paperclip,MessagesSquare,Send,Bell,Wallet,History,ShieldCheck
} from "lucide-react";
import {featureGuide,progressLabel,stepsForRole,type FeatureGuide,type GuideAction,type GuideRole,type GuideView} from "../lib/experience-guide";

type Props={
 role:GuideRole;
 organizationName:string;
 progressKey:string;
 onClose:()=>void;
 onGo:(action:GuideAction,view:GuideView)=>void;
};
const ICONS:Record<string,LucideIcon>={
 "building-2":Building2,"folder-kanban":FolderKanban,
 "users":UsersRound,"users-round":UsersRound,"list-todo":ListTodo,
 "layout-dashboard":LayoutDashboard,"check-check":CheckCheck,"message-circle":MessageCircle,
 "calendar-days":CalendarDays,"chart-no-axes-combined":ChartNoAxesCombined,
 "party-popper":PartyPopper,"message-square-text":MessageSquareText,"inbox":Inbox,
 "folder-open":FolderOpen,"contact":Contact,"target":Target,"repeat-2":Repeat2,
 "paperclip":Paperclip,"messages-square":MessagesSquare,"send":Send,"bell":Bell,
 "wallet":Wallet,"history":History,"shield-check":ShieldCheck,"sparkles":Sparkles
};
const GROUPS:FeatureGuide["group"][]=["Getting started","Organize","Collaborate","Monitor","Advanced"];
export default function OnboardingTour({role,organizationName,progressKey,onClose,onGo}:Props){
 const steps=useMemo(()=>stepsForRole(role),[role]);
 const [tab,setTab]=useState<"tour"|"features">("tour");
 const [index,setIndex]=useState(0);
 const [search,setSearch]=useState("");
 const [expanded,setExpanded]=useState<string>("organizations");
 const headingRef=useRef<HTMLHeadingElement>(null);
 const panelRef=useRef<HTMLElement>(null);
 useEffect(()=>{
  try{
   const stored=window.localStorage.getItem(progressKey+":step");
   if(stored!==null){const parsed=Number(stored);if(Number.isInteger(parsed)&&parsed>=0&&parsed<steps.length)setIndex(parsed)}
  }catch{/* Private browsing can disable storage. */}
 },[progressKey,steps.length]);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const priorOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  headingRef.current?.focus();
  return()=>{document.body.style.overflow=priorOverflow;previous?.focus()};
 },[]);
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();onClose();return}
   if(event.key!=="Tab"||!panelRef.current)return;
   const nodes=[...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href],summary,[tabindex="0"]')].filter(el=>el.getClientRects().length>0);
   if(!nodes.length)return;
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  };
  window.addEventListener("keydown",handler);
  return()=>window.removeEventListener("keydown",handler);
 },[onClose]);
 function setStep(next:number){
  const valid=Math.min(steps.length-1,Math.max(0,next));
  setIndex(valid);
  try{window.localStorage.setItem(progressKey+":step",String(valid))}catch{/* optional */}
 }
 function startOver(){setTab("tour");setStep(0)}
 function launch(action:GuideAction,view:GuideView){
  try{window.localStorage.setItem(progressKey+":step",String(index))}catch{/* optional */}
  onGo(action,view);
 }
 const current=steps[index];
 const Icon=ICONS[current.icon]??Compass;
 const visible=featureGuide.filter(feature=>{
  if(feature.leaderOnly&&role!=="leader")return false;
  const q=search.trim().toLowerCase();
  return !q||[feature.name,feature.purpose,feature.how,feature.group].some(part=>part.toLowerCase().includes(q));
 });
 const featureGroupCount=visible.length;
 return <div className="twTourBackdrop" onPointerDown={event=>{if(event.currentTarget===event.target)onClose()}}>
  <section ref={panelRef} className="twTourPanel" role="dialog" aria-modal="true" aria-labelledby="twTourHeading" aria-describedby="twTourDescription">
   <div className="twTourTopbar">
    <div className="twTourBrand"><span className="twTourBrandMark"><Sparkles size={18}/></span><div><strong>Trackwise Guide</strong><small>Learn it once. Use it confidently.</small></div></div>
    <button type="button" className="twTourClose" onClick={onClose} aria-label="Close guide"><X size={20}/></button>
   </div>
   <div className="twTourTabs" role="tablist" aria-label="Guide sections">
    <button type="button" role="tab" aria-selected={tab==="tour"} className={tab==="tour"?"active":""} onClick={()=>setTab("tour")}><Compass size={17}/> Guided setup</button>
    <button type="button" role="tab" aria-selected={tab==="features"} className={tab==="features"?"active":""} onClick={()=>setTab("features")}><BookOpen size={17}/> All features</button>
   </div>
   {tab==="tour"?
    <div className="twTourContent">
     <div className="twTourProgressHeading"><span>{progressLabel(index,steps.length)}</span><span>{Math.round((index+1)/steps.length*100)}% explored</span></div>
     <div className="twTourProgress"><div style={{width:((index+1)/steps.length*100)+"%"}}/></div>
     <div className="twTourHero">
      <span className="twTourIcon"><Icon size={27}/></span>
      <span className="twTourKicker">{current.eyebrow}</span>
      <h2 ref={headingRef} tabIndex={-1} id="twTourHeading">{current.title}</h2>
      <p id="twTourDescription">{current.summary}</p>
      {index===0&&<p className="twTourOrg">You're exploring <strong>{organizationName}</strong></p>}
     </div>
     <div className="twTourChecklist">
      <span className="twTourChecklistTitle"><Lightbulb size={16}/> HOW TO USE IT</span>
      {current.points.map((point,i)=><div className="twTourPoint" key={i}><span>{i+1}</span><p>{point}</p></div>)}
     </div>
     <div className="twTourCallToAction">
      <button type="button" className="twTourTry" onClick={()=>launch(current.action,current.view)}>
       {current.cta} <ArrowRight size={17}/>
      </button>
      <span>Opens the real feature in your workspace.</span>
     </div>
     <div className="twTourBottom">
      <button type="button" disabled={index===0} onClick={()=>setStep(index-1)} className="twTourBack"><ArrowLeft size={16}/> Back</button>
      <div className="twTourDots" aria-label="Tour progress">
       {steps.map((item,i)=><button type="button" key={item.id} className={i===index?"current":i<index?"seen":""} aria-label={"Go to "+item.title} aria-current={i===index?"step":undefined} onClick={()=>setStep(i)}/>)}
      </div>
      {index===steps.length-1?<button type="button" className="twTourNext" onClick={onClose}><Check size={16}/> Finish</button>:
       <button type="button" className="twTourNext" onClick={()=>setStep(index+1)}>Next <ArrowRight size={16}/></button>}
     </div>
    </div>:
    <div className="twTourFeatureContent">
     <div className="twTourFeatureIntro"><div><h2 ref={headingRef} tabIndex={-1} id="twTourHeading">What can Trackwise do?</h2><p id="twTourDescription">A practical reference for every feature and why your organization might use it. Choose any item to open its workspace page.</p></div><button type="button" onClick={startOver} title="Restart guided walkthrough"><RotateCcw size={15}/> Restart tour</button></div>
     <label className="twTourSearchLabel" htmlFor="twTourSearch"><Search size={18}/><input id="twTourSearch" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find tasks, teams, reports, budgets…" aria-label="Search Trackwise features"/></label>
     <small className="twTourResultCount">{featureGroupCount} feature{featureGroupCount===1?"":"s"} available to your role</small>
     <div className="twTourFeatureGroups">{GROUPS.map(group=>{
      const features=visible.filter(f=>f.group===group);
      if(!features.length)return null;
      return <section className="twTourFeatureGroup" key={group}><h3>{group}</h3>
       {features.map(feature=>{
        const FeatureIcon=ICONS[feature.icon]??HelpCircle;
        const open=expanded===feature.id;
        return <div className="twTourFeature" key={feature.id}>
         <button type="button" className="twTourFeatureToggle" aria-expanded={open} onClick={()=>setExpanded(open?"":feature.id)}>
          <span className="twTourFeatureIcon"><FeatureIcon size={19}/></span><span><strong>{feature.name}</strong><small>{feature.purpose}</small></span><ChevronDown size={17} className={open?"twTourExpanded":""}/>
         </button>
         {open&&<div className="twTourFeatureDetails"><p>{feature.how}</p><button type="button" onClick={()=>launch("navigate",feature.view)}>Go to {feature.name} <ArrowRight size={15}/></button></div>}
        </div>
       })}
      </section>
     })}</div>
     {featureGroupCount===0&&<p className="twTourNoResults">No features match that search. Try “tasks”, “people”, or “calendar”.</p>}
     <div className="twTourFeatureFooter"><button type="button" onClick={()=>setTab("tour")}><ArrowLeft size={16}/> Back to guided setup</button><button type="button" onClick={onClose}>Close guide</button></div>
    </div>}
  </section>
 </div>;
}
