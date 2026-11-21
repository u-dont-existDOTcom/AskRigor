import { z } from "zod";

/** Atlas news, stage 1: the news actions' small later inputs (later-inputs.ts declares them). */
export const newsNumberInputSchema = z.string().trim().regex(/^(?:N-[1-9][0-9]{3,}|all)$/u);
export const newsDateInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
