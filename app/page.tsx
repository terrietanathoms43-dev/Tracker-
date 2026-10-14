"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {User} from "@supabase/supabase-js";
import Reports from "./reports";
import Operations from "./operations";
import useUnreadNotifications from "./use-unread-notifications";
import {canManageOrganization,canEditTaskChecklist,canOwnTask,taskStatusLabel as taskLabel,userFacingError as displayError} from "../lib/task-rules";
import dynamic from "next/dynamic";
const TaskExtras=dynamic(()=>import("./task-extras"),{ssr:false,loading:()=>null});
const TaskCalendar=dynamic(()=>import("./task-calendar"),{ssr:false,loading:()=><p className="muted">Opening calendar…</p>});
const RecurringSchedules=dynamic(()=>import("./recurring-schedules"),{ssr:false,loading:()=>null});
const WorkspaceBackup=dynamic(()=>import("./workspace-backup"),{ssr:false,loading:()=>null});
const OnboardingTour=dynamic(()=>import("./onboarding-tour"),{ssr:false,loading:()=>null});
const MeetingAssistant=dynamic(()=>import("./meeting-assistant"),{ssr:false,loading:()=><p className="muted">Opening meeting assistant…</p>});
import {supabase as makeClient} from "../lib/supabase";
const ready=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db=ready?makeClient():null;
type Org={id:string;name:string;created_at:string};
type Team={id:string;name:string;organization_id:string};
type Goal={id:string;title:string;description:string|null;status:string;target_date:string|null};
type Project={id:string;name:string;description:string|null;status:string;team_id:string|null;goal_id:string|null};
type DirectoryMember={user_id:string;display_name:string;role:string};
type Task={id:string;title:string;description:string|null;status:string;priority:string;due_at:string|null;owner_id:string|null;created_at:string;latest_progress:string|null;organization_id:string;project_id:string|null;source_request_id:string|null};
type Member={user_id:string;role:string};
type TeamMember={team_id:string;user_id:string;role:string};
type Request={id:string;title:string;details:string|null;decision:string;submitted_by:string;decision_reason:string|null;created_at:string};
type Handover={id:string;task_id:string;from_user:string|null;to_user:string;note:string;created_at:string};
type Activity={id:string;entity_type:string;action:string;created_at:string;details:Record<string,unknown>};
const statuses=["not_started","underway","awaiting_approval","blocked","rejected","completed"];
const statusLabel=(s:string)=>s.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const actionStatusLabel=(status:string)=>status==="awaiting_approval"?"Submit for approval":statusLabel(status);
type View="overview"|"tasks"|"calendar"|"teams"|"people"|"planning"|"projects"|"meeting_ai"|"requests"|"activity"|"reports"|"collaboration"|"resources"|"notifications"|"settings";
type NavGroup={id:string;label:string;icon:string;defaultView:View;items:{view:View;label:string}[]};
const NAV_GROUPS:NavGroup[]=[
 {id:"home",label:"Home",icon:"⌂",defaultView:"overview",items:[{view:"overview",label:"Overview"}]},
 {id:"tasks",label:"Tasks",icon:"☑",defaultView:"tasks",items:[{view:"tasks",label:"All tasks"},{view:"calendar",label:"Calendar"}]},
 {id:"projects",label:"Projects",icon:"▧",defaultView:"projects",items:[{view:"projects",label:"Projects"},{view:"planning",label:"Goals & planning"},{view:"meeting_ai",label:"Meeting assistant"}]},
 {id:"people",label:"People",icon:"♙",defaultView:"people",items:[{view:"people",label:"Members"},{view:"teams",label:"Teams"}]},
 {id:"inbox",label:"Inbox",icon:"◉",defaultView:"notifications",items:[{view:"notifications",label:"Notifications"},{view:"collaboration",label:"Team messages"},{view:"requests",label:"Requests & approvals"}]},
 {id:"more",label:"More",icon:"⚙",defaultView:"settings",items:[{view:"settings",label:"Settings"},{view:"reports",label:"Reports"},{view:"resources",label:"Budgets"},{view:"activity",label:"Activity history"}]}
];
export default function Home(){
 const [handovers,setHandovers]=useState<Handover[]>([]),[handoverOwner,setHandoverOwner]=useState(""),[handoverNote,setHandoverNote]=useState("");
 const [inviteShareEmail,setInviteShareEmail]=useState(""),[inviteShareReady,setInviteShareReady]=useState(false),[inviteShareId,setInviteShareId]=useState("");
 const [profileName,setProfileName]=useState(""),[profileSaving,setProfileSaving]=useState(false),[roleEditing,setRoleEditing]=useState(""),[roleChoice,setRoleChoice]=useState("member");
 const [recovery,setRecovery]=useState(false),[newPassword,setNewPassword]=useState(""),[selectedTask,setSelectedTask]=useState(""),[progressText,setProgressText]=useState(""),[nextStep,setNextStep]=useState(""),[taskUpdates,setTaskUpdates]=useState<{id:string;progress:string;next_action:string|null;created_at:string;author_id:string}[]>([]);
 const [user,setUser]=useState<User|null>(null),[initial,setInitial]=useState(true),[working,setWorking]=useState(false);
 const [mode,setMode]=useState<"signin"|"signup"|"reset">("signin"),[email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [orgs,setOrgs]=useState<Org[]>([]),[selected,setSelected]=useState(""),[teams,setTeams]=useState<Team[]>([]),[tasks,setTasks]=useState<Task[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [goals,setGoals]=useState<Goal[]>([]),[projects,setProjects]=useState<Project[]>([]),[directory,setDirectory]=useState<DirectoryMember[]>([]),[goalTitle,setGoalTitle]=useState(""),[goalTarget,setGoalTarget]=useState(""),[projectName,setProjectName]=useState(""),[projectDescription,setProjectDescription]=useState(""),[projectFilter,setProjectFilter]=useState("all"),[projectGoal,setProjectGoal]=useState(""),[projectTeam,setProjectTeam]=useState(""),[taskProject,setTaskProject]=useState(""),[search,setSearch]=useState(""),[statusFilter,setStatusFilter]=useState("all");
 const [teamMembers,setTeamMembers]=useState<TeamMember[]>([]),[requests,setRequests]=useState<Request[]>([]),[activity,setActivity]=useState<Activity[]>([]),[requestTitle,setRequestTitle]=useState(""),[requestDetails,setRequestDetails]=useState(""),[assignTeam,setAssignTeam]=useState(""),[assignUser,setAssignUser]=useState(""),[assignRole,setAssignRole]=useState("member");
 const [pendingInvites,setPendingInvites]=useState<{id:string;email:string;role:string;organization_id:string;expires_at:string}[]>([]),[invitesLoading,setInvitesLoading]=useState(false);
 const [outgoingInvites,setOutgoingInvites]=useState<{id:string;email:string;role:string;expires_at:string;accepted_at:string|null}[]>([]),[inviteAction,setInviteAction]=useState("");
 const [inviteEmail,setInviteEmail]=useState(""),[inviteRole,setInviteRole]=useState("member"),[orgName,setOrgName]=useState(""),[teamName,setTeamName]=useState(""),[taskTitle,setTaskTitle]=useState(""),[taskDescription,setTaskDescription]=useState(""),[taskDue,setTaskDue]=useState(""),[taskFrequency,setTaskFrequency]=useState("none"),[recurringRefresh,setRecurringRefresh]=useState(0),[taskPriority,setTaskPriority]=useState("normal"),[taskOwner,setTaskOwner]=useState("");
 const [myTasksOnly,setMyTasksOnly]=useState(false),[workspaceLoading,setWorkspaceLoading]=useState(false);
 const workspaceRequest=useRef(0);
 const [mobileMenu,setMobileMenu]=useState(false),[showTaskForm,setShowTaskForm]=useState(false),[showTaskHandover,setShowTaskHandover]=useState(false);
 const [view,setView]=useState<View>("overview"),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [createMenu,setCreateMenu]=useState(false),[showGuide,setShowGuide]=useState(false),[hideChecklist,setHideChecklist]=useState(false);
 const [lastCreatedProject,setLastCreatedProject]=useState<{id:string;name:string}|null>(null);
 const [lastCreatedTeam,setLastCreatedTeam]=useState<{id:string;name:string}|null>(null);
 const [goalDescription,setGoalDescription]=useState("");
 const [editingGoal,setEditingGoal]=useState(""),[editGoalTitle,setEditGoalTitle]=useState(""),[editGoalDescription,setEditGoalDescription]=useState(""),[editGoalDate,setEditGoalDate]=useState(""),[editGoalStatus,setEditGoalStatus]=useState("active");
 const [searchOpen,setSearchOpen]=useState(false),[globalSearch,setGlobalSearch]=useState("");
 const [editingTask,setEditingTask]=useState(""),[editTaskTitle,setEditTaskTitle]=useState(""),[editTaskDescription,setEditTaskDescription]=useState(""),[editTaskPriority,setEditTaskPriority]=useState("normal"),[editTaskDue,setEditTaskDue]=useState(""),[editTaskProject,setEditTaskProject]=useState("");
 const [editingProject,setEditingProject]=useState(""),[editProjectName,setEditProjectName]=useState(""),[editProjectDescription,setEditProjectDescription]=useState(""),[editProjectGoal,setEditProjectGoal]=useState(""),[editProjectTeam,setEditProjectTeam]=useState(""),[editProjectStatus,setEditProjectStatus]=useState("active");
 useEffect(()=>{setProfileName(String(user?.user_metadata?.display_name??""))},[user?.id]);
 const clear=()=>{setError("");setNotice("")};
 const loadOrgs=useCallback(async()=>{if(!db)return;const {data,error}=await db.from("tw_organizations").select("id,name,created_at").order("created_at",{ascending:false});if(error)setError(error.message);else {setOrgs(data??[]);setSelected(old=>(data??[]).some(o=>o.id===old)?old:(data?.[0]?.id??""))}},[]);
 const loadWorkspace=useCallback(async(orgId:string)=>{
  if(!db||!orgId)return;
  const request=++workspaceRequest.current;
  setWorkspaceLoading(true);
  // Fetch every saved task in stable batches; a single .limit(200) hid older tasks.
  const allTasks=async()=>{
   try{
    const saved:Task[]=[];
    const pageSize=200;
    for(let offset=0;;offset+=pageSize){
     const result=await db.from("tw_tasks")
      .select("id,title,description,status,priority,due_at,owner_id,created_at,latest_progress,organization_id,project_id,source_request_id")
      .eq("organization_id",orgId)
      .order("created_at",{ascending:false})
      .order("id",{ascending:false})
      .range(offset,offset+pageSize-1);
     if(result.error)throw result.error;
     const batch=(result.data??[]) as Task[];
     saved.push(...batch);
     if(batch.length<pageSize)break;
    }
    return {data:saved,error:null};
   }catch(e){return {data:null,error:{message:e instanceof Error?e.message:"Could not load saved tasks"}}}
  };
  try{
   const [t,k,m,tm,r,a,g,p,d,h]=await Promise.all([
    db.from("tw_teams").select("id,name,organization_id").eq("organization_id",orgId).order("created_at",{ascending:false}),
    allTasks(),
    db.from("tw_memberships").select("user_id,role").eq("organization_id",orgId).is("revoked_at",null),
    db.from("tw_team_members").select("team_id,user_id,role"),
    db.from("tw_requests").select("id,title,details,decision,submitted_by,decision_reason,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(100),
    db.from("tw_activity").select("id,entity_type,action,created_at,details").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
    db.from("tw_goals").select("id,title,description,status,target_date").eq("organization_id",orgId).order("created_at",{ascending:false}),
    db.from("tw_projects").select("id,name,description,status,team_id,goal_id").eq("organization_id",orgId).order("created_at",{ascending:false}),
    db.rpc("tw_member_directory",{org_id:orgId}),
    db.from("tw_task_handovers").select("id,task_id,from_user,to_user,note,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(100)
   ]);
   if(request!==workspaceRequest.current)return;
   // Keep the successful reads even if an unrelated feature has a query error.
   if(!t.error)setTeams(t.data??[]);
   if(!k.error)setTasks(k.data??[]);
   if(!m.error)setMembers(m.data??[]);
   if(!tm.error)setTeamMembers((tm.data??[]).filter(x=>(t.data??[]).some(team=>team.id===x.team_id)));
   if(!r.error)setRequests(r.data??[]);
   if(!a.error)setActivity(a.data??[]);
   if(!g.error)setGoals(g.data??[]);
   if(!p.error)setProjects(p.data??[]);
   if(!d.error)setDirectory(d.data??[]);
   if(!h.error)setHandovers(h.data??[]);
   const failures=[["teams",t.error],["saved tasks",k.error],["members",m.error],["team membership",tm.error],["requests",r.error],["activity",a.error],["goals",g.error],["projects",p.error],["directory",d.error],["handover history",h.error]].filter((entry)=>entry[1]);
   if(failures.length)setError("Some workspace information could not be loaded: "+failures.map(entry=>entry[0]).join(", ")+". Refresh to try again.");
  }catch(e){
   if(request===workspaceRequest.current)setError(e instanceof Error?e.message:"Unable to load workspace");
  }finally{
   if(request===workspaceRequest.current)setWorkspaceLoading(false);
  }
 },[]);
 const loadOutgoingInvites=useCallback(async(orgId:string)=>{if(!db||!orgId)return;const {data,error}=await db.from("tw_invitations").select("id,email,role,expires_at,accepted_at").eq("organization_id",orgId).order("created_at",{ascending:false});if(error)setError(error.message);else setOutgoingInvites(data??[])},[]);
 useEffect(()=>{if(selected&&members.some(m=>m.user_id===user?.id&&["admin","leader"].includes(m.role)))void loadOutgoingInvites(selected);else setOutgoingInvites([])},[selected,members,user?.id,loadOutgoingInvites]);
 async function revokeInvite(id:string){if(!db||!selected||!manager)return;if(!window.confirm("Revoke this invitation? Its link will stop working."))return;setInviteAction(id);clear();try{const {error}=await db.rpc("tw_revoke_invitation",{invitation_id:id});if(error)throw error;await loadOutgoingInvites(selected);if(inviteShareId===id){setInviteShareReady(false);setInviteShareId("")}setNotice("Invitation revoked.")}catch(e){setError(e instanceof Error?e.message:"Unable to revoke invitation")}finally{setInviteAction("")}}
 function shareExistingInvite(id:string,email:string){setInviteShareEmail(email);setInviteShareId(id);setInviteShareReady(true);setNotice("Invitation link ready to share.")}
 useEffect(()=>{if(!db){setInitial(false);return}let live=true;db.auth.getUser().then(({data,error})=>{if(live){if(error)setError(error.message);setUser(data.user);setInitial(false)}}).catch(()=>{if(live){setError("Unable to connect. Check your internet connection.");setInitial(false)}});const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(live)setUser(session?.user??null);if(_event==="PASSWORD_RECOVERY")setRecovery(true)});return()=>{live=false;subscription.unsubscribe()}},[]);
 useEffect(()=>{if(user){void db?.from("tw_invitations").select("id,email,role,organization_id,expires_at").eq("email",user.email?.toLowerCase()??"").is("accepted_at",null).gt("expires_at",new Date().toISOString()).then(({data})=>setPendingInvites(data??[]));}else setPendingInvites([])},[user]);
 useEffect(()=>{if(user&&typeof window!=="undefined"&&new URLSearchParams(window.location.search).has("invite"))setView("settings")},[user]);
 useEffect(()=>{if(user)void loadOrgs();else{setOrgs([]);setSelected("");setTeams([]);setTasks([])}},[user,loadOrgs]);
 useEffect(()=>{if(selected){setTasks([]);setProjects([]);setMembers([]);setTeams([]);setGoals([]);setDirectory([]);setProjectFilter("all");setSelectedTask("");void loadWorkspace(selected)}else{workspaceRequest.current++;setTeams([]);setTasks([]);setProjects([]);setMembers([]);setGoals([]);setDirectory([]);setWorkspaceLoading(false)}},[selected,loadWorkspace]);
 // Refresh persisted tasks and projects after returning to an open Trackwise tab.
 useEffect(()=>{
  if(!selected||!user)return;
  let lastRefresh=Date.now();
  const checkForUpdates=()=>{
   if(document.visibilityState!=="visible"||Date.now()-lastRefresh<15000)return;
   lastRefresh=Date.now();
   void loadOrgs();
   void loadWorkspace(selected);
  };
  window.addEventListener("focus",checkForUpdates);
  window.addEventListener("online",checkForUpdates);
  document.addEventListener("visibilitychange",checkForUpdates);
  return()=>{window.removeEventListener("focus",checkForUpdates);window.removeEventListener("online",checkForUpdates);document.removeEventListener("visibilitychange",checkForUpdates)};
 },[selected,user?.id,loadWorkspace,loadOrgs]);

 const active=orgs.find(o=>o.id===selected),role=members.find(m=>m.user_id===user?.id)?.role,manager=canManageOrganization(role);
 const unreadNotifications=useUnreadNotifications(selected,user?.id);
 const activeNav=NAV_GROUPS.find(group=>group.items.some(item=>item.view===view))??NAV_GROUPS[0];
 function navigate(to:View){setView(to);setMobileMenu(false);setCreateMenu(false);clear();}
 function launchCreate(kind:"task"|"project"|"team"|"invite"|"request"){
  const target:View=kind==="task"?"tasks":kind==="project"?"projects":kind==="team"?"teams":kind==="invite"?"settings":"requests";
  if(kind==="task")setShowTaskForm(true);
  navigate(target);
  const element=kind==="task"?"taskComposer":kind==="project"?"projectCreator":kind==="team"?"createTeam":kind==="invite"?"inviteMembers":"submitRequest";
  window.setTimeout(()=>document.getElementById(element)?.scrollIntoView({behavior:"smooth",block:"start"}),120);
 }
 function closeGuide(){
  if(user&&selected&&typeof window!=="undefined")window.localStorage.setItem("tw-tour-v3:"+user.id+":"+selected,"seen");
  setShowGuide(false);
 }
 useEffect(()=>{
  if(!user||!selected||!role||workspaceLoading||typeof window==="undefined")return;
  const key="tw-tour-v3:"+user.id+":"+selected;
  if(!window.localStorage.getItem(key))setShowGuide(true);
  setHideChecklist(window.localStorage.getItem("tw-setup-hidden:"+user.id+":"+selected)==="yes");
 },[user?.id,selected,role,workspaceLoading]);
 useEffect(()=>{
  if(!createMenu&&!showGuide)return;
  function onEscape(event:KeyboardEvent){
   if(event.key==="Escape"){setCreateMenu(false);if(showGuide)closeGuide()}
  }
  window.addEventListener("keydown",onEscape);
  return()=>window.removeEventListener("keydown",onEscape);
 },[createMenu,showGuide,user?.id,selected]);

 useEffect(()=>{
  if(!searchOpen)return;
  function onKey(event:KeyboardEvent){if(event.key==="Escape")setSearchOpen(false)}
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
 },[searchOpen]);
 const searchTerm=globalSearch.trim().toLocaleLowerCase();
 const taskMatches=searchTerm?tasks.filter(t=>t.title.toLocaleLowerCase().includes(searchTerm)||(t.description??"").toLocaleLowerCase().includes(searchTerm)).slice(0,8):[];
 const projectMatches=searchTerm?projects.filter(p=>p.name.toLocaleLowerCase().includes(searchTerm)||(p.description??"").toLocaleLowerCase().includes(searchTerm)).slice(0,6):[];
 const peopleMatches=searchTerm?directory.filter(m=>m.display_name.toLocaleLowerCase().includes(searchTerm)).slice(0,6):[];
 function closeSearch(){setSearchOpen(false);setGlobalSearch("")}
 const homeTasks=manager?tasks:tasks.filter(t=>t.owner_id===user?.id);
 const counts=useMemo(()=>({total:homeTasks.length,active:homeTasks.filter(t=>t.status==="underway").length,blocked:homeTasks.filter(t=>t.status==="blocked").length,done:homeTasks.filter(t=>t.status==="completed").length,overdue:homeTasks.filter(t=>t.due_at&&new Date(t.due_at)<new Date()&&t.status!=="completed").length}),[tasks,manager,user?.id]);
 const setupCompleted=[projects.length>0,teams.length>0,members.length>1||outgoingInvites.length>0,tasks.length>0].filter(Boolean).length;
 function openFirstProjectTask(){
  if(!lastCreatedProject)return;
  setTaskProject(lastCreatedProject.id);
  launchCreate("task");
 }
 function showSetup(){
  setHideChecklist(false);
  if(user&&selected)window.localStorage.removeItem("tw-setup-hidden:"+user.id+":"+selected);
  navigate("overview");
 }
 async function auth(e:FormEvent){e.preventDefault();if(!db)return;setWorking(true);clear();try{if(mode==="signup"&&password.length<10)throw new Error("Choose a password with at least 10 characters.");if(mode==="reset"){const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)throw error;setNotice("Password reset email sent. Check your inbox.");return}const result=mode==="signin"?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});if(result.error)throw result.error;if(mode==="signup")setNotice(result.data.session?"Your account is ready.":"Check your email to confirm your account.");}catch(e){setError(e instanceof Error?e.message:"Unable to authenticate")}finally{setWorking(false)}}
 async function saveProfile(e:FormEvent){e.preventDefault();if(!db)return;setProfileSaving(true);clear();try{const name=profileName.trim();if(name.length<2||name.length>80)throw new Error("Display name must be between 2 and 80 characters.");const {error}=await db.auth.updateUser({data:{display_name:name}});if(error)throw error;setNotice("Profile updated.");await loadWorkspace(selected)}catch(e){setError(e instanceof Error?e.message:"Unable to update profile")}finally{setProfileSaving(false)}}
 async function updateMemberRole(memberId:string){
  if(!db||!selected||role!=="admin")return;
  const previous=directory.find(member=>member.user_id===memberId)?.role;
  if(previous===roleChoice){setRoleEditing("");return}
  const willUnassign=["stakeholder","observer"].includes(roleChoice)
   &&tasks.some(task=>task.owner_id===memberId);
  if(willUnassign&&!window.confirm("Changing this person to a read-only role will unassign their current tasks and repeating assignments. Their previous work and history will be preserved. Continue?"))return;
  setWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_change_member_role",{org_id:selected,member_id:memberId,new_role:roleChoice});
   if(error)throw error;
   setRoleEditing("");
   await loadWorkspace(selected);
   setNotice(willUnassign?"Member role updated. Their tasks are now unassigned and can be reassigned.":"Member role updated.");
  }catch(e){setError(displayError(e,"Unable to update this member's role"))}
  finally{setWorking(false)}
 }
 async function removeMember(memberId:string,displayName:string){
  if(!db||!selected||role!=="admin"||!user||memberId===user.id)return;
  if(!window.confirm("Remove "+displayName+" from this organization? They will lose access immediately, their assigned tasks will become unassigned, and past comments and activity will be preserved."))return;
  setWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_remove_member",{org_id:selected,member_id:memberId});
   if(error)throw error;
   await loadWorkspace(selected);
   setNotice(displayName+" was removed from this organization. Their previous work remains in the history.");
  }catch(e){setError(displayError(e,"Unable to remove this person from the organization."))}
  finally{setWorking(false)}
 }
 async function changePassword(e:FormEvent){e.preventDefault();if(!db)return;setWorking(true);clear();try{if(newPassword.length<10)throw new Error("Use at least 10 characters.");const {error}=await db.auth.updateUser({password:newPassword});if(error)throw error;setNewPassword("");setRecovery(false);setNotice("Password updated successfully.")}catch(e){setError(e instanceof Error?e.message:"Unable to update password")}finally{setWorking(false)}}
 async function openTask(id:string){if(!db)return;setSelectedTask(id);setTaskUpdates([]);const {data,error}=await db.from("tw_task_updates").select("id,progress,next_action,created_at,author_id").eq("task_id",id).order("created_at",{ascending:false}).limit(50);if(error)setError(error.message);else setTaskUpdates(data??[])}
 async function addProgress(e:FormEvent){e.preventDefault();if(!db||!selectedTask)return;setWorking(true);clear();try{const {error}=await db.rpc("tw_add_task_update",{target_task:selectedTask,progress_text:progressText.trim(),next_step:nextStep.trim()||null});if(error)throw error;setProgressText("");setNextStep("");await Promise.all([openTask(selectedTask),loadWorkspace(selected)]);setNotice("Progress update recorded.")}catch(e){setError(e instanceof Error?e.message:"Unable to save progress")}finally{setWorking(false)}}
 async function reassignTask(e:FormEvent){e.preventDefault();if(!db||!selected||!selectedTask||!manager)return;setWorking(true);clear();try{const {error}=await db.rpc("tw_reassign_task",{target_task:selectedTask,new_owner:handoverOwner,handover_message:handoverNote.trim()});if(error)throw error;setHandoverOwner("");setHandoverNote("");await loadWorkspace(selected);setNotice("Task reassigned and handover recorded.")}catch(e){setError(e instanceof Error?e.message:"Unable to reassign task")}finally{setWorking(false)}}
 async function createOrg(e:FormEvent){e.preventDefault();if(!db)return;setWorking(true);clear();try{const {data,error}=await db.rpc("tw_create_organization",{org_name:orgName.trim()});if(error)throw error;setOrgName("");await loadOrgs();if(data)setSelected(data);setView("overview");setLastCreatedProject(null);setLastCreatedTeam(null);setNotice("Your organization is ready! Follow the setup checklist or take the guided tour.");}catch(e){setError(e instanceof Error?e.message:"Unable to create workspace")}finally{setWorking(false)}}
 async function createTeam(e:FormEvent){
  e.preventDefault();if(!db||!selected||!manager)return;
  const name=teamName.trim();
  if(name.length<2){setError("Give your team a short descriptive name.");return}
  setWorking(true);clear();
  try{
   const {data:saved,error}=await db.from("tw_teams").insert({organization_id:selected,name}).select("id,name").single();
   if(error)throw error;
   if(!saved)throw new Error("The database did not confirm the new team.");
   setTeamName("");
   setLastCreatedTeam({id:saved.id,name:saved.name});
   setAssignTeam(saved.id);
   await loadWorkspace(selected);
   setNotice("Team created! Add someone to the team or invite a colleague.");
  }catch(e){setError(displayError(e,"Unable to create team"))}
  finally{setWorking(false)}
 }
 async function createTask(e:FormEvent){
  e.preventDefault();
  if(!db||!selected||!user||!manager)return;
  const title=taskTitle.trim();
  if(title.length<2){setError("Enter a task title with at least two characters.");return}
  if(taskFrequency!=="none"&&!taskDue){setError("Choose a first due date for a repeating task.");return}
  setWorking(true);clear();
  try{
   const due=taskDue?new Date(taskDue+"T23:59:00").toISOString():null;
   if(taskFrequency!=="none"){
    const {error:saveError}=await db.rpc("tw_create_recurring_task",{
     org_id:selected,first_due_at:due,task_title:title,
     task_description:taskDescription.trim(),task_priority:taskPriority,
     task_owner:taskOwner||null,task_project:taskProject||null,task_frequency:taskFrequency
    });
    if(saveError)throw saveError;
   }else{
    const {data:saved,error:saveError}=await db.from("tw_tasks")
     .insert({organization_id:selected,created_by:user.id,title,description:taskDescription.trim()||null,
      priority:taskPriority,due_at:due,owner_id:taskOwner||null,project_id:taskProject||null})
     .select("id,title,description,status,priority,due_at,owner_id,created_at,latest_progress,organization_id,project_id").single();
    if(saveError)throw saveError;
    if(!saved)throw new Error("The database did not confirm that your task was saved.");
    setTasks(old=>old.some(t=>t.id===saved.id)?old:[saved as Task,...old]);
   }
   setTaskTitle("");setTaskDescription("");setTaskDue("");setTaskFrequency("none");setTaskOwner("");setTaskProject("");
   setShowTaskForm(false);
   await loadWorkspace(selected);
   if(taskFrequency!=="none")setRecurringRefresh(v=>v+1);
   setNotice(taskFrequency!=="none"?"First task saved. New assignments will be generated automatically on this schedule.":"Task saved to the database.");
  }catch(e){setError(displayError(e,"Unable to save task. Please try again."));}
  finally{setWorking(false)}
 }
 function startTaskEdit(t:Task){
  setEditingTask(t.id);
  setEditTaskTitle(t.title);
  setEditTaskDescription(t.description??"");
  setEditTaskPriority(t.priority);
  setEditTaskProject(t.project_id??"");
  if(t.due_at){
   const d=new Date(t.due_at);
   setEditTaskDue([d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"));
  }else setEditTaskDue("");
 }
 async function saveTaskEdit(e:FormEvent){
  e.preventDefault();
  if(!db||!selected||!manager||!editingTask)return;
  setWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_edit_task",{
    target_task:editingTask,task_title:editTaskTitle.trim(),task_description:editTaskDescription.trim(),
    task_priority:editTaskPriority,task_due:editTaskDue?new Date(editTaskDue+"T23:59:00").toISOString():null,
    task_project:editTaskProject||null
   });
   if(error)throw error;
   await loadWorkspace(selected);
   setEditingTask("");
   setNotice("Task details updated and saved.");
  }catch(e){setError(displayError(e,"Couldn't save task changes."));}
  finally{setWorking(false)}
 }
 async function acceptInvite(id:string){if(!db)return;setInvitesLoading(true);clear();try{const {error}=await db.rpc("tw_accept_invitation",{invitation_id:id});if(error)throw error;setPendingInvites(old=>old.filter(x=>x.id!==id));await loadOrgs();setNotice("Invitation accepted. Your new organization is available.")}catch(e){setError(e instanceof Error?e.message:"Unable to accept invitation")}finally{setInvitesLoading(false)}}
 async function addMember(e:FormEvent){e.preventDefault();if(!db||!selected||!manager)return;setWorking(true);clear();try{const recipient=inviteEmail.trim().toLowerCase();const {error}=await db.rpc("tw_invite_member",{org_id:selected,invite_email:recipient,invite_role:inviteRole});if(error)throw error;setInviteShareReady(false);setInviteShareId("");const {data:invitation,error:invitationError}=await db.from("tw_invitations").select("id").eq("organization_id",selected).eq("email",recipient).single();if(invitationError||!invitation)throw invitationError??new Error("Unable to load invitation link.");setInviteShareEmail(recipient);setInviteShareId(invitation.id);setInviteShareReady(true);setInviteEmail("");await loadOutgoingInvites(selected);setNotice("Invitation created. Copy the link or share it directly with the invited person.");}catch(e){setError(e instanceof Error?e.message:"Unable to invite member")}finally{setWorking(false)}}
 async function updateTask(id:string,status:string){
  if(!db||!selected||!user)return;
  if(status==="completed"&&!manager){
   setError("Only an organization leader can approve and complete tasks. Submit your work for approval instead.");
   return;
  }
  let reason:string|null=null;
  if(status==="blocked"){
   reason=window.prompt("What is blocking this task? Add a short explanation so your team can help.");
   if(!reason?.trim())return;
  }
  setWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_set_task_status",{task_id:id,new_status:status,new_blocker:reason});
   if(error)throw error;
   await loadWorkspace(selected);
   setNotice(status==="completed"?"Task marked complete and saved.":status==="awaiting_approval"?"Task submitted for approval. Your leader can now review it.":"Task status updated and saved.");
  }catch(e){
   setError(displayError(e,"Unable to update the task. Check your permissions and try again."));
  }finally{setWorking(false)}
 }
 async function assignMember(e:FormEvent){e.preventDefault();if(!db||!selected||!manager)return;setWorking(true);clear();try{const {error}=await db.rpc("tw_assign_team_member",{target_team:assignTeam,target_user:assignUser,target_role:assignRole});if(error)throw error;await loadWorkspace(selected);setNotice("Team membership saved.")}catch(e){setError(e instanceof Error?e.message:"Unable to assign team member")}finally{setWorking(false)}}
 async function unassignTeamMember(teamId:string,memberId:string,memberName:string){
  if(!db||!selected||!manager)return;
  if(!window.confirm("Remove "+memberName+" from this team? They will remain a member of your organization."))return;
  setWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_unassign_team_member",{target_team:teamId,target_user:memberId});
   if(error)throw error;
   await loadWorkspace(selected);setNotice(memberName+" was removed from the team.");
  }catch(e){setError(displayError(e,"Unable to remove the team member."))}
  finally{setWorking(false)}
 }
 async function submitRequest(e:FormEvent){e.preventDefault();if(!db||!selected||!user)return;setWorking(true);clear();try{const {error}=await db.from("tw_requests").insert({organization_id:selected,submitted_by:user.id,title:requestTitle.trim(),details:requestDetails.trim()||null});if(error)throw error;setRequestTitle("");setRequestDetails("");await loadWorkspace(selected);setNotice("Request submitted.")}catch(e){setError(e instanceof Error?e.message:"Unable to submit request")}finally{setWorking(false)}}
 async function createTaskFromApprovedRequest(requestId:string){
  if(!db||!selected||!manager)return;
  setWorking(true);clear();
  try{
   const {data:createdId,error:creationError}=await db.rpc("tw_create_task_from_request",{request_id:requestId});
   if(creationError)throw creationError;
   await loadWorkspace(selected);
   setNotice("Task created from the approved request. You can edit its deadline, priority, or assignee.");
   setSelectedTask(createdId);
   setView("tasks");
  }catch(e){setError(displayError(e,"Unable to create a task from this request"))}
  finally{setWorking(false)}
 }
 async function decideRequest(id:string,decision:string){if(!db||!selected||!manager)return;const reason=window.prompt("Explain your decision:");if(!reason?.trim())return;setWorking(true);clear();try{const {error}=await db.rpc("tw_decide_request",{request_id:id,new_decision:decision,reason:reason.trim()});if(error)throw error;await loadWorkspace(selected);setNotice("Decision recorded.")}catch(e){setError(e instanceof Error?e.message:"Unable to decide request")}finally{setWorking(false)}}
 const visibleTasks=tasks.filter(t=>(!myTasksOnly||t.owner_id===user?.id)&&(statusFilter==="all"||t.status===statusFilter)&&(projectFilter==="all"||(projectFilter==="none"?!t.project_id:t.project_id===projectFilter))&&t.title.toLowerCase().includes(search.trim().toLowerCase()));
 async function createGoal(e:FormEvent){
  e.preventDefault();if(!db||!selected||!manager)return;
  setWorking(true);clear();
  try{
   const {error}=await db.from("tw_goals").insert({
    organization_id:selected,title:goalTitle.trim(),description:goalDescription.trim()||null,target_date:goalTarget||null
   });
   if(error)throw error;
   setGoalTitle("");setGoalDescription("");setGoalTarget("");
   await loadWorkspace(selected);setNotice("Goal created and saved.");
  }catch(e){setError(displayError(e,"Unable to create goal"))}finally{setWorking(false)}
 }
 function startGoalEdit(g:Goal){
  setEditingGoal(g.id);setEditGoalTitle(g.title);setEditGoalDescription(g.description??"");
  setEditGoalDate(g.target_date??"");setEditGoalStatus(g.status);
 }
 async function saveGoalEdit(e:FormEvent){
  e.preventDefault();if(!db||!selected||!manager||!editingGoal)return;
  setWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_edit_goal",{
    target_goal:editingGoal,new_title:editGoalTitle.trim(),new_description:editGoalDescription.trim(),
    new_date:editGoalDate||null,new_status:editGoalStatus
   });
   if(error)throw error;
   setEditingGoal("");await loadWorkspace(selected);setNotice("Goal updated.");
  }catch(e){setError(displayError(e,"Unable to save goal changes"))}finally{setWorking(false)}
 }
 async function createProject(e:FormEvent){
  e.preventDefault();
  if(!db||!selected||!manager)return;
  const name=projectName.trim();
  if(!name){setError("Enter a project name before saving.");return}
  setWorking(true);clear();
  try{
   const {data:saved,error:saveError}=await db.from("tw_projects")
    .insert({organization_id:selected,name,description:projectDescription.trim()||null,goal_id:projectGoal||null,team_id:projectTeam||null})
    .select("id,name,description,status,team_id,goal_id")
    .single();
   if(saveError)throw saveError;
   if(!saved)throw new Error("The database did not confirm that the project was saved.");
   setProjects(old=>old.some(p=>p.id===saved.id)?old:[saved as Project,...old]);
   setLastCreatedProject({id:saved.id,name:saved.name});
   setProjectName("");setProjectDescription("");setProjectGoal("");setProjectTeam("");
   await loadWorkspace(selected);
   setNotice("Project created! Your next step is to add its first task.");
  }catch(e){setError(displayError(e,"Unable to save project. Check your organization role and try again."));}
  finally{setWorking(false)}
 }
 function startProjectEdit(p:Project){
  setEditingProject(p.id);setEditProjectName(p.name);setEditProjectDescription(p.description??"");
  setEditProjectGoal(p.goal_id??"");setEditProjectTeam(p.team_id??"");setEditProjectStatus(p.status);
 }
 async function saveProjectEdit(e:FormEvent){
  e.preventDefault();
  if(!db||!selected||!manager||!editingProject)return;
  setWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_edit_project",{
    target_project:editingProject,project_name:editProjectName.trim(),
    project_description:editProjectDescription.trim(),project_goal:editProjectGoal||null,
    project_team:editProjectTeam||null,project_status:editProjectStatus
   });
   if(error)throw error;
   await loadWorkspace(selected);
   setEditingProject("");
   setNotice("Project changes saved.");
  }catch(e){setError(displayError(e,"Couldn't save project changes."));}
  finally{setWorking(false)}
 }
 const taskTable=<><div className="mobileTaskList">{visibleTasks.length?visibleTasks.map(t=><article className="mobileTaskCard" key={t.id}><div className="mobileTaskTop"><span className={"priority "+t.priority}>{statusLabel(t.priority)}</span><span className="mobileTaskDate">{t.due_at?"Due "+new Date(t.due_at).toLocaleDateString():"No deadline"}</span></div><button className="mobileTaskTitle" onClick={()=>void openTask(t.id)}>{t.title} <span aria-hidden="true">↗</span></button><div className="mobileTaskMeta"><span>{t.owner_id===user?.id?"Assigned to you":directory.find(m=>m.user_id===t.owner_id)?.display_name??"Unassigned"}</span><span>{t.project_id?" · "+(projects.find(p=>p.id===t.project_id)?.name??"Project"):" · No project"}</span></div><div className="mobileTaskStatus">{manager||(t.owner_id===user?.id&&t.status!=="completed")?<select aria-label={"Status for "+t.title} value={t.status} disabled={working} onChange={e=>void updateTask(t.id,e.target.value)}>{statuses.filter(st=>st===t.status||(manager?st!=="rejected"||t.status==="awaiting_approval":st!=="completed"&&st!=="rejected")).map(st=><option key={st} value={st}>{actionStatusLabel(st)}</option>)}</select>:<span className="chip">{taskLabel(t.status)}</span>}</div><div className="taskInlineActions">
 {manager&&t.status!=="completed"&&<button type="button" className="primary" disabled={working} onClick={()=>void updateTask(t.id,"completed")}>✓ Complete task</button>}
 {!manager&&t.owner_id===user?.id&&t.status!=="completed"&&t.status!=="awaiting_approval"&&<button type="button" className="primary" disabled={working} onClick={()=>void updateTask(t.id,"awaiting_approval")}>Submit for approval →</button>}
 {t.status==="awaiting_approval"&&<small className="muted">{manager?"Ready for your review":"Waiting for leader approval"}</small>}
</div></article>):<div className="card"><p className="muted">{workspaceLoading?"Loading saved tasks…":manager?"No saved tasks match these filters. Add a task or change your filters.":"No tasks match these filters."}</p></div>}</div><div className="tablewrap"><table><thead><tr><th>Task</th><th>Priority</th><th>Due date</th><th>Project</th><th>Owner</th><th>Status</th></tr></thead><tbody>{visibleTasks.length?visibleTasks.map(t=><tr key={t.id}><td><button className="taskOpen" onClick={()=>void openTask(t.id)}>{t.title}</button></td><td><span className={"priority "+t.priority}>{statusLabel(t.priority)}</span></td><td>{t.due_at?new Date(t.due_at).toLocaleDateString():"—"}</td><td>{t.project_id?projects.find(p=>p.id===t.project_id)?.name??"Project":"—"}</td><td>{t.owner_id===user?.id?"You":directory.find(m=>m.user_id===t.owner_id)?.display_name??(t.owner_id?"Assigned":"Unassigned")}</td><td>{manager||(t.owner_id===user?.id&&t.status!=="completed")?<select aria-label={"Status for "+t.title} value={t.status} disabled={working} onChange={e=>void updateTask(t.id,e.target.value)}>{statuses.filter(st=>st===t.status||(manager?st!=="rejected"||t.status==="awaiting_approval":st!=="completed"&&st!=="rejected")).map(st=><option key={st} value={st}>{actionStatusLabel(st)}</option>)}</select>:<span className="chip">{taskLabel(t.status)}</span>}</td></tr>):<tr><td colSpan={6} className="muted">{workspaceLoading?"Loading saved tasks from the database…":manager?"No saved tasks match your filters. Select Add task to create one.":"No saved tasks match your filters."}</td></tr>}</tbody></table></div></>;
 if(recovery&&user)return <main className="recoveryPage"><section className="card recoveryCard"><h1>Choose a new password</h1><p className="muted">Set a secure password for your Trackwise account.</p>{error&&<p role="alert" className="feedback bad">{error}</p>}{notice&&<p className="feedback good">{notice}</p>}<form onSubmit={changePassword}><label htmlFor="newPassword">New password</label><input id="newPassword" type="password" autoComplete="new-password" minLength={10} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button className="primary" disabled={working}>Update password</button></form></section></main>;
 if(!ready)return <main className="center"><div className="card"><h1>Trackwise</h1><h2>Setup required</h2><p>Supabase environment variables are missing from this deployment.</p></div></main>;
 if(initial)return <main className="center"><div className="spinner"/><p>Preparing your workspace…</p></main>;
 if(!user)return <main className="authShell"><div className="authHero"><div className="logo light"><span className="mark">T</span> Trackwise</div><div><span className="eyebrow">A clearer way to lead</span><h1>Every task.<br/>Every team.<br/><em>One clear picture.</em></h1><p>Turn scattered updates into focused action, shared accountability, and measurable progress.</p><div className="heroChips"><span>✓ Clear ownership</span><span>✓ Live progress</span><span>✓ Team visibility</span></div></div><small>Designed for leaders who value clarity.</small></div><div className="authSide"><div className="authCard"><div className="mobileLogo logo"><span className="mark">T</span> Trackwise</div><span className="eyebrow blue">YOUR WORKSPACE STARTS HERE</span><h2>{mode==="signin"?"Welcome back":mode==="signup"?"Create your account":"Reset your password"}</h2><p className="muted">{mode==="signin"?"Sign in to pick up where your team left off.":mode==="signup"?"Bring your people and priorities together.":"We'll send a reset link to your email."}</p><form onSubmit={auth}><label htmlFor="email">Email address</label><input id="email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/>{mode!=="reset"&&<><label htmlFor="password">Password</label><input id="password" type="password" minLength={mode==="signup"?10:1} placeholder={mode==="signup"?"At least 10 characters":"Enter your password"} autoComplete={mode==="signin"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} required/>{mode==="signup"&&<p className="muted" style={{fontSize:12,marginTop:6}}>Use at least 10 characters and a unique password. A long passphrase is a good choice.</p>}</>}<button className="primary wide" disabled={working}>{working?"Please wait…":mode==="signin"?"Sign in →":mode==="signup"?"Create account →":"Send reset link →"}</button></form>{mode==="signin"&&<button className="linkButton" onClick={()=>{setMode("reset");clear()}}>Forgot password?</button>}<div className="authSwitch">{mode==="signin"?"New to Trackwise?":mode==="signup"?"Already have an account?":"Remember your password?"} <button className="linkButton" onClick={()=>{setMode(mode==="signin"?"signup":"signin");clear()}}>{mode==="signin"?"Create an account":"Sign in"}</button></div>{error&&<p role="alert" className="feedback bad">{error}</p>}{notice&&<p role="status" className="feedback good">{notice}</p>}</div></div></main>;
 return <div className="appShell"><div className="mobileTopbar"><div className="logo"><span className="mark">T</span> Trackwise</div><button type="button" className="mobileMenuToggle" aria-label="Open workspace menu" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(v=>!v)}>☰ <span>Menu</span></button></div>{mobileMenu&&<button className="mobileBackdrop" aria-label="Close menu" onClick={()=>setMobileMenu(false)}/>}<aside className={"sidebar "+(mobileMenu?"mobileOpen":"")}><div className="logo"><span className="mark">T</span> Trackwise</div><div className="sideLabel">WORKSPACE</div><select className="orgSelect" aria-label="Current organization" value={selected} onChange={e=>{setSelected(e.target.value);setLastCreatedProject(null);setLastCreatedTeam(null);setProjectFilter("all");setView("overview");setMobileMenu(false);clear()}}><option value="">Select organization</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><button type="button" className="sidebarGuideButton" onClick={()=>setShowGuide(true)}><span aria-hidden="true">✦</span><span><strong>Take a guided tour</strong><small>See how everything works</small></span><span aria-hidden="true">→</span></button><nav aria-label="Main navigation">{NAV_GROUPS.map(group=><button type="button" key={group.id} className={"navItem "+(activeNav.id===group.id?"selected":"")} aria-current={activeNav.id===group.id?"page":undefined} onClick={()=>navigate(group.defaultView)}><span aria-hidden="true">{group.icon}</span>{group.label}{group.id==="inbox"&&unreadNotifications>0&&<span className="unreadNavCount" aria-label={unreadNotifications+" unread notifications"}>{unreadNotifications>99?"99+":unreadNotifications}</span>}</button>)}</nav><div className="sideFoot"><div className="avatar">{(user.email??"U").slice(0,1).toUpperCase()}</div><div className="userDetails"><strong>{user.email?.split("@")[0]}</strong><small>{role?statusLabel(role):"Account"}</small></div><button className="logout" title="Sign out" aria-label="Sign out" onClick={()=>void db?.auth.signOut()}>↪</button></div></aside><div className="workspace"><header className="appHeader">
 <div className="pageHeading"><span className="eyebrow blue">TRACKWISE / {activeNav.label.toUpperCase()}</span>
  <h1>{view==="overview"?"Your workspace":view==="tasks"?"Tasks":view==="calendar"?"Task calendar":view==="meeting_ai"?"Meeting assistant":view==="projects"?"Projects":view==="planning"?"Goals & planning":view==="people"?"People":view==="teams"?"Teams":view==="notifications"?"Inbox":view==="collaboration"?"Team messages":view==="requests"?"Requests & approvals":view==="reports"?"Reports":view==="resources"?"Budgets & resources":view==="activity"?"Activity history":"Settings"}</h1>
  <p className="muted">{view==="overview"?"See what needs attention and keep work moving.":view==="tasks"?"Find, assign, and finish work.":view==="calendar"?"See deadlines at a glance.":view==="meeting_ai"?"Turn meeting decisions into reviewed tasks and plans.":view==="projects"?"Group related tasks and see what's moving.":view==="people"?"Find your colleagues and manage your teams.":view==="teams"?"Bring people together around shared work.":view==="notifications"?"Your updates, requests, and conversations in one place.":view==="settings"?"Your account, organization, and invitations.":"Keep everything organized in one place."}</p>
 </div>
 <div className="headerControls">
  {active&&<button type="button" className="headerSearch" aria-label="Search tasks, projects, and people" onClick={()=>{setSearchOpen(true);setCreateMenu(false)}}>⌕ <span>Search</span></button>}
  <button type="button" className="headerHelp" onClick={()=>{setShowGuide(true);setCreateMenu(false)}} aria-label="Open guided setup and feature explanations">✦ <span>Guided help</span></button>
  {active&&<div className="createWrapper">
   <button type="button" className="primary mainCreateButton" aria-expanded={createMenu} aria-controls="globalCreateMenu" onClick={()=>setCreateMenu(v=>!v)}>＋ {manager?"Create":"Quick actions"} <span aria-hidden="true">⌄</span></button>
   {createMenu&&<><button type="button" className="createDismiss" aria-label="Close create menu" onClick={()=>setCreateMenu(false)}/><div className="createDropdown" id="globalCreateMenu" role="menu" aria-label="Quick actions">
    {manager?<><button type="button" role="menuitem" onClick={()=>launchCreate("task")}><strong>☑ New task</strong><small>Assign something to get done</small></button>
    <button type="button" role="menuitem" onClick={()=>launchCreate("project")}><strong>▧ New project</strong><small>Group related tasks</small></button>
    <button type="button" role="menuitem" onClick={()=>navigate("meeting_ai")}><strong>✦ Review meeting notes</strong><small>Suggest tasks and changes from a transcript</small></button>
    <button type="button" role="menuitem" onClick={()=>launchCreate("team")}><strong>♙ New team</strong><small>Organize your members</small></button>
    <button type="button" role="menuitem" onClick={()=>launchCreate("invite")}><strong>✉ Invite a person</strong><small>Copy or share an invitation link</small></button></>:
    <><button type="button" role="menuitem" onClick={()=>launchCreate("request")}><strong>✉ New request</strong><small>Ask your leader for support</small></button>
    <button type="button" role="menuitem" onClick={()=>{setMyTasksOnly(true);navigate("tasks")}}><strong>☑ My tasks</strong><small>See work assigned to you</small></button></>}
   </div></>}
  </div>}
  <span className="userBadge" title={user.email??""}>{user.email}</span>
 </div>
