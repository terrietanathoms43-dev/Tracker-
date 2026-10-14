/** AES-256-GCM encrypted workspace snapshots. All cryptography runs on the user's device. */
export const ARCHIVE_FORMAT="trackwise-encrypted-workspace-v1";
export const ARCHIVE_ITERATIONS=350000;

export type EncryptedArchive={
 format:typeof ARCHIVE_FORMAT;
 createdAt:string;
 algorithm:"AES-256-GCM";
 kdf:"PBKDF2-SHA256";
 iterations:number;
 salt:string;
 iv:string;
 ciphertext:string;
};

function bytesToBase64(bytes:Uint8Array):string{
 let binary="";
 for(let pos=0;pos<bytes.length;pos+=16384){
  binary+=String.fromCharCode(...bytes.subarray(pos,pos+16384));
 }
 return btoa(binary);
}
function base64ToBytes(text:string):Uint8Array{
 return Uint8Array.from(atob(text),char=>char.charCodeAt(0));
}
async function deriveArchiveKey(passphrase:string,salt:Uint8Array,iterations:number,usage:KeyUsage[]):Promise<CryptoKey>{
 const passwordKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey(
  {name:"PBKDF2",salt:new Uint8Array(salt).buffer,iterations,hash:"SHA-256"},
  passwordKey,{name:"AES-GCM",length:256},false,usage
 );
}
export async function encryptWorkspaceData(data:unknown,passphrase:string):Promise<EncryptedArchive>{
 if(passphrase.length<16)throw new Error("Use a backup passphrase of at least 16 characters.");
 if(!globalThis.crypto?.subtle)throw new Error("Your browser does not support secure local encryption.");
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await deriveArchiveKey(passphrase,salt,ARCHIVE_ITERATIONS,["encrypt"]);
 const encoded=new TextEncoder().encode(JSON.stringify(data));
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv:new Uint8Array(iv).buffer},key,encoded);
 return {
  format:ARCHIVE_FORMAT,createdAt:new Date().toISOString(),algorithm:"AES-256-GCM",
  kdf:"PBKDF2-SHA256",iterations:ARCHIVE_ITERATIONS,salt:bytesToBase64(salt),
  iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(ciphertext))
 };
}
export async function decryptWorkspaceData(input:unknown,passphrase:string):Promise<unknown>{
 if(!input||typeof input!=="object")throw new Error("This is not a Trackwise backup.");
 const frame=input as Partial<EncryptedArchive>;
 if(frame.format!==ARCHIVE_FORMAT||frame.algorithm!=="AES-256-GCM"||
    frame.kdf!=="PBKDF2-SHA256"||typeof frame.iterations!=="number"||
    frame.iterations<200000||frame.iterations>600000||
    typeof frame.salt!=="string"||typeof frame.iv!=="string"||
    typeof frame.ciphertext!=="string")throw new Error("Unsupported or invalid backup format.");
 if(!globalThis.crypto?.subtle)throw new Error("Secure decryption is not supported on this device.");
 try{
  const salt=base64ToBytes(frame.salt);
  const iv=base64ToBytes(frame.iv);
  if(salt.length!==16||iv.length!==12)throw new Error("Invalid encryption parameters");
  const key=await deriveArchiveKey(passphrase,salt,frame.iterations,["decrypt"]);
  const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(iv).buffer},key,base64ToBytes(frame.ciphertext).buffer);
  return JSON.parse(new TextDecoder().decode(plaintext));
 }catch{
  throw new Error("Couldn't open the backup. Check the passphrase and file, then try again.");
 }
}
