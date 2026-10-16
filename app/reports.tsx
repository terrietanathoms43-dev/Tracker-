"use client";
import {useEffect,useMemo,useState} from "react";
import {supabase as makeClient} from "../lib/supabase";
import ReportExport from "./report-export";

const db=makeClient();
type Task={id:string;title:string;status:string;priority:string;due_at:string|null;owner_id:string|null;project_id:string|null;created_at:string};
type Project={id:string;name:string;team_id:string|null};
type Team={id:string;name:string};
type Member={user_id:string;display_name:string};
type Props={tasks:Task[];projects:Project[];teams:Team[];directory:Member[];organizationName:string;organizationId:string};
type Rollup={name:string;total:number;done:number;overdue:number;blocked:number;pending:number};
const STATUSES=["not_started","underway","awaiting_approval","blocked","rejected","completed"];
const PRIORITIES=["urgent","high","normal","low"];
const DAY=86400000;
const label=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
const isComplete=(task:Task)=>task.status==="completed";
const isOverdue=(task:Task,now:number)=>Boolean(task.due_at)&&!isComplete(task)&&new Date(task.due_at!).getTime()<now;
const percentage=(value:number,total:number)=>total?Math.round(100*value/total):0;
const displayDate=(value:string|null)=>value?new Date(value).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"Not set";
const rollup=(name:string,tasks:Task[],now:number):Rollup=>({
 name,total:tasks.length,done:tasks.filter(isComplete).length,overdue:tasks.filter(task=>isOverdue(task,now)).length,
 blocked:tasks.filter(t=>t.status==="blocked").length,pending:tasks.filter(t=>t.status==="awaiting_approval").length
});
function Progress({item}:{item:Rollup}){
 const value=percentage(item.done,item.total);
 return <div className="reportProgressRow">
  <div className="reportProgressTop"><span>{item.name}</span><strong>{value}% completed</strong></div>
  <div className="reportTrack" role="progressbar" aria-label={item.name+" completed"} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{width:value+"%"}}/></div>
  <div className="reportProgressMeta"><span>{item.done} / {item.total} completed</span><span>{item.overdue} overdue</span><span>{item.blocked} blocked</span><span>{item.pending} awaiting approval</span></div>
 </div>;
}
export default function Reports({tasks,projects,teams,directory,organizationName,organizationId}:Props){
 const [allTasks,setAllTasks]=useState<Task[]|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[limited,setLimited]=useState(false),[reload,setReload]=useState(0);
 const [team,setTeam]=useState("all"),[project,setProject]=useState("all"),[member,setMember]=useState("all"),[status,setStatus]=useState("all"),[period,setPeriod]=useState("all"),[search,setSearch]=useState("");
 const [exportOpen,setExportOpen]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  setLoading(true);setError("");setAllTasks(null);setLimited(false);
  async function load(){
   if(!db){if(!cancelled){setError("No database connection.");setLoading(false)}return}
   const collected:Task[]=[];let capped=false;
   try{
    for(let offset=0;offset<50000;offset+=500){
     const {data,error:dbError}=await db.from("tw_tasks").select("id,title,status,priority,due_at,owner_id,project_id,created_at")
      .eq("organization_id",organizationId).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
     if(dbError)throw dbError;
     collected.push(...(data??[]));
     if((data??[]).length<500)break;
     if(offset===49500)capped=true;
    }
    if(!cancelled){setAllTasks(collected);setLimited(capped)}
   }catch(reason){if(!cancelled)setError(reason instanceof Error?reason.message:"Unable to load complete report")}
   finally{if(!cancelled)setLoading(false)}
  }
  void load();
  return()=>{cancelled=true};
 },[organizationId,reload]);
 const source=allTasks??tasks;
 const byProjectId=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects]);
 const byMemberId=useMemo(()=>new Map(directory.map(m=>[m.user_id,m])),[directory]);
 const byTeamId=useMemo(()=>new Map(teams.map(t=>[t.id,t])),[teams]);
 const now=Date.now();
 const filtered=source.filter(task=>{
  const linked=task.project_id?byProjectId.get(task.project_id):undefined;
  const days=period==="all"?0:Number(period);
  return (team==="all"||(team==="none"?!linked?.team_id:linked?.team_id===team))
   &&(project==="all"||(project==="none"?!task.project_id:task.project_id===project))
   &&(member==="all"||(member==="none"?!task.owner_id:task.owner_id===member))
   &&(status==="all"||task.status===status)
   &&(!days||new Date(task.created_at).getTime()>=now-days*DAY)
   &&(!search||task.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 });
 const totals=rollup("All",filtered,now);
 const progress=filtered.filter(t=>t.status==="underway").length;
 const dueSoon=filtered.filter(t=>t.due_at&&!isComplete(t)&&new Date(t.due_at).getTime()>=now&&new Date(t.due_at).getTime()<now+7*DAY).length;
 const unassigned=filtered.filter(t=>!t.owner_id).length;
 const recent=filtered.filter(t=>new Date(t.created_at).getTime()>=now-7*DAY).length;
 const unattached=filtered.filter(t=>!t.project_id);
 const projectRows=[...projects.map(p=>({id:p.id,...rollup(p.name,filtered.filter(t=>t.project_id===p.id),now)})),
  ...(unattached.length?[{id:"none",...rollup("No project",unattached,now)}]:[])].filter(r=>r.total).sort((a,b)=>b.overdue-a.overdue||b.total-a.total);
 const teamRows=[...teams.map(t=>({id:t.id,...rollup(t.name,filtered.filter(item=>item.project_id&&byProjectId.get(item.project_id)?.team_id===t.id),now)})),
  {id:"none",...rollup("No linked team",filtered.filter(item=>!item.project_id||!byProjectId.get(item.project_id)?.team_id),now)}].filter(r=>r.total).sort((a,b)=>b.total-a.total);
 const peopleRows=[...directory.map(m=>({id:m.user_id,...rollup(m.display_name,filtered.filter(t=>t.owner_id===m.user_id),now)})),
  {id:"none",...rollup("Unassigned",filtered.filter(t=>!t.owner_id),now)}].filter(r=>r.total).sort((a,b)=>b.total-a.total);
 const priorityItems=PRIORITIES.map(p=>({name:label(p),count:filtered.filter(t=>t.priority===p).length}));
 const statusItems=STATUSES.map(s=>({name:label(s),count:filtered.filter(t=>t.status===s).length}));
 const attention=filtered.filter(t=>isOverdue(t,now)||t.status==="blocked"||t.status==="awaiting_approval").sort((a,b)=>{
  const rank=(t:Task)=>isOverdue(t,now)?0:t.status==="blocked"?1:2;
  return rank(a)-rank(b)||(a.due_at?new Date(a.due_at).getTime():Infinity)-(b.due_at?new Date(b.due_at).getTime():Infinity);
 });
 const upcoming=filtered.filter(t=>t.due_at&&!isComplete(t)&&new Date(t.due_at).getTime()>=now)
  .sort((a,b)=>new Date(a.due_at!).getTime()-new Date(b.due_at!).getTime()).slice(0,8);
 function ownerName(t:Task){return t.owner_id?byMemberId.get(t.owner_id)?.display_name??"Unknown member":"Unassigned"}
 function projectName(t:Task){return t.project_id?byProjectId.get(t.project_id)?.name??"Unknown project":"No project"}
 function teamName(t:Task){const teamId=t.project_id?byProjectId.get(t.project_id)?.team_id:null;return teamId?byTeamId.get(teamId)?.name??"Unknown team":"No team"}
 return <div className="reportPage">
  <h2 className="reportPrintHeading">{organizationName} · Work report · {displayDate(new Date().toISOString())}</h2>
  <section className="card reportHero">
   <div className="reportHeroHeading"><div><span className="eyebrow blue">REPORTING CENTER</span><h2>{organizationName} · Reports</h2><p className="muted">Analyze deadlines, delivery, team workload, projects and task priorities.</p></div>
    <div className="reportActions"><button type="button" disabled={loading} onClick={()=>setReload(value=>value+1)}>{loading?"Loading…":"↻ Refresh"}</button><button type="button" className="primary" onClick={()=>setExportOpen(true)}>Create a report →</button></div>
   </div>
   <div className="reportFilters">
    <label htmlFor="reportTeam">Team<select id="reportTeam" value={team} onChange={event=>setTeam(event.target.value)}><option value="all">All teams</option><option value="none">No team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label htmlFor="reportProject">Project<select id="reportProject" value={project} onChange={event=>setProject(event.target.value)}><option value="all">All projects</option><option value="none">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label htmlFor="reportMember">Task owner<select id="reportMember" value={member} onChange={event=>setMember(event.target.value)}><option value="all">All members</option><option value="none">Unassigned</option>{directory.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
    <label htmlFor="reportStatus">Task status<select id="reportStatus" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All statuses</option>{STATUSES.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
    <label htmlFor="reportPeriod">Tasks created<select id="reportPeriod" value={period} onChange={event=>setPeriod(event.target.value)}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></label>
    <label htmlFor="reportSearch">Search tasks<input id="reportSearch" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search task titles…"/></label>
   </div>
   <p className="reportDataNote" role={error?"alert":"status"}>{loading?"Loading all organization tasks; previewing currently loaded records.":error?"Couldn't load the full report ("+error+"). Showing workspace tasks only.":limited?"Report reached 50,000 tasks; older records may not be included.":allTasks?"Complete report loaded: "+allTasks.length+" available tasks. Date filter uses task creation date.":"Showing currently loaded workspace records."}</p>
  </section>
  <section className="reportKpis" aria-label="Reporting key metrics">{[
   ["Tasks",totals.total,"Matching current filters"],["Completion",percentage(totals.done,totals.total)+"%",totals.done+" completed"],
   ["Overdue",totals.overdue,"Unfinished and past due"],["In progress",progress,"Currently underway"],
   ["Blocked",totals.blocked,"Need support"],["Awaiting approval",totals.pending,"Pending a review"],
   ["Due next 7 days",dueSoon,"Upcoming deadlines"],["Unassigned",unassigned,"Need an owner"],["New in 7 days",recent,"Recently created"]
  ].map(([name,value,hint])=><div key={String(name)} className="reportKpi"><span>{name}</span><strong>{value}</strong><small>{hint}</small></div>)}</section>
  <div className="reportPanelGrid">
   {[{title:"Task statuses",items:statusItems},{title:"Priorities",items:priorityItems}].map(group=><section className="card" key={group.title}>
    <div className="reportSectionTitle"><h2>{group.title}</h2><span className="muted">{totals.total} tasks</span></div>
    <div className="reportRows">{group.items.map(item=><div className="reportProgressRow" key={item.name}>
     <div className="reportProgressTop"><span>{item.name}</span><strong>{item.count} · {percentage(item.count,totals.total)}%</strong></div>
     <div className="reportTrack"><span style={{width:percentage(item.count,totals.total)+"%"}}/></div>
    </div>)}</div>
   </section>)}
  </div>
  <div className="reportPanelGrid">
   <section className="card"><div className="reportSectionTitle"><h2>Project delivery</h2><span className="muted">{projectRows.length} groups</span></div><div className="reportRows">{projectRows.length?projectRows.map(row=><Progress key={row.id} item={row}/>):<p className="reportEmpty">No projects match these filters.</p>}</div></section>
   <section className="card"><div className="reportSectionTitle"><h2>Team delivery</h2><span className="muted">{teamRows.length} groups</span></div><p className="reportSectionHint">Team assignment is determined by the project linked to each task.</p><div className="reportRows">{teamRows.length?teamRows.map(row=><Progress key={row.id} item={row}/>):<p className="reportEmpty">No teams match these filters.</p>}</div></section>
  </div>
  <section className="card"><div className="reportSectionTitle"><h2>Workload by member</h2><span className="muted">{peopleRows.length} groups</span></div><div className="reportPanelGrid"><div className="reportRows">{peopleRows.filter((_,index)=>index%2===0).map(row=><Progress key={row.id} item={row}/>)}</div><div className="reportRows">{peopleRows.filter((_,index)=>index%2===1).map(row=><Progress key={row.id} item={row}/>)}</div></div>{peopleRows.length===0&&<p className="reportEmpty">No assigned tasks match these filters.</p>}</section>
  <section className="card"><div className="reportSectionTitle"><h2>Needs attention</h2><span className="reportStatusTag isRisk">{attention.length} items</span></div>
   <p className="reportSmallStat">Overdue tasks first, then blocked tasks and work waiting for approval.</p>
   {attention.length?<div className="tablewrap"><table className="reportDataTable"><thead><tr><th>Task</th><th>Project</th><th>Owner</th><th>Status</th><th>Due</th></tr></thead><tbody>{attention.slice(0,20).map(t=><tr key={t.id}><td><strong>{t.title}</strong></td><td>{projectName(t)}</td><td>{ownerName(t)}</td><td><span className={"reportStatusTag "+(isOverdue(t,now)?"isRisk":"")}>{isOverdue(t,now)?"Overdue":label(t.status)}</span></td><td>{displayDate(t.due_at)}</td></tr>)}</tbody></table></div>:<p className="reportEmpty">Nothing overdue, blocked or awaiting approval in this selection.</p>}
   {attention.length>20&&<p className="reportSectionHint">Showing 20 of {attention.length} issues; Task CSV includes all matching tasks.</p>}
  </section>
  <section className="card"><div className="reportSectionTitle"><h2>Upcoming deadlines</h2><span className="muted">Next 8 open tasks</span></div>
   {upcoming.length?<div className="tablewrap"><table className="reportDataTable"><thead><tr><th>Task</th><th>Project</th><th>Owner</th><th>Priority</th><th>Due</th></tr></thead><tbody>{upcoming.map(t=><tr key={t.id}><td><strong>{t.title}</strong></td><td>{projectName(t)}</td><td>{ownerName(t)}</td><td>{label(t.priority)}</td><td>{displayDate(t.due_at)}</td></tr>)}</tbody></table></div>:<p className="reportEmpty">No upcoming due dates in the current selection.</p>}
  </section>
  <section className="card"><div className="reportSectionTitle"><h2>Detailed task register</h2><span className="muted">{filtered.length} matching tasks</span></div>
   {filtered.length?<div className="tablewrap"><table className="reportDataTable"><thead><tr><th>Task</th><th>Team / project</th><th>Owner</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead><tbody>{filtered.slice(0,30).map(t=><tr key={t.id}><td><strong>{t.title}</strong></td><td>{teamName(t)} / {projectName(t)}</td><td>{ownerName(t)}</td><td>{label(t.status)}</td><td>{label(t.priority)}</td><td>{displayDate(t.due_at)}</td></tr>)}</tbody></table></div>:<p className="reportEmpty">No tasks match the selected filters.</p>}
   {filtered.length>30&&<p className="reportSectionHint">Showing 30 of {filtered.length} matching tasks. Export the Task CSV for all records.</p>}
  </section>
  {exportOpen&&<ReportExport tasks={source} projects={projects} teams={teams} directory={directory} organizationName={organizationName} complete={!loading&&!error&&!limited&&allTasks!==null} warning={loading?"Full data is still loading.":error||(limited?"Reporting reached the 50,000 task limit.":undefined)} onClose={()=>setExportOpen(false)}/>}
 </div>;
}
