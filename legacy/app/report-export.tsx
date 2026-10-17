"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {BarChart3,Building2,FileSpreadsheet,FileText,Printer,UsersRound,UserRound,X} from "lucide-react";

type Task={id:string;title:string;status:string;priority:string;due_at:string|null;owner_id:string|null;project_id:string|null;created_at:string};
type Project={id:string;name:string;team_id:string|null};
type Team={id:string;name:string};
type Member={user_id:string;display_name:string};
type Scope="organization"|"team"|"individual";
type Format="pdf"|"summary"|"detailed";
type Props={tasks:Task[];projects:Project[];teams:Team[];directory:Member[];organizationName:string;complete:boolean;warning?:string;onClose:()=>void};
const MS_DAY=86400000;
const friendly=(text:string)=>text.replaceAll("_"," ").replace(/\b\w/g,s=>s.toUpperCase());
const overdue=(t:Task,now:number)=>!!t.due_at&&t.status!=="completed"&&new Date(t.due_at).getTime()<now;
const dateText=(value:string|null)=>value?new Date(value).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"Not set";
const percent=(part:number,total:number)=>total?Math.round(100*part/total):0;
const htmlEscape=(value:unknown)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
function csvFile(rows:string[][],filename:string){
 const safe=(v:string)=>{
  const value=String(v).replace(/^[\s]*[=+@-]/,"'$&");
  return '"'+value.replaceAll('"','""')+'"';
 };
 const text="\uFEFF"+rows.map(row=>row.map(safe).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export default function ReportExport({tasks,projects,teams,directory,organizationName,complete,warning,onClose}:Props){
 const [scope,setScope]=useState<Scope>("organization");
 const [teamId,setTeamId]=useState("");
 const [personId,setPersonId]=useState("");
 const [period,setPeriod]=useState("all");
 const [format,setFormat]=useState<Format>("pdf");
 const [error,setError]=useState("");
 const first=useRef<HTMLButtonElement>(null);
 const modal=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const old=document.body.style.overflow;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  document.body.style.overflow="hidden";first.current?.focus();
  const listener=(e:KeyboardEvent)=>{
   if(e.key==="Escape"){e.preventDefault();onClose()}
   if(e.key!=="Tab"||!modal.current)return;
   const focusable=Array.from(modal.current.querySelectorAll<HTMLElement>("button:not([disabled]),select:not([disabled]),input:not([disabled])")).filter(el=>el.getClientRects().length>0);
   if(!focusable.length)return;
   if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable[focusable.length-1].focus()}
   else if(!e.shiftKey&&document.activeElement===focusable[focusable.length-1]){e.preventDefault();focusable[0].focus()}
  };
  document.addEventListener("keydown",listener);
  return()=>{document.body.style.overflow=old;document.removeEventListener("keydown",listener);previous?.focus()};
 },[onClose]);
 const projectById=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects]);
 const teamById=useMemo(()=>new Map(teams.map(t=>[t.id,t])),[teams]);
 const personById=useMemo(()=>new Map(directory.map(p=>[p.user_id,p])),[directory]);
 const ready=scope==="organization"||(scope==="team"?!!teamId:!!personId);
 const scopeName=scope==="organization"?organizationName:scope==="team"?(teamById.get(teamId)?.name??"Select a team"):(personById.get(personId)?.display_name??"Select a person");
 const now=Date.now();
 const scoped=tasks.filter(t=>{
  if(scope==="team"&&(!t.project_id||projectById.get(t.project_id)?.team_id!==teamId))return false;
  if(scope==="individual"&&t.owner_id!==personId)return false;
  return period==="all"||new Date(t.created_at).getTime()>=now-Number(period)*MS_DAY;
 });
 const count=scoped.length,done=scoped.filter(t=>t.status==="completed").length;
 const late=scoped.filter(t=>overdue(t,now)).length,blocked=scoped.filter(t=>t.status==="blocked").length;
 const awaiting=scoped.filter(t=>t.status==="awaiting_approval").length;
 const inProgress=scoped.filter(t=>t.status==="underway").length;
 const attention=scoped.filter(t=>overdue(t,now)||t.status==="blocked"||t.status==="awaiting_approval")
  .sort((a,b)=>Number(overdue(b,now))-Number(overdue(a,now))||new Date(a.due_at??"9999-12-30").getTime()-new Date(b.due_at??"9999-12-30").getTime());
 const periodText=period==="all"?"All available dates":"Created within the last "+period+" days";
 const ownerName=(t:Task)=>t.owner_id?personById.get(t.owner_id)?.display_name??"Unknown member":"Unassigned";
 const projectName=(t:Task)=>t.project_id?projectById.get(t.project_id)?.name??"Unknown project":"No project";
 const teamName=(t:Task)=>{const project=t.project_id?projectById.get(t.project_id):undefined;return project?.team_id?teamById.get(project.team_id)?.name??"Unknown team":"No team"};
 const summaryGroups=()=>{
  if(scope==="individual")return projects.map(p=>({name:p.name,items:scoped.filter(t=>t.project_id===p.id)}))
   .concat([{name:"No project",items:scoped.filter(t=>!t.project_id)}]).filter(row=>row.items.length);
  if(scope==="team")return projects.filter(p=>p.team_id===teamId).map(p=>({name:p.name,items:scoped.filter(t=>t.project_id===p.id)})).filter(row=>row.items.length);
  return projects.map(p=>({name:p.name,items:scoped.filter(t=>t.project_id===p.id)}))
   .concat([{name:"No project",items:scoped.filter(t=>!t.project_id)}]).filter(row=>row.items.length);
 };
 const teamGroups=teams.map(team=>({name:team.name,items:scoped.filter(t=>t.project_id&&projectById.get(t.project_id)?.team_id===team.id)})).filter(group=>group.items.length);
 const unlinkedTeams=scoped.filter(t=>!t.project_id||!projectById.get(t.project_id)?.team_id);
 if(unlinkedTeams.length)teamGroups.push({name:"No linked team",items:unlinkedTeams});
 const peopleGroups=directory.map(person=>({name:person.display_name,items:scoped.filter(t=>t.owner_id===person.user_id)})).filter(group=>group.items.length);
 const unassignedPeople=scoped.filter(t=>!t.owner_id);
 if(unassignedPeople.length)peopleGroups.push({name:"Unassigned",items:unassignedPeople});
 const safeFileName="trackwise-"+scope+"-"+scopeName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)+"-"+new Date().toISOString().slice(0,10);
 function metaRows(){
  return [
   ["TRACKWISE | WORK REPORT"],
   ["Organization",organizationName],
   ["Report scope",scope==="organization"?"Whole organization":scope==="team"?"Selected team":"Selected individual"],
   ["Prepared for",scopeName],
   ["Task date range",periodText],
   ["Generated on",dateText(new Date().toISOString())],
   ["Source","Trackwise workspace records (only permitted data)"],
   ...(warning?[["Data availability",warning]]:[]),
   [],
   ["EXECUTIVE SUMMARY"],
   ["Measure","Value","Meaning"],
   ["Total tasks",String(count),"Tasks included in this report"],
   ["Completed",String(done),"Finished tasks"],
   ["Completion rate",percent(done,count)+"%","Completed divided by total tasks"],
   ["In progress",String(inProgress),"Tasks currently underway"],
   ["Overdue",String(late),"Unfinished tasks past their deadline"],
   ["Blocked",String(blocked),"Tasks requiring assistance"],
   ["Awaiting approval",String(awaiting),"Tasks waiting for a decision"],
   [],
  ];
 }
 function exportCsv(){
  const rows=metaRows();
  if(format==="summary"){
   rows.push(["DELIVERY BY PROJECT"],["Project","Tasks","Completed","Completion rate","Overdue","Blocked","Awaiting approval"]);
   for(const group of summaryGroups()){
    const n=group.items.length,d=group.items.filter(t=>t.status==="completed").length;
    rows.push([group.name,String(n),String(d),percent(d,n)+"%",String(group.items.filter(t=>overdue(t,now)).length),String(group.items.filter(t=>t.status==="blocked").length),String(group.items.filter(t=>t.status==="awaiting_approval").length)]);
   }
   rows.push([],["DELIVERY BY TEAM"],["Team","Tasks","Completed","Completion rate","Overdue","Blocked"]);
   for(const group of teamGroups){const total=group.items.length,completed=group.items.filter(t=>t.status==="completed").length;
    rows.push([group.name,String(total),String(completed),percent(completed,total)+"%",String(group.items.filter(t=>overdue(t,now)).length),String(group.items.filter(t=>t.status==="blocked").length)]);
   }
   rows.push([],["WORKLOAD BY INDIVIDUAL"],["Person","Tasks assigned","Completed","Completion rate","Overdue","Awaiting approval"]);
   for(const group of peopleGroups){const total=group.items.length,completed=group.items.filter(t=>t.status==="completed").length;
    rows.push([group.name,String(total),String(completed),percent(completed,total)+"%",String(group.items.filter(t=>overdue(t,now)).length),String(group.items.filter(t=>t.status==="awaiting_approval").length)]);
   }
   rows.push([],["TASKS REQUIRING ATTENTION"],["Task","Project","Owner","Status","Due date"]);
   for(const t of attention)rows.push([t.title,projectName(t),ownerName(t),overdue(t,now)?"Overdue":friendly(t.status),dateText(t.due_at)]);
  }else{
   rows.push(["FULL TASK REGISTER"],["Task name","Project","Team","Assigned to","Status","Priority","Due date","Created date","Overdue?","Days overdue"]);
   for(const t of scoped){
    rows.push([t.title,projectName(t),teamName(t),ownerName(t),friendly(t.status),friendly(t.priority),dateText(t.due_at),dateText(t.created_at),overdue(t,now)?"Yes":"No",overdue(t,now)?String(Math.ceil((now-new Date(t.due_at!).getTime())/MS_DAY)):""]);
   }
  }
  csvFile(rows,safeFileName+(format==="summary"?"-summary":"-tasks")+".csv");
  onClose();
 }
 function exportPresentation(){
  const win=window.open("","_blank");
  if(!win){setError("Your browser blocked the report window. Allow pop-ups for Trackwise or choose CSV.");return}
  win.opener=null;
  const cells=(values:unknown[],tag:"th"|"td"="td")=>"<tr>"+values.map(v=>"<"+tag+">"+htmlEscape(v)+"</"+tag+">").join("")+"</tr>";
  const rows=summaryGroups().map(group=>cells([group.name,group.items.length,group.items.filter(t=>t.status==="completed").length,percent(group.items.filter(t=>t.status==="completed").length,group.items.length)+"%",group.items.filter(t=>overdue(t,now)).length,group.items.filter(t=>t.status==="blocked").length])).join("");
  const groupCells=(groups:{name:string;items:Task[]}[])=>groups.map(group=>cells([group.name,group.items.length,group.items.filter(t=>t.status==="completed").length,percent(group.items.filter(t=>t.status==="completed").length,group.items.length)+"%",group.items.filter(t=>overdue(t,now)).length,group.items.filter(t=>t.status==="blocked").length])).join("");
  const attentionRows=attention.map(t=>cells([t.title,projectName(t),ownerName(t),overdue(t,now)?"Overdue":friendly(t.status),dateText(t.due_at)])).join("");
  const allRows=scoped.map(t=>cells([t.title,projectName(t),ownerName(t),friendly(t.status),friendly(t.priority),dateText(t.due_at)])).join("");
  const kpis=[["Tasks",count],["Completed",done],["Completion rate",percent(done,count)+"%"],["In progress",inProgress],["Overdue",late],["Blocked",blocked],["Awaiting approval",awaiting]].map(k=>'<div class="metric"><span>'+htmlEscape(k[0])+'</span><strong>'+htmlEscape(k[1])+'</strong></div>').join("");
  const style="<style>@page{size:A4;margin:17mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#243650;max-width:1050px;margin:0 auto;background:#fff;font-size:12px;line-height:1.5}header{background:#102653;color:#fff;padding:24px 28px;border-radius:10px;display:flex;gap:16px;align-items:center}header .mark{display:grid;place-items:center;background:#edc36e;color:#172a54;width:48px;height:48px;border-radius:12px;font-size:30px;font-weight:900}.brand{font-size:25px;font-weight:900;letter-spacing:-.7px}.brand small{display:block;font-size:10px;color:#ebd09c;letter-spacing:2px;margin-top:3px}h1{font-size:23px;color:#102653;margin:26px 0 5px}h2{font-size:16px;color:#102653;border-bottom:2px solid #dfe7f5;padding-bottom:8px;margin:22px 0 12px}.subtitle{color:#69768a;margin:0 0 14px}.meta{background:#f3f6fb;border:1px solid #d9e2f3;padding:15px 18px;border-radius:8px;display:grid;grid-template-columns:1fr 1fr;gap:9px}.meta b{color:#193c7e}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:17px}.metric{border:1px solid #d9e2f3;border-radius:8px;padding:12px}.metric span{display:block;color:#5f718d;font-size:11px}.metric strong{display:block;font-size:22px;color:#183c84;margin-top:5px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#193e7e;color:white;text-align:left}td,th{padding:8px;border-bottom:1px solid #e1e8f2;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#f7f9fd}.notice{background:#fff5df;padding:10px;border-left:4px solid #d69c3b}.foot{margin-top:22px;border-top:1px solid #dbe5f5;padding-top:10px;color:#6c7890;font-size:10px}.noprint{position:sticky;top:0;padding:14px;background:white;text-align:right;border-bottom:1px solid #dae2ed}.noprint button{background:#315ec8;color:white;border:0;border-radius:8px;padding:11px 19px;cursor:pointer;font-weight:700}@media print{.noprint{display:none}header{print-color-adjust:exact}th{print-color-adjust:exact}section,header,.metric{break-inside:avoid}h2{break-after:avoid}}</style>";
  const head='<div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div><header><span class="mark">T</span><span class="brand">Trackwise<small>WORK REPORTING & ACCOUNTABILITY</small></span></header>';
  const meta='<h1>'+htmlEscape(scopeName)+' — Work report</h1><p class="subtitle">Prepared for leadership review · '+htmlEscape(dateText(new Date().toISOString()))+'</p><div class="meta"><div><b>Organization:</b> '+htmlEscape(organizationName)+'</div><div><b>Scope:</b> '+htmlEscape(scope==="organization"?"Entire organization":scope==="team"?"Team":"Individual")+'</div><div><b>Prepared for:</b> '+htmlEscape(scopeName)+'</div><div><b>Reporting period:</b> '+htmlEscape(periodText)+'</div></div>';
  const section=(heading:string,thead:string[],body:string,empty:string)=>'<section><h2>'+htmlEscape(heading)+'</h2><table><thead>'+cells(thead,"th")+'</thead><tbody>'+(body||'<tr><td colspan="'+thead.length+'">'+htmlEscape(empty)+'</td></tr>')+'</tbody></table></section>';
  const footer='<p class="foot">Trackwise report generated from workspace data available to the signed-in user. Completion rate is completed tasks divided by all tasks in scope. Team tasks are grouped by the team linked to each task’s project. '+(warning?htmlEscape("Data notice: "+warning):"")+'</p>';
  const documentContent='<!doctype html><html><head><meta charset="utf-8"><title>'+htmlEscape(scopeName)+' — Trackwise Report</title>'+style+'</head><body>'+head+meta+'<div class="kpis">'+kpis+'</div>'+
   (warning?'<p class="notice">'+htmlEscape("Data may be incomplete: "+warning)+'</p>':"")+
   section("Delivery by project",["Project","Tasks","Completed","Completion","Overdue","Blocked"],rows,"No matching projects")+
   section("Delivery by team",["Team","Tasks","Completed","Completion","Overdue","Blocked"],groupCells(teamGroups),"No linked team work")+
   section("Workload by individual",["Person","Tasks","Completed","Completion","Overdue","Blocked"],groupCells(peopleGroups),"No assigned tasks")+
   section("Items requiring attention",
    ["Task","Project","Owner","Status","Due"],attentionRows,"No overdue, blocked or approval-pending tasks")+
   section("Detailed task register",
    ["Task","Project","Owner","Status","Priority","Due"],allRows,"No tasks match the selected scope")+footer+
   '<p class="subtitle">Use the Print / Save as PDF button to save a professional, branded copy.</p></body></html>';
  win.document.open();win.document.write(documentContent);win.document.close();win.focus();
  onClose();
 }
 function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");
  if(!ready){setError("Choose the team or individual for the report.");return}
  if(format==="pdf")exportPresentation();else exportCsv();
 }
 return <div className="reportExportOverlay" onPointerDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div role="dialog" aria-modal="true" aria-labelledby="reportExportTitle" className="reportExportDialog" ref={modal}>
   <div className="reportExportTop"><div className="reportExportBrand"><span className="reportExportMark">T</span><div><strong>Trackwise</strong><small>REPORT STUDIO</small></div></div><button ref={first} type="button" onClick={onClose} aria-label="Close report setup" className="reportExportClose"><X size={22}/></button></div>
   <form onSubmit={submit} className="reportExportBody">
    <div className="reportExportIntro"><h2 id="reportExportTitle">Who is this report for?</h2><p>Choose what you want to report on. We’ll organize the results and prepare the file for you.</p></div>
    <fieldset className="reportScopeGrid"><legend className="srOnly">Select report scope</legend>
     {([
      {id:"organization" as Scope,label:"Organization",desc:"All visible work",icon:Building2},
      {id:"team" as Scope,label:"A team",desc:"One team's projects",icon:UsersRound},
      {id:"individual" as Scope,label:"An individual",desc:"One person's tasks",icon:UserRound}
     ]).map(({id,label,desc,icon:Icon})=><label key={id} className={"reportScopeOption "+(scope===id?"chosen":"")}>
      <input type="radio" name="reportScope" checked={scope===id} onChange={()=>{setScope(id);setError("")}}/>
      <Icon size={22}/><strong>{label}</strong><small>{desc}</small>
     </label>)}
    </fieldset>
    <div className="reportExportSelectors">
     {scope==="team"&&<label htmlFor="reportExportTeam">Which team?<select id="reportExportTeam" required value={teamId} onChange={e=>setTeamId(e.target.value)}><option value="">Choose a team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><small>Includes work in projects linked to that team.</small></label>}
     {scope==="individual"&&<label htmlFor="reportExportPerson">Whose work?<select id="reportExportPerson" required value={personId} onChange={e=>setPersonId(e.target.value)}><option value="">Choose a person</option>{directory.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select><small>Shows tasks assigned to the selected person.</small></label>}
     <label htmlFor="reportExportPeriod">Reporting period<select id="reportExportPeriod" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select><small>Based on when each task was created.</small></label>
    </div>
    <div className="reportExportIntro second"><h3>How would you like to present it?</h3><p>For a meeting with your boss, use the branded presentation report.</p></div>
    <fieldset className="reportFormatList"><legend className="srOnly">Select report format</legend>
     {([
      {id:"pdf" as Format,label:"Presentation report (PDF)",desc:"Branded Trackwise header, executive summary, readable tables and ready to print.",icon:Printer},
      {id:"summary" as Format,label:"Summary CSV",desc:"Project totals, completion rates and work needing attention; opens in Excel.",icon:BarChart3},
      {id:"detailed" as Format,label:"Detailed CSV",desc:"Every task, owner, project, deadline and status; opens in Excel.",icon:FileSpreadsheet}
     ]).map(({id,label,desc,icon:Icon})=><label key={id} className={"reportFormatOption "+(format===id?"chosen":"")}>
      <input type="radio" name="reportFormat" checked={format===id} onChange={()=>setFormat(id)}/>
      <Icon size={21}/><span><strong>{label}</strong><small>{desc}</small></span>
     </label>)}
    </fieldset>
    <div className="reportExportPreview"><FileText size={20}/><div><strong>{ready?scopeName:"Choose a recipient"}</strong>
     <span>{ready?count+" tasks · "+percent(done,count)+"% completed · "+late+" overdue":"Select a team or person above"} · {periodText}</span></div></div>
    {!complete&&<p className="reportExportWarning" role="status">The complete report hasn't been verified. Any export may only include currently accessible or loaded records. {warning??""}</p>}
    {format!=="pdf"&&<p className="reportExportHint">CSV is a data format: it contains clear headings and context, but can't display a logo or formatted design. Choose Presentation report for branding.</p>}
    {error&&<p className="feedback bad" role="alert">{error}</p>}
    <div className="reportExportFooter"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!ready}>{format==="pdf"?"Prepare report →":"Export "+(format==="summary"?"summary":"tasks")+" CSV ↓"}</button></div>
   </form>
  </div>
 </div>;
}
