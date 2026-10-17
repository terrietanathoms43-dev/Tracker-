import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { appOrigin } from "@/lib/app-url";
import { INVITE_TTL_DAYS } from "@/lib/constants";

/** A fresh 32-byte token for the link, and the sha256 that is all the database ever stores. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(from = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function inviteUrl(token: string): string {
  return `${appOrigin()}/invite/${token}`;
}
