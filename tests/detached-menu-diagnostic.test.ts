import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { projectDetachedMenuDiagnostic, recordDetachedMenuTransition } from "../scripts/detached-menu-diagnostic.mts";

class Element {
  children: Element[] = [];
  parentElement: Element | null = null;
  shown: boolean | null = true;
  disabled: boolean | undefined;
  textReads = 0;
  labelReads = 0;
  constructor(public tagName: string, public attrs: Record<string, string> = {}, public text = "") {
    if (tagName === "BUTTON") this.disabled = false;
  }
  get id() { return this.attrs.id ?? ""; }
  get textContent(): string { this.textReads++; if (this.tagName === "SCRIPT") throw new Error("PRIVATE_SCRIPT"); return this.text + this.children.map((child) => child.textContent).join(""); }
  getAttribute(name: string) { if (name === "aria-label") this.labelReads++; return this.attrs[name] ?? null; }
  hasAttribute(name: string) { return Object.hasOwn(this.attrs, name); }
  add(...children: Element[]) { for (const child of children) { this.children.push(child); child.parentElement = this; } return this; }
  all(): Element[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  contains(other: Element) { return this === other || this.all().includes(other); }
  closest(selector: string): Element | null { return match(this, selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector: string) { return this.all().filter((node) => match(node, selector)); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  checkVisibility() { return this.shown; }
  getBoundingClientRect() { return { x: 1, y: 2, width: 3, height: 4, top: 2, right: 4, bottom: 6, left: 1 }; }
  click() { throw new Error("FORBIDDEN_INTERACTION"); }
  setAttribute() { throw new Error("FORBIDDEN_MUTATION"); }
  dispatchEvent() { throw new Error("FORBIDDEN_EVENT"); }
}
function match(node: Element, selector: string): boolean {
  return selector.split(",").some((part) => {
    const entry = part.trim();
    if (entry.startsWith("#")) return node.id === entry.slice(1);
    const tag = entry.match(/^[a-z]+/i)?.[0];
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    return [...entry.matchAll(/\[([a-z-]+)(~?=)"([^"]*)"\]/g)].every(([, key, op, value]) =>
      op === "~=" ? node.attrs[key]?.split(/\s+/).includes(value) : node.attrs[key] === value);
  });
}
function fixture() {
  const root = new Element("MAIN"), form = new Element("FORM");
  const composer = new Element("DIV", { id: "prompt-textarea", contenteditable: "true" });
  const control = new Element("BUTTON", { id: "composer-plus-btn", "aria-label": "Add files and more", "aria-haspopup": "menu", "aria-expanded": "false" });
  root.add(form.add(composer, control));
  const queries: string[] = [];
  const document = { visibilityState: "visible", querySelectorAll(selector: string) { queries.push(selector); return root.querySelectorAll(selector); } };
  const sample = (phase: any, priorSamples: any[] = [], overrides: Record<string, any> = {}) => runInNewContext(
    `(${projectDetachedMenuDiagnostic.toString()})(${JSON.stringify({ phase, messageCount: 0, attachmentCount: 0, priorSamples, ...overrides })})`,
    { document, location: { origin: "https://chatgpt.com" } });
  const menu = (id?: string, explicit = false) => {
    const node = new Element("DIV", { role: "menu", ...(id ? { id } : {}) });
    if (explicit) node.attrs["aria-labelledby"] = "composer-plus-btn";
    root.add(node); return node;
  };
  const open = () => { control.attrs["aria-expanded"] = "true"; };
  return { root, form, composer, control, queries, sample, menu, open };
}
const action = (label = "Add photos & files") => new Element("DIV", { role: "menuitem", tabindex: "-1" }, label);
function throughOpen2(ui: ReturnType<typeof fixture>, setup: () => void) {
  const baseline = ui.sample("CLOSED_BASELINE"); setup(); ui.open();
  const first = ui.sample("OPEN_OBSERVATION_1", [baseline]);
  const second = ui.sample("OPEN_OBSERVATION_2", [baseline, first]);
  return { baseline, first, second };
}

describe("detached menu structural projection", () => {
  it("observes a detached menu without aria-controls and releases labels only at the second open sample", () => {
    const ui = fixture(); let entry!: Element;
    const baseline = ui.sample("CLOSED_BASELINE");
    const menu = ui.menu().add(entry = action()); ui.open();
    const first = ui.sample("OPEN_OBSERVATION_1", [baseline]);
    expect(entry.textReads).toBe(0);
    expect(first.containers[0]).toMatchObject({ literalElementIdWhenPresent: null, isDescendantOfComposerForm: false,
      isDescendantOfNavigationControl: false, explicitlyReferencedByNavigationControl: false, visible: true });
    const second = ui.sample("OPEN_OBSERVATION_2", [baseline, first]);
    expect(second.transitionCandidateLabel).toBe("UNIQUE_OBSERVED_TRANSITION_CANDIDATE_NOT_EXPLICIT_ARIA_ASSOCIATION");
    expect(second.interactiveControls[0].allowlistedLabel).toBe("Add photos & files");
    expect(second.selectedCandidateLocalObservationId).toBe("OPEN_OBSERVATION_2:local-menu-1");
    expect(first.containers[0].localObservationId).not.toBe(second.containers[0].localObservationId);
    expect(first.containers[0].literalElementIdWhenPresent).toBeNull();
    expect(menu.textReads).toBe(0);
    expect(new Set(ui.queries)).toEqual(new Set(["#prompt-textarea", '[role~="menu"]']));
  });
  it.each(["controls", "labelledby"])("supports a unique explicit %s association", (kind) => {
    const ui = fixture();
    const samples = throughOpen2(ui, () => {
      const menu = ui.menu("synthetic-menu", kind === "labelledby").add(action());
      if (kind === "controls") ui.control.attrs["aria-controls"] = menu.id;
    });
    expect(samples.second.explicitAssociation).toBe("UNIQUE_VISIBLE");
    expect(samples.second.interactiveControls[0].allowlistedLabel).toBe("Add photos & files");
  });
  it.each(["multiple", "unknown", "conflicting-references"])("refuses selection for %s evidence", (kind) => {
    const ui = fixture(); const baseline = ui.sample("CLOSED_BASELINE");
    const menu = ui.menu("one", true).add(action("PRIVATE_TITLE"));
    if (kind === "multiple") ui.menu("two");
    if (kind === "unknown") ui.menu("unknown").shown = null;
    if (kind === "conflicting-references") ui.control.attrs["aria-controls"] = "different-menu";
    ui.open(); const first = ui.sample("OPEN_OBSERVATION_1", [baseline]);
    const second = ui.sample("OPEN_OBSERVATION_2", [baseline, first]);
    expect(second.selectedCandidateLocalObservationId).toBeNull();
    expect(second.interactiveControls).toBeNull();
    expect(second.ambiguity.length).toBeGreaterThan(0);
    expect(menu.children[0].textReads).toBe(0);
    expect(JSON.stringify(second)).not.toContain("PRIVATE_TITLE");
  });
  it("preserves differing observed literal IDs without imposing persistent identity on a valid transition", () => {
    const ui = fixture(); const baseline = ui.sample("CLOSED_BASELINE");
    const menu = ui.menu("first-observed-id").add(action()); ui.open();
    const first = ui.sample("OPEN_OBSERVATION_1", [baseline]);
    menu.attrs.id = "second-observed-id";
    const second = ui.sample("OPEN_OBSERVATION_2", [baseline, first]);
    expect(first.containers[0].literalElementIdWhenPresent).toBe("first-observed-id");
    expect(second.containers[0].literalElementIdWhenPresent).toBe("second-observed-id");
    expect(second.ambiguity).toEqual([]);
    expect(second.transitionCandidateLabel).toBe("UNIQUE_OBSERVED_TRANSITION_CANDIDATE_NOT_EXPLICIT_ARIA_ASSOCIATION");
    expect(second.interactiveControls[0].allowlistedLabel).toBe("Add photos & files");
    expect(second.containers[0]).not.toHaveProperty("persistentNodeIdentity");
  });
  it("does not equate array positions with persistent identity", () => {
    const ui = fixture(); const baseline = ui.sample("CLOSED_BASELINE");
    const hidden = ui.menu(); hidden.shown = false;
    const visible = ui.menu().add(action()); ui.open();
    const first = ui.sample("OPEN_OBSERVATION_1", [baseline]);
    ui.root.children = [ui.form, visible, hidden];
    const second = ui.sample("OPEN_OBSERVATION_2", [baseline, first]);
    expect(first.containers[1].literalElementIdWhenPresent).toBeNull();
    expect(second.containers[0].literalElementIdWhenPresent).toBeNull();
    expect(second.selectedCandidateLocalObservationId).toBe("OPEN_OBSERVATION_2:local-menu-1");
    expect(second.transitionCandidateLabel).toBe("UNIQUE_OBSERVED_TRANSITION_CANDIDATE_NOT_EXPLICIT_ARIA_ASSOCIATION");
  });
  it("withholds private titles and external label references, and skips nested-menu labels", () => {
    const ui = fixture(); let unknown!: Element, external!: Element, nested!: Element;
    const samples = throughOpen2(ui, () => {
      const menu = ui.menu("outer", true);
      menu.add(...["Add photos & files", "Add files", "Upload from computer", "Take photo", "Connect apps"].map(action));
      menu.add(unknown = action("PRIVATE_SYNTHETIC_FILE.txt"));
      external = action("PRIVATE_EXTERNAL_LABEL"); external.attrs["aria-labelledby"] = "unrelated-id"; menu.add(external);
      const nestedMenu = new Element("DIV", { role: "menu" }).add(nested = action("PRIVATE_NESTED")); nestedMenu.shown = false; menu.add(nestedMenu);
    });
    expect(samples.second.interactiveControls.map((item: any) => item.allowlistedLabel)).toEqual([
      "Add photos & files", "Add files", "Upload from computer", "Take photo", "Connect apps", null, null,
    ]);
    expect(samples.second.interactiveControls[5].labelAvailabilityReason).toBe("UNCLASSIFIED_LABEL_WITHHELD");
    expect(samples.second.interactiveControls[6].labelAvailabilityReason).toBe("EXTERNAL_LABEL_REFERENCE_UNRESOLVED");
    expect(external.textReads + nested.textReads).toBe(0);
    expect(unknown.textReads).toBe(1);
    expect(JSON.stringify(samples.second)).not.toContain("PRIVATE_");
  });
  it("never reads labels of excluded elements or descendants", () => {
    const ui = fixture(); let script!: Element;
    const samples = throughOpen2(ui, () => ui.menu("one", true).add(new Element("BUTTON").add(script = new Element("SCRIPT", {}, "PRIVATE_SCRIPT"))));
    expect(samples.second.interactiveControls[0].labelAvailabilityReason).toBe("EXCLUDED_LABEL_DESCENDANT");
    expect(script.textReads).toBe(0);
    const unsafe = fixture(); unsafe.root.add(new Element("SCRIPT", { role: "menu" }, "PRIVATE_SCRIPT"));
    expect(unsafe.sample("CLOSED_BASELINE").observationErrors).toContain("EXCLUDED_MENU_CONTAINER");
  });
  it("does not read nested menu text through a direct parent item's aggregate label", () => {
    const ui = fixture(); let parent!: Element, nestedPrivate!: Element;
    const samples = throughOpen2(ui, () => {
      parent = action("Connect apps");
      const nested = new Element("DIV", { role: "menu" }); nested.shown = false;
      nestedPrivate = action("PRIVATE_NESTED_AGGREGATE"); nested.add(nestedPrivate); parent.add(nested);
      Object.defineProperty(nestedPrivate, "textContent", { get() { throw new Error("PRIVATE_NESTED_AGGREGATE_MUST_NOT_BE_READ"); } });
      ui.menu("outer", true).add(parent);
    });
    expect(samples.second.observationErrors).toEqual([]);
    expect(samples.second.interactiveControls[0]).toMatchObject({ allowlistedLabel: null, labelAvailabilityReason: "NESTED_MENU_CONTENT_NOT_READ" });
    expect(parent.textReads + parent.labelReads).toBe(0);
    expect(JSON.stringify(samples.second)).not.toContain("PRIVATE_NESTED");
  });
  it("provides a field-path availability reason for every unavailable null", () => {
    const ui = fixture();
    const baseline = ui.sample("CLOSED_BASELINE");
    expect(baseline.unavailableFields.interactiveControls).toBe("LABEL_COLLECTION_NOT_PERMITTED_IN_THIS_PHASE");
    const guarded = ui.sample("CLOSED_BASELINE", [], { messageCount: null });
    expect(guarded.unavailableFields.control).toBeTypeOf("string");
    expect(guarded.unavailableFields.containers).toBeTypeOf("string");
    const menu = ui.menu(); menu.shown = null;
    (ui.form as any).contains = undefined; (ui.control as any).contains = undefined;
    const unknown = ui.sample("CLOSED_BASELINE");
    const inspect = (root: any, value = root, path = "") => {
      for (const [key, member] of Object.entries(value)) {
        if (key === "unavailableFields") continue;
        const field = Array.isArray(value) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
        if (member === null && key !== "labelAvailabilityReason") expect(root.unavailableFields[field]).toBeTypeOf("string");
        else if (member !== null && typeof member === "object") inspect(root, member, field);
      }
    };
    for (const sample of [baseline, guarded, unknown]) inspect(sample);
  });
  it.each(["containers", "id", "tokens", "items"])("stops at the fixed %s bound", (kind) => {
    const ui = fixture();
    const samples = throughOpen2(ui, () => {
      if (kind === "containers") for (let index = 0; index < 9; index++) ui.menu();
      else {
        const menu = ui.menu(kind === "id" ? "x".repeat(513) : "one", true);
        if (kind === "tokens") menu.attrs["aria-labelledby"] = Array(9).fill("token").join(" ");
        if (kind === "items") menu.add(...Array.from({ length: 33 }, () => action("PRIVATE_TITLE")));
      }
    });
    expect(samples.second.observationErrors.length).toBeGreaterThan(0);
    expect(samples.second.interactiveControls).toBeNull();
  });
  it("refuses nonempty contexts and preserves unsupported visibility and focus as unknown", () => {
    const ui = fixture(); ui.composer.text = "PRIVATE_DRAFT";
    expect(ui.sample("CLOSED_BASELINE").observationErrors).toContain("COMPOSER_NOT_EMPTY");
    expect(ui.control.labelReads).toBe(0);
    const empty = fixture();
    expect(empty.sample("CLOSED_BASELINE", [], { attachmentCount: 1 }).observationErrors).toContain("EMPTY_CONTEXT_NOT_ESTABLISHED");
    (empty.control as any).checkVisibility = undefined; empty.control.disabled = undefined;
    const observed = empty.sample("CLOSED_BASELINE", [], { controlVisible: true, controlEnabled: true });
    expect(observed.control).toMatchObject({ visible: true, enabled: true });
    expect(observed.documentHasFocus).toBeNull();
  });
});

describe("fixed detached-menu transition accounting", () => {
  function sequence() {
    const ui = fixture(); const samples = throughOpen2(ui, () => ui.menu().add(action()));
    const events = [
      { type: "CLOSED_BASELINE", sample: samples.baseline }, { type: "OPEN_ONCE", operationReturnStatus: "SUCCEEDED" },
      { type: "OPEN_OBSERVATION_1", sample: samples.first }, { type: "OPEN_OBSERVATION_2", sample: samples.second },
    ];
    return { ui, samples, events };
  }
  it("records cleanup return and observed closure separately without mutating prior events", () => {
    const { ui, events } = sequence(); const prior = JSON.stringify(events);
    const cleanup = recordDetachedMenuTransition(events, { type: "CLOSE_OWN_MENU_ONCE", operationReturnStatus: "SUCCEEDED" });
    expect(cleanup.closureVerification).toBe("NOT_OBSERVED");
    const notClosed = recordDetachedMenuTransition(cleanup.events, { type: "CLOSURE_VERIFICATION", sample: ui.sample("CLOSURE_VERIFICATION") });
    expect(notClosed).toMatchObject({ cleanupCommandReturnStatus: "SUCCEEDED", closureVerification: "NOT_CLOSED" });
    ui.control.attrs["aria-expanded"] = "false"; ui.root.children.filter((node) => node.attrs.role === "menu").forEach((node) => { node.shown = false; });
    const closed = recordDetachedMenuTransition(cleanup.events, { type: "CLOSURE_VERIFICATION", sample: ui.sample("CLOSURE_VERIFICATION") });
    expect(closed).toMatchObject({ closureVerification: "VERIFIED_CLOSED", operationCounts: { openingCalls: 1, cleanupCalls: 1, boundedStateSamples: 4 },
      transitionCandidate: "UNIQUE_ZERO_TO_ONE_VISIBLE_TRANSITION" });
    expect(JSON.stringify(events)).toBe(prior);
    expect(() => recordDetachedMenuTransition(closed.events, { type: "OPEN_ONCE", operationReturnStatus: "SUCCEEDED" })).toThrow();
  });
  it("blocks before opening without any interaction", () => {
    expect(recordDetachedMenuTransition([], { type: "BLOCKED", reasonCode: "ADMISSION_UNAVAILABLE" })).toMatchObject({ status: "BLOCKED_BEFORE_OPEN", nextPermittedEvents: [],
      operationCounts: { openingCalls: 0, cleanupCalls: 0, boundedStateSamples: 0 } });
    const ui = fixture(); ui.composer.text = "PRIVATE_DRAFT";
    const stopped = recordDetachedMenuTransition([], { type: "CLOSED_BASELINE", sample: ui.sample("CLOSED_BASELINE") });
    expect(stopped.status).toBe("BLOCKED_BEFORE_OPEN");
    expect(() => recordDetachedMenuTransition(stopped.events, { type: "OPEN_ONCE", operationReturnStatus: "SUCCEEDED" })).toThrow();
  });
  it("allows only safe reserved cleanup and closure after an opening failure", () => {
    const ui = fixture(); const baseline = { type: "CLOSED_BASELINE", sample: ui.sample("CLOSED_BASELINE") };
    const failed = recordDetachedMenuTransition([baseline], { type: "OPEN_ONCE", operationReturnStatus: "FAILED" });
    expect(failed.nextPermittedEvents).toEqual(["CLOSE_OWN_MENU_ONCE"]);
    expect(() => recordDetachedMenuTransition(failed.events, { type: "OPEN_OBSERVATION_1", sample: {} })).toThrow();
    expect(() => recordDetachedMenuTransition(failed.events, { type: "OPEN_ONCE", operationReturnStatus: "SUCCEEDED" })).toThrow();
    expect(() => recordDetachedMenuTransition(failed.events, { type: "CLOSE_OWN_MENU_ONCE", operationReturnStatus: "SUCCEEDED" })).toThrow();
    const cleanup = recordDetachedMenuTransition(failed.events, { type: "CLOSE_OWN_MENU_ONCE", operationReturnStatus: "FAILED", exactTaskControlVerified: true, observedExpanded: true });
    const complete = recordDetachedMenuTransition(cleanup.events, { type: "CLOSURE_VERIFICATION", sample: ui.sample("CLOSURE_VERIFICATION") });
    expect(complete).toMatchObject({ cleanupCommandReturnStatus: "FAILED", closureVerification: "VERIFIED_CLOSED", status: "FINISHED_WITH_FAILURE" });
  });
  it("allows a recorded post-opening block to skip remaining ordinary observations", () => {
    const { events, ui } = sequence();
    const blocked = recordDetachedMenuTransition(events.slice(0, 3), { type: "BLOCKED", reasonCode: "SUPPORTED_CONTROL_FAILED" });
    expect(blocked.nextPermittedEvents).toEqual(["CLOSE_OWN_MENU_ONCE"]);
    const cleanup = recordDetachedMenuTransition(blocked.events, { type: "CLOSE_OWN_MENU_ONCE", operationReturnStatus: "SUCCEEDED" });
    const closed = recordDetachedMenuTransition(cleanup.events, { type: "CLOSURE_VERIFICATION", sample: ui.sample("CLOSURE_VERIFICATION") });
    expect(closed.operationCounts.boundedStateSamples).toBe(3);
  });
  it("keeps both exported functions self-contained under the actual tsx loader", () => {
    const script = `import { projectDetachedMenuDiagnostic as project, recordDetachedMenuTransition as record } from './scripts/detached-menu-diagnostic.mts';
      import { runInNewContext } from 'node:vm';
      const a = runInNewContext('('+project.toString()+')({phase:"CLOSED_BASELINE"})', {});
      const b = runInNewContext('('+record.toString()+')([], {type:"BLOCKED",reasonCode:"TEST_BLOCK"})', {});
      process.stdout.write(JSON.stringify([a.observationErrors,b.status]));`;
    expect(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" })).toBe('[["DOCUMENT_UNAVAILABLE"],"BLOCKED_BEFORE_OPEN"]');
  });
});
