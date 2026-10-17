"use client";
type Props={name:string;photoUrl?:string|null;styleName?:string|null;size?:"sm"|"md"|"lg";className?:string};
const styles=new Set(["blue","violet","teal","sunset","rose","slate"]);
export function safeAvatarStyle(style:unknown){return typeof style==="string"&&styles.has(style)?style:"blue"}
export function nameInitials(name:string){
 const parts=name.trim().split(/\s+/).filter(Boolean);
 if(!parts.length)return "?";
 return (parts.length>=2?parts[0][0]+parts[parts.length-1][0]:parts[0].slice(0,2)).toUpperCase();
}
export default function ProfileAvatar({name,photoUrl,styleName,size="md",className=""}:Props){
 return <span className={"profileAvatar profileAvatar-"+safeAvatarStyle(styleName)+" profileAvatar-"+size+" "+className} aria-label={name+" profile image"}>
  {photoUrl?<img src={photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/>:
   <span aria-hidden="true">{nameInitials(name)}</span>}
 </span>;
}
