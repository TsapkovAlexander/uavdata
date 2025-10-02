import { CONFIG } from "./config";
import path from "path";

type Msg = { text: string };

type ParseFn = (messages: Array<Msg>) => { flights: any[]; logs?: any[] };

let cached: { parseMessagesUniversal?: ParseFn } | null = null;

export function loadParser(): ParseFn {
  if (!cached) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(path.resolve(CONFIG.PARSER_ENTRY));
      if (!mod || typeof mod.parseMessagesUniversal !== "function") {
        throw new Error("parseMessagesUniversal not found in parser module");
      }
      cached = mod;
    } catch (e: any) {
      throw new Error(
        `Не удалось загрузить парсер по пути ${CONFIG.PARSER_ENTRY}: ${e?.message || e}`
      );
    }
  }
  return cached.parseMessagesUniversal!;
}

export function parseMessages(messages: Array<Msg>) {
  const fn = loadParser();
  return fn(messages);
}
