"use client";

import {useMemo,useState} from "react";

type Task={id:string;title:string;status:string;priority:string;due_at:string|null;owner_id:string|null;project_id:string|null};
type Project={id:string;name:string};
type Props={tasks:Task[];projects:Project[];onOpenTask:(id:string)=>void;};
const weekdayNames=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const sameDay=(a:Date,b:Date)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const formatDay=(date:Date)=>date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
const readableStatus=(status:string)=>({not_started:"To do",underway:"In progress",awaiting_approval:"For review",blocked:"Blocked",rejected:"Needs changes",completed:"Completed"} as Record<string,string>)[status]??status.replaceAll("_"," ");
const makeKey=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
export default function TaskCalendar({tasks,projects,onOpenTask}:Props){
 const [month,setMonth]=useState(()=>{const t=new Date();return new Date(t.getFullYear(),t.getMonth(),1)});
 const [selected,setSelected]=useState(()=>new Date());
 const [project,setProject]=useState("all");
 const today=new Date();
 const days=useMemo(()=>{
  const first=new Date(month.getFullYear(),month.getMonth(),1);
  const mondayOffset=(first.getDay()+6)%7;
  const result:Date[]=[];
  for(let i=0;i<42;i++)result.push(new Date(month.getFullYear(),month.getMonth(),i-mondayOffset+1));
  return result;
 },[month]);
 const visible=useMemo(()=>tasks.filter(t=>t.due_at&&(project==="all"||t.project_id===project)),[tasks,project]);
 const byDay=useMemo(()=>{
  const result:Record<string,Task[]>={};
  for(const task of visible){
   if(!task.due_at)continue;
   const key=makeKey(new Date(task.due_at));
   (result[key]??=[]).push(task);
  }
  return result;
 },[visible]);
 const selectedTasks=byDay[makeKey(selected)]??[];
 const upcoming=visible.filter(t=>new Date(t.due_at!).getTime()>=Date.now()&&t.status!=="completed").sort((a,b)=>new Date(a.due_at!).getTime()-new Date(b.due_at!).getTime()).slice(0,6);
 function shiftMonth(delta:number){
  const next=new Date(month.getFullYear(),month.getMonth()+delta,1);
  setMonth(next);setSelected(new Date(next.getFullYear(),next.getMonth(),1));
 }
 return <div className="calendarWorkspace">
  <section className="card calendarIntro">
   <div className="sectionHead"><div><h2>Task deadline calendar</h2><p className="muted">See when work is due. Select a date to see the tasks and open them.</p></div>
    <label className="calendarFilter">Project<select aria-label="Filter calendar by project" value={project} onChange={e=>setProject(e.target.value)}><option value="all">All projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   </div>
   <div className="calendarMonthControls">
    <button type="button" aria-label="Previous month" onClick={()=>shiftMonth(-1)}>‹</button>
    <h3 aria-live="polite">{month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h3>
    <button type="button" aria-label="Next month" onClick={()=>shiftMonth(1)}>›</button>
    <button type="button" className="calendarToday" onClick={()=>{setMonth(new Date(today.getFullYear(),today.getMonth(),1));setSelected(today)}}>Today</button>
   </div>
   <div className="calendarGrid" role="grid" aria-label="Task deadlines">
    {weekdayNames.map(day=><div role="columnheader" className="calendarWeekday" key={day}>{day}</div>)}
    {days.map(day=>{
     const key=makeKey(day),events=byDay[key]??[],inMonth=day.getMonth()===month.getMonth(),isSelected=sameDay(day,selected),isToday=sameDay(day,today);
     return <button type="button" role="gridcell" key={key} onClick={()=>{setSelected(day);if(!inMonth)setMonth(new Date(day.getFullYear(),day.getMonth(),1))}}
      aria-label={formatDay(day)+", "+events.length+" tasks due"} aria-selected={isSelected}
      className={"calendarCell "+(!inMonth?"outside ":"")+(isSelected?"selected ":"")+(isToday?"today":"")}>
      <span className="calendarDate">{day.getDate()}</span>
      {events.length>0&&<><span className="calendarCount">{events.length} {events.length===1?"task":"tasks"}</span><span className="calendarDots" aria-hidden="true">{events.slice(0,3).map(event=><span className={"calendarDot "+event.status} key={event.id}/>)}</span></>}
     </button>
    })}
   </div>
  </section>
  <div className="twoCol calendarBottom">
   <section className="card calendarSelected">
    <div className="sectionHead"><h2>{formatDay(selected)}</h2><span className="chip">{selectedTasks.length} due</span></div>
    {selectedTasks.length?selectedTasks.map(task=><button className="calendarTask" type="button" key={task.id} onClick={()=>onOpenTask(task.id)}>
     <span><strong>{task.title}</strong><small>{projects.find(p=>p.id===task.project_id)?.name??"No project"} · {readableStatus(task.status)}</small></span><span aria-hidden="true">→</span>
    </button>):<p className="muted">No tasks due on this day. Choose another date to explore.</p>}
   </section>
   <section className="card calendarUpcoming"><h2>Coming up next</h2>
    {upcoming.length?upcoming.map(task=><button className="calendarTask" key={task.id} type="button" onClick={()=>onOpenTask(task.id)}><span><strong>{task.title}</strong><small>Due {new Date(task.due_at!).toLocaleDateString()} · {readableStatus(task.status)}</small></span><span>→</span></button>):<p className="muted">No upcoming deadlines. Your future tasks will appear here.</p>}
   </section>
  </div>
 </div>
}
