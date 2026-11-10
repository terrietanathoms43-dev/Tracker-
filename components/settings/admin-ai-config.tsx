"use client";

import { useState, useTransition } from "react";
import { setAiConfig } from "@/actions/config";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// Admins: the AI engine for "Capture from a meeting", and its key. The key is stored encrypted server-side
// and never read back — the panel shows only its tail, and pasting a new one replaces it.

export function AiConfigCard(props: { provider: "anthropic" | "openai" | ""; tail: string | null }) {
  const [provider, setProvider] = useState(props.provider);
  const [apiKey, setApiKey] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = provider !== props.provider || apiKey !== "";

  return (
    <Section id="ai-config" title="AI provider" description="The engine Capture from a meeting drafts with. The key is stored encrypted and never shown again — only its last characters.">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            toastResult(await setAiConfig({ provider, apiKey }));
            setApiKey("");
          });
        }}
      >
        <div className="grid items-start gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field id="ai-provider" label="Provider">
            <NativeSelect id="ai-provider" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
              <option value="">Off — fall back to the server key</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </NativeSelect>
          </Field>
          <Field id="ai-api-key" label="API key" error={undefined}>
            <Input id="ai-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={props.tail ? `••••${props.tail} — paste to replace` : "sk-…"} autoComplete="off" />
          </Field>
        </div>
        <div className="flex justify-end border-t px-4 py-3 sm:px-5">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Section>
  );
}
