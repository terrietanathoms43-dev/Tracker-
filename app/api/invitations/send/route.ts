import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
const APP_URL="https://tracker-virid-nine.vercel.app";
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));
export async function POST(request:Request){
 const key=process.env.RESEND_API_KEY;
 const from=process.env.EMAIL_FROM;
 if(!key||!from)return NextResponse.json({error:"Email delivery is not configured yet."},{status:503});
 const authorization=request.headers.get("authorization")??"";
 if(!authorization.startsWith("Bearer "))return NextResponse.json({error:"Sign in required."},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)return NextResponse.json({error:"Application configuration missing."},{status:503});
 const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await client.auth.getUser(authorization.slice(7));
 if(userError||!user)return NextResponse.json({error:"Invalid session."},{status:401});
 let body:unknown;
 try{body=await request.json()}catch{return NextResponse.json({error:"Invalid request."},{status:400})}
 if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid request."},{status:400});
 const payload=body as Record<string,unknown>;
 const orgId=payload.organizationId,recipient=payload.email;
 if(typeof orgId!=="string"||typeof recipient!=="string"||!/^\S+@\S+\.\S+$/.test(recipient)||recipient.length>254)return NextResponse.json({error:"Invalid invitation details."},{status:400});
 const {data:membership,error:membershipError}=await client.from("tw_memberships").select("role").eq("organization_id",orgId).eq("user_id",user.id).maybeSingle();
 if(membershipError||!membership||!["admin","leader"].includes(membership.role))return NextResponse.json({error:"Only organization leaders can send invitations."},{status:403});
 const {data:invite,error:inviteError}=await client.from("tw_invitations").select("id,role,expires_at,accepted_at").eq("organization_id",orgId).eq("email",recipient.trim().toLowerCase()).maybeSingle();
 if(inviteError||!invite||invite.accepted_at||new Date(invite.expires_at).getTime()<Date.now())return NextResponse.json({error:"Create an active invitation first."},{status:404});
 const {data:org}=await client.from("tw_organizations").select("name").eq("id",orgId).maybeSingle();
 const orgName=org?.name??"an organization";
 const safeOrg=escapeHtml(orgName),safeRole=escapeHtml(invite.role);
 const html='<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#17233d"><div style="font-size:23px;font-weight:800;color:#315cce">Trackwise</div><h1 style="font-size:28px">You’re invited!</h1><p>You have been invited to join <strong>'+safeOrg+'</strong> on Trackwise as a <strong>'+safeRole+'</strong>.</p><p>Organize tasks, collaborate with your team, and keep work moving.</p><p style="margin:30px 0"><a href="'+APP_URL+'" style="background:#315cce;color:white;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open Trackwise</a></p><p>Sign up or sign in using the email address this invitation was sent to, then accept your invitation in the app.</p><p style="color:#73829a;font-size:13px">This invitation expires on '+new Date(invite.expires_at).toLocaleDateString("en-US",{timeZone:"UTC"})+'. If you weren’t expecting it, you can ignore this email.</p></div>';
 try{
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":"trackwise-invite-"+invite.id},body:JSON.stringify({from,to:[recipient.trim().toLowerCase()],subject:"Invitation to join "+orgName+" on Trackwise",html,text:"You are invited to join "+orgName+" on Trackwise as "+invite.role+". Sign in or create an account at "+APP_URL+" using this email address and accept your invitation. Expires "+invite.expires_at+"."}),signal:AbortSignal.timeout(12000)});
 if(!response.ok){console.error("Email provider rejected invitation",response.status);return NextResponse.json({error:"Email provider could not send the invitation."},{status:502})}
 return NextResponse.json({sent:true});
 }catch{return NextResponse.json({error:"Email service temporarily unavailable."},{status:502})}
}
