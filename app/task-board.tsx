"use client";
import {useState,type DragEvent} from "react";
import {CheckCircle2,Clock3,Plus,Square,UsersRound} from "lucide-react";

type Task={id:string;title:string;status:string;priority:string;due_at:string|null;owner_id:string|null;project_id:string|null};
type Person={user_id:string;display_name:string};
type Project={id:string;name:string};
type Lane="todo"|"progress"|"done";
type Props={
 tasks:Task[];directory:Person[];projects:Project[];userId:string;manager:boolean;working:boolean;hideStats?:boolean;
 onOpen:(id:string)=>void;onStatusChange:(id:string,status:string)=>void;onCreate:()=>void;
};
const lanes:{id:Lane;label:string;hint:string}[]=[
 {id:"todo",label:"To do",hint:"Ready to start"},
 {id:"progress",label:"In progress",hint:"Active, blocked or awaiting review"},
 {id:"done",label:"Done",hint:"Approved and completed"}
];
const laneFor=(status:string):Lane=>status==="completed"?"done":status==="not_started"||status==="rejected"?"todo":"progress";
const label=(value:string)=>({
 not_started:"To do",underway:"In progress",awaiting_approval:"For review",
 blocked:"Blocked",rejected:"Needs changes",completed:"Completed",normal:"Normal"
} as Record<string,string>)[value]??value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export default function TaskBoard({tasks,directory,projects,userId,manager,working,hideStats=false,onOpen,onStatusChange,onCreate}:Props){
 const [dragged,setDragged]=useState<string|null>(null);
 const [over,setOver]=useState<Lane|null>(null);
 const assigned=tasks.filter(t=>t.owner_id===userId).length;
 const overdue=tasks.filter(t=>t.due_at&&new Date(t.due_at).getTime()<Date.now()&&t.status!=="completed").length;
 function drop(event:DragEvent<HTMLElement>,lane:Lane){
  event.preventDefault();
  if(dragged&&manager&&!working){
   const current=tasks.find(t=>t.id===dragged);
   const next=lane==="done"?"completed":lane==="progress"?"underway":"not_started";
   if(current&&current.status!==next)onStatusChange(dragged,next);
  }
  setDragged(null);setOver(null);
 }
 return <section aria-label="Task board" className="twBoard">
  {!hideStats&&<div className="twBoardStats" aria-label="Task summary">
   <div><span>Total tasks</span><strong>{tasks.length}</strong></div>
   <div><span>Assigned to me</span><strong>{assigned}</strong></div>
   <div><span>Overdue</span><strong>{overdue}</strong></div>
   <div><span>Completed</span><strong>{tasks.filter(t=>t.status==="completed").length}</strong></div>
   <div><span>Unassigned</span><strong>{tasks.filter(t=>!t.owner_id).length}</strong></div>
  </div>}
  {manager&&<p className="twBoardHint">Drag a task between columns on a computer, or use its status menu on any device. Completed work still follows your organization’s approval rules.</p>}
  <div className="twBoardLanes">
   {lanes.map(lane=>{
    const items=tasks.filter(task=>laneFor(task.status)===lane.id);
    return <section key={lane.id} className={"twBoardLane "+(over===lane.id?"isDropTarget":"")}
     aria-label={lane.label+" tasks"}
     onDragOver={event=>{if(!manager||!dragged)return;event.preventDefault();setOver(lane.id)}}
     onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOver(null)}}
     onDrop={event=>drop(event,lane.id)}>
     <div className="twBoardLaneHead"><div className="twBoardLaneTitle">
      {lane.id==="todo"?<Square size={19}/>:lane.id==="done"?<CheckCircle2 size={19}/>:<Clock3 size={19}/>}
      <strong>{lane.label}</strong><span>{items.length}</span></div>
      {lane.id==="todo"&&manager&&<button type="button" className="twBoardAdd" onClick={onCreate} aria-label="Create a new task"><Plus size={17}/></button>}
     </div>
     <div className="twBoardLaneBody">
      {items.length?items.map(task=>{
       const owner=directory.find(p=>p.user_id===task.owner_id)?.display_name;
       const project=projects.find(p=>p.id===task.project_id)?.name;
       const canChange=manager||(task.owner_id===userId&&task.status!=="completed");
       const choices=["not_started","underway","blocked","awaiting_approval","completed","rejected"].filter(status=>status===task.status||(manager?status!=="rejected":status!=="completed"&&status!=="rejected"));
       return <article key={task.id} className="twBoardCard" draggable={manager&&!working}
        onDragStart={event=>{if(!manager||working)return;event.dataTransfer.effectAllowed="move";setDragged(task.id)}}
        onDragEnd={()=>{setDragged(null);setOver(null)}}>
        <button type="button" className="twBoardCardTitle" onClick={()=>onOpen(task.id)}>{task.title}<span aria-hidden="true">↗</span></button>
        <div className="twBoardCardMeta"><span className={"priority "+task.priority}>{label(task.priority)}</span><span className={"twBoardStatus twBoardStatus-"+task.status}>{label(task.status)}</span></div>
        <div className="twBoardCardDetails"><span><UsersRound size={14}/>{task.owner_id===userId?"You":owner??"Unassigned"}</span><span>{task.due_at?"Due "+new Date(task.due_at).toLocaleDateString():"No due date"}</span>{project&&<span className="twBoardProject">{project}</span>}</div>
        {canChange&&<label className="twBoardChange">Move task to
         <select aria-label={"Change status for "+task.title} disabled={working} value={task.status} onChange={event=>onStatusChange(task.id,event.target.value)}>{choices.map(status=><option key={status} value={status}>{label(status)}</option>)}</select>
        </label>}
       </article>;
      }):<div className="twBoardEmpty"><p>{lane.id==="todo"?"Nothing waiting to start.":lane.id==="progress"?"No work in progress.":"Completed tasks appear here."}</p>{lane.id==="todo"&&manager&&<button type="button" onClick={onCreate}>+ New task</button>}</div>}
     </div>
    </section>;
   })}
  </div>
 </section>;
}
