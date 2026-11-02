import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CAPTURE_MODEL } from "./availability";
import type { CaptureContext, CaptureDraft, CaptureProvider } from "./draft";
import { fakeProposal } from "./fake";
import { buildUserMessage, proposalSchema, proposalToDraft, SYSTEM_PROMPT } from "./prompt";
import { errorFields, log } from "@/lib/log";

// The one place the app talks to the model (docs/PLAN.md, 2026-11-01 log). One request per draft: the standing
// instructions (cached), the workspace's ids and the transcript in, a strictly shaped proposal out, normalised into
// a draft. Nothing is written anywhere here; the person approves the draft first (actions/capture.ts).

/** A failure the person can act on; anything else is logged and becomes the generic error. */
export class CaptureError extends Error {}

async function askModel(context: CaptureContext, transcript: string): Promise<CaptureDraft> {
  // Credentials come from the environment (ANTHROPIC_API_KEY); lib/capture/availability.ts checked they exist.
  const client = new Anthropic();
  const started = Date.now();
  let message;
  try {
    message = await client.messages.parse({
      model: CAPTURE_MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserMessage(context, transcript) }],
      output_config: { format: zodOutputFormat(proposalSchema), effort: "medium" },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new CaptureError("The server's AI key was refused. Ask whoever runs Trackwise to check ANTHROPIC_API_KEY.");
    if (error instanceof Anthropic.RateLimitError) throw new CaptureError("The AI service is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.BadRequestError) {
      log.error("capture.bad_request", { model: CAPTURE_MODEL, ...errorFields(error) });
      throw new CaptureError("The transcript could not be sent as it is. Try a shorter part of it.");
    }
    if (error instanceof Anthropic.APIConnectionError) throw new CaptureError("The AI service could not be reached. Check the connection and try again.");
    log.error("capture.failed", { model: CAPTURE_MODEL, ...errorFields(error) });
    throw new CaptureError("Drafting failed. Try again in a moment.");
  }

  if (message.stop_reason === "refusal") throw new CaptureError("The model declined to read this transcript.");
  if (message.stop_reason === "max_tokens") throw new CaptureError("That meeting produced more than can be drafted at once. Paste a shorter part of it.");
  if (!message.parsed_output) {
    log.error("capture.unparsed", { model: CAPTURE_MODEL, stop: message.stop_reason });
    throw new CaptureError("The model's answer could not be read. Try again.");
  }
  log.info("capture.drafted", {
    model: message.model,
    ms: Date.now() - started,
    input: message.usage.input_tokens,
    cachedInput: message.usage.cache_read_input_tokens ?? 0,
    output: message.usage.output_tokens,
    goals: message.parsed_output.goals.length,
    tasks: message.parsed_output.tasks.length,
  });
  return proposalToDraft(message.parsed_output, context);
}

/** A draft from the transcript, by the engine chosen for this person. */
export async function proposeWork(provider: CaptureProvider, context: CaptureContext, transcript: string): Promise<CaptureDraft> {
  if (provider === "fake") return proposalToDraft(fakeProposal(context, transcript), context);
  return askModel(context, transcript);
}
