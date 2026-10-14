"use client";
import {useMemo,useState} from "react";
type Task={id:string;title:string;status:string;priority:string;due_at:string|null;owner_id:string|null;project_id:string|null;created_at:string};
type Project={id:string;name:string;team_id:string|null};
type Team={id:string;name:string};
type Member={user_id:string;display_name:string};
type Props={tasks:Task[];projects:Project[];teams:Team[];directory:Member[];organizationName:string};
export default function Reports({tasks,projects,teams,directory,organizationName}:Props){
 const [team,setTeam]=useState("all"),[period,setPeriod]=useState("all");
 const filtered=useMemo(()=>tasks.filter(t=>{
  const project=projects.find(p=>p.id===t.project_id);
  const cutoff=period==="30"?Date.now()-30*86400000:period==="90"?Date.now()-90*86400000:0;
  return (team==="all"||project?.team_id===team)&&(!cutoff||new Date(t.created_at).getTime()>=cutoff);
 }),[tasks,projects,team,period]);
 const completed=filtered.filter(t=>t.status==="completed").length;
 const overdue=filtered.filter(t=>t.due_at&&new Date(t.due_at)<new Date()&&t.status!=="completed").length;
 const blocked=filtered.filter(t=>t.status==="blocked").length;
 const pending=filtered.filter(t=>t.status==="awaiting_approval").length;
 const pct=filtered.length?Math.round(completed/filtered.length*100):0;
 function exportCSV(){
  const rows=[["Task","Project","Owner","Status","Priority","Due date","Created"],...filtered.map(t=>[t.title,projects.find(p=>p.id===t.project_id)?.name??"",directory.find(m=>m.user_id===t.owner_id)?.display_name??"Unassigned",t.status,t.priority,t.due_at??"",t.created_at])];
  const csv=rows.map(row=>row.map(value=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'").replaceAll('"','""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download="trackwise-report-"+new Date().toISOString().slice(0,10)+".csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <><section className="card"><div className="sectionHead"><h2>{organizationName} · Reporting</h2><button className="primary" onClick={exportCSV} disabled={!filtered.length}>Export CSV ↓</button></div><div className="filterBar"><select aria-label="Report team" value={team} onChange={e=>setTeam(e.target.value)}><option value="all">All teams</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select aria-label="Report period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">All available records</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div><p className="muted">Reports cover the most recent 200 loaded tasks. Team grouping uses the task's project. Date filters use task creation dates.</p></section>
 <div className="reportStats">{[["Total tasks",filtered.length],["Completed",completed],["Overdue",overdue],["Blocked",blocked],["Awaiting approval",pending]].map(([label,value])=><div className="card reportMetric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
 <div className="twoCol"><section className="card"><h2>Delivery rate</h2><p className="reportBig">{pct}%</p><div className="reportBar"><span style={{width:pct+"%"}}/></div><p className="muted">Completed tasks as a share of the selected workload.</p></section><section className="card"><h2>Workload by member</h2>{directory.map(m=>{const owned=filtered.filter(t=>t.owner_id===m.user_id);return <div className="reportRow" key={m.user_id}><span>{m.display_name}</span><strong>{owned.length} tasks · {owned.filter(t=>t.status==="completed").length} done</strong></div>})}<div className="reportRow"><span>Unassigned</span><strong>{filtered.filter(t=>!t.owner_id).length} tasks</strong></div></section></div>
 <section className="card"><h2>Project delivery</h2>{projects.length?projects.map(p=>{const related=filtered.filter(t=>t.project_id===p.id);return <div className="reportRow" key={p.id}><span>{p.name}</span><strong>{related.filter(t=>t.status==="completed").length} / {related.length} completed</strong></div>}):<p className="muted">No projects created yet.</p>}</section></>;
}
