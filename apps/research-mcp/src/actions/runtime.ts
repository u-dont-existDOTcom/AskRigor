import type { ActionRoute } from "./types.js";

export interface EnabledActionRouteOptions {
  researchEnabled: boolean;
  lessonsEnabled: boolean;
  research: readonly ActionRoute[];
  lessons: readonly ActionRoute[];
}

export function createEnabledActionRoutes(
  options: EnabledActionRouteOptions
): readonly ActionRoute[] {
  return Object.freeze([
    ...(options.researchEnabled ? options.research : []),
    ...(options.lessonsEnabled ? options.lessons : [])
  ]);
}
