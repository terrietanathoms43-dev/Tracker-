"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {User} from "@supabase/supabase-js";
import useUnreadNotifications from "./use-unread-notifications";
import {canManageOrganization,canEditTaskChecklist,canOwnTask,canChangeTaskStatus,allowedTaskStatuses,taskStatusLabel as taskLabel,userFacingError as displayError} from "../lib/task-rules";
import dynamic from "next/dynamic";
import {House,SquareCheckBig,FolderKanban,UsersRound,Inbox,Settings2,Menu,Search as SearchIcon,Sparkles,Plus,BarChart3,Mail,CheckCircle2} from "lucide-react";
const Reports=dynamic(()=>import("./reports"),{ssr:false,loading:()=><p className="muted">Opening reports…</p>});
const Operations=dynamic(()=>import("./operations"),{ssr:false,loading:()=><p className="muted">Loading your workspace…</p>});
const TaskExtras=dynamic(()=>import("./task-extras"),{ssr:false,loading:()=>null});
const TaskCalendar=dynamic(()=>import("./task-calendar"),{ssr:false,loading:()=><p className="muted">Opening calendar…</p>});
const RecurringSchedules=dynamic(()=>import("./recurring-schedules"),{ssr:false,loading:()=>null});
const WorkspaceBackup=dynamic(()=>import("./workspace-backup"),{ssr:false,loading:()=>null});
const OnboardingTour=dynamic(()=>import("./onboarding-tour"),{ssr:false,loading:()=>null});
const QuickCreate=dynamic(()=>import("./quick-create"),{ssr:false,loading:()=>null});
const TaskBoard=dynamic(()=>import("./task-board"),{ssr:false,loading:()=>null});
const WorkspaceInfo=dynamic(()=>import("./workspace-info"),{ssr:false,loading:()=>null});
const AccountProfile=dynamic(()=>import("./account-profile"),{ssr:false,loading:()=>null});
const AuthExperience=dynamic(()=>import("./auth-experience"),{ssr:false,loading:()=> <main className="authV3 authV3Loading" role="status" aria-live="polite"><div className="authV3LoadingCard"><span className="authV3BrandMark">T</span><strong>Trackwise</strong><span>Preparing your sign-in page…</span></div></main>});
import ProfileAvatar from "./profile-avatar";
type QuickCreateKind="task"|"project"|"team"|"organization";
type QuickCreated={kind:QuickCreateKind;id:string;name:string};
const MeetingAssistant=dynamic(()=>import("./meeting-assistant"),{ssr:false,loading:()=><p className="muted">Opening meeting assistant…</p>});
import {supabase as makeClient} from "../lib/supabase";
import {initialAuthErrorMessage} from "../lib/auth-session";
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
type View="overview"|"tasks"|"calendar"|"teams"|"people"|"planning"|"projects"|"meeting_ai"|"requests"|"activity"|"reports"|"collaboration"|"notifications"|"settings"|"profile";
type NavGroup={id:string;label:string;icon:string;defaultView:View;items:{view:View;label:string}[]};
const NAV_GROUPS:NavGroup[]=[
 {id:"home",label:"Home",icon:"⌂",defaultView:"overview",items:[{view:"overview",label:"Overview"}]},
 {id:"tasks",label:"Tasks",icon:"☑",defaultView:"tasks",items:[{view:"tasks",label:"All tasks"},{view:"calendar",label:"Calendar"}]},
 {id:"projects",label:"Projects",icon:"▧",defaultView:"projects",items:[{view:"projects",label:"Projects"},{view:"planning",label:"Goals & planning"},{view:"meeting_ai",label:"Meeting assistant"}]},
 {id:"people",label:"People",icon:"♙",defaultView:"people",items:[{view:"people",label:"Members"},{view:"teams",label:"Teams"}]},
 {id:"inbox",label:"Inbox",icon:"◉",defaultView:"notifications",items:[{view:"notifications",label:"Notifications"},{view:"collaboration",label:"Team messages"},{view:"requests",label:"Requests & approvals"}]},
 {id:"reports",label:"Reports",icon:"▤",defaultView:"reports",items:[{view:"reports",label:"Reports"}]},
 {id:"more",label:"More",icon:"⚙",defaultView:"settings",items:[{view:"profile",label:"My profile"},{view:"settings",label:"Settings"},{view:"activity",label:"Activity history"}]}
];
const DIALOG_VIEWS=new Set<View>(["profile","settings","people","teams","planning","requests","activity","reports","meeting_ai","collaboration","notifications"]);
const DIALOG_NAV: {label:string;view:View;section:"workspace"|"account"}[]=[
 {label:"My profile",view:"profile",section:"account"},
 {label:"Settings & invitations",view:"settings",section:"account"},
 {label:"Members",view:"people",section:"workspace"},
 {label:"Teams",view:"teams",section:"workspace"},
 {label:"Goals & planning",view:"planning",section:"workspace"},
 {label:"Requests",view:"requests",section:"workspace"},
 {label:"Activity",view:"activity",section:"workspace"},
 {label:"Reports",view:"reports",section:"workspace"},
 {label:"Meeting assistant",view:"meeting_ai",section:"workspace"},
 {label:"Notifications",view:"notifications",section:"workspace"},
 {label:"Team messages",view:"collaboration",section:"workspace"}
];
function navigationIcon(id:string){
 if(id==="home"||id==="overview")return <House size={19} strokeWidth={2.1}/>;
 if(id==="tasks")return <SquareCheckBig size={19} strokeWidth={2.1}/>;
 if(id==="projects")return <FolderKanban size={19} strokeWidth={2.1}/>;
 if(id==="people")return <UsersRound size={19} strokeWidth={2.1}/>;
 if(id==="inbox"||id==="notifications")return <Inbox size={19} strokeWidth={2.1}/>;
 if(id==="reports")return <BarChart3 size={19} strokeWidth={2.1}/>;
 return <Settings2 size={19} strokeWidth={2.1}/>;
}
export default function Home(){
 const [handovers,setHandovers]=useState<Handover[]>([]),[handoverOwner,setHandoverOwner]=useState(""),[handoverNote,setHandoverNote]=useState("");
 const [inviteShareEmail,setInviteShareEmail]=useState(""),[inviteShareReady,setInviteShareReady]=useState(false),[inviteShareId,setInviteShareId]=useState("");
 const [roleEditing,setRoleEditing]=useState(""),[roleChoice,setRoleChoice]=useState("member");
 const [profilePhotoUrl,setProfilePhotoUrl]=useState<string|null>(null);
 const [recovery,setRecovery]=useState(false),[newPassword,setNewPassword]=useState(""),[selectedTask,setSelectedTask]=useState(""),[progressText,setProgressText]=useState(""),[nextStep,setNextStep]=useState(""),[taskUpdates,setTaskUpdates]=useState<{id:string;progress:string;next_action:string|null;created_at:string;author_id:string}[]>([]);
 const [user,setUser]=useState<User|null>(null),[initial,setInitial]=useState(true),[working,setWorking]=useState(false);
 const [mode,setMode]=useState<"signin"|"signup"|"reset">("signin"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[signupName,setSignupName]=useState("");
 const [orgs,setOrgs]=useState<Org[]>([]),[selected,setSelected]=useState(""),[teams,setTeams]=useState<Team[]>([]),[tasks,setTasks]=useState<Task[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [goals,setGoals]=useState<Goal[]>([]),[projects,setProjects]=useState<Project[]>([]),[directory,setDirectory]=useState<DirectoryMember[]>([]),[goalTitle,setGoalTitle]=useState(""),[goalTarget,setGoalTarget]=useState(""),[projectName,setProjectName]=useState(""),[projectDescription,setProjectDescription]=useState(""),[projectFilter,setProjectFilter]=useState("all"),[projectGoal,setProjectGoal]=useState(""),[projectTeam,setProjectTeam]=useState(""),[taskProject,setTaskProject]=useState(""),[search,setSearch]=useState(""),[statusFilter,setStatusFilter]=useState("all");
 const [teamMembers,setTeamMembers]=useState<TeamMember[]>([]),[requests,setRequests]=useState<Request[]>([]),[activity,setActivity]=useState<Activity[]>([]),[requestTitle,setRequestTitle]=useState(""),[requestDetails,setRequestDetails]=useState(""),[assignTeam,setAssignTeam]=useState(""),[assignUser,setAssignUser]=useState(""),[assignRole,setAssignRole]=useState("member");
 const [pendingInvites,setPendingInvites]=useState<{id:string;email:string;role:string;organization_id:string;expires_at:string}[]>([]),[invitesLoading,setInvitesLoading]=useState(false);
 const inviteRequest=useRef(0);
 const shareLinkRequest=useRef(0);
 const [inviteLinks,setInviteLinks]=useState<{id:string;role:string;expires_at:string;uses_count:number;max_uses:number;revoked_at:string|null}[]>([]);
 const [shareRole,setShareRole]=useState("member"),[shareLinkId,setShareLinkId]=useState(""),[shareLinkWorking,setShareLinkWorking]=useState(false);
 const [joinToken,setJoinToken]=useState(""),[joiningWorkspace,setJoiningWorkspace]=useState(false);
 const personalInvitesRequest=useRef(0);
 const organizationsRequest=useRef(0);
 const [outgoingInvites,setOutgoingInvites]=useState<{id:string;email:string;role:string;expires_at:string;accepted_at:string|null}[]>([]),[inviteAction,setInviteAction]=useState("");
 const [inviteEmail,setInviteEmail]=useState(""),[inviteRole,setInviteRole]=useState("member"),[orgName,setOrgName]=useState(""),[teamName,setTeamName]=useState(""),[taskTitle,setTaskTitle]=useState(""),[taskDescription,setTaskDescription]=useState(""),[taskDue,setTaskDue]=useState(""),[taskFrequency,setTaskFrequency]=useState("none"),[recurringRefresh,setRecurringRefresh]=useState(0),[taskPriority,setTaskPriority]=useState("normal"),[taskOwner,setTaskOwner]=useState("");
 const [myTasksOnly,setMyTasksOnly]=useState(false),[workspaceLoading,setWorkspaceLoading]=useState(false);
 const workspaceRequest=useRef(0);
 const taskDetailRequest=useRef(0);
 const [taskLayout,setTaskLayout]=useState<"board"|"list">("board"),[workspaceInfoOpen,setWorkspaceInfoOpen]=useState(false);
 const [workspacePickerOpen,setWorkspacePickerOpen]=useState(false);
 useEffect(()=>{
  if(!workspacePickerOpen)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const onEscape=(event:KeyboardEvent)=>{if(event.key==="Escape")setWorkspacePickerOpen(false)};
  window.addEventListener("keydown",onEscape);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener("keydown",onEscape)};
 },[workspacePickerOpen]);
 const [dashboardLayout,setDashboardLayout]=useState<"board"|"list">("board");
 const [showDashboardFilters,setShowDashboardFilters]=useState(false);
 const [dashboardSearch,setDashboardSearch]=useState(""),[dashboardStatus,setDashboardStatus]=useState("all"),[dashboardPriority,setDashboardPriority]=useState("all"),[dashboardAssignee,setDashboardAssignee]=useState("all");
  const [mobileMenu,setMobileMenu]=useState(false),[showTaskForm,setShowTaskForm]=useState(false),[showTaskHandover,setShowTaskHandover]=useState(false),[showAdvancedProject,setShowAdvancedProject]=useState(false);
 useEffect(()=>{if(!mobileMenu)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setMobileMenu(false)};window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close)}},[mobileMenu]);
 const [view,setView]=useState<View>("overview"),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const dialogView=DIALOG_VIEWS.has(view);
 const dialogReturnView=useRef<View>("overview");
 const dialogCloseRef=useRef<HTMLButtonElement>(null);
 const [createMenu,setCreateMenu]=useState(false),[showGuide,setShowGuide]=useState(false),[hideChecklist,setHideChecklist]=useState(false);
 const [quickCreate,setQuickCreate]=useState<QuickCreateKind|null>(null),[quickProjectId,setQuickProjectId]=useState("");
 const [lastCreatedProject,setLastCreatedProject]=useState<{id:string;name:string}|null>(null);
 const [lastCreatedTeam,setLastCreatedTeam]=useState<{id:string;name:string}|null>(null);
 const [goalDescription,setGoalDescription]=useState("");
 const [editingGoal,setEditingGoal]=useState(""),[editGoalTitle,setEditGoalTitle]=useState(""),[editGoalDescription,setEditGoalDescription]=useState(""),[editGoalDate,setEditGoalDate]=useState(""),[editGoalStatus,setEditGoalStatus]=useState("active");
 const [searchOpen,setSearchOpen]=useState(false),[globalSearch,setGlobalSearch]=useState("");
 const [editingTask,setEditingTask]=useState(""),[editTaskTitle,setEditTaskTitle]=useState(""),[editTaskDescription,setEditTaskDescription]=useState(""),[editTaskPriority,setEditTaskPriority]=useState("normal"),[editTaskDue,setEditTaskDue]=useState(""),[editTaskProject,setEditTaskProject]=useState("");
 const [editingProject,setEditingProject]=useState(""),[editProjectName,setEditProjectName]=useState(""),[editProjectDescription,setEditProjectDescription]=useState(""),[editProjectGoal,setEditProjectGoal]=useState(""),[editProjectTeam,setEditProjectTeam]=useState(""),[editProjectStatus,setEditProjectStatus]=useState("active");
 useEffect(()=>{
  const path=user?.user_metadata?.avatar_path;
  if(!db||!user?.id||typeof path!=="string"||!path.startsWith(user.id+"/")){
   setProfilePhotoUrl(null);return;
  }
  let live=true;
  setProfilePhotoUrl(null);
  void db.storage.from("tw-profile-avatars").createSignedUrl(path,3600).then(({data,error})=>{
   if(live)setProfilePhotoUrl(!error?(data?.signedUrl??null):null);
  }).catch(()=>{if(live)setProfilePhotoUrl(null)});
  return()=>{live=false};
 },[user?.id,user?.user_metadata?.avatar_path]);
 const clear=()=>{setError("");setNotice("")};
 const loadOrgs=useCallback(async()=>{if(!db)return;const request=++organizationsRequest.current;const {data,error}=await db.from("tw_organizations").select("id,name,created_at").order("created_at",{ascending:false});if(request!==organizationsRequest.current)return;if(error)setError(error.message);else {setOrgs(data??[]);setSelected(old=>(data??[]).some(o=>o.id===old)?old:(data?.[0]?.id??""))}},[]);
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
   // Never reuse stale data after a failed workspace read.
   setTeams(t.error?[]:t.data??[]);
   setTasks(k.error?[]:k.data??[]);
   setMembers(m.error?[]:m.data??[]);
   setTeamMembers(t.error||tm.error?[]:(tm.data??[]).filter(x=>(t.data??[]).some(team=>team.id===x.team_id)));
   setRequests(r.error?[]:r.data??[]);
   setActivity(a.error?[]:a.data??[]);
   setGoals(g.error?[]:g.data??[]);
   setProjects(p.error?[]:p.data??[]);
   setDirectory(d.error?[]:d.data??[]);
   setHandovers(h.error?[]:h.data??[]);
   const failures=[["teams",t.error],["saved tasks",k.error],["members",m.error],["team membership",tm.error],["requests",r.error],["activity",a.error],["goals",g.error],["projects",p.error],["directory",d.error],["handover history",h.error]].filter((entry)=>entry[1]);
   if(failures.length)setError("Some workspace information could not be loaded: "+failures.map(entry=>entry[0]).join(", ")+". Refresh to try again.");
  }catch(e){
   if(request===workspaceRequest.current)setError(e instanceof Error?e.message:"Unable to load workspace");
  }finally{
   if(request===workspaceRequest.current)setWorkspaceLoading(false);
  }
 },[]);
 const loadShareLinks=useCallback(async(orgId:string)=>{
  if(!db||!orgId)return;
  const request=++shareLinkRequest.current;
  const {data,error}=await db.from("tw_invite_links")
   .select("id,role,expires_at,uses_count,max_uses,revoked_at")
   .eq("organization_id",orgId).order("created_at",{ascending:false}).limit(30);
  if(request!==shareLinkRequest.current)return;
  if(error)setError(displayError(error,"Unable to load invitation links."));
  else setInviteLinks(data??[]);
 },[]);
 useEffect(()=>{
  if(selected&&members.some(m=>m.user_id===user?.id&&["admin","leader"].includes(m.role)))void loadShareLinks(selected);
  else{shareLinkRequest.current++;setInviteLinks([])}
 },[selected,members,user?.id,loadShareLinks]);
 useEffect(()=>{
  if(typeof window==="undefined")return;
  const token=new URLSearchParams(window.location.search).get("join")??"";
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))
   setJoinToken(token);
 },[]);
 function dismissJoinLink(){
  setJoinToken("");
  if(typeof window==="undefined")return;
  const url=new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState(null,"",url.pathname+url.search+url.hash);
 }
 async function joinFromLink(){
  if(!db||!user||!joinToken||joiningWorkspace)return;
  setJoiningWorkspace(true);clear();
  try{
   const {data,error}=await db.rpc("tw_accept_invite_link",{link_id:joinToken});
   if(error)throw error;
   await loadOrgs();
   if(typeof data==="string")setSelected(data);
   setView("overview");dismissJoinLink();
   setNotice("You have joined the workspace. Welcome!");
  }catch(e){setError(displayError(e,"The invitation could not be accepted. Ask for a new link."))}
  finally{setJoiningWorkspace(false)}
 }
 async function createShareLink(){
  if(!db||!selected||!manager||shareLinkWorking)return;
  setShareLinkWorking(true);clear();
  try{
   const {data,error}=await db.rpc("tw_create_invite_link",{org_id:selected,invite_role:shareRole});
   if(error)throw error;
   if(typeof data!=="string")throw new Error("Could not confirm the invitation link.");
   setShareLinkId(data);await loadShareLinks(selected);
   setNotice("Invite link created. Copy or share it with your teammates.");
  }catch(e){setError(displayError(e,"Unable to create invitation link"))}
  finally{setShareLinkWorking(false)}
 }
 async function revokeShareLink(linkId:string){
  if(!db||!selected||!manager||shareLinkWorking)return;
  if(!window.confirm("Disable this invite link? People who have already joined will keep their workspace access."))return;
  setShareLinkWorking(true);clear();
  try{
   const {error}=await db.rpc("tw_revoke_invite_link",{link_id:linkId});
   if(error)throw error;
   if(shareLinkId===linkId)setShareLinkId("");
   await loadShareLinks(selected);setNotice("Invitation link disabled.");
  }catch(e){setError(displayError(e,"Unable to disable the link"))}
  finally{setShareLinkWorking(false)}
 }
 function shareableInviteUrl(id:string){
  return typeof window==="undefined"?"":window.location.origin+"/?join="+encodeURIComponent(id);
 }
 async function copyShareLink(id:string){
  try{await navigator.clipboard.writeText(shareableInviteUrl(id));setNotice("Workspace invitation link copied.")}
  catch{setError("Automatic copying was blocked. Select the link and copy it manually.")}
 }
 async function sendShareLink(id:string){
  const url=shareableInviteUrl(id);
  const title="Join "+(active?.name??"our workspace")+" on Trackwise";
  const message="You're invited to join "+(active?.name??"a workspace")+" on Trackwise. Open the link and sign in or create an account.";
  if(navigator.share){
   try{await navigator.share({title,text:message,url})}
   catch(e){if(!(e instanceof Error)||e.name!=="AbortError")setError("Sharing was interrupted. You can copy the link instead.")}
  }else window.open("https://wa.me/?text="+encodeURIComponent(message+" "+url),"_blank","noopener,noreferrer");
 }
 const loadOutgoingInvites=useCallback(async(orgId:string)=>{if(!db||!orgId)return;const request=++inviteRequest.current;const {data,error}=await db.from("tw_invitations").select("id,email,role,expires_at,accepted_at").eq("organization_id",orgId).order("created_at",{ascending:false});if(request!==inviteRequest.current)return;if(error)setError(error.message);else setOutgoingInvites(data??[])},[]);
 useEffect(()=>{if(selected&&members.some(m=>m.user_id===user?.id&&["admin","leader"].includes(m.role)))void loadOutgoingInvites(selected);else{inviteRequest.current++;setOutgoingInvites([])}},[selected,members,user?.id,loadOutgoingInvites]);
 async function revokeInvite(id:string){if(!db||!selected||!manager)return;if(!window.confirm("Revoke this invitation? Its link will stop working."))return;setInviteAction(id);clear();try{const {error}=await db.rpc("tw_revoke_invitation",{invitation_id:id});if(error)throw error;await loadOutgoingInvites(selected);if(inviteShareId===id){setInviteShareReady(false);setInviteShareId("")}setNotice("Invitation revoked.")}catch(e){setError(e instanceof Error?e.message:"Unable to revoke invitation")}finally{setInviteAction("")}}
 function shareExistingInvite(id:string,email:string){setInviteShareEmail(email);setInviteShareId(id);setInviteShareReady(true);setNotice("Invitation link ready to share.")}
 useEffect(()=>{
  if(!db){setInitial(false);return}
  let live=true;
  let authChangedSinceInitialCheck=false;
  // A visitor without a session should see sign-in, not "Auth session missing".
  const {data:{subscription}}=db.auth.onAuthStateChange((event,session)=>{
   if(!live)return;
   if(event==="SIGNED_IN"||event==="SIGNED_OUT"||event==="TOKEN_REFRESHED"||event==="PASSWORD_RECOVERY"){
    authChangedSinceInitialCheck=true;
    setError("");
   }
   setUser(session?.user??null);
   if(event==="PASSWORD_RECOVERY")setRecovery(true);
  });
  void db.auth.getUser().then(({data,error})=>{
   if(!live)return;
   const message=initialAuthErrorMessage(error);
   // Don't restore an initial session error after a successful sign-in.
   if(message&&!authChangedSinceInitialCheck)setError(message);
   if(!authChangedSinceInitialCheck)setUser(data.user);
   setInitial(false);
  }).catch(()=>{
   if(!live)return;
   if(!authChangedSinceInitialCheck)setError("Unable to connect. Check your internet connection.");
   setInitial(false);
  });
  return()=>{live=false;subscription.unsubscribe()}
 },[]);
 useEffect(()=>{
  const request=++personalInvitesRequest.current;
  setPendingInvites([]);
  if(user?.email)void db?.from("tw_invitations").select("id,email,role,organization_id,expires_at")
   .eq("email",user.email.toLowerCase()).is("accepted_at",null)
   .gt("expires_at",new Date().toISOString())
   .then(({data,error})=>{
    if(request!==personalInvitesRequest.current)return;
    if(!error)setPendingInvites(data??[]);
   });
 },[user?.id,user?.email]);
 useEffect(()=>{if(user&&typeof window!=="undefined"&&new URLSearchParams(window.location.search).has("invite"))setView("settings")},[user]);
 useEffect(()=>{if(user)void loadOrgs();else{workspaceRequest.current++;taskDetailRequest.current++;inviteRequest.current++;shareLinkRequest.current++;personalInvitesRequest.current++;organizationsRequest.current++;setOrgs([]);setSelected("");setTeams([]);setTasks([]);setTeamMembers([]);setRequests([]);setActivity([]);setHandovers([]);setOutgoingInvites([]);setInviteLinks([]);setShareLinkId("");setQuickCreate(null);setWorkspaceInfoOpen(false)}},[user?.id,loadOrgs]);
 useEffect(()=>{
  taskDetailRequest.current++;
  inviteRequest.current++;
  shareLinkRequest.current++;
  setShareLinkId("");setInviteLinks([]);
  setTasks([]);setProjects([]);setMembers([]);setTeams([]);setGoals([]);setDirectory([]);
  setTeamMembers([]);setRequests([]);setActivity([]);setHandovers([]);setOutgoingInvites([]);
  setSelectedTask("");setTaskUpdates([]);setQuickCreate(null);setWorkspaceInfoOpen(false);
  setEditingTask("");setEditingProject("");setEditingGoal("");
  setInviteShareReady(false);setInviteShareId("");setProjectFilter("all");
  setDashboardSearch("");setDashboardStatus("all");setDashboardPriority("all");setDashboardAssignee("all");
  if(selected)void loadWorkspace(selected);
  else{workspaceRequest.current++;setWorkspaceLoading(false)}
 },[selected,loadWorkspace]);
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
 useEffect(()=>{
  if(!dialogView)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  dialogCloseRef.current?.focus();
  const closeOnEscape=(event:KeyboardEvent)=>{
   if(event.key==="Escape"&&!searchOpen&&!quickCreate&&!showGuide&&!workspaceInfoOpen&&!workspacePickerOpen){
    setView(dialogReturnView.current);
   }
  };
  window.addEventListener("keydown",closeOnEscape);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener("keydown",closeOnEscape)};
 },[dialogView,searchOpen,quickCreate,showGuide,workspaceInfoOpen,workspacePickerOpen]);
 function navigate(to:View){if(!DIALOG_VIEWS.has(to))dialogReturnView.current=to;setView(to);setMobileMenu(false);setCreateMenu(false);clear();if(typeof window!=="undefined"&&!DIALOG_VIEWS.has(to))window.scrollTo({top:0,behavior:"auto"});}
 function closeWorkspaceDialog(){navigate(dialogReturnView.current)}

 function launchCreate(kind:"task"|"project"|"team"|"invite"|"request"){
  setCreateMenu(false);setMobileMenu(false);clear();
  if(kind==="task"||kind==="project"||kind==="team"){
   if(!manager)return;
   setQuickProjectId("");setQuickCreate(kind);
   return;
  }
  const destination:View=kind==="invite"?"settings":"requests";
  navigate(destination);
  const target=kind==="invite"?"inviteMembers":"submitRequest";
  window.setTimeout(()=>document.getElementById(target)?.scrollIntoView({behavior:"smooth",block:"start"}),120);
 }
 async function onQuickSaved(created:QuickCreated){
  if(created.kind==="organization"){
   await loadOrgs();
   setSelected(created.id);
   setView("overview");setHideChecklist(false);setMobileMenu(false);
   setNotice("Your new organization is ready. Start with a project or invite your team.");
  }else{
   await loadWorkspace(selected);
   setNotice(created.name+" has been created.");
  }
 }
 function openQuickCreated(created:QuickCreated){
  setQuickCreate(null);
  if(created.kind==="organization")navigate("overview");
  else if(created.kind==="task"){navigate("tasks");window.setTimeout(()=>void openTask(created.id),50)}
  else if(created.kind==="project"){navigate("projects");setProjectFilter("all")}
  else navigate("teams");
 }
  function closeGuide(){
  if(user&&typeof window!=="undefined")window.localStorage.setItem("tw-tour-v3:"+user.id+":"+(selected||"start"),"seen");
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
 const dashboardTasks=homeTasks.filter(t=>
  (!dashboardSearch.trim()||t.title.toLowerCase().includes(dashboardSearch.trim().toLowerCase())||(t.description??"").toLowerCase().includes(dashboardSearch.trim().toLowerCase()))&&
  (dashboardStatus==="all"||t.status===dashboardStatus)&&
  (dashboardPriority==="all"||t.priority===dashboardPriority)&&
  (dashboardAssignee==="all"||(dashboardAssignee==="unassigned"?!t.owner_id:t.owner_id===dashboardAssignee))
 );
 const dashboardStats=[
  {label:manager?"Total tasks":"My tasks",value:homeTasks.length,help:manager?"Across this workspace":"Assigned to you"},
  {label:"In progress",value:homeTasks.filter(t=>t.status==="underway").length,help:"Work being done"},
  {label:"Overdue",value:homeTasks.filter(t=>t.due_at&&new Date(t.due_at).getTime()<Date.now()&&t.status!=="completed").length,help:"Needs attention"},
  manager?{label:"For review",value:homeTasks.filter(t=>t.status==="awaiting_approval").length,help:"Awaiting approval"}:{label:"Completed",value:homeTasks.filter(t=>t.status==="completed").length,help:"Approved work"}
 ];
 const dashboardFilterCount=[dashboardStatus!=="all",dashboardPriority!=="all",manager&&dashboardAssignee!=="all"].filter(Boolean).length;
 function clearDashboardFilters(){setDashboardSearch("");setDashboardStatus("all");setDashboardPriority("all");setDashboardAssignee("all");}

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
 async function auth(e:FormEvent){
  e.preventDefault();if(!db)return;
  setWorking(true);clear();
  try{
   const name=signupName.replace(/\s+/g," ").trim();
   if(mode==="signup"){
    if(name.length<2||name.length>80)throw new Error("Enter your name (2–80 characters).");
    if(password.length<10)throw new Error("Choose a password with at least 10 characters.");
   }
   if(mode==="reset"){
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
    if(error)throw error;
    setNotice("Password reset email sent. Check your inbox.");
    return;
   }
   const result=mode==="signin"
    ?await db.auth.signInWithPassword({email,password})
    :await db.auth.signUp({email,password,options:{
      emailRedirectTo:joinToken?shareableInviteUrl(joinToken):window.location.origin,
      data:{display_name:name,full_name:name}
     }});
   if(result.error)throw result.error;
   if(mode==="signup")setNotice(result.data.session?"Your account is ready.":"Check your email to confirm your account.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to authenticate")}
  finally{setWorking(false)}
 }
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
 async function openTask(id:string){
  if(!db||!selected)return;
  const request=++taskDetailRequest.current;
  setSelectedTask(id);setTaskUpdates([]);
  const {data,error}=await db.from("tw_task_updates").select("id,progress,next_action,created_at,author_id")
   .eq("task_id",id).order("created_at",{ascending:false}).limit(50);
  if(request!==taskDetailRequest.current)return;
  if(error)setError(error.message);else setTaskUpdates(data??[]);
 }
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
 const taskTable=<><div className="mobileTaskList">{visibleTasks.length?visibleTasks.map(t=><article className="mobileTaskCard" key={t.id}><div className="mobileTaskTop"><span className={"priority "+t.priority}>{statusLabel(t.priority)}</span><span className="mobileTaskDate">{t.due_at?"Due "+new Date(t.due_at).toLocaleDateString():"No deadline"}</span></div><button className="mobileTaskTitle" onClick={()=>void openTask(t.id)}>{t.title} <span aria-hidden="true">↗</span></button><div className="mobileTaskMeta"><span>{t.owner_id===user?.id?"Assigned to you":directory.find(m=>m.user_id===t.owner_id)?.display_name??"Unassigned"}</span><span>{t.project_id?" · "+(projects.find(p=>p.id===t.project_id)?.name??"Project"):" · No project"}</span></div><div className="mobileTaskStatus">{canChangeTaskStatus(role,t.owner_id,user?.id,t.status)?<select aria-label={"Status for "+t.title} value={t.status} disabled={working} onChange={e=>void updateTask(t.id,e.target.value)}>{allowedTaskStatuses(role,t.status).map(st=><option key={st} value={st}>{actionStatusLabel(st)}</option>)}</select>:<span className="chip">{taskLabel(t.status)}</span>}</div><div className="taskInlineActions">
 {manager&&t.status!=="completed"&&<button type="button" className="primary" disabled={working} onClick={()=>void updateTask(t.id,"completed")}>✓ Complete task</button>}
 {!manager&&t.owner_id===user?.id&&t.status!=="completed"&&t.status!=="awaiting_approval"&&<button type="button" className="primary" disabled={working} onClick={()=>void updateTask(t.id,"awaiting_approval")}>Submit for approval →</button>}
 {t.status==="awaiting_approval"&&<small className="muted">{manager?"Ready for your review":"Waiting for leader approval"}</small>}
</div></article>):<div className="card"><p className="muted">{workspaceLoading?"Loading saved tasks…":manager?"No saved tasks match these filters. Add a task or change your filters.":"No tasks match these filters."}</p></div>}</div><div className="tablewrap"><table><thead><tr><th>Task</th><th>Priority</th><th>Due date</th><th>Project</th><th>Owner</th><th>Status</th></tr></thead><tbody>{visibleTasks.length?visibleTasks.map(t=><tr key={t.id}><td><button className="taskOpen" onClick={()=>void openTask(t.id)}>{t.title}</button></td><td><span className={"priority "+t.priority}>{statusLabel(t.priority)}</span></td><td>{t.due_at?new Date(t.due_at).toLocaleDateString():"—"}</td><td>{t.project_id?projects.find(p=>p.id===t.project_id)?.name??"Project":"—"}</td><td>{t.owner_id===user?.id?"You":directory.find(m=>m.user_id===t.owner_id)?.display_name??(t.owner_id?"Assigned":"Unassigned")}</td><td>{canChangeTaskStatus(role,t.owner_id,user?.id,t.status)?<select aria-label={"Status for "+t.title} value={t.status} disabled={working} onChange={e=>void updateTask(t.id,e.target.value)}>{allowedTaskStatuses(role,t.status).map(st=><option key={st} value={st}>{actionStatusLabel(st)}</option>)}</select>:<span className="chip">{taskLabel(t.status)}</span>}</td></tr>):<tr><td colSpan={6} className="muted">{workspaceLoading?"Loading saved tasks from the database…":manager?"No saved tasks match your filters. Select Add task to create one.":"No saved tasks match your filters."}</td></tr>}</tbody></table></div></>;
 if(recovery&&user)return <main className="recoveryPage"><section className="card recoveryCard"><h1>Choose a new password</h1><p className="muted">Set a secure password for your Trackwise account.</p>{error&&<p role="alert" className="feedback bad">{error}</p>}{notice&&<p className="feedback good">{notice}</p>}<form onSubmit={changePassword}><label htmlFor="newPassword">New password</label><input id="newPassword" type="password" autoComplete="new-password" minLength={10} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button className="primary" disabled={working}>Update password</button></form></section></main>;
 if(!ready)return <main className="center"><div className="card"><h1>Trackwise</h1><h2>Setup required</h2><p>Supabase environment variables are missing from this deployment.</p></div></main>;
 if(initial)return <main className="center"><div className="spinner"/><p>Preparing your workspace…</p></main>;
 if(!user)return <AuthExperience
  inviteLinkPending={!!joinToken}
  mode={mode} email={email} password={password} name={signupName}
  working={working} error={error} notice={notice}
  onSubmit={auth}
  onModeChange={next=>{setMode(next);clear()}}
  onEmailChange={setEmail} onPasswordChange={setPassword} onNameChange={setSignupName}
/>;
 return <div className="appShell"><div className="mobileTopbar"><div className="logo"><span className="mark">T</span> Trackwise</div><button type="button" className="mobileMenuToggle" aria-label="Open workspace menu" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(v=>!v)}>☰ <span>Menu</span></button></div>{mobileMenu&&<button className="mobileBackdrop" aria-label="Close menu" onClick={()=>setMobileMenu(false)}/>}<aside className={"sidebar "+(mobileMenu?"mobileOpen":"")} aria-label="Workspace sidebar"><div className="logo"><span className="mark">T</span> Trackwise</div><div className="sideLabel">WORKSPACE</div><select className="orgSelect" aria-label="Current organization" value={selected} onChange={e=>{setSelected(e.target.value);setLastCreatedProject(null);setLastCreatedTeam(null);setProjectFilter("all");setView("overview");setMobileMenu(false);clear()}}><option value="">Select organization</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><button type="button" className="twSidebarWorkspaces" onClick={()=>{setWorkspacePickerOpen(true);setMobileMenu(false)}}><UsersRound size={16}/> Workspaces ({orgs.length})</button>
 <button type="button" className="sidebarNewOrg" onClick={()=>{setMobileMenu(false);setQuickCreate("organization")}}><Plus size={16}/> New organization</button><div className="sideLabel sideNavigationLabel">NAVIGATE</div><nav aria-label="Main navigation">{NAV_GROUPS.map(group=><div className="navCluster" key={group.id}>
 <button type="button" className={"navItem "+(activeNav.id===group.id?"selected":"")} aria-current={view===group.defaultView?"page":undefined} onClick={()=>navigate(group.defaultView)}><span aria-hidden="true" className="navGlyph">{navigationIcon(group.id)}</span>{group.label}{group.id==="inbox"&&unreadNotifications>0&&<span className="unreadNavCount" aria-label={unreadNotifications+" unread notifications"}>{unreadNotifications>99?"99+":unreadNotifications}</span>}</button>
 
 </div>)}</nav>
 <div className="sideLabel sideProjectsLabel">PROJECTS</div>
 <div className="twSideProjectList">
 <button type="button" className={view==="projects"&&projectFilter==="all"?"selected":""} onClick={()=>{setProjectFilter("all");navigate("projects")}}><FolderKanban size={16}/> All projects</button>
 {projects.slice(0,6).map(project=><button type="button" key={project.id} className={view==="tasks"&&projectFilter===project.id?"selected":""} onClick={()=>{setProjectFilter(project.id);setMyTasksOnly(false);navigate("tasks")}} title={project.name}><span aria-hidden="true">•</span><span>{project.name}</span></button>)}
 {!projects.length&&<small>No projects yet</small>}
 </div><div className="sidebarUtility"><button type="button" className="sidebarWorkspaceInfo" onClick={()=>{setMobileMenu(false);setWorkspaceInfoOpen(true)}}><UsersRound size={17}/> Workspace details</button><button type="button" className="sidebarGuideButton" onClick={()=>{setMobileMenu(false);setShowGuide(true)}}><span aria-hidden="true">✦</span><span><strong>Take a guided tour</strong><small>See how everything works</small></span><span aria-hidden="true">→</span></button></div><div className="sideFoot"><button type="button" className="sidebarProfileShortcut" onClick={()=>navigate("profile")} aria-label="Open my account profile">
  <ProfileAvatar size="md" name={String(user.user_metadata?.display_name??user.email??"Member")} photoUrl={profilePhotoUrl} styleName={user.user_metadata?.avatar_style}/>
  <span className="userDetails"><strong>{String(user.user_metadata?.display_name??"").trim()||user.email?.split("@")[0]}</strong><small>{role?statusLabel(role):"Account"} · My profile →</small></span>
 </button><button className="logout" title="Sign out" aria-label="Sign out" onClick={()=>void db?.auth.signOut()}>↪</button></div></aside><div className="workspace"><header className="appHeader">
 <div className="pageHeading"><span className="eyebrow blue">TRACKWISE / {activeNav.label.toUpperCase()}</span>
  <h1>{view==="overview"?"Good to see you, "+(String(user.user_metadata?.display_name??user.email?.split("@")[0]??"there").trim().split(/\s+/)[0]):view==="profile"?"My profile":view==="tasks"?"Tasks":view==="calendar"?"Task calendar":view==="meeting_ai"?"Meeting assistant":view==="projects"?"Projects":view==="planning"?"Goals & planning":view==="people"?"People":view==="teams"?"Teams":view==="notifications"?"Inbox":view==="collaboration"?"Team messages":view==="requests"?"Requests & approvals":view==="reports"?"Reports":view==="activity"?"Activity history":"Settings"}</h1>
  <p className="muted">{view==="overview"?"See ownership, deadlines, and progress in one place.":view==="profile"?"Your account, photo and personal settings.":view==="tasks"?"Find, assign, and finish work.":view==="calendar"?"See deadlines at a glance.":view==="meeting_ai"?"Turn meeting decisions into reviewed tasks and plans.":view==="projects"?"Group related tasks and see what's moving.":view==="people"?"Find your colleagues and manage your teams.":view==="teams"?"Bring people together around shared work.":view==="notifications"?"Your updates, requests, and conversations in one place.":view==="settings"?"Your account, organization, and invitations.":"Keep everything organized in one place."}</p>
 </div>
 <div className="headerControls">
  {active&&<button type="button" className="headerSearch" aria-label="Search tasks, projects, and people" onClick={()=>{setSearchOpen(true);setCreateMenu(false)}}><SearchIcon size={18}/> <span>Search</span></button>}
  
   
   <button type="button" className="headerHelp" onClick={()=>{setShowGuide(true);setCreateMenu(false)}} aria-label="Open guided setup and feature explanations"><Sparkles size={18}/> <span>Guided help</span></button>
  {active&&<div className="createWrapper">
   <button type="button" className="primary mainCreateButton" onClick={()=>{if(manager)setQuickCreate("task");else launchCreate("request")}}><Plus size={18}/> {manager?"Quick create":"New request"}</button>
   <button type="button" className="createMenuToggle" aria-label="See all quick actions" aria-expanded={createMenu} aria-controls="globalCreateMenu" onClick={()=>setCreateMenu(v=>!v)}>⌄</button>
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
  <button type="button" className="userBadge userProfileBadge" onClick={()=>navigate("profile")} aria-label="Open my profile" title={user.email??""}>
   <ProfileAvatar size="sm" name={String(user.user_metadata?.display_name??user.email??"Member")} photoUrl={profilePhotoUrl} styleName={user.user_metadata?.avatar_style}/>
   <span>{String(user.user_metadata?.display_name??"").trim()||user.email?.split("@")[0]}</span>
 </button>
 </div>
</header><main className={"content "+(dialogView?"twWorkspaceDialog":"")} role={dialogView?"dialog":undefined} aria-modal={dialogView?true:undefined} aria-label={dialogView?"Trackwise workspace tools":undefined}>
 {dialogView&&<button type="button" className="twWorkspaceDialogBackdrop" onClick={closeWorkspaceDialog} aria-label="Close workspace dialog"/>}
 <div className="contentWidth">
 {dialogView&&<aside className="twWorkspaceDialogNav" aria-label="Workspace dialog sections">
   <div className="twWorkspaceDialogNavTop"><small>WORKSPACE</small><strong>{active?.name??"Your workspace"}</strong></div>
   {(["account","workspace"] as const).map(section=><div key={section} className="twWorkspaceDialogNavGroup">
    <span>{section==="account"?"ACCOUNT":"WORKSPACE TOOLS"}</span>
    {DIALOG_NAV.filter(item=>item.section===section&&(item.view!=="meeting_ai"||manager)).map(item=>
     <button type="button" key={item.view} className={view===item.view?"selected":""} aria-current={view===item.view?"page":undefined} onClick={()=>navigate(item.view)}>{item.label}</button>
    )}
   </div>)}
  </aside>}
 <div className="twWorkspaceDialogBody">
 {dialogView&&<div className="twWorkspaceDialogTitleBar"><div><span>TRACKWISE / {active?.name??"WORKSPACE"}</span><h2>{view==="profile"?"My profile":view==="people"?"Members":view==="teams"?"Teams":view==="planning"?"Goals & planning":view==="requests"?"Requests & approvals":view==="activity"?"Recent activity":view==="reports"?"Reports":view==="settings"?"Workspace settings":view==="meeting_ai"?"Meeting assistant":view==="notifications"?"Notifications":"Team messages"}</h2></div><button type="button" ref={dialogCloseRef} onClick={closeWorkspaceDialog} aria-label="Close dialog and return to workspace">×</button></div>}
 {joinToken&&<section className="card twJoinBanner" role="region" aria-label="Join workspace invitation"><div><strong>You've been invited to a Trackwise workspace.</strong><p className="muted">Choose Join workspace to accept. You'll have access based on the role your inviter selected.</p></div><div className="twJoinActions"><button type="button" className="primary" onClick={()=>void joinFromLink()} disabled={joiningWorkspace}>{joiningWorkspace?"Joining…":"Join workspace →"}</button><button type="button" onClick={dismissJoinLink} disabled={joiningWorkspace}>Dismiss</button></div></section>}
 
 {active&&activeNav.items.length>1&&<nav className="sectionTabs" aria-label={activeNav.label+" sections"}>{activeNav.items.filter(item=>item.view!=="meeting_ai"||manager).map(item=><button type="button" key={item.view} className={view===item.view?"active":""} aria-current={view===item.view?"page":undefined} onClick={()=>navigate(item.view)}>{item.label}</button>)}</nav>}
 {error&&<p role="alert" className="feedback bad">{error}</p>}{notice&&<p role="status" className="feedback good">{notice}</p>}{!active&&view!=="profile"?<div className="card emptyState">{pendingInvites.length>0&&<section><h2>Invitations for you</h2>{pendingInvites.map(i=><div className="reportRow" key={i.id}><span>Invitation to join as {statusLabel(i.role)}</span><button className="primary" disabled={invitesLoading} onClick={()=>void acceptInvite(i.id)}>Accept</button></div>)}</section>}<span className="bigIcon">✦</span><span className="eyebrow blue">WELCOME · STEP 1 OF 3</span><h2>Let's create your first workspace</h2>
 <p className="muted">You can create an organization to organize projects and tasks, or join someone else's organization through an invitation link.</p><button type="button" className="newUserGuideCTA" onClick={()=>setShowGuide(true)}>✦ First time here? Take the guided tour →</button>
 <div className="startChoices"><div className="startChoice"><strong>🏢 Start an organization</strong><p>You'll be its administrator, so you can invite people, create projects and assign tasks.</p></div><div className="startChoice"><strong>✉ Join an organization</strong><p>Ask your leader to share an invitation link with you. Sign in with your invited email and accept it here.</p></div></div><div className="organizationSetupForm"><label htmlFor="firstOrgName">Organization name</label>
 <form onSubmit={createOrg} className="inlineForm"><input id="firstOrgName" aria-label="Organization name" minLength={2} maxLength={120} value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="e.g. Volunteerism Club" required/><button type="submit" className="primary" disabled={working}>{working?"Creating…":"Create & start setup →"}</button></form>
 <small className="fieldHint">You'll be the administrator. Only approved members can see your organization's work.</small></div></div>:<>{view==="overview"&&<div className="twDashboard">
 <section className="twDashboardHero" aria-label="Workspace overview">
  <div className="twDashboardHeroCopy">
   <span className="twDashboardHeroEyebrow"><Sparkles size={15} aria-hidden="true"/> TRACKWISE · WORKSPACE OVERVIEW</span>
   <h2>Make progress.<span>Stay in control.</span></h2>
   <p>One clear view of your priorities, people and projects. Less searching, more moving forward.</p>
   <div className="twDashboardHeroHighlights" aria-label="Workspace totals">
    <span><strong>{projects.length}</strong> Projects</span>
    <span><strong>{teams.length}</strong> Teams</span>
    <span><strong>{homeTasks.length}</strong> Tasks</span>
   </div>
  </div>
  <div className="twDashboardHeroCard">
   <span className="twDashboardHeroCardLabel"><span aria-hidden="true">✦</span> YOUR NEXT MOVE</span>
   <strong>{counts.overdue>0?"You have work to catch up on.":manager?"Let's make something happen.":"Your priorities, all in one place."}</strong>
   <p>{counts.overdue>0?`${counts.overdue} overdue task${counts.overdue===1?" needs":"s need"} attention. Check the board below to get things moving.`:manager?"Create a project, assign a task, or invite your team in a few simple steps.":"See your assigned work, follow progress and stay connected with your team."}</p>
   <button type="button" className="twDashboardHeroPrimary" onClick={()=>manager?launchCreate("project"):navigate("tasks")}><Plus size={18} aria-hidden="true"/>{manager?"Start a project":"Open my tasks"} <span aria-hidden="true">→</span></button>
   <button type="button" className="twDashboardHeroGuide" onClick={()=>setShowGuide(true)}><Sparkles size={15} aria-hidden="true"/> Take a guided tour</button>
  </div>
 </section>
 <section className="twDashboardActionStrip" aria-label="Get started quickly">
  <div className="twDashboardActionIntro"><strong>What would you like to do?</strong><span>Choose an action to get started.</span></div>
  <div className="twDashboardActionButtons">
   {manager?<><button type="button" className="primary" onClick={()=>launchCreate("task")}><Plus size={17}/> New task</button>
    <button type="button" onClick={()=>launchCreate("project")}><FolderKanban size={17}/> New project</button>
    <button type="button" onClick={()=>launchCreate("invite")}><Mail size={17}/> Invite person</button></>:
    <><button type="button" className="primary" onClick={()=>{setMyTasksOnly(true);navigate("tasks")}}><SquareCheckBig size={17}/> My tasks</button>
    <button type="button" onClick={()=>launchCreate("request")}><Plus size={17}/> New request</button>
    <button type="button" onClick={()=>navigate("collaboration")}><Inbox size={17}/> Team messages</button></>}
  </div>
 </section>
 <section className="twDashboardMetricGrid" aria-label="Workspace task summary">
  {/* Summary cards stay visible above the task board on desktop and mobile. */}
  {dashboardStats.map(item=><div className="twDashboardMetric" key={item.label}>
   <span>{item.label}</span><strong>{item.value}</strong><small>{item.help}</small>
  </div>)}
 </section>
 <section className="card twDashboardTaskPanel" aria-label="Workspace task board">
  <div className="twDashboardTaskHeading"><div><span className="eyebrow blue">TASK MANAGEMENT</span><h2>Tasks at a glance</h2><p className="muted">Move work forward without leaving your dashboard.</p></div>
   <div className="twDashboardTaskHeadingActions"><button type="button" disabled={workspaceLoading} onClick={()=>void loadWorkspace(selected)}>{workspaceLoading?"Refreshing…":"↻ Refresh"}</button><button type="button" className="primary" onClick={()=>navigate("tasks")}>Open all tasks →</button></div>
  </div>
  <div className="twDashboardFilters">
   <input type="search" aria-label="Search dashboard tasks" value={dashboardSearch} onChange={e=>setDashboardSearch(e.target.value)} placeholder="Find a task by name or description…"/>
   <button type="button" className="twDashboardFilterToggle" aria-expanded={showDashboardFilters} aria-controls="twDashboardAdvancedFilters" onClick={()=>setShowDashboardFilters(v=>!v)}><SearchIcon size={16}/> Filters{dashboardFilterCount>0?" ("+dashboardFilterCount+")":""} <span aria-hidden="true">{showDashboardFilters?"⌃":"⌄"}</span></button>
   {(dashboardFilterCount>0||dashboardSearch)&&<button type="button" className="twDashboardClearFilters" onClick={clearDashboardFilters}>Clear</button>}
  </div>
  <div id="twDashboardAdvancedFilters" className={"twDashboardAdvancedFilters "+(showDashboardFilters?"isOpen":"")} hidden={!showDashboardFilters}>
   <label>Status<select aria-label="Filter dashboard task status" value={dashboardStatus} onChange={e=>setDashboardStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(x=><option key={x} value={x}>{taskLabel(x)}</option>)}</select></label>
   <label>Priority<select aria-label="Filter dashboard priority" value={dashboardPriority} onChange={e=>setDashboardPriority(e.target.value)}><option value="all">All priorities</option>{["low","normal","high","urgent"].map(x=><option key={x} value={x}>{statusLabel(x)}</option>)}</select></label>
   {manager&&<label>Assigned to<select aria-label="Filter dashboard assignee" value={dashboardAssignee} onChange={e=>setDashboardAssignee(e.target.value)}><option value="all">All assignees</option><option value="unassigned">Unassigned</option>{directory.map(p=><option key={p.user_id} value={p.user_id}>{p.user_id===user.id?"Me":p.display_name}</option>)}</select></label>}
  </div>
  <div className="twDashboardTaskTools"><div className="twTaskViewSwitch" role="group" aria-label="Dashboard task display"><button type="button" aria-pressed={dashboardLayout==="board"} className={dashboardLayout==="board"?"selected":""} onClick={()=>setDashboardLayout("board")}>▦ Board</button><button type="button" aria-pressed={dashboardLayout==="list"} className={dashboardLayout==="list"?"selected":""} onClick={()=>setDashboardLayout("list")}>☷ List</button></div><span className="muted">{dashboardTasks.length} matching task{dashboardTasks.length===1?"":"s"}</span></div>
  {dashboardLayout==="board"?<TaskBoard hideStats tasks={dashboardTasks} directory={directory} projects={projects} userId={user.id} role={role??null} manager={manager} working={working} onOpen={id=>{navigate("tasks");void openTask(id)}} onStatusChange={(id,status)=>void updateTask(id,status)} onCreate={()=>launchCreate("task")}/>:
   <div className="tablewrap twDashboardList"><table><thead><tr><th>Task</th><th>Owner</th><th>Priority</th><th>Status</th><th>Deadline</th></tr></thead><tbody>{dashboardTasks.length?dashboardTasks.map(t=><tr key={t.id}><td><button type="button" className="taskOpen" onClick={()=>{navigate("tasks");void openTask(t.id)}}>{t.title}</button></td><td>{t.owner_id===user.id?"You":directory.find(m=>m.user_id===t.owner_id)?.display_name??"Unassigned"}</td><td>{statusLabel(t.priority)}</td><td>{taskLabel(t.status)}</td><td>{t.due_at?new Date(t.due_at).toLocaleDateString():"—"}</td></tr>):<tr><td colSpan={5} className="muted">No tasks match these filters.</td></tr>}</tbody></table></div>}
 </section>
 <div className="twDashboardBelow"><section className="card twDashboardShortcuts"><div className="sectionHead"><h2>Explore your workspace</h2><button className="textAction" type="button" onClick={()=>setShowGuide(true)}>How it works →</button></div>
 <p className="muted">Everything you need, without searching through menus.</p>
 <section className="quickActions" aria-label="Workspace shortcuts">
  <button type="button" onClick={()=>navigate("calendar")}><span className="quickIcon"><SquareCheckBig size={21}/></span><span><strong>Calendar</strong><small>See deadlines</small></span></button>
  <button type="button" onClick={()=>navigate("people")}><span className="quickIcon"><UsersRound size={21}/></span><span><strong>People & teams</strong><small>Work together</small></span></button>
  <button type="button" onClick={()=>navigate("collaboration")}><span className="quickIcon"><Inbox size={21}/></span><span><strong>Team messages</strong><small>Share updates</small></span></button>
  <button type="button" onClick={()=>navigate("requests")}><span className="quickIcon"><Mail size={21}/></span><span><strong>Requests</strong><small>Review decisions</small></span></button>
 </section>
 </section><section className="card reportShortcutCard" aria-label="Workspace reports"><div><span className="eyebrow blue">WORKSPACE INSIGHTS</span><h2>Reports & progress</h2><p className="muted">See completion rates, overdue work, team workload and project progress in one place.</p><div className="reportShortcutFacts"><span><strong>{tasks.filter(t=>t.status==="completed").length}</strong> completed</span><span><strong>{counts.overdue}</strong> overdue</span><span><strong>{projects.length}</strong> projects</span></div></div><button type="button" className="primary" onClick={()=>navigate("reports")}><BarChart3 size={18}/> View detailed reports →</button></section></div>
 <details className="twDashboardGettingStarted"><summary><span>✦ Getting started & guided setup</span><span className="muted">{setupCompleted} of 4 setup steps</span></summary>
  {!hideChecklist&&<section className="card setupChecklist">
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
 </section>}
 </details>
 </div>}{view==="calendar"&&<TaskCalendar tasks={tasks} projects={projects} onOpenTask={id=>{navigate("tasks");void openTask(id)}}/>}{view==="tasks"&&<>{selectedTask&&<section className="card"><div className="sectionHead"><h2>{tasks.find(t=>t.id===selectedTask)?.title??"Task details"}</h2><button className="textAction" onClick={()=>setSelectedTask("")}>Close ×</button></div><div className="taskDetailsSummary"><p><strong>Project: </strong>{projects.find(p=>p.id===tasks.find(t=>t.id===selectedTask)?.project_id)?.name??"Not linked"}</p><p><strong>Assigned to: </strong>{directory.find(m=>m.user_id===tasks.find(t=>t.id===selectedTask)?.owner_id)?.display_name??"Unassigned"}</p>{tasks.find(t=>t.id===selectedTask)?.description&&<p className="detailDescription">{tasks.find(t=>t.id===selectedTask)?.description}</p>}</div>
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
  <input id="taskTitle" value={taskTitle} minLength={2} maxLength={180} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Prepare the meeting agenda" required autoComplete="off"/>
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
 <div className="span2 friendlyActions"><button className="primary" type="submit" disabled={working}>{working?"Saving task…":"Create task →"}</button><button type="button" onClick={()=>setShowTaskForm(false)} disabled={working}>Cancel</button></div></form></section>}<section className="card"><div className="sectionHead"><div><h2>Saved tasks <span className="count">{tasks.length}</span></h2><p className="muted">Tasks are stored in your organization database. Select Refresh to check for updates.</p></div><div className="headerActions">{manager&&<><button type="button" className="primary" onClick={()=>launchCreate("task")}><Plus size={17}/> New task</button><button type="button" className="textAction" onClick={()=>{setShowTaskForm(v=>!v);setTimeout(()=>document.getElementById("taskComposer")?.scrollIntoView({behavior:"smooth",block:"start"}),100)}}>{showTaskForm?"Hide advanced setup":"Advanced setup"}</button></>}<button type="button" className="textAction" onClick={()=>{setView("projects");setProjectFilter("all");setMobileMenu(false);setTimeout(()=>document.getElementById("projectCreator")?.scrollIntoView({behavior:"smooth",block:"start"}),80)}}>{manager?"＋ Add project":"View projects"} →</button><button className="textAction" disabled={workspaceLoading} onClick={()=>void loadWorkspace(selected)}>{workspaceLoading?"Loading…":"↻ Refresh"}</button></div></div><details className="workflowHelp"><summary>How do task statuses work?</summary>
 <p>To do → In progress → For review → Completed. Tasks can also be marked <strong>Blocked</strong> when you need help or <strong>Needs changes</strong> when a leader asks for revisions.</p>
 <p>{manager?"As a leader, you can mark a task complete after reviewing it.":"When you finish your task, select Submit for approval. A leader will review and complete it."}</p></details>
 <div className="twTaskViewSwitch" role="group" aria-label="Task display"><button type="button" className={taskLayout==="board"?"selected":""} aria-pressed={taskLayout==="board"} onClick={()=>setTaskLayout("board")}>▦ Board view</button><button type="button" className={taskLayout==="list"?"selected":""} aria-pressed={taskLayout==="list"} onClick={()=>setTaskLayout("list")}>☷ List view</button></div><div className="filterBar"><label className="taskOwnerFilter"><input type="checkbox" checked={myTasksOnly} onChange={e=>setMyTasksOnly(e.target.checked)}/> My tasks only</label><input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(x=><option key={x} value={x}>{taskLabel(x)}</option>)}</select><select aria-label="Filter by project" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="all">All projects</option><option value="none">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>{taskLayout==="board"?<TaskBoard tasks={visibleTasks} directory={directory} projects={projects} userId={user.id} role={role??null} manager={manager} working={working} onOpen={id=>void openTask(id)} onStatusChange={(id,status)=>void updateTask(id,status)} onCreate={()=>launchCreate("task")}/>:taskTable}</section><RecurringSchedules key={selected} organizationId={selected} manager={manager} refreshKey={recurringRefresh} directory={directory} projects={projects}/></>}{view==="people"&&<>
 <section className="card peopleIntro">
  <div className="sectionHead"><div><span className="eyebrow blue">WORK TOGETHER</span><h2>People in {active?.name??"Workspace"}</h2></div>{manager&&<button type="button" className="primary" onClick={()=>launchCreate("invite")}>＋ Invite a person</button>}</div>
  <p className="muted">Invite people before assigning them tasks or adding them to teams. Each person can join using the invitation link you share with them.</p>
  <div className="stats"><div className="stat"><span>Members</span><strong>{members.length}</strong></div><div className="stat"><span>Teams</span><strong>{teams.length}</strong></div><div className="stat"><span>Pending invitations</span><strong>{manager?outgoingInvites.filter(i=>!i.accepted_at&&new Date(i.expires_at)>new Date()).length:"—"}</strong></div></div>
 </section>
 <section className="card">
  <div className="sectionHead"><h2>Organization members</h2>{role==="admin"&&<button type="button" className="textAction" onClick={()=>navigate("settings")}>Manage roles →</button>}</div>
  {directory.length?directory.map(m=><div key={m.user_id} className="memberManageRow"><div className="peopleIdentity"><span className="peopleAvatar">{m.display_name.slice(0,1).toUpperCase()}</span><div><strong>{m.display_name}{m.user_id===user.id?" (You)":""}</strong><small>{statusLabel(m.role)} · {teamMembers.filter(t=>t.user_id===m.user_id).length} team(s)</small></div></div>{role==="admin"&&m.user_id!==user.id&&<button type="button" className="dangerAction" disabled={working} onClick={()=>void removeMember(m.user_id,m.display_name)}>Remove</button>}</div>):<p className="muted">{workspaceLoading?"Loading people…":"You can invite your first colleague using the button above."}</p>}
 </section>
 <section className="card"><div className="sectionHead"><h2>Teams</h2><button type="button" className="primary" onClick={()=>navigate("teams")}>{manager?"Manage teams →":"See teams →"}</button></div><p className="muted">Teams help you organize members around a project or shared responsibility. Create a team and add people who have joined the organization.</p>{teams.slice(0,5).map(t=><div key={t.id} className="taskLine"><span className="taskDot underway"/><div><strong>{t.name}</strong><small>{teamMembers.filter(m=>m.team_id===t.id).length} member(s)</small></div></div>)}</section>
 </>}{view==="teams"&&<><section className="card"><div className="sectionHead"><h2>Your teams <span className="count">{teams.length}</span></h2>{manager&&<button type="button" className="primary" onClick={()=>launchCreate("team")}><Plus size={17}/> New team</button>}</div><div className="teamGrid">{teams.length?teams.map(t=><div className="teamCard" key={t.id}>
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
 <section className="card savedProjectsCard">
  <div className="sectionHead"><div><h2>Your projects <span className="count">{projects.length}</span></h2><p className="muted">All your projects in one place. Open one to view its tasks or add the next action.</p></div><div className="projectHeaderActions">{manager&&<button type="button" className="primary" onClick={()=>launchCreate("project")}><Plus size={17}/> New project</button>}<button type="button" className="textAction" disabled={workspaceLoading} onClick={()=>void loadWorkspace(selected)}>{workspaceLoading?"Loading…":"↻ Refresh"}</button></div></div>
  {workspaceLoading&&projects.length===0?<p role="status" className="muted">Loading projects from the database…</p>:projects.length===0?<div className="emptyProject"><h3>No projects yet</h3><p>{manager?"Select New project to create a project in a few seconds.":"Your organization leaders can create projects and assign tasks to them."}</p></div>:<div className="projectGrid">{projects.map(p=><article className="projectCard" key={p.id}>
   <div className="projectTop"><strong>{p.name}</strong><span className="chip">{statusLabel(p.status)}</span></div>
   {p.description&&<p className="muted">{p.description}</p>}
   <p className="muted">{p.goal_id?"Goal: "+(goals.find(g=>g.id===p.goal_id)?.title??"Linked goal"):"No linked goal"} · {p.team_id?"Team: "+(teams.find(t=>t.id===p.team_id)?.name??"Assigned team"):"No team assigned"}</p>
   <div className="projectFoot"><span><strong>{tasks.filter(t=>t.project_id===p.id).length}</strong> saved tasks</span><div className="projectActions"><button type="button" onClick={()=>{setProjectFilter(p.id);setView("tasks");setMyTasksOnly(false)}}>View tasks →</button>{manager&&<button type="button" className="primary" onClick={()=>{setQuickProjectId(p.id);setQuickCreate("task")}}>+ Add task</button>}{manager&&<button type="button" onClick={()=>{if(editingProject===p.id)setEditingProject("");else startProjectEdit(p)}}>{editingProject===p.id?"Cancel":"✎ Edit"}</button>}</div></div>
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
 <section className="card projectHelp">
  <div className="sectionHead"><div><span className="eyebrow blue">ORGANIZE YOUR WORK</span><h2>Need a guide? How projects work</h2></div></div>
  <p>Projects group related tasks together. Create a project first, then choose it while adding tasks. You do not need an existing team or goal to get started.</p>
  <p className="muted">Administrators and leaders can create projects and tasks. Other organization members can view them and follow their assigned work.</p>{!manager&&<div className="limitedAccessHelp"><strong>Want to start a new project?</strong><p>Ask your organization administrator or leader to create it, or submit a project request for their approval.</p><button type="button" className="primary" onClick={()=>setView("requests")}>Request a project →</button></div>}
 </section>
 {manager&&<section className="card projectCreator" id="projectCreator">
  <button type="button" className="projectAdvancedToggle" aria-expanded={showAdvancedProject} onClick={()=>setShowAdvancedProject(v=>!v)}><span><strong>Need more project settings?</strong><small>Advanced setup: link a goal or team and add detailed information.</small></span><span aria-hidden="true">{showAdvancedProject?"−":"+"}</span></button>
  {showAdvancedProject&&<><div className="sectionHead"><div><span className="eyebrow blue">START HERE · STEP 1</span><h2>Project setup with more options</h2></div></div>
  <p className="muted">Prefer a detailed setup? Use this form to link a goal or team immediately. For a faster start, choose New project above.</p>
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
  {lastCreatedProject&&<div className="creationSuccess" role="status"><span className="creationSuccessIcon" aria-hidden="true">✓</span><div><strong>{lastCreatedProject.name} is ready!</strong><p>Next, add the first task for this project. We'll link it automatically.</p></div><button type="button" className="primary" onClick={openFirstProjectTask}>Add its first task →</button></div>}</>}
 </section>}
 </>}{view==="requests"&&<><section className="card" id="submitRequest"><h2>Submit a request</h2><form onSubmit={submitRequest}><label htmlFor="requestTitle">Request title</label><input id="requestTitle" value={requestTitle} onChange={e=>setRequestTitle(e.target.value)} maxLength={180} required placeholder="What do you need?"/><label htmlFor="requestDetails">Details</label><textarea id="requestDetails" value={requestDetails} onChange={e=>setRequestDetails(e.target.value)} placeholder="Provide context and expected outcome" rows={3}/><button className="primary" disabled={working} style={{marginTop:14}}>Submit request</button></form></section><section className="card"><h2>Request inbox</h2>{requests.length?requests.map(r=><div className="requestRow" key={r.id}><div><strong>{r.title}</strong><p className="muted">{r.details||"No additional details"}</p><span className="chip">{statusLabel(r.decision)}</span>{r.decision_reason&&<p className="muted">Decision: {r.decision_reason}</p>}</div>{manager&&(r.decision==="submitted"||r.decision==="deferred")&&<div className="rowActions">{(["approved","deferred","rejected"] as const).map(d=><button key={d} disabled={working} onClick={()=>void decideRequest(r.id,d)}>{statusLabel(d)}</button>)}</div>}{r.decision==="approved"&&<div className="rowActions">
 {tasks.find(t=>t.source_request_id===r.id)?<button type="button" className="textAction" onClick={()=>{const linked=tasks.find(t=>t.source_request_id===r.id);if(linked){setView("tasks");void openTask(linked.id)}}}>Open linked task →</button>:manager&&<button type="button" className="primary" disabled={working} onClick={()=>void createTaskFromApprovedRequest(r.id)}>+ Create a task</button>}
 </div>}</div>):<p className="muted">No requests submitted yet.</p>}</section></>}
{view==="meeting_ai"&&(manager?<MeetingAssistant key={selected} organizationId={selected} userId={user.id} tasks={tasks} projects={projects} members={directory} onSaved={async()=>{await loadWorkspace(selected)}}/>:<section className="card"><h2>Leader access required</h2><p className="muted">An administrator or leader must review and approve meeting suggestions before they can change the tracker.</p></section>)}
{view==="activity"&&<section className="card"><h2>Recent activity</h2>{activity.length?activity.map(a=><div className="taskLine" key={a.id}><span className="taskDot"/><div><strong>{statusLabel(a.entity_type.replace("tw_",""))} · {statusLabel(a.action)}</strong><small>{new Date(a.created_at).toLocaleString()}</small></div></div>):<p className="muted">Activity will appear as your team starts working.</p>}</section>}
{view==="reports"&&<Reports key={selected} tasks={tasks} projects={projects} teams={teams} directory={directory} organizationName={active?.name??"Organization"} organizationId={selected}/>}{(view==="collaboration"||view==="notifications")&&user&&<Operations key={selected} organizationId={selected} userId={user.id} tasks={tasks} teams={manager?teams:teams.filter(t=>teamMembers.some(member=>member.team_id===t.id&&member.user_id===user.id))} projects={projects} manager={manager} section={view}/>}{view==="profile"&&<AccountProfile user={user} role={role??null}
 organizationName={active?.name??""} organizationCount={orgs.length}
 assignedTasks={tasks.filter(t=>t.owner_id===user.id).length}
 projectsCount={projects.length} photoUrl={profilePhotoUrl}
 onUpdated={async()=>{
  const result=await db?.auth.getUser();
  if(result?.data.user)setUser(result.data.user);
  if(selected)await loadWorkspace(selected);
 }}/>}
 {view==="settings"&&<>{role==="admin"&&<WorkspaceBackup key={selected} organizationId={selected} organizationName={active?.name??"Workspace"} userId={user.id}/>}<section className="card setupHelpCard"><div className="sectionHead"><div><span className="eyebrow blue">LEARNING CENTER</span><h2>Get comfortable with Trackwise</h2></div><button type="button" className="primary" onClick={()=>setShowGuide(true)}>Open interactive guide ↗</button></div><p>Go through the setup walkthrough or browse a searchable explanation of all the features, their purpose, and where to find them.</p><div className="setupHelpActions"><button type="button" onClick={showSetup}>Show my setup checklist</button><button type="button" onClick={()=>{setShowGuide(true)}}>Explore features & uses</button></div></section><section className="card"><h2>Your organization role</h2><p className="muted">Your role belongs to this organization, not your login account. The person who creates a workspace becomes its administrator. Other people receive their roles when an administrator or leader invites them.</p><p className="readOnlyValue"><strong>{role?statusLabel(role):"No organization role assigned"}</strong> · {active?.name}</p>{!manager&&<p className="muted">Only administrators and leaders can invite members. Ask an organization leader if you need invitation permissions.</p>}</section><section className="card"><div className="sectionHead"><h2>Your account</h2><button type="button" className="primary" onClick={()=>navigate("profile")}>View & edit my profile →</button></div><p className="muted">Update your name, avatar, position and personal details on the My profile page.</p></section>{role==="admin"&&<section className="card"><h2>Manage member roles</h2><p className="muted">Only administrators can change roles or remove members. Changing someone to Observer or Stakeholder makes their tasks unassigned; removing a member revokes their access. Past work remains in the history.</p>{directory.map(m=><div className="memberManageRow" key={m.user_id}><div><strong>{m.display_name}</strong><small>{statusLabel(m.role)}{m.user_id===user.id?" · You":""}</small></div>{roleEditing===m.user_id?<div className="memberManageActions"><select aria-label={"New role for "+m.display_name} value={roleChoice} onChange={e=>setRoleChoice(e.target.value)}>{["admin","leader","member","stakeholder","observer"].map(x=><option key={x} value={x}>{statusLabel(x)}</option>)}</select><button className="primary" disabled={working} onClick={()=>void updateMemberRole(m.user_id)}>Save</button><button onClick={()=>setRoleEditing("")}>Cancel</button></div>:<div className="memberManageActions"><button type="button" disabled={working} onClick={()=>{setRoleEditing(m.user_id);setRoleChoice(m.role)}}>Change role</button>{m.user_id!==user.id&&<button type="button" disabled={working} className="dangerAction" onClick={()=>void removeMember(m.user_id,m.display_name)}>Remove member</button>}</div>}</div>)}</section>}{pendingInvites.length>0&&<section className="card"><h2>Invitations for you</h2>{pendingInvites.map(i=><div className="reportRow" key={i.id}><span>Invitation to join an organization as {statusLabel(i.role)}</span><button className="primary" disabled={invitesLoading} onClick={()=>void acceptInvite(i.id)}>Accept invitation</button></div>)}</section>}{manager&&<section className="card twInviteSection" id="inviteMembers">
 <div className="sectionHead"><div><span className="eyebrow blue">EASY TEAM ONBOARDING</span><h2>Invite people with a link</h2></div></div>
 <p className="muted">No email addresses to enter. Create a link and send it through WhatsApp, messages, or any app. Teammates sign in or create a Trackwise account to join.</p>
 <div className="twInviteCreate">
  <label htmlFor="twShareRole">Access level<select id="twShareRole" value={shareRole} onChange={e=>setShareRole(e.target.value)}><option value="member">Member · collaborate on tasks</option><option value="observer">Observer · view only</option><option value="stakeholder">Stakeholder · view only</option></select></label>
  <button className="primary" type="button" disabled={shareLinkWorking} onClick={()=>void createShareLink()}><Plus size={18}/>{shareLinkWorking?"Please wait…":"Create invite link"}</button>
 </div>
 {shareLinkId&&<div className="twInviteLinkReady" role="status"><strong><CheckCircle2 size={18}/> Your link is ready</strong><p>Anyone you share this link with can request to join using its access level. It expires after 14 days or 25 successful joins. You can disable it whenever you want.</p>
  <input type="text" aria-label="Shareable workspace invite link" readOnly onFocus={e=>e.target.select()} value={shareableInviteUrl(shareLinkId)}/>
  <div className="inviteActions"><button type="button" className="primary" onClick={()=>void copyShareLink(shareLinkId)}>Copy link</button><button type="button" onClick={()=>void sendShareLink(shareLinkId)}>Share / WhatsApp ↗</button></div>
 </div>}
 {inviteLinks.length>0&&<details className="twInviteManage"><summary>Active and previous invite links ({inviteLinks.length})</summary><div className="twInviteLinkList">{inviteLinks.map(link=>{
  const valid=!link.revoked_at&&new Date(link.expires_at).getTime()>Date.now()&&link.uses_count<link.max_uses;
  return <div key={link.id} className="twInviteLinkRow"><div><strong>{statusLabel(link.role)} · {valid?"Active":link.revoked_at?"Disabled":"Expired / used"}</strong><small>{link.uses_count} / {link.max_uses} joins · Expires {new Date(link.expires_at).toLocaleDateString()}</small></div><div className="inviteActions">{valid&&<><button type="button" onClick={()=>{setShareLinkId(link.id);void copyShareLink(link.id)}}>Copy</button><button type="button" onClick={()=>void revokeShareLink(link.id)} disabled={shareLinkWorking}>Disable</button></>}</div></div>;
 })}</div></details>}
 <details className="twInviteEmailAlternate"><summary>Prefer to invite a specific email? (Optional)</summary><p className="muted">Email-specific invitations are useful when you want access restricted to one email address, or need to invite a team leader.</p>
 <form onSubmit={addMember} className="formGrid"><div><label htmlFor="inviteEmail">Member email</label><input id="inviteEmail" type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="colleague@example.com"/></div><div><label htmlFor="inviteRole">Organization role</label><select id="inviteRole" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="member">Member</option><option value="leader">Leader</option><option value="observer">Observer</option><option value="stakeholder">Stakeholder</option></select></div><div className="formAction"><button className="primary" disabled={working}>Create invitation</button></div></form>{inviteShareReady&&inviteShareId&&<div className="inviteShare"><p>Invitation ready for <strong>{inviteShareEmail}</strong>. It expires in 14 days and can only be accepted by that email address.</p><input aria-label="Invitation link" readOnly value={typeof window!=="undefined"?window.location.origin+"/?invite="+encodeURIComponent(inviteShareId):""}/><div className="inviteActions"><button className="primary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+"/?invite="+encodeURIComponent(inviteShareId));setNotice("Invitation link copied.")}catch{setError("Could not copy automatically. Select and copy the invitation link above.")}}}>Copy invitation link</button><button type="button" onClick={async()=>{const url=window.location.origin+"/?invite="+encodeURIComponent(inviteShareId);const message="You're invited to join "+(active?.name??"an organization")+" on Trackwise. Sign in using "+inviteShareEmail+" and accept the invitation.";if(navigator.share){try{await navigator.share({title:"Trackwise invitation",text:message,url})}catch(e){if(e instanceof Error&&e.name!=="AbortError")setError("Sharing failed. Try copying the link.")}}else{window.open("https://wa.me/?text="+encodeURIComponent(message+" "+url),"_blank","noopener,noreferrer")}}}>Share invitation ↗</button><a href={"https://wa.me/?text="+encodeURIComponent("You're invited to join "+(active?.name??"an organization")+" on Trackwise. Sign in as "+inviteShareEmail+" to accept: "+(typeof window!=="undefined"?window.location.origin+"/?invite="+encodeURIComponent(inviteShareId):""))} target="_blank" rel="noopener noreferrer">Share on WhatsApp ↗</a></div></div>}
 </details>
 </section>}{manager&&<section className="card"><div className="sectionHead"><h2>Manage invitations</h2><button type="button" onClick={()=>void loadOutgoingInvites(selected)}>Refresh</button></div><p className="muted">View invitations, share their links again, or revoke access before acceptance.</p>{outgoingInvites.length===0?<p className="muted">No invitations yet.</p>:outgoingInvites.map(inv=><div className="memberManageRow" key={inv.id}><div><strong>{inv.email}</strong><small>{statusLabel(inv.role)} · {inv.accepted_at?"Accepted":new Date(inv.expires_at).getTime()<Date.now()?"Expired":"Pending"} · Expires {new Date(inv.expires_at).toLocaleDateString()}</small></div><div className="memberManageActions">{!inv.accepted_at&&new Date(inv.expires_at).getTime()>=Date.now()&&<><button type="button" onClick={()=>shareExistingInvite(inv.id,inv.email)}>Share link</button><button type="button" disabled={inviteAction===inv.id} onClick={()=>void revokeInvite(inv.id)}>Revoke</button></>}{!inv.accepted_at&&new Date(inv.expires_at).getTime()<Date.now()&&<span className="muted">Create a new invitation to renew</span>}</div></div>)}</section>}<section className="card"><h2>Current organization</h2><p><strong>{active?.name??"Workspace"}</strong></p><p className="muted">Your role: {role?statusLabel(role):"Loading…"}</p><p className="muted">Organization ID: {active?.id??"Not selected"}</p></section><section className="card"><h2>Create another organization</h2><form onSubmit={createOrg} className="inlineForm"><input aria-label="New organization name" value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="Organization name" minLength={2} maxLength={120} required/><button className="primary" disabled={working}>Create workspace</button></form></section></>}</>}</div></div></main></div>{searchOpen&&active&&<div className="searchOverlay"><section className="searchPanel" role="dialog" aria-modal="true" aria-label="Search workspace">
  <div className="searchTop"><label htmlFor="globalSearch">Search this organization</label><button type="button" className="guideClose" onClick={closeSearch} aria-label="Close search">×</button></div>
  <input id="globalSearch" type="search" autoFocus placeholder="Find a task, project, or person…" value={globalSearch} maxLength={160} onChange={e=>setGlobalSearch(e.target.value)}/>
  {!searchTerm?<p className="muted">Type a name, task title, or project to find it quickly.</p>:
   taskMatches.length+projectMatches.length+peopleMatches.length===0?<p role="status" className="muted">No matches in this organization. Try another word.</p>:
   <div className="searchResults">
    {taskMatches.length>0&&<div><h3>Tasks</h3>{taskMatches.map(t=><button type="button" key={t.id} onClick={()=>{closeSearch();navigate("tasks");void openTask(t.id)}}><strong>☑ {t.title}</strong><small>{taskLabel(t.status)}</small></button>)}</div>}
    {projectMatches.length>0&&<div><h3>Projects</h3>{projectMatches.map(p=><button type="button" key={p.id} onClick={()=>{closeSearch();setProjectFilter(p.id);setMyTasksOnly(false);navigate("projects")}}><strong>▧ {p.name}</strong><small>{tasks.filter(t=>t.project_id===p.id).length} tasks</small></button>)}</div>}
    {peopleMatches.length>0&&<div><h3>People</h3>{peopleMatches.map(p=><button type="button" key={p.user_id} onClick={()=>{closeSearch();navigate("people")}}><strong>♙ {p.display_name}</strong><small>{statusLabel(p.role)}</small></button>)}</div>}
   </div>}
  <p className="muted searchFoot">Searching tasks, projects and people in {active?.name??"Workspace"}. Press Escape to close.</p>
 </section></div>}{workspacePickerOpen&&<div className="twWorkspacePickerOverlay"><button type="button" className="twWorkspacePickerBackdrop" aria-label="Close workspace chooser" onClick={()=>setWorkspacePickerOpen(false)}/><section className="twWorkspacePickerDialog" role="dialog" aria-modal="true" aria-labelledby="twWorkspacePickerHeading"><aside className="twWorkspacePickerSide"><span>ACCOUNT</span><strong>Workspaces</strong><p>Choose where you want to work.</p><button type="button" onClick={()=>{setWorkspacePickerOpen(false);navigate("profile")}}>My profile</button><button type="button" onClick={()=>{setWorkspacePickerOpen(false);navigate("settings")}}>Settings</button></aside><div className="twWorkspacePickerBody"><div className="twWorkspacePickerHeader"><div><span>WORKSPACE</span><h2 id="twWorkspacePickerHeading">Workspaces ({orgs.length})</h2></div><button autoFocus type="button" aria-label="Close workspaces" onClick={()=>setWorkspacePickerOpen(false)}>×</button></div><div className="twWorkspacePickerList">{orgs.map(org=><div key={org.id} className="twWorkspacePickerItem"><div><strong>{org.name}</strong><small>{org.id===selected?"Current workspace":"Select to open this workspace"}</small></div><button type="button" className={org.id===selected?"current":""} onClick={()=>{setSelected(org.id);setLastCreatedProject(null);setLastCreatedTeam(null);setProjectFilter("all");setWorkspacePickerOpen(false);navigate("overview")}}>{org.id===selected?"Current":"Switch workspace"}</button></div>)}{!orgs.length&&<p>You do not belong to any workspaces yet.</p>}</div><div className="twWorkspacePickerFooter"><strong>Create a workspace</strong><p>Organize new projects with your own team.</p><button type="button" onClick={()=>{setWorkspacePickerOpen(false);setQuickCreate("organization")}}><Plus size={17}/> New workspace</button></div></div></section></div>}{workspaceInfoOpen&&active&&user&&<WorkspaceInfo name={active.name} createdAt={active.created_at} role={role??null} members={directory} invites={outgoingInvites} activities={activity} taskCount={tasks.length} projectCount={projects.length} canManage={manager} userId={user.id} onClose={()=>setWorkspaceInfoOpen(false)} onNavigate={target=>{setWorkspaceInfoOpen(false);navigate(target)}}/>}{quickCreate&&user&&<QuickCreate key={quickCreate+":"+quickProjectId} initialKind={quickCreate} initialProjectId={quickProjectId}
  organizationId={selected} userId={user.id} canManage={manager}
  projects={projects} directory={directory}
  onClose={()=>setQuickCreate(null)} onSaved={onQuickSaved}
  onOpen={openQuickCreated} onInvite={()=>launchCreate("invite")}/>}
 {showGuide&&user&&<OnboardingTour
 role={!active?"new":manager?"leader":"member"}
 organizationName={active?.name??"your first organization"}
 progressKey={"tw-tour-v3:"+user.id+":"+(selected||"start")}
 onClose={closeGuide}
 onGo={(action,destination)=>{
  closeGuide();
  if(manager&&(action==="project"||action==="task"||action==="team"||action==="invite"))launchCreate(action);
  else if(!manager&&action==="request")launchCreate("request");
  else navigate(destination);
 }}
 />}<nav className="mobileBottomNav" aria-label="Mobile quick navigation">
 <button type="button" className={view==="overview"?"active":""} onClick={()=>navigate("overview")}><House size={21}/><small>Home</small></button>
 <button type="button" className={activeNav.id==="tasks"?"active":""} onClick={()=>navigate("tasks")}><SquareCheckBig size={21}/><small>Tasks</small></button>
 <button type="button" className="mobileCreateAction" onClick={()=>{if(manager)setQuickCreate("task");else launchCreate("request")}} aria-label={manager?"Create a task, project, team or organization":"Submit a new request"}><span className="mobileCreateSymbol"><Plus size={25}/></span><small>Create</small></button>
 <button type="button" className={activeNav.id==="projects"?"active":""} onClick={()=>navigate("projects")}><FolderKanban size={21}/><small>Projects</small></button>
 <button type="button" className={activeNav.id==="inbox"?"active":""} onClick={()=>navigate("notifications")}><Inbox size={21}/><small>Inbox</small>{unreadNotifications>0&&<span className="unreadNavCount mobileUnread" aria-label={unreadNotifications+" unread notifications"}>{unreadNotifications>99?"99+":unreadNotifications}</span>}</button>
 <button type="button" className={mobileMenu||activeNav.id==="more"||activeNav.id==="people"?"active":""} onClick={()=>setMobileMenu(v=>!v)} aria-label="Open more navigation"><Menu size={21}/><small>More</small></button>
 </nav></div>
}
