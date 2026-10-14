"use client";
import {useEffect,useState} from "react";

/** Warn before users lose edits because the connection is unavailable. */
export default function ConnectionStatus(){
 const [offline,setOffline]=useState(false);
 useEffect(()=>{
  const update=()=>setOffline(!navigator.onLine);
  update();
  window.addEventListener("online",update);
  window.addEventListener("offline",update);
  return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update)};
 },[]);
 if(!offline)return null;
 return <div className="connectionBanner" role="status" aria-live="polite">
  <strong>You're offline.</strong> Check your internet connection before saving changes. Trackwise will refresh when you're back online.
 </div>;
}