</header><main className="content"><div className="contentWidth">
 {active&&activeNav.items.length>1&&<nav className="sectionTabs" aria-label={activeNav.label+" sections"}>{activeNav.items.filter(item=>item.view!=="meeting_ai"||manager).map(item=><button type="button" key={item.view} className={view===item.view?"active":""} aria-current={view===item.view?"page":undefined} onClick={()=>navigate(item.view)}>{item.label}</button>)}</nav>}
 {error&&<p role="alert" className="feedback bad">{error}</p>}{notice&&<p role="status" className="feedback good">{notice}</p>}{!active?<div className="card emptyState">{pendingInvites.length>0&&<section><h2>Invitations for you</h2>{pendingInvites.map(i=><div className="reportRow" key={i.id}><span>Invitation to join as {statusLabel(i.role)}</span><button className="primary" disabled={invitesLoading} onClick={()=>void acceptInvite(i.id)}>Accept</button></div>)}</section>}<span className="bigIcon">✦</span><span className="eyebrow blue">WELCOME · STEP 1 OF 3</span><h2>Let's create your first workspace</h2>
 <p className="muted">You can create an organization to organize projects and tasks, or join someone else's organization through an invitation link.</p>
 <div className="startChoices"><div className="startChoice"><strong>🏢 Start an organization</strong><p>You'll be its administrator, so you can invite people, create projects and assign tasks.</p></div><div className="startChoice"><strong>✉ Join an organization</strong><p>Ask your leader to share an invitation link with you. Sign in with your invited email and accept it here.</p></div></div><div className="organizationSetupForm"><label htmlFor="firstOrgName">Organization name</label>
 <form onSubmit={createOrg} className="inlineForm"><input id="firstOrgName" aria-label="Organization name" minLength={2} maxLength={120} value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="e.g. Volunteerism Club" required/><button type="submit" className="primary" disabled={working}>{working?"Creating…":"Create & start setup →"}</button></form>
 <small className="fieldHint">You'll be the administrator. Only approved members can see your organization's work.</small></div></div>:<>{view==="overview"&&!hideChecklist&&<section className="card setupChecklist">
 <div className="sectionHead"><div><span className="eyebrow blue">GETTING STARTED</span><h2>{manager?"Set up your workspace":"Make Trackwise your own"}</h2>{manager&&<span className="setupCount">{setupCompleted} of 4 steps complete</span>}</div><button type="button" className="textAction" onClick={()=>{setHideChecklist(true);if(user&&selected)window.localStorage.setItem("tw-setup-hidden:"+user.id+":"+selected,"yes")}}>Hide checklist ×</button></div>
 <p className="muted">{manager?"Complete these steps to organize your work. You can do them in any order.":"Trackwise helps you follow your tasks and stay in touch with your team."}</p>
 {manager&&<progress className="workspaceSetupProgress" value={setupCompleted} max={4} aria-label={"Workspace setup: "+setupCompleted+" out of 4 steps complete"}/>}
 {manager?<div className="setupSteps">
  {([{label:"Create a project",done:projects.length>0,action:()=>launchCreate("project"),help:"Start with the result you want to achieve."},
  {label:"Create a team",done:teams.length>0,action:()=>launchCreate("team"),help:"Give your group a clear name."},
  {label:"Invite a person",done:members.length>1||outgoingInvites.length>0,action:()=>launchCreate("invite"),help:"Share a link so a teammate can join."},
  {label:"Add a task",done:tasks.length>0,action:()=>launchCreate("task"),help:"Assign something and set a deadline."}]).map(item=><button type="button" key={item.label} className={"setupStep "+(item.done?"done":"")} onClick={item.action}><span className="setupCheck" aria-hidden="true">{item.done?"✓":"○"}</span><span><strong>{item.label}</strong><small>{item.done?"Done!":item.help}</small></span><span aria-hidden="true">→</span></button>)}</div>:
  <div className="setupSteps"><button type="button" className="setupStep" onClick={()=>{setMyTasksOnly(true);navigate("tasks")}}><span className="setupCheck">☑</span><span><strong>Find your tasks</strong><small>See what your team has assigned to you.</small></span><span>→</span></button><button type="button" className="setupStep" onClick={()=>navigate("notifications")}><span className="setupCheck">◉</span><span><strong>Check your inbox</strong><small>Find messages, updates and requests.</small></span><span>→</span></button><button type="button" className="setupStep" onClick={()=>navigate("people")}><span className="setupCheck">♙</span><span><strong>Meet your team</strong><small>See your organization and its members.</small></span><span>→</span></button></div>}
 <button type="button" className="textAction setupHelpLink" onClick={()=>setShowGuide(true)}>Learn each step with the guided tour →</button>
 </section>}{view==="overview"&&<><div className="welcome"><div><span className="eyebrow">YOUR WORKSPACE · {role?statusLabel(role):"Role pending"}</span><h2>{active.name}</h2><p>Everything your team needs, organized in one place.</p></div><button onClick={()=>setView("tasks")}>Open tasks ↗</button></div><section className="quickActions" aria-label="Quick actions">
 {manager?<><button type="button" onClick={()=>launchCreate("task")}><span className="quickIcon">＋</span><span><strong>New task</strong><small>Create & assign</small></span></button>
 <button type="button" onClick={()=>launchCreate("project")}><span className="quickIcon">▧</span><span><strong>New project</strong><small>Organize work</small></span></button>
 <button type="button" onClick={()=>launchCreate("invite")}><span className="quickIcon">✉</span><span><strong>Invite person</strong><small>Grow your team</small></span></button>
 <button type="button" onClick={()=>navigate("reports")}><span className="quickIcon">▤</span><span><strong>Reports</strong><small>Track results</small></span></button></>:
 <><button type="button" onClick={()=>{setMyTasksOnly(true);navigate("tasks")}}><span className="quickIcon">☑</span><span><strong>My tasks</strong><small>See assignments</small></span></button>
 <button type="button" onClick={()=>navigate("collaboration")}><span className="quickIcon">◈</span><span><strong>Team chat</strong><small>Share an update</small></span></button>
 <button type="button" onClick={()=>launchCreate("request")}><span className="quickIcon">✉</span><span><strong>New request</strong><small>Ask your leader</small></span></button>
 <button type="button" onClick={()=>navigate("people")}><span className="quickIcon">♙</span><span><strong>My team</strong><small>Meet people</small></span></button></>}
 </section><section className="card"><div className="sectionHead"><h2>My assignments</h2><button type="button" onClick={()=>{setMyTasksOnly(true);setView("tasks")}}>View my tasks →</button></div><div className="stats"><div className="stat"><span>Assigned to me</span><strong>{tasks.filter(t=>t.owner_id===user.id).length}</strong></div><div className="stat"><span>Due soon</span><strong>{tasks.filter(t=>t.owner_id===user.id&&t.due_at&&new Date(t.due_at).getTime()>=Date.now()&&new Date(t.due_at).getTime()<Date.now()+7*86400000&&t.status!=="completed").length}</strong></div><div className="stat"><span>Overdue</span><strong>{tasks.filter(t=>t.owner_id===user.id&&t.due_at&&new Date(t.due_at)<new Date()&&t.status!=="completed").length}</strong></div></div></section><div className="stats"><div className="stat"><span>{manager?"All tasks":"My tasks"}</span><strong>{counts.total}</strong><small>{manager?"Across your workspace":"Assigned to you"}</small></div><div className="stat"><span>In progress</span><strong>{counts.active}</strong><small>Currently underway</small></div><div className="stat"><span>Blocked</span><strong>{counts.blocked}</strong><small>Need attention</small></div><div className="stat"><span>Completed</span><strong>{counts.done}</strong><small>Finished tasks</small></div></div><div className="twoCol"><section className="card"><div className="sectionHead"><h2>{manager?"Recent work":"My recent tasks"}</h2><button className="textAction" onClick={()=>setView("tasks")}>View all →</button></div>{homeTasks.slice(0,5).length?homeTasks.slice(0,5).map(t=><div className="taskLine" key={t.id}><span className={"taskDot "+t.status}/><div><strong>{t.title}</strong><small>{taskLabel(t.status)} · {statusLabel(t.priority)} priority</small></div></div>):<p className="muted">{manager?"Tasks will appear here after you create them.":"Your leader can assign tasks to you. They will appear here when assigned."}</p>}</section><section className="card"><div className="sectionHead"><h2>At a glance</h2><button className="textAction" onClick={()=>setView("teams")}>Manage →</button></div><div className="snapshot"><strong>{teams.length}</strong><span>Active teams</span></div><div className="snapshot"><strong>{members.length}</strong><span>Organization members</span></div><div className="snapshot"><strong>{counts.overdue}</strong><span>Overdue tasks</span></div></section></div></>}{view==="calendar"&&<TaskCalendar tasks={tasks} projects={projects} onOpenTask={id=>{navigate("tasks");void openTask(id)}}/>}{view==="tasks"&&<>{selectedTask&&<section className="card"><div className="sectionHead"><h2>{tasks.find(t=>t.id===selectedTask)?.title??"Task details"}</h2><button className="textAction" onClick={()=>setSelectedTask("")}>Close ×</button></div><div className="taskDetailsSummary"><p><strong>Project: </strong>{projects.find(p=>p.id===tasks.find(t=>t.id===selectedTask)?.project_id)?.name??"Not linked"}</p><p><strong>Assigned to: </strong>{directory.find(m=>m.user_id===tasks.find(t=>t.id===selectedTask)?.owner_id)?.display_name??"Unassigned"}</p>{tasks.find(t=>t.id===selectedTask)?.description&&<p className="detailDescription">{tasks.find(t=>t.id===selectedTask)?.description}</p>}</div>
 {manager&&<div className="taskEditToggle"><button type="button" className="textAction" onClick={()=>{
 const task=tasks.find(t=>t.id===selectedTask);
 if(editingTask===selectedTask){setEditingTask("");return}
 if(task)startTaskEdit(task);
 }}>{editingTask===selectedTask?"Cancel editing ×":"✎ Edit task details"}</button></div>}
 {manager&&editingTask===selectedTask&&<form className="taskEditForm formGrid" onSubmit={saveTaskEdit}>
  <div className="span2"><label htmlFor="editTaskTitle">Task title</label><input id="editTaskTitle" required minLength={2} maxLength={180} value={editTaskTitle} onChange={e=>setEditTaskTitle(e.target.value)}/></div>
  <div className="span2"><label htmlFor="editTaskDescription">Description</label><textarea id="editTaskDescription" rows={3} maxLength={4000} value={editTaskDescription} onChange={e=>setEditTaskDescription(e.target.value)}/></div>
  <div><label htmlFor="editTaskPriority">Priority</label><select id="editTaskPriority" value={editTaskPriority} onChange={e=>setEditTaskPriority(e.target.value)}>{["low","normal","high","urgent"].map(p=><option key={p} value={p}>{statusLabel(p)}</option>)}</select></div>
  <div><label htmlFor="editTaskDue">Due date</label><input id="editTaskDue" type="date" value={editTaskDue} onChange={e=>setEditTaskDue(e.target.value)}/></div>
  <div className="span2"><label htmlFor="editTaskProject">Project</label><select id="editTaskProject" value={editTaskProject} onChange={e=>setEditTaskProject(e.target.value)}><option value="">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
  <div className="span2"><button className="primary" type="submit" disabled={working}>{working?"Saving…":"Save changes"}</button><button type="button" onClick={()=>setEditingTask("")}>Cancel</button></div>
 </form>}
 <div className="taskActionPanel">
  <p className="muted">{manager?"Leaders can mark completed work as finished. You can also review progress and reassign the task below.":"Mark work as ready for approval when you finish. Only an organization leader can approve it as completed."}</p>
  {manager&&tasks.find(t=>t.id===selectedTask)?.status!=="completed"&&<button type="button" className="primary" disabled={working} onClick={()=>void updateTask(selectedTask,"completed")}>✓ {tasks.find(t=>t.id===selectedTask)?.status==="awaiting_approval"?"Approve & complete":"Mark task completed"}</button>}
  {!manager&&tasks.find(t=>t.id===selectedTask)?.owner_id===user.id&&tasks.find(t=>t.id===selectedTask)?.status!=="completed"&&tasks.find(t=>t.id===selectedTask)?.status!=="awaiting_approval"&&<button type="button" className="primary" disabled={working} onClick={()=>void updateTask(selectedTask,"awaiting_approval")}>Submit for approval →</button>}
  {tasks.find(t=>t.id===selectedTask)?.status==="completed"&&<p role="status" className="taskCompletedLabel">✓ Task completed</p>}
  {!manager&&tasks.find(t=>t.id===selectedTask)?.status==="awaiting_approval"&&<p role="status" className="muted">Your task is waiting for a leader to approve it.</p>}
 </div><details className="taskCollaboration" open>
 <summary>☑ Checklist, 💬 comments and 📎 files</summary>
 <p className="muted">Keep the steps, updates, and documents for this task in one place.</p>
 <TaskExtras key={selectedTask} organizationId={selected} taskId={selectedTask} userId={user.id} manager={manager} canComment={manager||role==="member"} canEditChecklist={canEditTaskChecklist(role,tasks.find(t=>t.id===selectedTask)?.owner_id,user.id)} directory={directory}/>
 </details>{manager&&<div className="detailAction"><button className="textAction" onClick={()=>setShowTaskHandover(v=>!v)}>{showTaskHandover?"Hide reassignment":"↗ Reassign task"}</button></div>}{manager&&showTaskHandover&&<form onSubmit={reassignTask} className="handoverForm"><h3>Reassign task</h3><label htmlFor="handoverOwner">New owner</label><select id="handoverOwner" value={handoverOwner} onChange={e=>setHandoverOwner(e.target.value)} required><option value="">Choose a member</option>{directory.filter(m=>canOwnTask(m.role)&&m.user_id!==tasks.find(t=>t.id===selectedTask)?.owner_id).map(m=><option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select><label htmlFor="handoverNote">Handover instructions</label><textarea id="handoverNote" rows={3} required minLength={3} maxLength={2000} value={handoverNote} onChange={e=>setHandoverNote(e.target.value)}/><button className="primary" style={{marginTop:12}} disabled={working}>Confirm handover</button></form>}<details className="detailDisclosure"><summary>Handover history ({handovers.filter(h=>h.task_id===selectedTask).length})</summary>{handovers.filter(h=>h.task_id===selectedTask).map(h=><div className="taskLine" key={h.id}><span className="taskDot"/><div><strong>{directory.find(m=>m.user_id===h.from_user)?.display_name??"Unassigned"} → {directory.find(m=>m.user_id===h.to_user)?.display_name??"Member"}</strong><p className="muted">{h.note}</p><small>{new Date(h.created_at).toLocaleString()}</small></div></div>)}</details><h3>Progress history</h3>{taskUpdates.length?taskUpdates.map(u=><div key={u.id} className="taskLine"><span className="taskDot"/><div><strong>{u.progress}</strong><small>{u.next_action?"Next: "+u.next_action+" · ":""}{new Date(u.created_at).toLocaleString()}</small></div></div>):<p className="muted">No progress updates recorded.</p>}{(manager||tasks.find(t=>t.id===selectedTask)?.owner_id===user?.id)&&<form onSubmit={addProgress}><label htmlFor="progressText">Progress update</label><textarea id="progressText" required minLength={2} maxLength={2000} rows={3} value={progressText} onChange={e=>setProgressText(e.target.value)} placeholder="What has been accomplished?"/><label htmlFor="nextStep">Next action</label><input id="nextStep" value={nextStep} onChange={e=>setNextStep(e.target.value)} placeholder="What happens next?"/><button className="primary" style={{marginTop:14}} disabled={working}>Save progress</button></form>}</section>}{manager&&showTaskForm&&<section className="card taskComposer" id="taskComposer"><div className="sectionHead"><div><span className="eyebrow blue">ADD WORK · STEP 1</span><h2>Create a task</h2></div><button type="button" className="textAction" onClick={()=>setShowTaskForm(false)}>Close ×</button></div><p className="muted">Start with what needs doing. You can add the details later; only the title is required.</p><form onSubmit={createTask} className="formGrid friendlyForm">
 <div className="span2"><label htmlFor="taskTitle">What needs to be done? <span className="requiredMark">*</span></label>
  <input id="taskTitle" value={taskTitle} minLength={2} maxLength={180} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Prepare the event budget" required autoComplete="off"/>
  <small className="fieldHint">One clear action makes a task easier to assign and finish.</small></div>
 <div><label htmlFor="owner">Who is responsible?</label><select id="owner" value={taskOwner} onChange={e=>setTaskOwner(e.target.value)}><option value="">Choose later (unassigned)</option>{directory.filter(m=>canOwnTask(m.role)).map(m=><option key={m.user_id} value={m.user_id}>{m.user_id===user.id?"Me":m.display_name}</option>)}</select>
  {directory.filter(m=>canOwnTask(m.role)).length<=1&&<small className="fieldHint">To assign someone else, invite them first in People.</small>}</div>
 <div><label htmlFor="due">When is it due?</label><input id="due" type="date" value={taskDue} onChange={e=>setTaskDue(e.target.value)}/></div>
 <div className="span2"><label htmlFor="taskProject">Which project is this for?</label><select id="taskProject" value={taskProject} onChange={e=>setTaskProject(e.target.value)}><option value="">No project (organize later)</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
  <button type="button" className="textAction smallLink" onClick={()=>launchCreate("project")}>Don't have a project? Create one →</button></div>
 <details className="formAdvanced span2">
  <summary>More options <span>Instructions, priority and repeating tasks</span><span aria-hidden="true">⌄</span></summary>
  <div className="formAdvancedFields">
   <div><label htmlFor="taskDescription">Instructions or context</label><textarea id="taskDescription" rows={3} maxLength={4000} value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} placeholder="What does a good finished result look like?"/></div>
   <div><label htmlFor="priority">Priority</label><select id="priority" value={taskPriority} onChange={e=>setTaskPriority(e.target.value)}>{["low","normal","high","urgent"].map(x=><option key={x} value={x}>{statusLabel(x)}</option>)}</select></div>
   <div><label htmlFor="taskFrequency">Repeat schedule</label><select id="taskFrequency" value={taskFrequency} onChange={e=>setTaskFrequency(e.target.value)}><option value="none">One-time task</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select>
    {taskFrequency!=="none"&&<small className="fieldHint">Choose a first due date above. Trackwise will generate future instances automatically.</small>}</div>
  </div>
 </details>
 <div className="span2 friendlyActions"><button className="primary" type="submit" disabled={working}>{working?"Saving task…":"Create task →"}</button><button type="button" onClick={()=>setShowTaskForm(false)} disabled={working}>Cancel</button></div></form></section>}<section className="card"><div className="sectionHead"><div><h2>Saved tasks <span className="count">{tasks.length}</span></h2><p className="muted">Tasks are stored in your organization database. Select Refresh to check for updates.</p></div><div className="headerActions">{manager&&<button className="primary" onClick={()=>{setShowTaskForm(v=>!v);setTimeout(()=>document.getElementById("taskComposer")?.scrollIntoView({behavior:"smooth",block:"start"}),100)}}>{showTaskForm?"Close form":"＋ Add task"}</button>}<button type="button" className="textAction" onClick={()=>{setView("projects");setProjectFilter("all");setMobileMenu(false);setTimeout(()=>document.getElementById("projectCreator")?.scrollIntoView({behavior:"smooth",block:"start"}),80)}}>{manager?"＋ Add project":"View projects"} →</button><button className="textAction" disabled={workspaceLoading} onClick={()=>void loadWorkspace(selected)}>{workspaceLoading?"Loading…":"↻ Refresh"}</button></div></div><details className="workflowHelp"><summary>How do task statuses work?</summary>
 <p>To do → In progress → For review → Completed. Tasks can also be marked <strong>Blocked</strong> when you need help or <strong>Needs changes</strong> when a leader asks for revisions.</p>
 <p>{manager?"As a leader, you can mark a task complete after reviewing it.":"When you finish your task, select Submit for approval. A leader will review and complete it."}</p></details>
 <div className="filterBar"><label className="taskOwnerFilter"><input type="checkbox" checked={myTasksOnly} onChange={e=>setMyTasksOnly(e.target.checked)}/> My tasks only</label><input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(x=><option key={x} value={x}>{taskLabel(x)}</option>)}</select><select aria-label="Filter by project" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="all">All projects</option><option value="none">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>{taskTable}</section><RecurringSchedules key={selected} organizationId={selected} manager={manager} refreshKey={recurringRefresh} directory={directory} projects={projects}/></>}{view==="people"&&<>
 <section className="card peopleIntro">
  <div className="sectionHead"><div><span className="eyebrow blue">WORK TOGETHER</span><h2>People in {active.name}</h2></div>{manager&&<button type="button" className="primary" onClick={()=>launchCreate("invite")}>＋ Invite a person</button>}</div>
  <p className="muted">Invite people before assigning them tasks or adding them to teams. Each person can join using the invitation link you share with them.</p>
  <div className="stats"><div className="stat"><span>Members</span><strong>{members.length}</strong></div><div className="stat"><span>Teams</span><strong>{teams.length}</strong></div><div className="stat"><span>Pending invitations</span><strong>{manager?outgoingInvites.filter(i=>!i.accepted_at&&new Date(i.expires_at)>new Date()).length:"—"}</strong></div></div>
 </section>
 <section className="card">
  <div className="sectionHead"><h2>Organization members</h2>{role==="admin"&&<button type="button" className="textAction" onClick={()=>navigate("settings")}>Manage roles →</button>}</div>
  {directory.length?directory.map(m=><div key={m.user_id} className="memberManageRow"><div className="peopleIdentity"><span className="peopleAvatar">{m.display_name.slice(0,1).toUpperCase()}</span><div><strong>{m.display_name}{m.user_id===user.id?" (You)":""}</strong><small>{statusLabel(m.role)} · {teamMembers.filter(t=>t.user_id===m.user_id).length} team(s)</small></div></div>{role==="admin"&&m.user_id!==user.id&&<button type="button" className="dangerAction" disabled={working} onClick={()=>void removeMember(m.user_id,m.display_name)}>Remove</button>}</div>):<p className="muted">{workspaceLoading?"Loading people…":"You can invite your first colleague using the button above."}</p>}
 </section>
 <section className="card"><div className="sectionHead"><h2>Teams</h2><button type="button" className="primary" onClick={()=>navigate("teams")}>{manager?"Manage teams →":"See teams →"}</button></div><p className="muted">Teams help you organize members around a project or shared responsibility. Create a team and add people who have joined the organization.</p>{teams.slice(0,5).map(t=><div key={t.id} className="taskLine"><span className="taskDot underway"/><div><strong>{t.name}</strong><small>{teamMembers.filter(m=>m.team_id===t.id).length} member(s)</small></div></div>)}</section>
 </>}{view==="teams"&&<><section className="card"><div className="sectionHead"><h2>Teams <span className="count">{teams.length}</span></h2></div><div className="teamGrid">{teams.length?teams.map(t=><div className="teamCard" key={t.id}>
 <div className="teamSymbol">♙</div><h3>{t.name}</h3>
 <p className="muted">{teamMembers.filter(m=>m.team_id===t.id).length} assigned members</p>
 <div className="teamMemberList">{teamMembers.filter(m=>m.team_id===t.id).map(tm=><div className="teamMemberRow" key={tm.user_id}>
  <span><strong>{directory.find(m=>m.user_id===tm.user_id)?.display_name??"Member"}</strong><small>{statusLabel(tm.role)}</small></span>
  {manager&&<button type="button" className="textAction" disabled={working} onClick={()=>void unassignTeamMember(t.id,tm.user_id,directory.find(m=>m.user_id===tm.user_id)?.display_name??"This member")}>Remove</button>}
 </div>)}</div>
 </div>):<p className="muted">No teams yet. Administrators and leaders can create a team below, then assign organization members. If you are a member, ask your leader to create a team.</p>}</div></section>{manager&&<section className="card teamCreateCard" id="createTeam"><div className="sectionHead"><div><span className="eyebrow blue">ORGANIZE PEOPLE · STEP 1</span><h2>Create a team</h2></div></div><p className="muted">Teams help colleagues working on the same thing stay organized. Create a team now and add members next.</p>
 <form onSubmit={createTeam} className="inlineForm">
  <label className="srOnly" htmlFor="teamNewName">Team name</label><input id="teamNewName" aria-label="Team name" value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="e.g. Outreach committee" minLength={2} maxLength={120} required/><button className="primary" disabled={working}>{working?"Creating…":"Create team →"}</button>
 </form>
 {lastCreatedTeam&&<div className="creationSuccess" role="status"><span className="creationSuccessIcon" aria-hidden="true">✓</span><div><strong>{lastCreatedTeam.name} was created!</strong><p>{members.length>1?"Next, choose who belongs to this team.":"Invite teammates first, then assign them to the team."}</p></div>
 <button type="button" className="primary" onClick={()=>{if(members.length>1){setAssignTeam(lastCreatedTeam.id);document.getElementById("assignTeamMembers")?.scrollIntoView({behavior:"smooth",block:"start"})}else launchCreate("invite")}}>{members.length>1?"Assign people →":"Invite someone →"}</button></div>}
 </section>}</>}{view==="teams"&&manager&&members.length>0&&teams.length>0&&<section className="card" id="assignTeamMembers"><div className="sectionHead"><div><span className="eyebrow blue">ORGANIZE PEOPLE · STEP 2</span><h2>Add people to a team</h2></div></div><p className="muted">Select a team, an existing organization member, and their team role.</p><form onSubmit={assignMember} className="formGrid"><div><label htmlFor="assignTeam">Team</label><select id="assignTeam" required value={assignTeam} onChange={e=>setAssignTeam(e.target.value)}><option value="">Choose a team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><label htmlFor="assignUser">Organization member</label><select id="assignUser" required value={assignUser} onChange={e=>setAssignUser(e.target.value)}><option value="">Choose a member</option>{directory.map(m=><option key={m.user_id} value={m.user_id}>{m.user_id===user.id?"Me":m.display_name} ({m.role})</option>)}</select></div><div><label htmlFor="assignRole">Team role</label><select id="assignRole" value={assignRole} onChange={e=>setAssignRole(e.target.value)}><option value="member">Member</option><option value="leader">Leader</option></select></div><div className="formAction"><button className="primary" disabled={working}>Save assignment</button></div></form></section>}{view==="planning"&&<><div className="twoCol"><section className="card"><div className="sectionHead"><h2>Organization goals <span className="count">{goals.length}</span></h2></div>{goals.length?goals.map(g=><div className="goalRecord" key={g.id}>
 <div className="taskLine"><span className="taskDot underway"/><div><strong>{g.title}</strong><small>{statusLabel(g.status)}{g.target_date?" · Target "+new Date(g.target_date+"T12:00:00").toLocaleDateString():""}</small>{g.description&&<p className="muted">{g.description}</p>}</div></div>
 {manager&&<button type="button" className="textAction" onClick={()=>editingGoal===g.id?setEditingGoal(""):startGoalEdit(g)}>{editingGoal===g.id?"Cancel":"✎ Edit goal"}</button>}
 {manager&&editingGoal===g.id&&<form className="goalEditForm formGrid" onSubmit={saveGoalEdit}>
 <div className="span2"><label htmlFor="editGoalTitle">Title</label><input id="editGoalTitle" required minLength={2} maxLength={180} value={editGoalTitle} onChange={e=>setEditGoalTitle(e.target.value)}/></div>
 <div className="span2"><label htmlFor="editGoalDescription">Description</label><textarea id="editGoalDescription" rows={3} maxLength={4000} value={editGoalDescription} onChange={e=>setEditGoalDescription(e.target.value)}/></div>
 <div><label htmlFor="editGoalDate">Target date</label><input id="editGoalDate" type="date" value={editGoalDate} onChange={e=>setEditGoalDate(e.target.value)}/></div>
 <div><label htmlFor="editGoalStatus">Status</label><select id="editGoalStatus" value={editGoalStatus} onChange={e=>setEditGoalStatus(e.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="achieved">Achieved</option></select></div>
 <div className="span2"><button type="submit" className="primary" disabled={working}>{working?"Saving…":"Save goal changes"}</button></div>
 </form>}
 </div>):<p className="muted">Create a goal to define what success looks like.</p>}{manager&&<form onSubmit={createGoal}><label htmlFor="goalTitle">New goal</label><input id="goalTitle" value={goalTitle} onChange={e=>setGoalTitle(e.target.value)} placeholder="e.g. Improve service response time" required minLength={2} maxLength={180}/><label htmlFor="goalDescription">Description (optional)</label><textarea id="goalDescription" rows={2} maxLength={4000} value={goalDescription} onChange={e=>setGoalDescription(e.target.value)} placeholder="What will success look like?"/><label htmlFor="goalTarget">Target date</label><input id="goalTarget" type="date" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)}/><button className="primary" style={{marginTop:14}} disabled={working}>Create goal</button></form>}</section><section className="card"><div className="sectionHead"><h2>Projects <span className="count">{projects.length}</span></h2></div>{projects.length?projects.map(p=><div className="taskLine" key={p.id}><span className="taskDot"/><div><strong>{p.name}</strong><small>{statusLabel(p.status)} · {tasks.filter(t=>t.project_id===p.id).length} tasks</small></div></div>):<p className="muted">Projects organize the work needed to reach goals.</p>}<button type="button" className="textAction" onClick={()=>setView("projects")}>Open Projects to manage and create projects →</button></section></div></>}
{view==="projects"&&<>
 <section className="card projectHelp">
  <div className="sectionHead"><div><span className="eyebrow blue">ORGANIZE YOUR WORK</span><h2>How projects work</h2></div></div>
  <p>Projects group related tasks together. Create a project first, then choose it while adding tasks. You do not need an existing team or goal to get started.</p>
  <p className="muted">Administrators and leaders can create projects and tasks. Other organization members can view them and follow their assigned work.</p>{!manager&&<div className="limitedAccessHelp"><strong>Want to start a new project?</strong><p>Ask your organization administrator or leader to create it, or submit a project request for their approval.</p><button type="button" className="primary" onClick={()=>setView("requests")}>Request a project →</button></div>}
 </section>
 {manager&&<section className="card projectCreator" id="projectCreator">
  <div className="sectionHead"><div><span className="eyebrow blue">START HERE · STEP 1</span><h2>Create a project</h2></div></div>
  <p className="muted">Give your plan a name now, then add the tasks needed to achieve it.</p>
  <form onSubmit={createProject} className="formGrid friendlyForm">
   <div className="span2"><label htmlFor="projectName">What are you planning? <span className="requiredMark">*</span></label><input id="projectName" value={projectName} onChange={e=>setProjectName(e.target.value)} required minLength={2} maxLength={180} placeholder="e.g. Christmas outreach drive"/>
    <small className="fieldHint">Just a name is enough to begin. A project can have many tasks.</small></div>
   <details className="formAdvanced span2"><summary>More project details <span>Description, goal and team (optional)</span><span aria-hidden="true">⌄</span></summary>
    <div className="formAdvancedFields">
     <div><label htmlFor="projectDescription">Description</label><textarea id="projectDescription" rows={3} maxLength={4000} value={projectDescription} onChange={e=>setProjectDescription(e.target.value)} placeholder="What are you hoping to achieve?"/></div>
     <div><label htmlFor="projectGoal">Linked goal</label><select id="projectGoal" value={projectGoal} onChange={e=>setProjectGoal(e.target.value)}><option value="">No goal yet</option>{goals.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
     <div><label htmlFor="projectTeam">Responsible team</label><select id="projectTeam" value={projectTeam} onChange={e=>setProjectTeam(e.target.value)}><option value="">Choose later</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    </div>
   </details>
   <div className="span2 friendlyActions"><button type="submit" className="primary" disabled={working}>{working?"Creating project…":"Create project →"}</button></div></form>
  {lastCreatedProject&&<div className="creationSuccess" role="status"><span className="creationSuccessIcon" aria-hidden="true">✓</span><div><strong>{lastCreatedProject.name} is ready!</strong><p>Next, add the first task for this project. We'll link it automatically.</p></div><button type="button" className="primary" onClick={openFirstProjectTask}>Add its first task →</button></div>}
 </section>}
 <section className="card">
  <div className="sectionHead"><div><h2>Saved projects <span className="count">{projects.length}</span></h2><p className="muted">Projects are stored in your organization database and appear here when you return.</p></div><button type="button" className="textAction" disabled={workspaceLoading} onClick={()=>void loadWorkspace(selected)}>{workspaceLoading?"Loading…":"↻ Refresh"}</button></div>
  {workspaceLoading&&projects.length===0?<p role="status" className="muted">Loading projects from the database…</p>:projects.length===0?<div className="emptyProject"><h3>No projects yet</h3><p>{manager?"Create your first project using the form above. Then add tasks and link them to it.":"Your organization leaders can create projects and assign tasks to them."}</p></div>:<div className="projectGrid">{projects.map(p=><article className="projectCard" key={p.id}>
   <div className="projectTop"><strong>{p.name}</strong><span className="chip">{statusLabel(p.status)}</span></div>
   {p.description&&<p className="muted">{p.description}</p>}
   <p className="muted">{p.goal_id?"Goal: "+(goals.find(g=>g.id===p.goal_id)?.title??"Linked goal"):"No linked goal"} · {p.team_id?"Team: "+(teams.find(t=>t.id===p.team_id)?.name??"Assigned team"):"No team assigned"}</p>
   <div className="projectFoot"><span><strong>{tasks.filter(t=>t.project_id===p.id).length}</strong> saved tasks</span><div className="projectActions"><button type="button" onClick={()=>{setProjectFilter(p.id);setView("tasks");setMyTasksOnly(false)}}>View tasks →</button>{manager&&<button type="button" className="primary" onClick={()=>{setTaskProject(p.id);setProjectFilter("all");setView("tasks");setShowTaskForm(true);setTimeout(()=>document.getElementById("taskComposer")?.scrollIntoView({behavior:"smooth",block:"start"}),100)}}>+ Add task</button>}{manager&&<button type="button" onClick={()=>{if(editingProject===p.id)setEditingProject("");else startProjectEdit(p)}}>{editingProject===p.id?"Cancel":"✎ Edit"}</button>}</div></div>
  {manager&&editingProject===p.id&&<form className="projectEditForm formGrid" onSubmit={saveProjectEdit}>
   <div className="span2"><h3>Edit project</h3><label htmlFor="editProjectName">Project name</label><input id="editProjectName" required minLength={2} maxLength={180} value={editProjectName} onChange={e=>setEditProjectName(e.target.value)}/></div>
   <div className="span2"><label htmlFor="editProjectDescription">Description</label><textarea id="editProjectDescription" rows={3} maxLength={4000} value={editProjectDescription} onChange={e=>setEditProjectDescription(e.target.value)}/></div>
   <div><label htmlFor="editProjectStatus">Status</label><select id="editProjectStatus" value={editProjectStatus} onChange={e=>setEditProjectStatus(e.target.value)}><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></div>
   <div><label htmlFor="editProjectGoal">Goal</label><select id="editProjectGoal" value={editProjectGoal} onChange={e=>setEditProjectGoal(e.target.value)}><option value="">No linked goal</option>{goals.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
   <div><label htmlFor="editProjectTeam">Team</label><select id="editProjectTeam" value={editProjectTeam} onChange={e=>setEditProjectTeam(e.target.value)}><option value="">No team assigned</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
   <div className="span2"><button type="submit" className="primary" disabled={working}>{working?"Saving…":"Save project changes"}</button><button type="button" onClick={()=>setEditingProject("")}>Cancel</button></div>
  </form>}
  </article>)}</div>}
 </section>
 </>}{view==="requests"&&<><section className="card" id="submitRequest"><h2>Submit a request</h2><form onSubmit={submitRequest}><label htmlFor="requestTitle">Request title</label><input id="requestTitle" value={requestTitle} onChange={e=>setRequestTitle(e.target.value)} maxLength={180} required placeholder="What do you need?"/><label htmlFor="requestDetails">Details</label><textarea id="requestDetails" value={requestDetails} onChange={e=>setRequestDetails(e.target.value)} placeholder="Provide context and expected outcome" rows={3}/><button className="primary" disabled={working} style={{marginTop:14}}>Submit request</button></form></section><section className="card"><h2>Request inbox</h2>{requests.length?requests.map(r=><div className="requestRow" key={r.id}><div><strong>{r.title}</strong><p className="muted">{r.details||"No additional details"}</p><span className="chip">{statusLabel(r.decision)}</span>{r.decision_reason&&<p className="muted">Decision: {r.decision_reason}</p>}</div>{manager&&(r.decision==="submitted"||r.decision==="deferred")&&<div className="rowActions">{(["approved","deferred","rejected"] as const).map(d=><button key={d} disabled={working} onClick={()=>void decideRequest(r.id,d)}>{statusLabel(d)}</button>)}</div>}{r.decision==="approved"&&<div className="rowActions">
 {tasks.find(t=>t.source_request_id===r.id)?<button type="button" className="textAction" onClick={()=>{const linked=tasks.find(t=>t.source_request_id===r.id);if(linked){setView("tasks");void openTask(linked.id)}}}>Open linked task →</button>:manager&&<button type="button" className="primary" disabled={working} onClick={()=>void createTaskFromApprovedRequest(r.id)}>+ Create a task</button>}
 </div>}</div>):<p className="muted">No requests submitted yet.</p>}</section></>}
{view==="meeting_ai"&&(manager?<MeetingAssistant key={selected} organizationId={selected} userId={user.id} tasks={tasks} projects={projects} members={directory} onSaved={async()=>{await loadWorkspace(selected)}}/>:<section className="card"><h2>Leader access required</h2><p className="muted">An administrator or leader must review and approve meeting suggestions before they can change the tracker.</p></section>)}
{view==="activity"&&<section className="card"><h2>Recent activity</h2>{activity.length?activity.map(a=><div className="taskLine" key={a.id}><span className="taskDot"/><div><strong>{statusLabel(a.entity_type.replace("tw_",""))} · {statusLabel(a.action)}</strong><small>{new Date(a.created_at).toLocaleString()}</small></div></div>):<p className="muted">Activity will appear as your team starts working.</p>}</section>}
{view==="reports"&&<Reports tasks={tasks} projects={projects} teams={teams} directory={directory} organizationName={active?.name??"Organization"} organizationId={selected}/>}{(view==="collaboration"||view==="resources"||view==="notifications")&&user&&<Operations key={selected} organizationId={selected} userId={user.id} tasks={tasks} teams={manager?teams:teams.filter(t=>teamMembers.some(member=>member.team_id===t.id&&member.user_id===user.id))} projects={projects} manager={manager} section={view}/>}{view==="settings"&&<>{role==="admin"&&<WorkspaceBackup key={selected} organizationId={selected} organizationName={active?.name??"Workspace"} userId={user.id}/>}<section className="card setupHelpCard"><div className="sectionHead"><div><span className="eyebrow blue">LEARNING CENTER</span><h2>Get comfortable with Trackwise</h2></div><button type="button" className="primary" onClick={()=>setShowGuide(true)}>Open interactive guide ↗</button></div><p>Go through the setup walkthrough or browse a searchable explanation of all the features, their purpose, and where to find them.</p><div className="setupHelpActions"><button type="button" onClick={showSetup}>Show my setup checklist</button><button type="button" onClick={()=>{setShowGuide(true)}}>Explore features & uses</button></div></section><section className="card"><h2>Your organization role</h2><p className="muted">Your role belongs to this organization, not your login account. The person who creates a workspace becomes its administrator. Other people receive their roles when an administrator or leader invites them.</p><p className="readOnlyValue"><strong>{role?statusLabel(role):"No organization role assigned"}</strong> · {active?.name}</p>{!manager&&<p className="muted">Only administrators and leaders can invite members. Ask an organization leader if you need invitation permissions.</p>}</section><section className="card"><div className="sectionHead"><h2>My profile</h2><span className="chip">Personal settings</span></div><p className="muted">Your display name is shown to colleagues in your organizations.</p><form className="formGrid" onSubmit={saveProfile}><div><label htmlFor="profileName">Display name</label><input id="profileName" minLength={2} maxLength={80} required value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Your name"/></div><div><label>Email address</label><p className="readOnlyValue">{user.email}</p></div><div className="formAction"><button className="primary" disabled={profileSaving}>{profileSaving?"Saving…":"Save profile"}</button></div></form></section>{role==="admin"&&<section className="card"><h2>Manage member roles</h2><p className="muted">Only administrators can change roles or remove members. Changing someone to Observer or Stakeholder makes their tasks unassigned; removing a member revokes their access. Past work remains in the history.</p>{directory.map(m=><div className="memberManageRow" key={m.user_id}><div><strong>{m.display_name}</strong><small>{statusLabel(m.role)}{m.user_id===user.id?" · You":""}</small></div>{roleEditing===m.user_id?<div className="memberManageActions"><select aria-label={"New role for "+m.display_name} value={roleChoice} onChange={e=>setRoleChoice(e.target.value)}>{["admin","leader","member","stakeholder","observer"].map(x=><option key={x} value={x}>{statusLabel(x)}</option>)}</select><button className="primary" disabled={working} onClick={()=>void updateMemberRole(m.user_id)}>Save</button><button onClick={()=>setRoleEditing("")}>Cancel</button></div>:<div className="memberManageActions"><button type="button" disabled={working} onClick={()=>{setRoleEditing(m.user_id);setRoleChoice(m.role)}}>Change role</button>{m.user_id!==user.id&&<button type="button" disabled={working} className="dangerAction" onClick={()=>void removeMember(m.user_id,m.display_name)}>Remove member</button>}</div>}</div>)}</section>}{pendingInvites.length>0&&<section className="card"><h2>Invitations for you</h2>{pendingInvites.map(i=><div className="reportRow" key={i.id}><span>Invitation to join an organization as {statusLabel(i.role)}</span><button className="primary" disabled={invitesLoading} onClick={()=>void acceptInvite(i.id)}>Accept invitation</button></div>)}</section>}{manager&&<section className="card" id="inviteMembers"><h2>Invite organization members</h2><p className="muted">Choose a role, create an invitation, then copy its link or share it through WhatsApp and other apps. The invited person must sign in using the email you enter.</p><form onSubmit={addMember} className="formGrid"><div><label htmlFor="inviteEmail">Member email</label><input id="inviteEmail" type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="colleague@example.com"/></div><div><label htmlFor="inviteRole">Organization role</label><select id="inviteRole" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="member">Member</option><option value="leader">Leader</option><option value="observer">Observer</option><option value="stakeholder">Stakeholder</option></select></div><div className="formAction"><button className="primary" disabled={working}>Create invitation</button></div></form>{inviteShareReady&&inviteShareId&&<div className="inviteShare"><p>Invitation ready for <strong>{inviteShareEmail}</strong>. It expires in 14 days and can only be accepted by that email address.</p><input aria-label="Invitation link" readOnly value={typeof window!=="undefined"?window.location.origin+"/?invite="+encodeURIComponent(inviteShareId):""}/><div className="inviteActions"><button className="primary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+"/?invite="+encodeURIComponent(inviteShareId));setNotice("Invitation link copied.")}catch{setError("Could not copy automatically. Select and copy the invitation link above.")}}}>Copy invitation link</button><button type="button" onClick={async()=>{const url=window.location.origin+"/?invite="+encodeURIComponent(inviteShareId);const message="You're invited to join "+(active?.name??"an organization")+" on Trackwise. Sign in using "+inviteShareEmail+" and accept the invitation.";if(navigator.share){try{await navigator.share({title:"Trackwise invitation",text:message,url})}catch(e){if(e instanceof Error&&e.name!=="AbortError")setError("Sharing failed. Try copying the link.")}}else{window.open("https://wa.me/?text="+encodeURIComponent(message+" "+url),"_blank","noopener,noreferrer")}}}>Share invitation ↗</button><a href={"https://wa.me/?text="+encodeURIComponent("You're invited to join "+(active?.name??"an organization")+" on Trackwise. Sign in as "+inviteShareEmail+" to accept: "+(typeof window!=="undefined"?window.location.origin+"/?invite="+encodeURIComponent(inviteShareId):""))} target="_blank" rel="noopener noreferrer">Share on WhatsApp ↗</a></div></div>}</section>}{manager&&<section className="card"><div className="sectionHead"><h2>Manage invitations</h2><button type="button" onClick={()=>void loadOutgoingInvites(selected)}>Refresh</button></div><p className="muted">View invitations, share their links again, or revoke access before acceptance.</p>{outgoingInvites.length===0?<p className="muted">No invitations yet.</p>:outgoingInvites.map(inv=><div className="memberManageRow" key={inv.id}><div><strong>{inv.email}</strong><small>{statusLabel(inv.role)} · {inv.accepted_at?"Accepted":new Date(inv.expires_at).getTime()<Date.now()?"Expired":"Pending"} · Expires {new Date(inv.expires_at).toLocaleDateString()}</small></div><div className="memberManageActions">{!inv.accepted_at&&new Date(inv.expires_at).getTime()>=Date.now()&&<><button type="button" onClick={()=>shareExistingInvite(inv.id,inv.email)}>Share link</button><button type="button" disabled={inviteAction===inv.id} onClick={()=>void revokeInvite(inv.id)}>Revoke</button></>}{!inv.accepted_at&&new Date(inv.expires_at).getTime()<Date.now()&&<span className="muted">Create a new invitation to renew</span>}</div></div>)}</section>}<section className="card"><h2>Current organization</h2><p><strong>{active.name}</strong></p><p className="muted">Your role: {role?statusLabel(role):"Loading…"}</p><p className="muted">Organization ID: {active.id}</p></section><section className="card"><h2>Create another organization</h2><form onSubmit={createOrg} className="inlineForm"><input aria-label="New organization name" value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="Organization name" minLength={2} maxLength={120} required/><button className="primary" disabled={working}>Create workspace</button></form></section></>}</>}</div></main></div>{searchOpen&&active&&<div className="searchOverlay"><section className="searchPanel" role="dialog" aria-modal="true" aria-label="Search workspace">
  <div className="searchTop"><label htmlFor="globalSearch">Search this organization</label><button type="button" className="guideClose" onClick={closeSearch} aria-label="Close search">×</button></div>
  <input id="globalSearch" type="search" autoFocus placeholder="Find a task, project, or person…" value={globalSearch} maxLength={160} onChange={e=>setGlobalSearch(e.target.value)}/>
  {!searchTerm?<p className="muted">Type a name, task title, or project to find it quickly.</p>:
   taskMatches.length+projectMatches.length+peopleMatches.length===0?<p role="status" className="muted">No matches in this organization. Try another word.</p>:
   <div className="searchResults">
    {taskMatches.length>0&&<div><h3>Tasks</h3>{taskMatches.map(t=><button type="button" key={t.id} onClick={()=>{closeSearch();navigate("tasks");void openTask(t.id)}}><strong>☑ {t.title}</strong><small>{taskLabel(t.status)}</small></button>)}</div>}
    {projectMatches.length>0&&<div><h3>Projects</h3>{projectMatches.map(p=><button type="button" key={p.id} onClick={()=>{closeSearch();setProjectFilter(p.id);setMyTasksOnly(false);navigate("projects")}}><strong>▧ {p.name}</strong><small>{tasks.filter(t=>t.project_id===p.id).length} tasks</small></button>)}</div>}
    {peopleMatches.length>0&&<div><h3>People</h3>{peopleMatches.map(p=><button type="button" key={p.user_id} onClick={()=>{closeSearch();navigate("people")}}><strong>♙ {p.display_name}</strong><small>{statusLabel(p.role)}</small></button>)}</div>}
   </div>}
  <p className="muted searchFoot">Searching tasks, projects and people in {active.name}. Press Escape to close.</p>
 </section></div>}{showGuide&&user&&active&&<OnboardingTour
 role={manager?"leader":"member"}
 organizationName={active.name}
 progressKey={"tw-tour-v3:"+user.id+":"+selected}
 onClose={closeGuide}
 onGo={(action,destination)=>{
  closeGuide();
  if(manager&&(action==="project"||action==="task"||action==="team"||action==="invite"))launchCreate(action);
  else if(!manager&&action==="request")launchCreate("request");
  else navigate(destination);
 }}
 />}<nav className="mobileBottomNav" aria-label="Mobile quick navigation">{([["overview","⌂","Home"],["tasks","☑","Tasks"],["projects","▧","Projects"],["notifications","◉","Inbox"]] as const).map(([key,icon,label])=><button type="button" key={key} className={activeNav.defaultView===key?"active":""} onClick={()=>navigate(key)}><span aria-hidden="true">{icon}</span><small>{label}</small>{key==="notifications"&&unreadNotifications>0&&<span className="unreadNavCount mobileUnread" aria-label={unreadNotifications+" unread notifications"}>{unreadNotifications>99?"99+":unreadNotifications}</span>}</button>)}<button type="button" className={mobileMenu||activeNav.id==="more"||activeNav.id==="people"?"active":""} onClick={()=>setMobileMenu(v=>!v)} aria-label="More navigation"><span aria-hidden="true">☷</span><small>More</small></button></nav></div>
}
