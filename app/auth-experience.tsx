"use client";
import {useState,type FormEvent} from "react";
import {
 ArrowRight,Check,CheckCircle2,Eye,EyeOff,FolderKanban,
 LockKeyhole,Mail,ShieldCheck,Sparkles,SquareCheckBig,
 UserRound,UsersRound
} from "lucide-react";
type AuthMode="signin"|"signup"|"reset";
type Props={
 mode:AuthMode;email:string;password:string;name:string;
 working:boolean;error:string;notice:string;inviteLinkPending?:boolean;
 onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
 onModeChange:(mode:AuthMode)=>void;
 onEmailChange:(value:string)=>void;onPasswordChange:(value:string)=>void;
 onNameChange:(value:string)=>void;
};
export default function AuthExperience({
 mode,email,password,name,working,error,notice,inviteLinkPending=false,
 onSubmit,onModeChange,onEmailChange,onPasswordChange,onNameChange
}:Props){
 const [showPassword,setShowPassword]=useState(false);
 const signup=mode==="signup";
 const reset=mode==="reset";
 return <main className="authV3">
  <section className="authV3Story" aria-label="About Trackwise">
   <div className="authV3Brand"><span className="authV3BrandMark">T</span><span>trackwise</span><span className="authV3BrandDot" aria-hidden="true"/></div>
   <div className="authV3StoryMain">
    <span className="authV3Pill"><Sparkles size={15}/> ONE SPACE FOR EVERYTHING THAT MATTERS</span>
    <h1>Organize the work.<br/><em>Empower the team.</em></h1>
    <p className="authV3StoryLead">Plans, projects, people and progress—all connected in one simple workspace.</p>
    <div className="authV3Preview" aria-label="An example of a Trackwise project dashboard">
     <div className="authV3PreviewTop"><span className="authV3PreviewMark"><SquareCheckBig size={17}/></span><span>Workspace overview</span><span className="authV3PreviewDots" aria-hidden="true">•••</span></div>
     <div className="authV3PreviewDetails">
      <div className="authV3PreviewHeading"><div><small>PROJECT EXAMPLE</small><strong>Community outreach</strong><span>Organize the next steps with your team.</span></div><span className="authV3PreviewTag">In progress</span></div>
      <div className="authV3ProgressLabel"><span>Progress</span><strong>75%</strong></div><div className="authV3PreviewProgress"><span/></div>
      <div className="authV3ExampleTasks"><div><CheckCircle2 size={18}/><span>Plan the event</span><small>Complete</small></div><div><CheckCircle2 size={18}/><span>Assign volunteers</span><small>Complete</small></div><div><span className="authV3ExampleUnfilled"/><span>Prepare the materials</span><small>In progress</small></div></div>
     </div>
     <div className="authV3PreviewFoot"><span><UsersRound size={16}/> Bring people together</span><span><FolderKanban size={16}/> Track every project</span></div>
    </div>
    <div className="authV3Features"><div><span><Check size={15}/></span> Clear responsibilities</div><div><span><Check size={15}/></span> Simple workflows</div><div><span><Check size={15}/></span> One shared picture</div></div>
   </div>
   <div className="authV3StoryFoot"><ShieldCheck size={16}/><span>Private, organized workspaces for the teams that need them.</span></div>
  </section>
  <section className="authV3Right">
   <div className="authV3MobileBrand"><span className="authV3BrandMark">T</span><strong>trackwise</strong></div>
   <div className="authV3FormCard">
    {inviteLinkPending&&<div className="authInviteBanner" role="status"><strong>Workspace invitation received</strong><span>Sign in or create your account to join your teammate’s workspace. No email-specific invitation is required.</span></div>}
    <div className="authV3Greeting"><span className="authV3GreetingIcon">{signup?<UserRound size={25}/>:reset?<LockKeyhole size={25}/>:<Sparkles size={25}/>}</span>
     <span className="authV3FormEyebrow">{signup?"GET STARTED":reset?"ACCOUNT RECOVERY":"WELCOME BACK"}</span>
     <h2>{signup?"Create your account":reset?"Reset your password":"Good to have you back."}</h2>
     <p>{signup?"Your name and email are all you need to get started. Create an organization or join your teammates afterwards.":reset?"Enter the email linked to your Trackwise account, and we'll send a reset link.":"Sign in and pick up right where your team left off."}</p>
    </div>
    {!reset&&<div className="authV3ModeTabs" role="tablist" aria-label="Choose account action">
     <button type="button" role="tab" aria-selected={!signup} className={!signup?"selected":""} onClick={()=>{setShowPassword(false);onModeChange("signin")}}>Sign in</button>
     <button type="button" role="tab" aria-selected={signup} className={signup?"selected":""} onClick={()=>{setShowPassword(false);onModeChange("signup")}}>Create account</button>
    </div>}
    <form className="authV3Form" onSubmit={onSubmit}>
     {signup&&<div className="authV3Field"><label htmlFor="authFullName">Your full name <span>*</span></label>
      <div className="authV3Control"><UserRound size={19}/><input id="authFullName" type="text" autoComplete="name" minLength={2} maxLength={80} value={name} onChange={event=>onNameChange(event.target.value)} required placeholder="e.g. Jordan Blake"/></div>
      <small>This is how colleagues will find you in Trackwise.</small>
     </div>}
     <div className="authV3Field"><label htmlFor="authEmail">Email address <span>*</span></label>
      <div className="authV3Control"><Mail size={19}/><input id="authEmail" type="email" autoComplete="email" inputMode="email" value={email} onChange={event=>onEmailChange(event.target.value)} required placeholder="you@example.com"/></div></div>
     {!reset&&<div className="authV3Field"><div className="authV3LabelRow"><label htmlFor="authPassword">Password <span>*</span></label>{!signup&&<button className="authV3Forgot" type="button" onClick={()=>onModeChange("reset")}>Forgot password?</button>}</div>
      <div className="authV3Control"><LockKeyhole size={19}/><input id="authPassword" type={showPassword?"text":"password"} minLength={signup?10:1} autoComplete={signup?"new-password":"current-password"} value={password} onChange={event=>onPasswordChange(event.target.value)} required placeholder={signup?"At least 10 characters":"Enter your password"}/>
       <button type="button" className="authV3PasswordToggle" aria-label={showPassword?"Hide password":"Show password"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button>
      </div>{signup&&<small>Use 10 or more characters and a unique password.</small>}</div>}
     {error&&<p role="alert" className="feedback bad authV3Alert">{error}</p>}
     {notice&&<p role="status" className="feedback good authV3Alert">{notice}</p>}
     <button className="authV3Submit" type="submit" disabled={working}>{working?"Please wait…":signup?"Create my account":reset?"Send reset link":"Sign in to Trackwise"} {!working&&<ArrowRight size={19}/>}</button>
    </form>
    {reset?<p className="authV3Switch">Remembered your password? <button type="button" onClick={()=>onModeChange("signin")}>Back to sign in</button></p>:
     <p className="authV3Switch">{signup?"Already have an account?":"New to Trackwise?"} <button type="button" onClick={()=>{setShowPassword(false);onModeChange(signup?"signin":"signup")}}>{signup?"Sign in instead":"Create an account"}</button></p>}
    <div className="authV3BottomNote"><ShieldCheck size={16}/><span>Your account is protected by Supabase Authentication. Your organization decides who can access its workspace.</span></div>
   </div>
   <footer className="authV3Footer">One team. Clear goals. Better progress.</footer>
  </section>
 </main>;
}
