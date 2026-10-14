/** Shared task and role rules. Keep all clients consistent with server-side policies. */
export type TrackwiseRole=string|null|undefined;

export function canManageOrganization(role:TrackwiseRole):boolean{
 return role==="admin"||role==="leader";
}
export function canEditTaskChecklist(
 role:TrackwiseRole,ownerId:string|null|undefined,userId:string|null|undefined
):boolean{
 return canManageOrganization(role)||(role==="member"&&!!userId&&!!ownerId&&ownerId===userId);
}
export function canSubmitForApproval(
 role:TrackwiseRole,ownerId:string|null|undefined,userId:string|null|undefined,status:string
):boolean{
 return role==="member"&&!!userId&&!!ownerId&&ownerId===userId
  &&status!=="completed"&&status!=="awaiting_approval";
}
export function canCompleteTask(role:TrackwiseRole):boolean{
 return canManageOrganization(role);
}
const STATUS_LABELS:Record<string,string>={
 not_started:"To do",underway:"In progress",awaiting_approval:"For review",
 blocked:"Blocked",rejected:"Needs changes",completed:"Completed"
};
export function taskStatusLabel(status:string):string{
 return STATUS_LABELS[status]??status.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
}
export function userFacingError(cause:unknown,fallback:string):string{
 const message=cause instanceof Error?cause.message:
  cause&&typeof cause==="object"&&"message" in cause?
   (cause as {message?:unknown}).message:undefined;
 if(typeof message!=="string"||!message.trim())return fallback;
 if(/failed to fetch|networkerror|fetch failed|load failed|network request failed/i.test(message))
  return "Could not connect. Check your internet and try again.";
 if(/jwt expired|invalid refresh token|refresh token not found/i.test(message))
  return "Your session has expired. Sign in again.";
 if(/duplicate key value|already exists/i.test(message))
  return "An item with those details already exists.";
 return message;
}
