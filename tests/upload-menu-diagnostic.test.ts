import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { projectUploadMenuDiagnostic } from "../scripts/upload-menu-diagnostic.mts";

class SyntheticElement {
  parentElement: SyntheticElement | null = null;
  children: SyntheticElement[] = [];
  textReads = 0;
  labelReads = 0;
  shown: boolean | null = true;
  disabled: boolean | undefined;
  value = "";
  constructor(public tagName: string, public attributes: Record<string, string> = {}, public ownText = "") {
    if (tagName === "BUTTON") this.disabled = false;
  }
  get id() { return this.attributes.id ?? ""; }
  get textContent(): string {
    this.textReads++;
    if (this.tagName === "SCRIPT") throw new Error("PRIVATE_SYNTHETIC_SCRIPT_MUST_NOT_BE_READ");
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }
  getAttribute(name: string) { if (name === "aria-label") this.labelReads++; return this.attributes[name] ?? null; }
  hasAttribute(name: string) { return Object.hasOwn(this.attributes, name); }
  add(...children: SyntheticElement[]) { for (const child of children) { child.parentElement = this; this.children.push(child); } return this; }
  all(): SyntheticElement[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelectorAll(selector: string) { return this.all().filter((element) => matches(element, selector)); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector: string): SyntheticElement | null { return matches(this, selector) ? this : this.parentElement?.closest(selector) ?? null; }
  checkVisibility() { return this.shown; }
  getBoundingClientRect() { return { x: 10, y: 20, width: 30, height: 40, top: 20, right: 40, bottom: 60, left: 10 }; }
  click() { throw new Error("MUTATION_FORBIDDEN"); }
  setAttribute() { throw new Error("MUTATION_FORBIDDEN"); }
  dispatchEvent() { throw new Error("MUTATION_FORBIDDEN"); }
}
function matches(element: SyntheticElement, selectors: string): boolean {
  return selectors.split(",").some((rawSelector) => {
    const selector = rawSelector.trim();
    if (selector.startsWith("#")) return element.id === selector.slice(1);
    const tag = selector.match(/^[a-z]+/i)?.[0];
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    return [...selector.matchAll(/\[([a-z-]+)(~?=)"([^"]*)"\]/g)].every(([, name, operation, value]) => {
      const actual = element.attributes[name];
      return operation === "~=" ? actual?.split(/\s+/).includes(value) : actual === value;
    });
  });
}
function fixture() {
  const root = new SyntheticElement("MAIN");
  const form = new SyntheticElement("FORM");
  const composer = new SyntheticElement("DIV", { id: "prompt-textarea", contenteditable: "true" });
  const control = new SyntheticElement("BUTTON", { id: "composer-plus-btn", "aria-label": "Add files and more", "aria-haspopup": "menu", "aria-expanded": "false" });
  const unrelatedMenu = new SyntheticElement("DIV", { role: "menu", "aria-labelledby": "account-menu" });
  const privateTitle = new SyntheticElement("BUTTON", {}, "PRIVATE_SYNTHETIC_CONVERSATION_TITLE");
  root.add(form.add(composer, control), unrelatedMenu.add(privateTitle));
  const queries: string[] = [];
  const document = {
    visibilityState: "visible", hasFocus: () => true,
    querySelectorAll(selector: string) { queries.push(selector); return root.querySelectorAll(selector); },
    getElementById(id: string) { return root.all().find((element) => element.id === id) ?? null; },
  };
  const browserGlobals: { document: typeof document; location?: { origin: string } } = { document, location: { origin: "https://chatgpt.com" } };
  const sample = (context: unknown = { messageCount: 0, attachmentCount: 0 }) =>
    runInNewContext(`(${projectUploadMenuDiagnostic.toString()})(${JSON.stringify(context)})`, browserGlobals);
  const menu = (association: "controls" | "labelledby" | "descendant" = "controls") => {
    const associated = new SyntheticElement("DIV", { id: "synthetic-menu", role: "menu" });
    if (association === "controls") control.attributes["aria-controls"] = associated.id;
    if (association === "labelledby") associated.attributes["aria-labelledby"] = "composer-plus-btn";
    (association === "descendant" ? control : root).add(associated);
    control.attributes["aria-expanded"] = "true";
    return associated;
  };
  return { root, form, composer, control, unrelatedMenu, privateTitle, document, browserGlobals, queries, sample, menu };
}

