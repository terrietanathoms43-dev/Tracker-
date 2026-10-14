import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import mammoth from "mammoth";
import parsePdf from "pdf-parse";
import {MEETING_MAX_TEXT} from "../../../lib/meeting-review";

export const runtime="nodejs";
export const maxDuration=30;
const MAX_FILE_SIZE=5*1024*1024;
const ALLOWED=[".txt",".md",".csv",".vtt",".srt",".pdf",".docx"];
function error(text:string,status:number){
 return NextResponse.json({error:text},{status,headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest){
 try{
  const bearer=/^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization")??"")?.[1];
  if(!bearer)return error("Sign in to upload meeting notes.",401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return error("The workspace connection isn't available.",503);
  const sb=createClient(url,key,{
   global:{headers:{Authorization:"Bearer "+bearer}},
   auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:identity,error:authError}=await sb.auth.getUser(bearer);
  if(authError||!identity.user)return error("Your sign-in session has expired.",401);
  const form=await request.formData();
  const orgId=form.get("organization_id");
  if(typeof orgId!=="string"||!/^[a-f0-9-]{36}$/i.test(orgId))return error("Select an organization first.",400);
  const {data:membership,error:memberError}=await sb.from("tw_memberships").select("role")
   .eq("organization_id",orgId).eq("user_id",identity.user.id).is("revoked_at",null).maybeSingle();
  if(memberError||!membership||!["admin","leader"].includes(membership.role)){
   return error("Only organization leaders can analyze meeting files.",403);
  }
  const uploaded=form.get("file");
  if(!(uploaded instanceof File))return error("Select a meeting document.",400);
  if(uploaded.size===0)return error("The file is empty.",400);
  if(uploaded.size>MAX_FILE_SIZE)return error("Meeting documents must be 5 MB or smaller.",413);
  const filename=uploaded.name.toLowerCase();
  const suffix=ALLOWED.find(ext=>filename.endsWith(ext));
  if(!suffix)return error("Choose a PDF, DOCX, TXT, Markdown, CSV, VTT or SRT file.",400);
  const buffer=Buffer.from(await uploaded.arrayBuffer());
  let text="";
  try{
   if(suffix===".pdf"){
    if(buffer.subarray(0,5).toString("ascii")!=="%PDF-")return error("This is not a valid PDF file.",400);
    const result=await parsePdf(buffer,{max:60});
    text=result.text??"";
    if(text.trim().length<25)return error("The PDF has no selectable text. Paste its text or upload a text-based document.",422);
   }else if(suffix===".docx"){
    if(buffer[0]!==0x50||buffer[1]!==0x4b)return error("This isn't a valid DOCX document.",400);
    const result=await mammoth.extractRawText({buffer});
    text=result.value;
   }else{
    text=buffer.toString("utf8").replace(/^\uFEFF/,"");
    if(text.includes("\u0000"))return error("This file isn't valid UTF-8 text.",400);
   }
  }catch{
   return error("Couldn't read text from this document. Try another PDF or paste the meeting transcript.",422);
  }
  text=text.trim();
  if(text.length<35)return error("This document doesn't contain enough readable text to analyze.",422);
  if(text.length>MEETING_MAX_TEXT)return error("The document exceeds 40,000 characters. Please divide it into smaller sections.",413);
  return NextResponse.json({
   text,characters:text.length,
   notice:"Text extracted successfully. The document was not stored in Trackwise."
  },{headers:{"Cache-Control":"no-store"}});
 }catch{
  return error("The document couldn't be opened. Please try again.",500);
 }
}
