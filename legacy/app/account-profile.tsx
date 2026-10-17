"use client";
import {useEffect,useMemo,useState,type ChangeEvent,type FormEvent} from "react";
import type {User} from "@supabase/supabase-js";
import {Camera,Check,CheckCheck,ImagePlus,Mail,ShieldCheck,UserRound,Users,X} from "lucide-react";
import ProfileAvatar,{safeAvatarStyle} from "./profile-avatar";
import {supabase} from "../lib/supabase";

type Props={
 user:User;role:string|null;organizationName:string;
 organizationCount:number;assignedTasks:number;projectsCount:number;
 photoUrl:string|null;onUpdated:()=>Promise<void>;
};
const AVATAR_STYLES=[
 {id:"blue",name:"Royal blue"},
 {id:"violet",name:"Violet"},
 {id:"teal",name:"Teal"},
 {id:"sunset",name:"Gold"},
 {id:"rose",name:"Rose"},
 {id:"slate",name:"Slate"}
] as const;
const MAX_FILE=2*1024*1024;
const MIME_EXT:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
export default function AccountProfile({user,role,organizationName,organizationCount,assignedTasks,projectsCount,photoUrl,onUpdated}:Props){
 const meta=user.user_metadata??{};
 const [name,setName]=useState(String(meta.display_name??meta.full_name??""));
 const [title,setTitle]=useState(String(meta.profile_title??""));
 const [bio,setBio]=useState(String(meta.profile_bio??""));
 const [style,setStyle]=useState(safeAvatarStyle(meta.avatar_style));
 const [selectedPhoto,setSelectedPhoto]=useState<File|null>(null);
 const [pendingRemoval,setPendingRemoval]=useState(false);
 const [previewUrl,setPreviewUrl]=useState<string|null>(null);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const created=new Date(user.created_at).toLocaleDateString(undefined,{month:"long",year:"numeric"});
 useEffect(()=>{
  setName(String(user.user_metadata?.display_name??user.user_metadata?.full_name??""));
  setTitle(String(user.user_metadata?.profile_title??""));
  setBio(String(user.user_metadata?.profile_bio??""));
  setStyle(safeAvatarStyle(user.user_metadata?.avatar_style));
 },[user.id,user.user_metadata?.display_name,user.user_metadata?.profile_title,user.user_metadata?.profile_bio,user.user_metadata?.avatar_style]);
 useEffect(()=>{
  if(!selectedPhoto){setPreviewUrl(null);return}
  const url=URL.createObjectURL(selectedPhoto);
  setPreviewUrl(url);
  return()=>URL.revokeObjectURL(url);
 },[selectedPhoto]);
 const activePhoto=previewUrl??(!pendingRemoval?photoUrl:null);
 const displayName=name.trim()||user.email?.split("@")[0]||"Trackwise member";
 const savedPath=typeof meta.avatar_path==="string"?meta.avatar_path:"";
 const roleText=role?role.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()):"Member";
 const profileUpdates=useMemo(()=>[
  {label:"Member since",value:created},
  {label:"Organizations",value:String(organizationCount)},
  {label:"Assigned tasks",value:String(assignedTasks)},
  {label:"Projects",value:String(projectsCount)}
 ],[created,organizationCount,assignedTasks,projectsCount]);
 function chooseImage(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0]??null;
  event.target.value="";
  if(!file)return;
  if(!MIME_EXT[file.type]){setError("Choose a JPG, PNG, or WebP photo.");return}
  if(file.size>MAX_FILE){setError("Profile photos must be 2 MB or smaller.");return}
  if(file.size===0){setError("That photo is empty.");return}
  setSelectedPhoto(file);setPendingRemoval(false);setError("");setSuccess("");
 }
 async function save(event:FormEvent){
  event.preventDefault();
  const fullName=name.replace(/\s+/g," ").trim();
  if(fullName.length<2||fullName.length>80){setError("Enter a name between 2 and 80 characters.");return}
  if(title.trim().length>80||bio.trim().length>280){setError("Keep your role under 80 characters and your bio under 280 characters.");return}
  setSaving(true);setError("");setSuccess("");
  const db=supabase();
  let uploadPath="";
  try{
   if(selectedPhoto){
    const ext=MIME_EXT[selectedPhoto.type];
    uploadPath=user.id+"/"+crypto.randomUUID()+"."+ext;
    const result=await db.storage.from("tw-profile-avatars").upload(uploadPath,selectedPhoto,{
     contentType:selectedPhoto.type,upsert:false,cacheControl:"3600"
    });
    if(result.error)throw result.error;
   }
   const updated={
    display_name:fullName,full_name:fullName,
    profile_title:title.trim(),profile_bio:bio.trim(),
    avatar_style:style,
    avatar_path:pendingRemoval?"":uploadPath||savedPath
   };
   const result=await db.auth.updateUser({data:updated});
   if(result.error)throw result.error;
   if((pendingRemoval||uploadPath)&&savedPath){
    // Best effort cleanup; a failed cleanup does not reverse saved account details.
    await db.storage.from("tw-profile-avatars").remove([savedPath]);
   }
   setSelectedPhoto(null);setPendingRemoval(false);setSuccess("Profile saved. Your name and details are updated.");
   await onUpdated();
  }catch(failure){
   if(uploadPath)await db.storage.from("tw-profile-avatars").remove([uploadPath]);
   setError(failure instanceof Error?failure.message:"Could not save your profile. Try again.");
  }finally{setSaving(false)}
 }
 return <section className="card accountProfile" aria-labelledby="accountProfileHeading">
  <div className="accountProfileCover"><div className="accountProfileCoverText">
   <span>YOUR ACCOUNT</span><h2 id="accountProfileHeading">Your Trackwise profile</h2>
   <p>Make your profile recognizable to the people you work with.</p>
  </div><div className="accountProfileCoverPattern" aria-hidden="true">✦</div></div>
  <div className="accountProfileBody">
   <div className="accountProfileHero">
    <div className="accountProfileAvatarGroup"><ProfileAvatar name={displayName} photoUrl={activePhoto} styleName={style} size="lg"/>
     <label className="accountPhotoUpload" htmlFor="accountPhoto"><Camera size={16}/> Change photo</label>
     <input id="accountPhoto" className="srOnly" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={chooseImage} disabled={saving}/>
     {(activePhoto||selectedPhoto)&&<button type="button" className="accountRemovePhoto" onClick={()=>{setSelectedPhoto(null);setPendingRemoval(true);setSuccess("")}} disabled={saving}><X size={14}/> Remove</button>}
    </div>
    <div className="accountProfileIdentity"><h3>{displayName}</h3>
     <p>{title.trim()||roleText}{title.trim()?" · "+roleText:""}</p>
     <span><ShieldCheck size={15}/> {organizationName||"Your workspace"}</span>
     <small>Only you can access your original uploaded profile photo. Other members currently see your initials.</small>
    </div>
   </div>
   <div className="accountProfileStats">{profileUpdates.map(field=><div key={field.label}><strong>{field.value}</strong><span>{field.label}</span></div>)}</div>
   <form className="accountProfileEditor" onSubmit={save}>
    <div className="accountProfileSectionHeading"><UserRound size={20}/><div><h3>About you</h3><p>Help teammates know who they're working with.</p></div></div>
    <div className="accountProfileFieldGrid">
     <div><label htmlFor="accountDisplayName">Full name <span aria-hidden="true">*</span></label><input id="accountDisplayName" autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={event=>setName(event.target.value)} placeholder="First and last name"/></div>
     <div><label htmlFor="accountProfileTitle">Your position or title</label><input id="accountProfileTitle" maxLength={80} value={title} onChange={event=>setTitle(event.target.value)} placeholder="e.g. Volunteerism Club Vice President"/></div>
     <div className="accountProfileWide"><label htmlFor="accountProfileBio">About me <span className="accountCounter">{bio.length}/280</span></label><textarea id="accountProfileBio" maxLength={280} rows={3} value={bio} onChange={event=>setBio(event.target.value)} placeholder="Share what you work on and how you contribute to your team." /></div>
    </div>
    <div className="accountProfileColors"><strong>Choose your avatar colour</strong><p>Shown when you haven't uploaded a picture.</p>
     <div role="group" aria-label="Avatar colour">{AVATAR_STYLES.map(item=><button type="button" title={item.name} aria-label={item.name} aria-pressed={style===item.id} className={"profileColorChoice profileColor-"+item.id+(style===item.id?" chosen":"")} onClick={()=>setStyle(item.id)} key={item.id}>{style===item.id&&<Check size={19}/>}</button>)}</div>
    </div>
    <div className="accountProfilePrivacy"><ShieldCheck size={18}/><span>Profile images are stored privately. Your name, title and bio may be shown within your organization.</span></div>
    <div className="accountProfileSectionHeading"><Mail size={20}/><div><h3>Account details</h3><p>Your email is used to sign in.</p></div></div>
    <div className="accountProfileContact"><span>Email address</span><strong>{user.email}</strong><small>Verified email and password management remain in Supabase Authentication.</small></div>
    {error&&<p role="alert" className="feedback bad">{error}</p>}
    {success&&<p role="status" className="feedback good"><CheckCheck size={17}/> {success}</p>}
    <div className="accountProfileSave"><button className="primary" type="submit" disabled={saving}>{saving?"Saving your profile…":"Save profile changes"}</button></div>
   </form>
  </div>
 </section>;
}
