/**
 * Read-only projection for the authorized empty-composer diagnostic.
 * Serialize this function itself: it has no imported or outer runtime dependencies.
 * Counts and fallback control observations require the caller's grounded current-state check.
 */
export function projectUploadMenuDiagnostic(context: {
  messageCount?: number | null; attachmentCount?: number | null;
  controlVisible?: boolean | null; controlEnabled?: boolean | null;
} = {}) {
  const output: Record<string, any> = {
    sampleId: null, capturedAt: new Date().toISOString(), taskTabId: null,
    observedOrigin: null, documentVisibilityState: null, documentHasFocus: null,
    messageCount: null, attachmentCount: null, composerContentLength: null,
    observedSelectorLabel: null, observedReasoningLabel: null,
    controlTag: null, controlRole: null, controlAccessibleName: null,
    controlDisabled: null, controlVisible: null, ariaHasPopup: null, ariaExpanded: null,
    ariaControls: null, controlBoundingRectangle: null, visibleAssociatedMenuCount: null,
    visibleAssociatedMenuItemRolesAndLabels: null,
    operationStart: null, operationEnd: null, operationReturnStatus: null, configuredTimeout: null,
    observationErrors: [], unavailableFields: {},
  };
  // Object methods remain self-contained when tsx preserves function names.
  const { unavailable, finish, stop, excluded, visible } = {
    unavailable(field: string, reason: string) { output.unavailableFields[field] = reason; },
    finish() {
      for (const key of Object.keys(output)) {
        if (output[key] === null && !output.unavailableFields[key]) unavailable(key, "OUTSIDE_PROJECTION_SCOPE_OR_NOT_OBSERVED");
      }
      return output;
    },
    stop(reason: string) { output.observationErrors.push(reason); return finish(); },
    excluded(element: any) {
      for (let node = element; node; node = node.parentElement) {
        if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(node.tagName)) return true;
      }
      return false;
    },
    visible(element: any): boolean | null {
      try {
        if (typeof element.checkVisibility !== "function") return null;
        const value = element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true });
        return typeof value === "boolean" ? value : null;
      } catch { return null; }
    },
  };
  try {
    if (typeof document === "undefined") return stop("DOCUMENT_UNAVAILABLE");
    try {
      if (typeof location !== "undefined" && typeof location.origin === "string") output.observedOrigin = location.origin;
      else unavailable("observedOrigin", "GLOBAL_LOCATION_ORIGIN_UNAVAILABLE");
    } catch { unavailable("observedOrigin", "GLOBAL_LOCATION_ORIGIN_READ_UNAVAILABLE"); }
    if (["visible", "hidden", "prerender"].includes(document.visibilityState)) output.documentVisibilityState = document.visibilityState;
    if (typeof document.hasFocus === "function") {
      try { const focus = document.hasFocus(); if (typeof focus === "boolean") output.documentHasFocus = focus; }
      catch { unavailable("documentHasFocus", "FOCUS_READ_UNAVAILABLE"); }
    }
    for (const key of ["messageCount", "attachmentCount"] as const) {
      const count = context[key];
      if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) output[key] = count;
      else unavailable(key, "CURRENT_GROUNDED_COUNT_NOT_SUPPLIED");
    }
    if (output.observedOrigin !== "https://chatgpt.com") return stop("AUTHORIZED_ORIGIN_NOT_ESTABLISHED");
    if (output.messageCount !== 0 || output.attachmentCount !== 0) return stop("EMPTY_MESSAGE_AND_ATTACHMENT_CONTEXT_NOT_ESTABLISHED");
    const composers = document.querySelectorAll("#prompt-textarea");
    if (composers.length !== 1) return stop("COMPOSER_NOT_UNIQUE");
    const composer = composers[0];
    if (excluded(composer) || composer.querySelector("script, style, template, noscript")) return stop("COMPOSER_EXCLUDED_ELEMENT");
    if (!(composer.tagName === "TEXTAREA" || (composer.tagName === "DIV" && composer.getAttribute("contenteditable") === "true"))) return stop("COMPOSER_NOT_EDITABLE");
    const composerValue = composer.tagName === "TEXTAREA" ? (composer as HTMLTextAreaElement).value : composer.textContent;
    if (typeof composerValue !== "string") return stop("COMPOSER_CONTENT_LENGTH_UNAVAILABLE");
    output.composerContentLength = composerValue.length;
    if (composerValue.length !== 0) return stop("COMPOSER_NOT_EMPTY");
    const form = composer.closest("form");
    if (!form || excluded(form)) return stop("COMPOSER_FORM_ASSOCIATION_UNAVAILABLE");
    const controls = form.querySelectorAll('button[aria-label="Add files and more"]');
    if (controls.length !== 1) return stop("MENU_NAVIGATION_CONTROL_NOT_UNIQUE");
    const control = controls[0] as HTMLButtonElement;
    if (excluded(control) || control.tagName !== "BUTTON" || control.id !== "composer-plus-btn"
      || ![null, "button"].includes(control.getAttribute("role"))) return stop("MENU_NAVIGATION_CONTROL_NOT_INTERACTIVE");
    output.controlTag = "BUTTON";
    output.controlRole = "button";
    output.controlAccessibleName = "Add files and more";
    const ariaDisabled = control.getAttribute("aria-disabled");
    try {
      if (typeof control.disabled === "boolean") output.controlDisabled = control.disabled || ariaDisabled === "true";
    } catch { /* Optional native property unavailable; use only grounded observations below. */ }
    if (output.controlDisabled === null && (ariaDisabled === "true" || ariaDisabled === "false")) output.controlDisabled = ariaDisabled === "true";
    if (output.controlDisabled === null && typeof context.controlEnabled === "boolean") output.controlDisabled = !context.controlEnabled;
    const hasPopup = control.getAttribute("aria-haspopup");
    if (["menu", "dialog", "listbox", "tree", "grid", "true", "false"].includes(hasPopup ?? "")) output.ariaHasPopup = hasPopup;
    const expanded = control.getAttribute("aria-expanded");
    if (expanded === "true" || expanded === "false") output.ariaExpanded = expanded === "true";
    const controlledIds = control.getAttribute("aria-controls");
    if (controlledIds !== null && controlledIds.length <= 512) output.ariaControls = controlledIds;
    output.controlVisible = visible(control);
    if (output.controlVisible === null && typeof context.controlVisible === "boolean") output.controlVisible = context.controlVisible;
    if (output.controlVisible === null) unavailable("controlVisible", "VISIBILITY_API_UNAVAILABLE");
    if (typeof control.getBoundingClientRect === "function") {
      try {
        const rect = control.getBoundingClientRect();
        const geometry = Object.fromEntries(["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, (rect as any)[key]]));
        if (Object.values(geometry).every((value) => typeof value === "number" && Number.isFinite(value))) output.controlBoundingRectangle = geometry;
      } catch { unavailable("controlBoundingRectangle", "GEOMETRY_READ_UNAVAILABLE"); }
    }
    if (hasPopup !== "menu") return stop("IN_PAGE_MENU_BEHAVIOR_NOT_ESTABLISHED");
    if (output.controlDisabled !== false || output.controlVisible !== true) return stop("VISIBLE_ENABLED_MENU_CONTROL_NOT_ESTABLISHED");

    const associated = new Set<Element>();
    let explicitMissingTarget = false;
    const ids = controlledIds?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (ids.length > 8 || (controlledIds?.length ?? 0) > 512) return stop("MENU_ASSOCIATION_EXCEEDS_BOUND");
    for (const id of ids) {
      const target = document.getElementById(id);
      if (target) associated.add(target);
      else explicitMissingTarget = true;
    }
    for (const menu of document.querySelectorAll('[role="menu"][aria-labelledby~="composer-plus-btn"]')) associated.add(menu);
    for (const menu of control.querySelectorAll('[role="menu"]')) associated.add(menu);
    if (associated.size > 8) return stop("ASSOCIATED_MENUS_EXCEED_BOUND");
    if (associated.size === 0) {
      if (explicitMissingTarget) { output.visibleAssociatedMenuCount = 0; output.visibleAssociatedMenuItemRolesAndLabels = []; }
      else { unavailable("visibleAssociatedMenuCount", "MENU_ASSOCIATION_NOT_ESTABLISHED"); unavailable("visibleAssociatedMenuItemRolesAndLabels", "MENU_ASSOCIATION_NOT_ESTABLISHED"); }
      return finish();
    }
    const visibleMenus: Element[] = [];
    for (const menu of associated) {
      if (excluded(menu) || menu.getAttribute("role") !== "menu") return stop("ASSOCIATED_TARGET_NOT_A_SAFE_MENU");
      const menuVisible = visible(menu);
      if (menuVisible === null) {
        unavailable("visibleAssociatedMenuCount", "ASSOCIATED_MENU_VISIBILITY_UNAVAILABLE");
        unavailable("visibleAssociatedMenuItemRolesAndLabels", "ASSOCIATED_MENU_VISIBILITY_UNAVAILABLE");
        return finish();
      }
      if (menuVisible) visibleMenus.push(menu);
    }
    output.visibleAssociatedMenuCount = visibleMenus.length;
    const items = new Set<Element>();
    for (const menu of visibleMenus) {
      for (const item of menu.querySelectorAll('button, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')) items.add(item);
    }
    if (items.size > 32) return stop("ASSOCIATED_MENU_ITEMS_EXCEED_BOUND");
    const labels: Array<{ role: string | null; label: string | null }> = [];
    const staticLabels = new Set(["Add photos & files", "Add files", "Upload from computer", "Take photo", "Connect apps"]);
    for (const item of items) {
      if (excluded(item)) return stop("ASSOCIATED_MENU_ITEM_EXCLUDED_ELEMENT");
      // Nested menus require their own association; do not traverse their labels.
      if (!visibleMenus.includes(item.closest('[role="menu"]')!)) continue;
      const itemVisible = visible(item);
      if (itemVisible === null) { unavailable("visibleAssociatedMenuItemRolesAndLabels", "MENU_ITEM_VISIBILITY_UNAVAILABLE"); return finish(); }
      if (!itemVisible) continue;
      const role = item.getAttribute("role") ?? (item.tagName === "BUTTON" ? "button" : null);
      const safeRole = ["button", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(role ?? "") ? role : null;
      const index = labels.length;
      labels.push({ role: safeRole, label: null });
      const labelField = `visibleAssociatedMenuItemRolesAndLabels[${index}].label`;
      const nativeInteractive = item.tagName === "BUTTON" || (item.tagName === "A" && item.hasAttribute("href"));
      const explicitInteractive = safeRole !== null && /^-?\d+$/.test(item.getAttribute("tabindex") ?? "");
      if (!safeRole || !(nativeInteractive || explicitInteractive)) { unavailable(labelField, "MENU_ITEM_NOT_INTERACTIVE"); continue; }
      if (item.querySelector("script, style, template, noscript")) { unavailable(labelField, "MENU_ITEM_EXCLUDED_DESCENDANT"); continue; }
      // Only local labels are read. Never resolve labels into unrelated document nodes.
      if (item.hasAttribute("aria-labelledby")) { unavailable(labelField, "EXTERNAL_LABEL_REFERENCE_NOT_READ"); continue; }
      const rawLabel = item.getAttribute("aria-label") ?? item.textContent;
      const label = typeof rawLabel === "string" ? rawLabel.replace(/\s+/g, " ").trim() : null;
      if (label !== null && staticLabels.has(label)) labels[index].label = label;
      else unavailable(labelField, "UNCLASSIFIED_LABEL_WITHHELD");
    }
    output.visibleAssociatedMenuItemRolesAndLabels = labels;
    return finish();
  } catch {
    // Exception messages can contain selectors or private UI text; never emit them.
    return stop("BOUNDED_PROJECTION_READ_UNAVAILABLE");
  }
}
