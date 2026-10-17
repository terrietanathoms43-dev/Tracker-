// Structured JSON logger: one line per event, so a VPS log is greppable and machine-readable.
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function write(level: Level, event: string, fields: Fields = {}): void {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

/** The parts of a thrown value worth logging. */
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) return { error: error.message, stack: error.stack?.split("\n").slice(0, 6).join("\n") };
  return { error: String(error) };
}
