/** Self-contained read-only expression; all supplied observations must be current and grounded. */
export function projectDetachedMenuDiagnostic(context: {
  phase: "CLOSED_BASELINE" | "OPEN_OBSERVATION_1" | "OPEN_OBSERVATION_2" | "CLOSURE_VERIFICATION";
  messageCount?: number | null; attachmentCount?: number | null;
  controlVisible?: boolean | null; controlEnabled?: boolean | null;
  priorSamples?: Array<Record<string, any>>;
}) {
  const result: Record<string, any> = {
    phase: context.phase, capturedAt: new Date().toISOString(), observedOrigin: null,
    documentVisibilityState: null, documentHasFocus: null,
    messageCount: null, attachmentCount: null, composerContentLength: null,
    control: null, containers: null, explicitAssociation: "UNAVAILABLE",
    transitionCandidate: "NOT_ESTABLISHED", transitionCandidateLabel: null,
    selectedCandidateLocalObservationId: null, ambiguity: [], interactiveControls: null,
    observationErrors: [], unavailableFields: {},
  };
  // Object methods avoid runtime helpers in the function's tsx-serialized source.
  const { unavailable, finish, stop, excluded, visibility, rectangle, identifier, tokens, booleanAttribute, inspectCandidate } = {
    unavailable(field: string, reason: string) { result.unavailableFields[field] = reason; },
    finish() {
      if (result.interactiveControls === null) unavailable("interactiveControls", context.phase !== "OPEN_OBSERVATION_2"
        ? "LABEL_COLLECTION_NOT_PERMITTED_IN_THIS_PHASE" : result.selectedCandidateLocalObservationId === null
          ? "NO_UNIQUE_PERMITTED_CANDIDATE" : "INTERACTIVE_METADATA_COLLECTION_STOPPED");
      if (result.selectedCandidateLocalObservationId === null) unavailable("selectedCandidateLocalObservationId", context.phase !== "OPEN_OBSERVATION_2"
        ? "SELECTION_NOT_PERMITTED_IN_THIS_PHASE" : "NO_UNIQUE_PERMITTED_CANDIDATE");
      if (result.transitionCandidateLabel === null) unavailable("transitionCandidateLabel", "TRANSITION_ONLY_CANDIDATE_LABEL_NOT_APPLICABLE_OR_ESTABLISHED");
      if (result.control === null) unavailable("control", "CONTROL_NOT_OBSERVED_DUE_TO_GUARD_OR_READ_FAILURE");
      if (result.containers === null) unavailable("containers", "CONTAINER_INVENTORY_NOT_OBSERVED_DUE_TO_GUARD_OR_READ_FAILURE");
      const pending: Array<{ value: any; path: string }> = [{ value: result, path: "" }];
      while (pending.length) {
        const { value, path } = pending.pop()!;
        for (const [key, member] of Object.entries(value)) {
          if (key === "unavailableFields") continue;
          const field = Array.isArray(value) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
          if (member === null && key !== "labelAvailabilityReason" && !result.unavailableFields[field]) {
            unavailable(field, key === "allowlistedLabel" && value.labelAvailabilityReason
              ? value.labelAvailabilityReason : "ATTRIBUTE_OR_OBSERVATION_UNAVAILABLE");
          } else if (member !== null && typeof member === "object") pending.push({ value: member, path: field });
        }
      }
      return result;
    },
    stop(code: string) { result.observationErrors.push(code); return finish(); },
    excluded(element: any) {
      for (let node = element; node; node = node.parentElement) {
        if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(node.tagName)) return true;
      }
      return false;
    },
    visibility(element: any): boolean | null {
      try {
        if (typeof element.checkVisibility !== "function") return null;
        const value = element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true });
        return typeof value === "boolean" ? value : null;
      } catch { return null; }
    },
    rectangle(element: any, field: string) {
      try {
        if (typeof element.getBoundingClientRect === "function") {
          const rect = element.getBoundingClientRect();
          const values = Object.fromEntries(["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, rect[key]]));
          if (Object.values(values).every((value) => typeof value === "number" && Number.isFinite(value))) return values;
        }
      } catch { /* Optional geometry remains unavailable. */ }
      unavailable(field, "GEOMETRY_UNAVAILABLE"); return null;
    },
    identifier(value: string | null, field: string) {
      if (value !== null && value.length > 512) throw new Error("IDENTIFIER_ATTRIBUTE_LIMIT");
      if (!value) { unavailable(field, "IDENTIFIER_NOT_PRESENT"); return null; }
      return value;
    },
    tokens(value: string | null, field: string): string[] | null {
      if (value === null) { unavailable(field, "ATTRIBUTE_NOT_PRESENT"); return null; }
      if (value.length > 512) throw new Error("IDENTIFIER_ATTRIBUTE_LIMIT");
      const entries = value.trim().split(/\s+/).filter(Boolean);
      if (entries.length > 8) throw new Error("IDENTIFIER_TOKEN_LIMIT");
      return entries;
    },
    booleanAttribute(element: any, name: string, field: string) {
      const value = element.getAttribute(name);
      if (value === "true" || value === "false") return value === "true";
      unavailable(field, "BOOLEAN_ATTRIBUTE_UNAVAILABLE"); return null;
    },
    inspectCandidate(current: Record<string, any>) {
      const containers = current.containers as Array<Record<string, any>>;
      const unknown = containers.some((menu) => menu.visible === null);
      const visible = containers.filter((menu) => menu.visible === true);
      const associated = containers.filter((menu) => menu.explicitlyReferencedByNavigationControl
        || (menu.ariaLabelledbyIdentifierTokens ?? []).includes("composer-plus-btn"));
      const explicitlyVisible = associated.filter((menu) => menu.visible === true);
      const references = current.control.ariaControlsIdentifierTokens ?? [];
      const conflictingReferences = associated.some((menu) => (menu.ariaLabelledbyIdentifierTokens ?? []).includes("composer-plus-btn")
        && references.length > 0 && !references.includes(menu.literalElementIdWhenPresent));
      current.explicitAssociation = unknown ? "UNAVAILABLE" : explicitlyVisible.length === 1 ? "UNIQUE_VISIBLE"
        : explicitlyVisible.length > 1 ? "MULTIPLE_VISIBLE" : associated.length > 0 || references.length > 0 ? "NO_VISIBLE_REFERENCED_MENU" : "NONE";
      if (unknown) current.ambiguity.push("UNKNOWN_CONTAINER_VISIBILITY");
      if (visible.length > 1) current.ambiguity.push("MULTIPLE_VISIBLE_CONTAINERS");
      if (conflictingReferences) current.ambiguity.push("CONFLICTING_EXPLICIT_REFERENCES");
      const prior = context.priorSamples ?? [];
      const baseline = prior[0], first = prior[1];
      const validHistory = prior.length === 2 && baseline?.phase === "CLOSED_BASELINE" && first?.phase === "OPEN_OBSERVATION_1"
        && [baseline, first].every((sample) => Array.isArray(sample.containers) && sample.observationErrors?.length === 0
          && sample.messageCount === 0 && sample.attachmentCount === 0 && sample.composerContentLength === 0);
      if (context.phase === "OPEN_OBSERVATION_2" && !validHistory) current.ambiguity.push("TRANSITION_HISTORY_UNAVAILABLE");
      if (context.phase === "OPEN_OBSERVATION_2" && validHistory) {
        const baselineUnknown = baseline.containers.some((menu: any) => menu.visible === null);
        const firstUnknown = first.containers.some((menu: any) => menu.visible === null);
        const firstVisible = first.containers.filter((menu: any) => menu.visible === true);
        const baselineVisible = baseline.containers.filter((menu: any) => menu.visible === true);
        const transition = !baselineUnknown && !firstUnknown && !unknown && baselineVisible.length === 0
          && firstVisible.length === 1 && visible.length === 1 && baseline.control?.ariaExpanded === false
          && first.control?.ariaExpanded === true && current.control.ariaExpanded === true;
        if (baselineUnknown || firstUnknown) current.ambiguity.push("UNKNOWN_PRIOR_VISIBILITY");
        if (firstVisible.length > 1) current.ambiguity.push("MULTIPLE_PRIOR_VISIBLE_CONTAINERS");
        if ((first.ambiguity ?? []).length > 0) current.ambiguity.push("AMBIGUOUS_FIRST_OPEN_OBSERVATION");
        current.transitionCandidate = transition ? "UNIQUE_ZERO_TO_ONE_VISIBLE_TRANSITION" : "NOT_ESTABLISHED";
        if (transition && current.explicitAssociation === "NONE") {
          current.transitionCandidateLabel = "UNIQUE_OBSERVED_TRANSITION_CANDIDATE_NOT_EXPLICIT_ARIA_ASSOCIATION";
        }
      }
      if (context.phase !== "OPEN_OBSERVATION_2" || current.ambiguity.length > 0 || current.control.ariaExpanded !== true) return null;
      if (explicitlyVisible.length === 1 && visible.length === 1) return explicitlyVisible[0];
      if (current.explicitAssociation === "NONE" && current.transitionCandidate === "UNIQUE_ZERO_TO_ONE_VISIBLE_TRANSITION") return visible[0];
      return null;
    },
  };
  try {
    if (!["CLOSED_BASELINE", "OPEN_OBSERVATION_1", "OPEN_OBSERVATION_2", "CLOSURE_VERIFICATION"].includes(context.phase)) return stop("PHASE_INVALID");
    if (typeof document === "undefined") return stop("DOCUMENT_UNAVAILABLE");
    try { if (typeof location !== "undefined" && typeof location.origin === "string") result.observedOrigin = location.origin; }
    catch { unavailable("observedOrigin", "GLOBAL_LOCATION_UNAVAILABLE"); }
    if (typeof document.visibilityState === "string") result.documentVisibilityState = document.visibilityState;
    try { if (typeof document.hasFocus === "function") { const focus = document.hasFocus(); if (typeof focus === "boolean") result.documentHasFocus = focus; } }
    catch { /* Focus is optional. */ }
    if (result.documentHasFocus === null) unavailable("documentHasFocus", "FOCUS_UNAVAILABLE");
    for (const field of ["messageCount", "attachmentCount"] as const) {
      const value = context[field];
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) result[field] = value;
      else unavailable(field, "GROUNDED_CURRENT_COUNT_UNAVAILABLE");
    }
    if (result.observedOrigin !== "https://chatgpt.com") return stop("AUTHORIZED_ORIGIN_NOT_ESTABLISHED");
    if (result.messageCount !== 0 || result.attachmentCount !== 0) return stop("EMPTY_CONTEXT_NOT_ESTABLISHED");
    const composers = document.querySelectorAll("#prompt-textarea");
    if (composers.length !== 1) return stop("COMPOSER_NOT_UNIQUE");
    const composer = composers[0];
    if (excluded(composer) || composer.querySelector("script, style, template, noscript")) return stop("EXCLUDED_COMPOSER_CONTENT");
    if (!(composer.tagName === "TEXTAREA" || (composer.tagName === "DIV" && composer.getAttribute("contenteditable") === "true"))) return stop("COMPOSER_NOT_EDITABLE");
    const value = composer.tagName === "TEXTAREA" ? (composer as HTMLTextAreaElement).value : composer.textContent;
    if (typeof value !== "string") return stop("COMPOSER_LENGTH_UNAVAILABLE");
    result.composerContentLength = value.length;
    if (value.length !== 0) return stop("COMPOSER_NOT_EMPTY");
    const form = composer.closest("form");
    if (!form || excluded(form)) return stop("COMPOSER_FORM_UNAVAILABLE");
    const buttons = form.querySelectorAll('button[aria-label="Add files and more"]');
    if (buttons.length !== 1) return stop("NAVIGATION_CONTROL_NOT_UNIQUE");
    const control = buttons[0] as HTMLButtonElement;
    if (excluded(control) || control.tagName !== "BUTTON" || control.id !== "composer-plus-btn"
      || ![null, "button"].includes(control.getAttribute("role"))) return stop("NAVIGATION_CONTROL_NOT_INTERACTIVE");
    let enabled: boolean | null = null;
    try { if (typeof control.disabled === "boolean") enabled = !control.disabled; } catch { /* Use supported fallback. */ }
    const ariaDisabled = control.getAttribute("aria-disabled");
    if (ariaDisabled === "true") enabled = false;
    else if (enabled === null && ariaDisabled === "false") enabled = true;
    if (enabled === null && typeof context.controlEnabled === "boolean") enabled = context.controlEnabled;
    const visible = visibility(control) ?? (typeof context.controlVisible === "boolean" ? context.controlVisible : null);
    result.control = { literalElementIdWhenPresent: "composer-plus-btn", tag: "BUTTON", role: "button", accessibleName: "Add files and more",
      visible, enabled, ariaHasPopup: control.getAttribute("aria-haspopup") === "menu" ? "menu" : null,
      ariaExpanded: booleanAttribute(control, "aria-expanded", "control.ariaExpanded"),
      ariaControlsIdentifierTokens: tokens(control.getAttribute("aria-controls"), "control.ariaControlsIdentifierTokens"),
      boundingRectangle: rectangle(control, "control.boundingRectangle") };
    if (visible === null) unavailable("control.visible", "VISIBILITY_UNAVAILABLE");
    if (enabled === null) unavailable("control.enabled", "ENABLED_STATE_UNAVAILABLE");
    if (visible !== true || enabled !== true || result.control.ariaHasPopup !== "menu") return stop("VISIBLE_ENABLED_MENU_CONTROL_NOT_ESTABLISHED");
    const matches = document.querySelectorAll('[role~="menu"]');
    if (matches.length > 8) return stop("MENU_CONTAINER_LIMIT");
    const nodes: Element[] = [];
    const containers: Array<Record<string, any>> = [];
    for (const menu of matches) {
      if (excluded(menu)) return stop("EXCLUDED_MENU_CONTAINER");
      const index = containers.length;
      const path = `containers[${index}]`;
      const id = identifier(menu.getAttribute("id"), `${path}.literalElementIdWhenPresent`);
      const role = identifier(menu.getAttribute("role"), `${path}.role`);
      let containsFocus: boolean | null = null;
      try { if (document.activeElement && typeof menu.contains === "function") containsFocus = menu.contains(document.activeElement); } catch { /* Optional focus. */ }
      if (containsFocus === null) unavailable(`${path}.containsCurrentFocusWhenObservable`, "FOCUS_TARGET_UNAVAILABLE");
      const menuVisible = visibility(menu);
      if (menuVisible === null) unavailable(`${path}.visible`, "VISIBILITY_UNAVAILABLE");
      containers.push({ localObservationId: `${context.phase}:local-menu-${index + 1}`, literalElementIdWhenPresent: id, role,
        visible: menuVisible, boundingRectangle: rectangle(menu, `${path}.boundingRectangle`),
        ariaHidden: booleanAttribute(menu, "aria-hidden", `${path}.ariaHidden`),
        ariaLabelledbyIdentifierTokens: tokens(menu.getAttribute("aria-labelledby"), `${path}.ariaLabelledbyIdentifierTokens`),
        isDescendantOfComposerForm: typeof form.contains === "function" ? form.contains(menu) : null,
        isDescendantOfNavigationControl: typeof control.contains === "function" ? control.contains(menu) : null,
        containsCurrentFocusWhenObservable: containsFocus,
        explicitlyReferencedByNavigationControl: id !== null && (result.control.ariaControlsIdentifierTokens ?? []).includes(id) });
      nodes.push(menu);
    }
    result.containers = containers;
    if (context.phase === "CLOSED_BASELINE" && result.control.ariaExpanded !== false) return stop("CLOSED_BASELINE_NOT_ESTABLISHED");
    const candidate = inspectCandidate(result);
    if (!candidate) return finish();
    result.selectedCandidateLocalObservationId = candidate.localObservationId;
    const selected = nodes[containers.indexOf(candidate)]; // Local mapping within this observation only.
    const entries = Array.from(selected.querySelectorAll('button, [role~="menuitem"], [role~="menuitemcheckbox"], [role~="menuitemradio"]'))
      .filter((item) => item.closest('[role~="menu"]') === selected);
    if (entries.length > 32) return stop("INTERACTIVE_ITEM_LIMIT");
    const controls: Array<Record<string, any>> = [];
    const allowlist = ["Add photos & files", "Add files", "Upload from computer", "Take photo", "Connect apps"];
    for (const item of entries) {
      if (excluded(item)) return stop("EXCLUDED_INTERACTIVE_ELEMENT");
      const path = `interactiveControls[${controls.length}]`;
      const roleTokens = tokens(item.getAttribute("role"), `${path}.role`);
      const role = roleTokens?.find((token) => ["menuitem", "menuitemcheckbox", "menuitemradio", "button"].includes(token)) ?? (item.tagName === "BUTTON" ? "button" : null);
      const tab = item.getAttribute("tabindex");
      let tabIndex: number | null = tab !== null && /^-?\d+$/.test(tab) && Number.isSafeInteger(Number(tab)) ? Number(tab) : null;
      try { if (tabIndex === null && typeof (item as HTMLElement).tabIndex === "number") tabIndex = (item as HTMLElement).tabIndex; } catch { /* Optional. */ }
      let disabled: boolean | null = null;
      try { if (typeof (item as HTMLButtonElement).disabled === "boolean") disabled = (item as HTMLButtonElement).disabled; } catch { /* Optional. */ }
      const ariaDisabled = item.getAttribute("aria-disabled");
      if (ariaDisabled === "true") disabled = true; else if (disabled === null && ariaDisabled === "false") disabled = false;
      const itemVisible = visibility(item);
      const popup = item.getAttribute("aria-haspopup");
      const row = { literalElementIdWhenPresent: identifier(item.getAttribute("id"), `${path}.literalElementIdWhenPresent`), tag: item.tagName,
        role, visible: itemVisible, disabled, tabIndex,
        ariaHasPopup: ["menu", "dialog", "listbox", "tree", "grid", "true", "false"].includes(popup ?? "") ? popup : null,
        ariaExpanded: booleanAttribute(item, "aria-expanded", `${path}.ariaExpanded`), allowlistedLabel: null as string | null,
        labelAvailabilityReason: "UNCLASSIFIED_LABEL_WITHHELD" as string | null };
      const interactive = role !== null && (item.tagName === "BUTTON" || (item.tagName === "A" && item.hasAttribute("href")) || tab !== null && /^-?\d+$/.test(tab));
      if (!interactive) row.labelAvailabilityReason = "NOT_A_DIRECT_INTERACTIVE_ENTRY";
      else if (itemVisible !== true) row.labelAvailabilityReason = itemVisible === false ? "ITEM_NOT_VISIBLE" : "ITEM_VISIBILITY_UNAVAILABLE";
      else if (item.querySelector("script, style, template, noscript")) row.labelAvailabilityReason = "EXCLUDED_LABEL_DESCENDANT";
      else if (item.querySelector('[role~="menu"]')) row.labelAvailabilityReason = "NESTED_MENU_CONTENT_NOT_READ";
      else if (item.hasAttribute("aria-labelledby")) row.labelAvailabilityReason = "EXTERNAL_LABEL_REFERENCE_UNRESOLVED";
      else {
        const raw = item.getAttribute("aria-label") ?? item.textContent;
        const label = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : null;
        if (label !== null && allowlist.includes(label)) { row.allowlistedLabel = label; row.labelAvailabilityReason = null; }
      }
      controls.push(row);
    }
    result.interactiveControls = controls;
    return finish();
  } catch (error) {
    const code = error instanceof Error && ["IDENTIFIER_ATTRIBUTE_LIMIT", "IDENTIFIER_TOKEN_LIMIT"].includes(error.message)
      ? error.message : "BOUNDED_PROJECTION_UNAVAILABLE";
    return stop(code);
  }
}

