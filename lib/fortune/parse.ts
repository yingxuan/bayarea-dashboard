import { compactDaySchema, legacyPayloadSchema, tenGodPayloadSchema } from "./schema.js";

type Variant = "compact" | "ten_god" | "legacy";

export function parseFortunePayload(raw: any): { variant: Variant; parsed: any } {
  const errors: any[] = [];

  try {
    const parsed = compactDaySchema.parse(raw);
    return { variant: "compact", parsed };
  } catch (err) {
    errors.push(err);
  }

  try {
    const parsed = tenGodPayloadSchema.parse(raw);
    return { variant: "ten_god", parsed };
  } catch (err) {
    errors.push(err);
  }

  try {
    const parsed = legacyPayloadSchema.parse(raw);
    return { variant: "legacy", parsed };
  } catch (err) {
    errors.push(err);
  }

  const messages = errors
    .map((e) => (e instanceof Error ? e.message : String(e)))
    .join(" | ");
  throw new Error(`fortune parse failed: ${messages}`);
}