describe("bounded empty-composer upload-menu diagnostic", () => {
  it("uses guarded global location without reading document.location", () => {
    const ui = fixture();
    Object.defineProperty(ui.document, "location", { get() { throw new Error("DOCUMENT_LOCATION_NOT_SUPPORTED"); } });
    expect(ui.sample().observedOrigin).toBe("https://chatgpt.com");
    delete ui.browserGlobals.location;
    const missing = ui.sample();
    expect(missing.observedOrigin).toBeNull();
    expect(missing.unavailableFields.observedOrigin).toBe("GLOBAL_LOCATION_ORIGIN_UNAVAILABLE");
    expect(missing.observationErrors).toContain("AUTHORIZED_ORIGIN_NOT_ESTABLISHED");
    ui.browserGlobals.location = { get origin(): string { throw new Error("PRIVATE_ORIGIN_ERROR"); } };
    const unavailable = ui.sample();
    expect(unavailable.unavailableFields.observedOrigin).toBe("GLOBAL_LOCATION_ORIGIN_READ_UNAVAILABLE");
    expect(JSON.stringify(unavailable)).not.toContain("PRIVATE_ORIGIN_ERROR");
  });
  it("also remains self-contained under the pinned-runtime tsx loader", () => {
    const script = `import { projectUploadMenuDiagnostic } from './scripts/upload-menu-diagnostic.mts';
      import { runInNewContext } from 'node:vm';
      const result = runInNewContext('('+projectUploadMenuDiagnostic.toString()+')()', {});
      process.stdout.write(JSON.stringify(result.observationErrors));`;
    expect(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" })).toBe('["DOCUMENT_UNAVAILABLE"]');
  });
  it("is serializable without a runtime closure and reports an empty pre-state without inferring a menu is absent", () => {
    const ui = fixture();
    const result = ui.sample();
    expect(result.observationErrors).toEqual([]);
    expect(result).toMatchObject({ messageCount: 0, attachmentCount: 0, composerContentLength: 0,
      controlTag: "BUTTON", controlRole: "button", controlAccessibleName: "Add files and more", controlVisible: true,
      controlDisabled: false, ariaHasPopup: "menu", ariaExpanded: false, visibleAssociatedMenuCount: null });
    expect(result.unavailableFields.visibleAssociatedMenuCount).toBe("MENU_ASSOCIATION_NOT_ESTABLISHED");
    expect(ui.privateTitle.textReads).toBe(0);
    expect(ui.queries).toEqual(["#prompt-textarea", '[role="menu"][aria-labelledby~="composer-plus-btn"]']);
    expect(result.operationStart).toBeNull();
    expect(result.configuredTimeout).toBeNull();
  });
  it.each(["controls", "labelledby", "descendant"] as const)("reports only visible static actions through %s association", (association) => {
    const ui = fixture();
    const menu = ui.menu(association);
    const action = new SyntheticElement("DIV", { role: "menuitem", tabindex: "-1" }, "Add photos & files");
    const privateDocument = new SyntheticElement("DIV", { role: "menuitem", tabindex: "-1" }, "PRIVATE_SYNTHETIC_DOCUMENT_NAME");
    const hidden = new SyntheticElement("BUTTON", {}, "PRIVATE_SYNTHETIC_HIDDEN_NAME"); hidden.shown = false;
    menu.add(action, privateDocument, hidden);
    const before = JSON.stringify(ui.root.all().map((node) => [node.tagName, node.attributes, node.ownText]));
    const result = ui.sample();
    expect(result.visibleAssociatedMenuCount).toBe(1);
    expect(result.visibleAssociatedMenuItemRolesAndLabels).toEqual([{ role: "menuitem", label: "Add photos & files" }, { role: "menuitem", label: null }]);
    expect(result.unavailableFields["visibleAssociatedMenuItemRolesAndLabels[1].label"]).toBe("UNCLASSIFIED_LABEL_WITHHELD");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SYNTHETIC");
    expect(hidden.textReads).toBe(0);
    expect(ui.privateTitle.textReads).toBe(0);
    expect(JSON.stringify(ui.root.all().map((node) => [node.tagName, node.attributes, node.ownText]))).toBe(before);
  });
  it("reports observed hidden or explicitly missing associated menus as zero", () => {
    const ui = fixture();
    ui.menu().shown = false;
    expect(ui.sample()).toMatchObject({ visibleAssociatedMenuCount: 0, visibleAssociatedMenuItemRolesAndLabels: [] });
    const missing = fixture(); missing.control.attributes["aria-controls"] = "explicit-missing-menu";
    expect(missing.sample()).toMatchObject({ visibleAssociatedMenuCount: 0, visibleAssociatedMenuItemRolesAndLabels: [] });
  });
  it.each([{ messageCount: 1, attachmentCount: 0 }, { messageCount: 0, attachmentCount: 1 }, { messageCount: null, attachmentCount: 0 }, {}])("refuses label inspection when current counts are nonempty or unavailable (%#)", (counts) => {
    const ui = fixture(); const action = new SyntheticElement("BUTTON", {}, "Add files"); ui.menu().add(action);
    const result = ui.sample(counts);
    expect(result.observationErrors).toContain("EMPTY_MESSAGE_AND_ATTACHMENT_CONTEXT_NOT_ESTABLISHED");
    expect(result.controlAccessibleName).toBeNull();
    expect(ui.control.labelReads).toBe(0);
    expect(action.textReads).toBe(0);
    expect(ui.composer.textReads).toBe(0);
  });
  it("returns only content length for a nonempty composer and never reads labels", () => {
    const ui = fixture(); ui.composer.ownText = "PRIVATE_SYNTHETIC_DRAFT";
    const result = ui.sample();
    expect(result.composerContentLength).toBe(23);
    expect(result.observationErrors).toContain("COMPOSER_NOT_EMPTY");
    expect(result.controlAccessibleName).toBeNull();
    expect(ui.control.labelReads).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SYNTHETIC_DRAFT");
  });
  it("uses null and reasons for unavailable visibility, focus, geometry and association", () => {
    const ui = fixture();
    (ui.document as any).hasFocus = undefined;
    (ui.control as any).getBoundingClientRect = undefined;
    (ui.control as any).checkVisibility = undefined;
    const result = ui.sample();
    for (const key of ["documentHasFocus", "controlBoundingRectangle", "controlVisible", "visibleAssociatedMenuCount"]) {
      expect(result[key]).toBeNull(); expect(result.unavailableFields[key]).toBeTypeOf("string");
    }
    expect(result.observationErrors).toContain("VISIBLE_ENABLED_MENU_CONTROL_NOT_ESTABLISHED");
  });
  it("accepts current locator control observations only when native observations are unavailable", () => {
    const ui = fixture();
    (ui.control as any).checkVisibility = undefined;
    ui.control.disabled = undefined;
    const context = { messageCount: 0, attachmentCount: 0, controlVisible: true, controlEnabled: true };
    expect(ui.sample(context)).toMatchObject({ controlVisible: true, controlDisabled: false, observationErrors: [] });
    expect(ui.sample({ ...context, controlEnabled: false })).toMatchObject({ controlDisabled: true, observationErrors: ["VISIBLE_ENABLED_MENU_CONTROL_NOT_ESTABLISHED"] });
    expect(ui.sample({ ...context, controlVisible: null, controlEnabled: null })).toMatchObject({ controlVisible: null, controlDisabled: null });
    (ui.control as any).checkVisibility = () => false;
    ui.control.disabled = true;
    expect(ui.sample(context)).toMatchObject({ controlVisible: false, controlDisabled: true, observationErrors: ["VISIBLE_ENABLED_MENU_CONTROL_NOT_ESTABLISHED"] });
  });
  it("guards unsupported native control getters without extending visibility fallback to menus", () => {
    const ui = fixture();
    Object.defineProperty(ui.control, "checkVisibility", { get() { throw new Error("UNSUPPORTED_PRIVATE_NATIVE_GETTER"); } });
    Object.defineProperty(ui.control, "disabled", { get() { throw new Error("UNSUPPORTED_PRIVATE_NATIVE_GETTER"); } });
    const action = new SyntheticElement("BUTTON", {}, "PRIVATE_SYNTHETIC_UNVERIFIED_ACTION");
    const menu = ui.menu().add(action); menu.shown = null;
    const result = ui.sample({ messageCount: 0, attachmentCount: 0, controlVisible: true, controlEnabled: true });
    expect(result).toMatchObject({ controlVisible: true, controlDisabled: false, visibleAssociatedMenuCount: null, visibleAssociatedMenuItemRolesAndLabels: null });
    expect(result.unavailableFields.visibleAssociatedMenuCount).toBe("ASSOCIATED_MENU_VISIBILITY_UNAVAILABLE");
    expect(action.textReads).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("rejects script-bearing composers and noninteractive controls", () => {
    const unsafe = fixture(); unsafe.composer.add(new SyntheticElement("SCRIPT", {}, "PRIVATE_SYNTHETIC_SCRIPT"));
    expect(unsafe.sample().observationErrors).toContain("COMPOSER_EXCLUDED_ELEMENT");
    expect(unsafe.composer.textReads).toBe(0);
    const wrong = fixture(); wrong.control.attributes.role = "presentation";
    expect(wrong.sample().observationErrors).toContain("MENU_NAVIGATION_CONTROL_NOT_INTERACTIVE");
    const chooser = fixture(); delete chooser.control.attributes["aria-haspopup"];
    expect(chooser.sample().observationErrors).toContain("IN_PAGE_MENU_BEHAVIOR_NOT_ESTABLISHED");
  });
  it("never reads script items, unclassified noninteractive elements or external label references", () => {
    const ui = fixture(); const menu = ui.menu();
    const noninteractive = new SyntheticElement("DIV", { role: "menuitem" }, "PRIVATE_SYNTHETIC_NONINTERACTIVE");
    const external = new SyntheticElement("BUTTON", { "aria-labelledby": "outside-private-label" }, "PRIVATE_SYNTHETIC_REFERENCE");
    const scriptBearing = new SyntheticElement("BUTTON").add(new SyntheticElement("SCRIPT", {}, "PRIVATE_SYNTHETIC_SCRIPT"));
    menu.add(noninteractive, external, scriptBearing);
    const result = ui.sample();
    expect(result.visibleAssociatedMenuItemRolesAndLabels.every((item: any) => item.label === null)).toBe(true);
    expect(noninteractive.textReads + external.textReads + scriptBearing.textReads).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SYNTHETIC");
    menu.add(new SyntheticElement("SCRIPT", { role: "menuitem", tabindex: "0" }, "PRIVATE_SYNTHETIC_SCRIPT"));
    expect(ui.sample().observationErrors).toContain("ASSOCIATED_MENU_ITEM_EXCLUDED_ELEMENT");
  });
  it("does not inspect a sibling menu or a nested menu without its own explicit association", () => {
    const ui = fixture();
    const sibling = new SyntheticElement("DIV", { role: "menu" }).add(new SyntheticElement("BUTTON", {}, "PRIVATE_SYNTHETIC_SIBLING"));
    ui.form.add(sibling);
    expect(ui.sample().visibleAssociatedMenuCount).toBeNull();
    const nestedAction = new SyntheticElement("BUTTON", {}, "PRIVATE_SYNTHETIC_NESTED");
    ui.menu().add(new SyntheticElement("DIV", { role: "menu" }).add(nestedAction));
    expect(ui.sample().visibleAssociatedMenuItemRolesAndLabels).toEqual([]);
    expect(nestedAction.textReads).toBe(0);
    expect(sibling.children[0].textReads).toBe(0);
  });
  it("withholds raw exception text and refuses ambiguous or overlarge projections", () => {
    const ambiguous = fixture(); ambiguous.form.add(new SyntheticElement("BUTTON", { "aria-label": "Add files and more" }));
    expect(ambiguous.sample().observationErrors).toContain("MENU_NAVIGATION_CONTROL_NOT_UNIQUE");
    const large = fixture(); large.menu().add(...Array.from({ length: 33 }, () => new SyntheticElement("BUTTON", {}, "PRIVATE_SYNTHETIC_TITLE")));
    expect(large.sample().observationErrors).toContain("ASSOCIATED_MENU_ITEMS_EXCEED_BOUND");
    const broken = fixture(); broken.document.querySelectorAll = () => { throw new Error("PRIVATE_SYNTHETIC_ERROR"); };
    expect(broken.sample().observationErrors).toEqual(["BOUNDED_PROJECTION_READ_UNAVAILABLE"]);
    expect(JSON.stringify(broken.sample())).not.toContain("PRIVATE_SYNTHETIC_ERROR");
  });
});