/** Pure append-only accounting; this function never performs browser operations. */
export function recordDetachedMenuTransition(priorEvents: Array<Record<string, any>>, event: Record<string, any>) {
  const events = [...priorEvents, event];
  const { fail, safeSample, visibleCount } = {
    fail(): never { throw new Error("DETACHED_MENU_EVENT_SEQUENCE_INVALID"); },
    safeSample(sample: any) { return sample && sample.observationErrors?.length === 0 && sample.observedOrigin === "https://chatgpt.com"
      && sample.messageCount === 0 && sample.attachmentCount === 0 && sample.composerContentLength === 0
      && sample.control?.literalElementIdWhenPresent === "composer-plus-btn" && sample.control?.visible === true
      && sample.control?.enabled === true && sample.control?.ariaHasPopup === "menu"; },
    visibleCount(sample: any): number | null { return Array.isArray(sample?.containers) && sample.containers.every((menu: any) => typeof menu.visible === "boolean")
      ? sample.containers.filter((menu: any) => menu.visible).length : null; },
  };
  let openingCalls = 0, cleanupCalls = 0, samples = 0;
  let stage = "CLOSED_BASELINE", failed = false, terminal = false;
  let cleanupCommandReturnStatus: string | null = null;
  let closureVerification = "NOT_OBSERVED";
  let baseline: any = null, lastSample: any = null, associationSample: any = null;
  for (const entry of events) {
    if (terminal || !entry || typeof entry.type !== "string") fail();
    if (entry.type === "BLOCKED") {
      if (typeof entry.reasonCode !== "string" || !/^[A-Z0-9_]{1,100}$/.test(entry.reasonCode)) fail();
      failed = true;
      if (openingCalls === 0) terminal = true;
      else if (cleanupCalls === 0) stage = "CLOSE_OWN_MENU_ONCE";
      else stage = "CLOSURE_VERIFICATION";
      continue;
    }
    if (entry.type !== stage) fail();
    if (entry.type === "OPEN_ONCE") {
      if (!safeSample(baseline) || baseline.control.ariaExpanded !== false || ++openingCalls !== 1
        || !["SUCCEEDED", "FAILED", "UNKNOWN"].includes(entry.operationReturnStatus)) fail();
      if (entry.operationReturnStatus !== "SUCCEEDED") { failed = true; stage = "CLOSE_OWN_MENU_ONCE"; }
      else stage = "OPEN_OBSERVATION_1";
    } else if (entry.type === "CLOSE_OWN_MENU_ONCE") {
      if (openingCalls !== 1 || ++cleanupCalls !== 1 || !["SUCCEEDED", "FAILED", "UNKNOWN"].includes(entry.operationReturnStatus)) fail();
      const observedOpen = safeSample(lastSample) && lastSample.control.ariaExpanded === true;
      if (!observedOpen && !(entry.exactTaskControlVerified === true && entry.observedExpanded === true)) fail();
      cleanupCommandReturnStatus = entry.operationReturnStatus;
      if (entry.operationReturnStatus !== "SUCCEEDED") failed = true;
      stage = "CLOSURE_VERIFICATION";
    } else {
      if (entry.sample?.phase !== entry.type || ++samples > 4) fail();
      lastSample = entry.sample;
      if (entry.type === "CLOSED_BASELINE") {
        baseline = entry.sample;
        if (!safeSample(baseline) || baseline.control.ariaExpanded !== false) { failed = true; terminal = true; }
        else stage = "OPEN_ONCE";
      } else if (entry.type === "CLOSURE_VERIFICATION") {
        const count = visibleCount(entry.sample);
        closureVerification = !safeSample(entry.sample) || count === null || typeof entry.sample.control.ariaExpanded !== "boolean"
          ? "UNAVAILABLE" : entry.sample.control.ariaExpanded === false && count === 0 ? "VERIFIED_CLOSED" : "NOT_CLOSED";
        terminal = true;
      } else {
        associationSample = entry.sample;
        if (!safeSample(entry.sample)) { failed = true; stage = "CLOSE_OWN_MENU_ONCE"; }
        else stage = entry.type === "OPEN_OBSERVATION_1" ? "OPEN_OBSERVATION_2" : "CLOSE_OWN_MENU_ONCE";
      }
    }
  }
  return { events, operationCounts: { openingCalls, cleanupCalls, boundedStateSamples: samples },
    cleanupCommandReturnStatus, closureVerification,
    status: terminal ? openingCalls === 0 ? "BLOCKED_BEFORE_OPEN" : failed ? "FINISHED_WITH_FAILURE" : "FINISHED" : failed ? "BLOCKED_AFTER_OPEN" : "IN_PROGRESS",
    nextPermittedEvents: terminal ? [] : [stage],
    explicitAssociation: associationSample?.explicitAssociation ?? "UNAVAILABLE",
    transitionCandidate: associationSample?.transitionCandidate ?? "NOT_ESTABLISHED",
    transitionCandidateLabel: associationSample?.transitionCandidateLabel ?? null,
    selectedCandidateLocalObservationId: associationSample?.selectedCandidateLocalObservationId ?? null,
    ambiguity: associationSample?.ambiguity ?? [] };
}
