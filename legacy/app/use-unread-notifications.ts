"use client";

import {useEffect,useState} from "react";
import {supabase as makeClient} from "../lib/supabase";

/** Lightweight, organization-scoped unread count. No realtime subscription required. */
export default function useUnreadNotifications(organizationId:string,userId:string|undefined){
 const [unread,setUnread]=useState(0);
 useEffect(()=>{
  if(!organizationId||!userId){setUnread(0);return}
  let mounted=true;
  const db=makeClient();
  async function check(){
   try{
    const {count,error}=await db.from("tw_notifications")
     .select("id",{head:true,count:"exact"})
     .eq("organization_id",organizationId).eq("user_id",userId)
     .is("read_at",null);
    if(mounted&&!error)setUnread(count??0);
   }catch{
    // Preserve the last visible count during short network interruptions.
   }
  }
  const whenVisible=()=>{if(document.visibilityState==="visible")void check()};
  void check();
  const interval=window.setInterval(whenVisible,45000);
  window.addEventListener("focus",whenVisible);
  document.addEventListener("visibilitychange",whenVisible);
  window.addEventListener("tw-notifications-updated",whenVisible);
  return()=>{
   mounted=false;
   window.clearInterval(interval);
   window.removeEventListener("focus",whenVisible);
   document.removeEventListener("visibilitychange",whenVisible);
   window.removeEventListener("tw-notifications-updated",whenVisible);
  };
 },[organizationId,userId]);
 return unread;
}
