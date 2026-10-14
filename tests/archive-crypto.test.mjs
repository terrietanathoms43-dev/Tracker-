import test from "node:test";
import assert from "node:assert/strict";
import {ARCHIVE_FORMAT,encryptWorkspaceData,decryptWorkspaceData} from "../lib/archive-crypto.ts";

test("encrypted workspace archive decrypts to the same records",async()=>{
 const rows={organization:{name:"Example"},tables:{tw_tasks:[{id:"task-1",title:"A saved task"}]}};
 const passphrase="a sufficiently long and private sample phrase";
 const saved=await encryptWorkspaceData(rows,passphrase);
 assert.equal(saved.format,ARCHIVE_FORMAT);
 assert.notEqual(saved.ciphertext.includes("A saved task"),true);
 assert.deepEqual(await decryptWorkspaceData(saved,passphrase),rows);
});
test("incorrect password and modified ciphertext cannot be decrypted",async()=>{
 const saved=await encryptWorkspaceData({tasks:[{secret:"private"}]},"this is a different sufficiently long password");
 await assert.rejects(()=>decryptWorkspaceData(saved,"a wrong backup passphrase"),/passphrase/i);
 const tampered={...saved,ciphertext:saved.ciphertext.slice(0,-4)+"AAAA"};
 await assert.rejects(()=>decryptWorkspaceData(tampered,"this is a different sufficiently long password"),/passphrase/i);
});
test("passphrases must be long and file format must be recognized",async()=>{
 await assert.rejects(()=>encryptWorkspaceData({data:1},"short"),/16 characters/i);
 await assert.rejects(()=>decryptWorkspaceData({format:"other"},"any passphrase"),/invalid|unsupported/i);
});
