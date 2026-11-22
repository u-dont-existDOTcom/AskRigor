import { z } from "zod";
import { ATLAS_MODERN_CHECKS, ATLAS_TRADITION_LISTS, AtlasTraditionError,
  type AtlasTraditionStore } from "@askrigor/evidence-repository";
import { ATLAS_TRADITIONS } from "./traditions-tree.js";
import { rowPassesPageGuard } from "./page-guard.js";

export const ATLAS_TRADITION_ACTIONS = ["label_traditions", "list_traditions"] as const;
export const ATLAS_TRADITION_OUTCOMES = ["traditions_labeled", "traditions_listed"] as const;
const item = z.string().trim().toUpperCase().regex(/^[PF]-[1-9][0-9]{3,}$/u);
const text = (max: number) => z.string().trim().min(1).refine((value) => Array.from(value).length <= max);
export const traditionLabelSchema = z.object({
  section: z.enum(ATLAS_TRADITIONS.map(({ key }) => key) as [string, ...string[]]),
  tradition: text(160), region: text(80).optional(), preparation: text(120).optional(),
  modern_check: z.enum(ATLAS_MODERN_CHECKS), match: text(120), list: z.enum(ATLAS_TRADITION_LISTS),
  quick_answer_misses: z.boolean(),
}).strict();
export const traditionChangesSchema = z.array(z.object({ item, labels: z.array(traditionLabelSchema).max(200)
  .refine((labels) => new Set(labels.map(({ section }) => section)).size === labels.length) }).strict()).max(200)
  .refine((changes) => new Set(changes.map(({ item }) => item)).size === changes.length);
export const traditionDisagreementsSchema = z.array(z.object({
  tcm_item: item, ccm_item: item, line: text(199).refine((value) => !/[\r\n]/u.test(value)),
}).strict())
  .max(200).refine((rows) => new Set(rows.map((row) => `${row.tcm_item}:${row.ccm_item}`)).size === rows.length);
export const atlasTraditionsSchema = z.object({
  changed: z.number().int().nonnegative().nullable(),
  sections: z.array(z.object({ key: z.string(), label: z.string(), description: z.string() }).strict()),
  labels: z.array(traditionLabelSchema.extend({ item, labeledAt: z.string() }).strict()),
  disagreements: traditionDisagreementsSchema,
}).strict();
export interface AtlasTraditionRequest {
  action: typeof ATLAS_TRADITION_ACTIONS[number];
  traditions?: z.infer<typeof traditionChangesSchema>;
  tradition_disagreements?: z.infer<typeof traditionDisagreementsSchema>;
}
export class AtlasTraditionReview {
  constructor(private readonly deps: { traditions: AtlasTraditionStore; now: () => Date }) {}
  async run(request: AtlasTraditionRequest) {
    const invalid = () => ({ ok: false, text: "The tradition labels were not valid; nothing was changed.",
      error: { code: "invalid_request" as const, message: "Give traditions and/or tradition_disagreements with label_traditions." } });
    let changed: number | null = null;
    if (request.action === "label_traditions") {
      const parsed = z.object({ traditions: traditionChangesSchema.optional(),
        tradition_disagreements: traditionDisagreementsSchema.optional() }).refine((value) =>
        (value.traditions?.length ?? 0) > 0 || value.tradition_disagreements !== undefined)
        .safeParse(request);
      if (!parsed.success || !rowPassesPageGuard(parsed.data)) return invalid();
      try {
        changed = await this.deps.traditions.setTraditions(parsed.data.traditions ?? [],
          parsed.data.tradition_disagreements, this.deps.now().toISOString());
      } catch (error) { if (error instanceof AtlasTraditionError) return invalid(); throw error; }
    } else if (request.traditions !== undefined || request.tradition_disagreements !== undefined) return invalid();
    return { ok: true, outcome: request.action === "label_traditions" ? "traditions_labeled" as const : "traditions_listed" as const,
      text: request.action === "label_traditions" ? "The tradition labels and disagreements were saved."
        : "The tradition sections, labels and disagreements are listed. Use label_traditions to replace an item’s labels; an empty labels list removes them.",
      traditions: { changed, sections: ATLAS_TRADITIONS.map((section) => ({ ...section })),
        ...await this.deps.traditions.listTraditions() } };
  }
}
