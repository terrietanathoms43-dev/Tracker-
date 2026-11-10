import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CaptureEngine } from "./availability";
import type { CaptureContext, CaptureDraft } from "./draft";
import { fakeProposal } from "./fake";
import { buildUserMessage, proposalSchema, proposalToDraft, SYSTEM_PROMPT } from "./prompt";
import { errorFields, log } from "@/lib/log";

// The one place the app talks to a model (docs/PLAN.md, 2026-11-01 log). One request per draft: the standing
// instructions, the workspace's ids and the transcript in, a strictly shaped proposal out, normalised into a
// draft. The engine (and its key) comes from captureEngineFor — a workspace's admin-panel key or the
// deployment's env; nothing is written here and a person approves the draft first (actions/capture.ts).

/** A failure the person can act on; anything else is logged and becomes the generic error. */
export class CaptureError extends Error {}

type ModelEngine = Exclude<CaptureEngine, { provider: "fake" }>;

async function askAnthropic(engine: ModelEngine, context: CaptureContext, transcript: string): Promise<CaptureDraft> {
  const client = new Anthropic(engine.apiKey ? { apiKey: engine.apiKey } : undefined);
  const started = Date.now();
  let message;
  try {
    message = await client.messages.parse({
      model: engine.model,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserMessage(context, transcript) }],
      output_config: { format: zodOutputFormat(proposalSchema), effort: "medium" },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new CaptureError("The AI key was refused. Check the key in the admin panel (or the server's ANTHROPIC_API_KEY).");
    if (error instanceof Anthropic.RateLimitError) throw new CaptureError("The AI service is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.BadRequestError) {
      log.error("capture.bad_request", { model: engine.model, ...errorFields(error) });
      throw new CaptureError("The transcript could not be sent as it is. Try a shorter part of it.");
    }
    if (error instanceof Anthropic.APIConnectionError) throw new CaptureError("The AI service could not be reached. Check the connection and try again.");
    log.error("capture.failed", { model: engine.model, ...errorFields(error) });
    throw new CaptureError("Drafting failed. Try again in a moment.");
  }

  if (message.stop_reason === "refusal") throw new CaptureError("The model declined to read this transcript.");
  if (message.stop_reason === "max_tokens") throw new CaptureError("That meeting produced more than can be drafted at once. Paste a shorter part of it.");
  if (!message.parsed_output) {
    log.error("capture.unparsed", { model: engine.model, stop: message.stop_reason });
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

async function askOpenAI(engine: ModelEngine, context: CaptureContext, transcript: string): Promise<CaptureDraft> {
  const started = Date.now();
  let content: string;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${engine.apiKey}` },
      body: JSON.stringify({
        model: engine.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(context, transcript) },
        ],
      }),
    });
    if (response.status === 401 || response.status === 403) throw new CaptureError("The AI key was refused. Check the key in the admin panel.");
    if (response.status === 429) throw new CaptureError("The AI service is busy right now. Try again in a minute.");
    if (!response.ok) {
      log.error("capture.openai_failed", { model: engine.model, status: response.status });
      throw new CaptureError("Drafting failed. Try again in a moment.");
    }
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    content = body.choices?.[0]?.message?.content ?? "";
    if (content === "") throw new CaptureError("The model's answer could not be read. Try again.");
    log.info("capture.drafted", { model: engine.model, ms: Date.now() - started, input: body.usage?.prompt_tokens ?? 0, cachedInput: 0, output: body.usage?.completion_tokens ?? 0 });
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    log.error("capture.openai_failed", { model: engine.model, ...errorFields(error) });
    throw new CaptureError("The AI service could not be reached. Check the connection and try again.");
  }

  try {
    return proposalToDraft(proposalSchema.parse(JSON.parse(content)), context);
  } catch {
    log.error("capture.unparsed", { model: engine.model });
    throw new CaptureError("The model's answer could not be read. Try again.");
  }
}

/** A draft from the transcript, by the engine chosen for this person and workspace. */
export async function proposeWork(engine: CaptureEngine, context: CaptureContext, transcript: string): Promise<CaptureDraft> {
  if (engine.provider === "fake") return proposalToDraft(fakeProposal(context, transcript), context);
  return engine.provider === "openai" ? askOpenAI(engine, context, transcript) : askAnthropic(engine, context, transcript);
}
