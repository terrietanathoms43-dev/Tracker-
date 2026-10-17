/**
 * Opening a public sign-in page with no active Supabase session is expected,
 * not a sign-in failure. Do not surface Supabase's internal session message.
 */
export function isMissingAuthSessionError(error:unknown):boolean{
 if(!error||typeof error!=="object")return false;
 const issue=error as {name?:unknown;code?:unknown;message?:unknown};
 return issue.name==="AuthSessionMissingError"
  ||issue.code==="session_not_found"
  ||(typeof issue.message==="string"&&/^auth session missing!?\.?$/i.test(issue.message.trim()));
}

export function initialAuthErrorMessage(error:unknown):string|null{
 if(!error||isMissingAuthSessionError(error))return null;
 const raw=error instanceof Error?error.message:
  typeof error==="object"&&"message" in error?String(error.message):"";
 if(/invalid refresh token|refresh token not found|jwt expired|refresh token.*expired/i.test(raw))
  return "Your previous session has ended. Please sign in again.";
 if(/failed to fetch|network|timeout|load failed/i.test(raw))
  return "We couldn't check your session. Check your internet connection and sign in.";
 return "We couldn't verify your previous session. Please sign in again.";
}
