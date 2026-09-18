#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat, readdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { chromium } from "playwright-core";

const STUDY_ID = "askrigor-mast-fresh-validation-round-2-20260918";
const DEVICE = "srv1894948";
const USER = "cloudbrowser";
const BROWSER = "Brave";
const CDP_ENDPOINT = "http://127.0.0.1:9222";
const CHATGPT_ORIGIN = "https://chatgpt.com";
const EXPECTED_MODEL = "GPT-5.6 Sol";
const EXPECTED_REASONING = "Extra High";
const EXPECTED_REASONING_ORDINAL = "4 of 5";
const NORMALIZATION = "LINE_ENDINGS_TO_LF_ONLY";
const MAXIMUM_ATTEMPTS = 2;
const RESPONSE_TIMEOUT_MS = 30 * 60 * 1_000;
const RESPONSE_STABILITY_MS = 5_000;

const now = () => new Date().toISOString();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalize = (value) => value.replace(/\r\n?/gu, "\n");
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function textIdentity(value) {
  const normalized = normalize(value);
  const bytes = Buffer.from(normalized, "utf8");
  return {
    normalization: NORMALIZATION,
    utf8Bytes: bytes.byteLength,
    codePoints: [...normalized].length,
    sha256: sha256(bytes),
  };
}

function requiredArgument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`MISSING_ARGUMENT_${name.replace(/^--/u, "").replace(/-/gu, "_").toUpperCase()}`);
  return process.argv[index + 1];
}

async function exists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return false;
    throw error;
  }
}

async function writePrivate(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, data, { mode: 0o600 });
  await rename(temporary, path);
}

async function writePrivateJson(path, value) {
  await writePrivate(path, Buffer.from(canonicalJson(value), "utf8"));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function safeFailureCode(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const candidate = raw.split("\n", 1)[0].replace(/[^A-Za-z0-9_]+/gu, "_").replace(/^_+|_+$/gu, "").toUpperCase();
  return (candidate || "VPS_TRANSPORT_FAILED").slice(0, 180);
}

function inventoryPages(contexts) {
  return contexts.flatMap((context) => context.pages()).map((page) => ({ page, url: page.url() }));
}

function selectChatGptPage(contexts) {
  const inventory = inventoryPages(contexts);
  const matches = inventory.filter(({ url }) => {
    try { return new URL(url).origin === CHATGPT_ORIGIN; } catch { return false; }
  });
  if (matches.length === 0 && inventory.length === 1 && inventory[0].url === "about:blank") {
    return { page: inventory[0].page, tabCount: 1, bootstrapRequired: true };
  }
  if (matches.length !== 1) throw new Error(matches.length ? "CHATGPT_CONTENT_TAB_AMBIGUOUS" : "CHATGPT_CONTENT_TAB_NOT_FOUND");
  if (inventory.length > 2) throw new Error("BROWSER_TAB_CEILING_EXCEEDED");
  return { page: matches[0].page, tabCount: inventory.length, bootstrapRequired: false };
}

async function ensureChatGptPage(contexts) {
  const selected = selectChatGptPage(contexts);
  if (selected.bootstrapRequired) await selected.page.goto(`${CHATGPT_ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  return selected;
}

async function connect() {
  return chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 60_000 });
}

async function safePageState(page) {
  await page.waitForLoadState("domcontentloaded");
  return page.evaluate(() => {
    const visible = (element) => element instanceof HTMLElement
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== "hidden"
      && getComputedStyle(element).display !== "none";
    const label = (element) => ((element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/gu, " "));
    const composers = [...document.querySelectorAll("#prompt-textarea, [data-testid='prompt-textarea'], textarea[aria-label='Chat with ChatGPT']")].filter(visible);
    const loginControls = [...document.querySelectorAll("a[href*='/auth/login'], button[data-testid='login-button']")].filter(visible);
    const modelControls = [...document.querySelectorAll("form button[aria-haspopup='menu']")]
      .filter(visible).filter((element) => element.getAttribute("data-testid") !== "composer-plus-btn")
      .filter((element) => Boolean(element.closest("form")?.querySelector("#prompt-textarea, [data-testid='prompt-textarea']")));
    const temporaryOn = [...document.querySelectorAll("button")].filter(visible).filter((element) => label(element) === "Turn off temporary chat");
    const temporaryLabels = [...document.querySelectorAll("button")].filter(visible).map(label).filter((value) => /temporary/iu.test(value));
    const personalization = [...document.querySelectorAll("button")].filter(visible).map(label).filter((value) => value === "Personalized" || value === "Unpersonalized");
    return {
      origin: location.origin,
      pathname: location.pathname,
      composerCount: composers.length,
      loginRequired: location.pathname.startsWith("/auth/") || loginControls.length > 0,
      modelControlCount: modelControls.length,
      modelControlLabels: modelControls.map(label),
      temporaryOnCount: temporaryOn.length,
      temporaryLabels,
      personalization,
    };
  });
}

async function probe() {
  const browser = await connect();
  const { page, tabCount } = await ensureChatGptPage(browser.contexts());
  const state = await safePageState(page);
  const authenticated = state.origin === CHATGPT_ORIGIN && state.composerCount === 1 && !state.loginRequired;
  process.stdout.write(canonicalJson({
    schemaVersion: 1,
    studyId: STUDY_ID,
    device: DEVICE,
    user: USER,
    browser: BROWSER,
    status: authenticated ? "AUTHENTICATED" : "AUTHENTICATION_REQUIRED",
    cdpEndpoint: CDP_ENDPOINT,
    cdpAttached: true,
    authenticated,
    tabCount,
    observedAt: now(),
    ...state,
  }));
  process.exit(authenticated ? 0 : 2);
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest?.studyId !== STUDY_ID || manifest?.device !== DEVICE || manifest?.user !== USER) {
    throw new Error("VPS_PACKET_MANIFEST_IDENTITY_INVALID");
  }
  if (!Array.isArray(manifest.records) || manifest.records.length !== 144) throw new Error("VPS_PACKET_MANIFEST_COVERAGE_INVALID");
  const ids = new Set();
  const sequences = new Set();
  for (const record of manifest.records) {
    if (!Number.isInteger(record.sequence) || record.sequence < 1 || record.sequence > 144
      || !/^run-[0-9a-f]{24}$/u.test(record.opaqueInputId)
      || !new RegExp(`^${record.sequence.toString().padStart(3, "0")}-${record.opaqueInputId}\\.txt$`, "u").test(record.fileName)
      || record.sourceRelativePath !== `generation/inputs/${record.fileName}`
      || !/^[0-9a-f]{64}$/u.test(record.expectedSha256)
      || record.sourceSha256 !== record.expectedSha256
      || !Number.isInteger(record.sourceUtf8Bytes) || record.sourceUtf8Bytes <= 0) {
      throw new Error("VPS_PACKET_MANIFEST_RECORD_INVALID");
    }
    ids.add(record.opaqueInputId);
    sequences.add(record.sequence);
  }
  if (ids.size !== 144 || sequences.size !== 144) throw new Error("VPS_PACKET_MANIFEST_DUPLICATE");
  return manifest;
}

async function verifyTransfer() {
  const workspace = resolve(requiredArgument("--workspace"));
  const manifestPath = resolve(requiredArgument("--manifest"));
  const manifest = validateManifest(await readJson(manifestPath));
  const records = [];
  for (const source of [...manifest.records].sort((left, right) => left.sequence - right.sequence)) {
    const path = join(workspace, "packets", source.fileName);
    const bytes = await readFile(path);
    const destinationSha256 = sha256(bytes);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const normalized = textIdentity(decoded);
    if (destinationSha256 !== source.expectedSha256 || bytes.byteLength !== source.sourceUtf8Bytes
      || normalized.sha256 !== source.expectedSha256 || normalized.utf8Bytes !== bytes.byteLength) {
      throw new Error(`VPS_PACKET_DESTINATION_MISMATCH_${source.sequence}`);
    }
    records.push({
      sequence: source.sequence,
      opaqueInputId: source.opaqueInputId,
      sourceRelativePath: source.sourceRelativePath,
      destinationRelativePath: `packets/${source.fileName}`,
      expectedSha256: source.expectedSha256,
      sourceSha256: source.sourceSha256,
      destinationSha256,
      sourceUtf8Bytes: source.sourceUtf8Bytes,
      destinationUtf8Bytes: bytes.byteLength,
      eligible: true,
    });
  }
  const receipt = {
    schemaVersion: 1,
    studyId: STUDY_ID,
    device: DEVICE,
    user: USER,
    privateRoot: workspace,
    transferredAt: now(),
    records,
  };
  const receiptPath = join(workspace, "packet-transfer-receipt.json");
  await writePrivateJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({ status: "VPS_PACKET_TRANSFER_VERIFIED", packetCount: records.length, receiptSha256: sha256(Buffer.from(canonicalJson(receipt), "utf8")) })}\n`);
  process.exit(0);
}

function exactVisibleButton(page, text) {
  return page.getByRole("button", { name: text, exact: true }).filter({ visible: true });
}

async function domClick(locator, failureCode) {
  if (await locator.count() !== 1) throw new Error(failureCode);
  await locator.evaluate((element) => element.click());
}

async function waitForExactButton(page, text, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const locator = exactVisibleButton(page, text);
    if (await locator.count() === 1) return locator;
    await sleep(100);
  }
  throw new Error(`BUTTON_NOT_OBSERVED_${text.replace(/\s+/gu, "_").toUpperCase()}`);
}

async function establishFreshTemporaryUnpersonalized(page) {
  await page.goto(`${CHATGPT_ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#prompt-textarea, [data-testid='prompt-textarea']").filter({ visible: true }).waitFor({ state: "visible", timeout: 60_000 });
  const safe = await safePageState(page);
  if (safe.origin !== CHATGPT_ORIGIN || safe.pathname !== "/" || safe.loginRequired || safe.composerCount !== 1) {
    throw new Error(safe.loginRequired ? "CHATGPT_AUTHENTICATION_REQUIRED" : "FRESH_CHAT_SURFACE_INVALID");
  }
  const offControl = exactVisibleButton(page, "Temporary chat");
  if (await offControl.count() === 1) {
    await domClick(offControl, "TEMPORARY_CHAT_CONTROL_INVALID");
    await waitForExactButton(page, "Turn off temporary chat");
  } else if (await exactVisibleButton(page, "Turn off temporary chat").count() !== 1) {
    throw new Error("TEMPORARY_CHAT_STATE_UNPROVABLE");
  }

  let personalizationState = null;
  const personalizationDeadline = Date.now() + 10_000;
  while (Date.now() < personalizationDeadline) {
    if (await exactVisibleButton(page, "Personalized").count() === 1) { personalizationState = "Personalized"; break; }
    if (await exactVisibleButton(page, "Unpersonalized").count() === 1) { personalizationState = "Unpersonalized"; break; }
    await sleep(100);
  }
  if (personalizationState === "Personalized") {
    await domClick(exactVisibleButton(page, "Personalized"), "PERSONALIZATION_CONTROL_INVALID");
    const unpersonalizedRadio = page.locator("button[role='radio']").filter({ hasText: /^Unpersonalized/iu, visible: true });
    await domClick(unpersonalizedRadio, "UNPERSONALIZED_OPTION_NOT_UNIQUE");
    await waitForExactButton(page, "Unpersonalized");
    await page.keyboard.press("Escape");
    await sleep(150);
  } else if (personalizationState !== "Unpersonalized") {
    throw new Error("UNPERSONALIZED_STATE_UNPROVABLE");
  }

  const counts = await page.evaluate(() => ({
    user: document.querySelectorAll("[data-message-author-role='user']").length,
    assistant: document.querySelectorAll("[data-message-author-role='assistant']").length,
  }));
  if (counts.user !== 0 || counts.assistant !== 0) throw new Error("FRESH_CHAT_MESSAGE_COUNT_NONZERO");
  return counts;
}

async function modelControl(page) {
  const selector = "form:has(#prompt-textarea) button[aria-haspopup='menu']:not([data-testid='composer-plus-btn']), form:has([data-testid='prompt-textarea']) button[aria-haspopup='menu']:not([data-testid='composer-plus-btn'])";
  const controls = page.locator(selector).filter({ visible: true });
  if (await controls.count() !== 1) throw new Error("MODEL_CONTROL_NOT_UNIQUE");
  return controls;
}

async function openModelMenu(page) {
  const control = await modelControl(page);
  const menus = page.locator("[role='menu']").filter({ visible: true });
  if (await menus.count() === 1) return menus;
  await control.click({ force: true, timeout: 10_000 });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await menus.count() === 1) return menus;
    await sleep(100);
  }
  throw new Error(`MODEL_MENU_COUNT_${await menus.count()}`);
}

async function inspectOpenModelMenu(page) {
  return page.evaluate(({ expectedModel, expectedReasoning }) => {
    const visible = (element) => element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    const label = (element) => ((element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/gu, " "));
    const roots = [...document.querySelectorAll("[role='menu']")].filter(visible);
    if (roots.length !== 1) return { valid: false, failureCode: "MODEL_MENU_NOT_UNIQUE" };
    const root = roots[0];
    const options = [...root.querySelectorAll("button, [role='menuitem'], [role='menuitemradio'], [role='option']")].filter(visible);
    const modelMatches = options.filter((element) => label(element) === expectedModel);
    const sliders = [...root.querySelectorAll("[role='slider']")].filter(visible);
    const indicators = [...root.querySelectorAll("[role='menuitem'][aria-label='Select model']")].filter(visible);
    const leafLabels = indicators.length === 1 ? [...indicators[0].querySelectorAll("*")]
      .filter(visible).filter((element) => element.children.length === 0)
      .map((element) => (element.textContent || "").trim().replace(/\s+/gu, " ")).filter(Boolean) : [];
    const slider = sliders.length === 1 ? sliders[0] : null;
    return {
      valid: modelMatches.length === 1 && sliders.length === 1,
      modelMatchCount: modelMatches.length,
      modelSelected: modelMatches.length === 1 && (
        modelMatches[0].getAttribute("aria-checked") === "true"
        || modelMatches[0].getAttribute("aria-selected") === "true"
        || modelMatches[0].getAttribute("data-state") === "checked"
        || Boolean(modelMatches[0].querySelector("[aria-checked='true'], [aria-selected='true'], [data-state='checked']"))
      ),
      sliderCount: sliders.length,
      sliderNow: slider ? Number(slider.getAttribute("aria-valuenow")) : null,
      sliderMin: slider ? Number(slider.getAttribute("aria-valuemin")) : null,
      sliderMax: slider ? Number(slider.getAttribute("aria-valuemax")) : null,
      reasoningVisible: leafLabels.includes(expectedReasoning),
    };
  }, { expectedModel: EXPECTED_MODEL, expectedReasoning: EXPECTED_REASONING });
}

async function ensureExactModelAndReasoning(page) {
  let menu = await openModelMenu(page);
  let modelOption = menu.locator("button, [role='menuitem'], [role='menuitemradio'], [role='option']")
    .filter({ hasText: new RegExp(`^${EXPECTED_MODEL.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"), visible: true });
  if (await modelOption.count() !== 1) throw new Error("EXPECTED_MODEL_OPTION_NOT_UNIQUE");
  let observation = await inspectOpenModelMenu(page);
  if (!observation.modelSelected) {
    await domClick(modelOption, "EXPECTED_MODEL_OPTION_NOT_UNIQUE");
    await sleep(300);
    menu = await openModelMenu(page);
    modelOption = menu.locator("button, [role='menuitem'], [role='menuitemradio'], [role='option']")
      .filter({ hasText: new RegExp(`^${EXPECTED_MODEL.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"), visible: true });
    observation = await inspectOpenModelMenu(page);
  }
  if (!observation.valid || !observation.modelSelected) throw new Error("EXPECTED_MODEL_SELECTION_UNPROVABLE");
  if (observation.sliderMin !== 0 || observation.sliderMax !== 4 || !Number.isInteger(observation.sliderNow)) {
    throw new Error("THINKING_SLIDER_BOUNDS_INVALID");
  }
  const slider = menu.locator("[role='slider']").filter({ visible: true });
  while (observation.sliderNow !== 3) {
    await slider.focus();
    await slider.press(observation.sliderNow < 3 ? "ArrowRight" : "ArrowLeft");
    await sleep(150);
    observation = await inspectOpenModelMenu(page);
  }
  if (!observation.reasoningVisible) throw new Error("EXTRA_HIGH_VISIBLE_LABEL_UNPROVABLE");
  await page.keyboard.press("Escape");
  const ordinal = `${observation.sliderNow - observation.sliderMin + 1} of ${observation.sliderMax - observation.sliderMin + 1}`;
  if (ordinal !== EXPECTED_REASONING_ORDINAL) throw new Error("EXTRA_HIGH_ORDINAL_MISMATCH");
  return observation;
}

async function attestUi(page, tabCount, sendEnabled) {
  const safe = await safePageState(page);
  const counts = await page.evaluate(() => ({
    user: document.querySelectorAll("[data-message-author-role='user']").length,
    assistant: document.querySelectorAll("[data-message-author-role='assistant']").length,
    attachments: document.querySelectorAll("[data-testid*='attachment'], button[aria-label^='Remove file']").length,
  }));
  if (safe.origin !== CHATGPT_ORIGIN || safe.loginRequired || safe.composerCount !== 1 || safe.temporaryOnCount !== 1
    || safe.personalization.length !== 1 || safe.personalization[0] !== "Unpersonalized"
    || counts.user !== 0 || counts.assistant !== 0 || counts.attachments !== 0 || !sendEnabled || tabCount < 1 || tabCount > 2) {
    throw new Error("GENERATION_UI_ATTESTATION_FAILED");
  }
  return {
    schemaVersion: 1,
    observedAt: now(),
    origin: CHATGPT_ORIGIN,
    modelVisibleLabel: EXPECTED_MODEL,
    reasoningVisibleLabel: EXPECTED_REASONING,
    reasoningOrdinal: EXPECTED_REASONING_ORDINAL,
    chatMode: "TEMPORARY",
    personalization: "UNPERSONALIZED",
    authenticated: true,
    freshConversation: true,
    userMessageCount: 0,
    assistantMessageCount: 0,
    attachmentCount: 0,
    sendEnabled: true,
  };
}

async function composerObservation(page) {
  return page.evaluate(async () => {
    const composers = document.querySelectorAll("#prompt-textarea");
    if (composers.length !== 1) return { failureCode: "COMPOSER_NOT_UNIQUE" };
    const composer = composers[0];
    const extraction = composer.tagName === "TEXTAREA" ? "TEXTAREA_VALUE" : "CONTENTEDITABLE_INNER_TEXT";
    const raw = composer.tagName === "TEXTAREA" ? composer.value : composer.innerText;
    const normalized = raw.replace(/\r\n?/gu, "\n");
    const bytes = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      origin: location.origin,
      composerSelector: "#prompt-textarea",
      composerCount: composers.length,
      extraction,
      normalization: "LINE_ENDINGS_TO_LF_ONLY",
      composerUtf8Bytes: bytes.byteLength,
      composerCodePoints: Array.from(normalized).length,
      composerSha256: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(""),
    };
  });
}

async function insertAndVerifyComposer(page, packetText, source) {
  const composer = page.locator("#prompt-textarea").filter({ visible: true });
  if (await composer.count() !== 1) throw new Error("COMPOSER_NOT_UNIQUE");
  await composer.evaluate((element, text) => {
    element.focus();
    if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setter) throw new Error("TEXTAREA_VALUE_SETTER_UNAVAILABLE");
      setter.call(element, text);
    } else if (element instanceof HTMLElement && element.getAttribute("contenteditable") === "true") {
      element.innerText = text;
    } else throw new Error("COMPOSER_NOT_EDITABLE");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: null }));
  }, packetText);
  const observation = await composerObservation(page);
  if (observation.failureCode || observation.normalization !== NORMALIZATION
    || observation.composerUtf8Bytes !== source.utf8Bytes
    || observation.composerCodePoints !== source.codePoints
    || observation.composerSha256 !== source.sha256) {
    const error = new Error("GENERATION_COMPOSER_SOURCE_MISMATCH");
    error.observedComposerSha256 = observation.composerSha256 ?? null;
    throw error;
  }
  return observation;
}

async function findSendButton(page) {
  const send = page.locator("button[data-testid='send-button']").filter({ visible: true });
  if (await send.count() !== 1 || !await send.isEnabled()) throw new Error("SEND_BUTTON_NOT_ENABLED");
  return send;
}

async function waitForCompleteResponse(page) {
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  let stableSha = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => {
      const assistants = [...document.querySelectorAll("[data-message-author-role='assistant']")];
      const users = document.querySelectorAll("[data-message-author-role='user']").length;
      const stop = [...document.querySelectorAll("button[data-testid='stop-button'], button[aria-label*='Stop generating']")]
        .some((element) => element instanceof HTMLElement && element.getClientRects().length > 0);
      const last = assistants.at(-1);
      return { assistantCount: assistants.length, userCount: users, stop, text: last instanceof HTMLElement ? last.innerText : "" };
    });
    if (snapshot.userCount === 1 && snapshot.assistantCount === 1 && !snapshot.stop && snapshot.text.trim()) {
      const digest = sha256(Buffer.from(snapshot.text, "utf8"));
      if (digest !== stableSha) { stableSha = digest; stableSince = Date.now(); }
      if (Date.now() - stableSince >= RESPONSE_STABILITY_MS) return snapshot.text;
    } else { stableSha = null; stableSince = 0; }
    await sleep(1_000);
  }
  throw new Error("RESPONSE_CAPTURE_TIMEOUT_AMBIGUOUS");
}

async function captureProvenance(page) {
  return page.evaluate(() => {
    const assistants = [...document.querySelectorAll("[data-message-author-role='assistant']")];
    const last = assistants.at(-1);
    if (!(last instanceof HTMLElement)) return { citationUrls: [], toolProvenance: [] };
    const citationUrls = [...new Set([...last.querySelectorAll("a[href]")].map((anchor) => anchor.href).filter((href) => /^https?:\/\//u.test(href)))];
    const toolElements = [...document.querySelectorAll("[data-message-author-role='tool'], [data-testid*='tool-call'], [data-testid*='tool-result']")];
    const toolProvenance = toolElements.map((element) => (
      element.getAttribute("data-testid") || element.getAttribute("data-message-author-role") || "TOOL_UI"
    )).filter(Boolean);
    return { citationUrls, toolProvenance };
  });
}

async function priorAttemptCount(runDirectory) {
  if (!await exists(runDirectory)) return 0;
  return (await readdir(runDirectory)).filter((name) => /^attempt-\d+-failure\.json$/u.test(name)).length;
}

async function recordFailure({ runDirectory, runId, attempt, stage, sourceSha256, observedComposerSha256, messageMayHaveBeenSent, error }) {
  const receipt = {
    schemaVersion: 1,
    studyId: STUDY_ID,
    opaqueInputId: runId,
    attempt,
    stage,
    failureCode: safeFailureCode(error),
    sourceSha256,
    observedComposerSha256: observedComposerSha256 ?? null,
    messageMayHaveBeenSent,
    retryable: !messageMayHaveBeenSent && attempt < MAXIMUM_ATTEMPTS,
    stoppedBeforeSend: !messageMayHaveBeenSent,
    recordedAt: now(),
  };
  await writePrivateJson(join(runDirectory, `attempt-${attempt}-failure.json`), receipt);
  if (messageMayHaveBeenSent) await writePrivateJson(join(runDirectory, "ambiguity-receipt.json"), receipt);
  return receipt;
}

async function runAttempt({ workspace, record, attempt }) {
  const runDirectory = join(workspace, "runs", record.opaqueInputId);
  let stage = "PACKET_DESTINATION_VERIFY";
  let messageMayHaveBeenSent = false;
  let observedComposerSha256 = null;
  let sourceSha256 = record.expectedSha256;

  try {
    const packetPath = join(workspace, "packets", record.fileName);
    const packetBytes = await readFile(packetPath);
    if (sha256(packetBytes) !== record.expectedSha256 || packetBytes.byteLength !== record.sourceUtf8Bytes) throw new Error("VPS_PACKET_DESTINATION_MISMATCH");
    const packetText = normalize(new TextDecoder("utf-8", { fatal: true }).decode(packetBytes));
    const source = textIdentity(packetText);
    sourceSha256 = source.sha256;
    if (source.sha256 !== record.expectedSha256 || source.utf8Bytes !== record.sourceUtf8Bytes) throw new Error("VPS_PACKET_NORMALIZED_IDENTITY_MISMATCH");
    stage = "CDP_ATTACH";
    const browser = await connect();
    const { page, tabCount } = await ensureChatGptPage(browser.contexts());
    stage = "AUTH_VERIFY";
    const initial = await safePageState(page);
    if (initial.loginRequired || initial.composerCount !== 1) throw new Error("CHATGPT_AUTHENTICATION_REQUIRED");
    stage = "FRESH_CHAT";
    await establishFreshTemporaryUnpersonalized(page);
    stage = "MODEL_SELECT";
    await ensureExactModelAndReasoning(page);
    stage = "COMPOSER_INSERT";
    const composer = await insertAndVerifyComposer(page, packetText, source);
    observedComposerSha256 = composer.composerSha256;
    stage = "COMPOSER_VERIFY";
    const send = await findSendButton(page);
    stage = "UI_ATTEST";
    const ui = await attestUi(page, tabCount, true);
    const verifiedAt = now();
    const verifiedReceipt = {
      schemaVersion: 1,
      studyId: STUDY_ID,
      opaqueInputId: record.opaqueInputId,
      attempt,
      state: "COMPOSER_VERIFIED",
      normalization: NORMALIZATION,
      sourceUtf8Bytes: source.utf8Bytes,
      sourceCodePoints: source.codePoints,
      sourceSha256: source.sha256,
      destinationPacketUtf8Bytes: source.utf8Bytes,
      destinationPacketCodePoints: source.codePoints,
      destinationPacketSha256: source.sha256,
      composerUtf8Bytes: composer.composerUtf8Bytes,
      composerCodePoints: composer.composerCodePoints,
      composerSha256: composer.composerSha256,
      exactEquality: true,
      ui,
      vpsDevice: DEVICE,
      vpsUser: USER,
      cdpEndpoint: CDP_ENDPOINT,
      cdpAttached: true,
      browser: BROWSER,
      tabCount,
      citationUrls: [],
      toolProvenance: [],
      responseArtifactSha256: null,
      verifiedAt,
      sentAt: null,
    };
    await writePrivateJson(join(runDirectory, `attempt-${attempt}-pre-send.json`), verifiedReceipt);
    stage = "SUBMIT";
    messageMayHaveBeenSent = true;
    await send.click({ timeout: 10_000 });
    const sentAt = now();
    await writePrivateJson(join(runDirectory, `attempt-${attempt}-sent.json`), { ...verifiedReceipt, state: "SENT", sentAt });
    stage = "RESPONSE_CAPTURE";
    const response = await waitForCompleteResponse(page);
    const provenance = await captureProvenance(page);
    if (provenance.toolProvenance.length > 0) throw new Error("GENERATION_TOOL_USE_FORBIDDEN");
    const responseBytes = Buffer.from(response, "utf8");
    const responseSha256 = sha256(responseBytes);
    const url = new URL(page.url());
    const conversationMatch = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/u);
    if (!conversationMatch) throw new Error("TEMPORARY_CONVERSATION_ID_UNPROVABLE");
    const completedAt = now();
    const provider = {
      surface: "CHATGPT_CONSUMER",
      modelVisibleLabel: EXPECTED_MODEL,
      reasoningVisibleLabel: EXPECTED_REASONING,
      reasoningOrdinal: null,
      conversationId: conversationMatch[1],
      submittedAt: sentAt,
      completedAt,
      toolsUsed: false,
      freshConversation: true,
      personalization: "UNPERSONALIZED",
      chatMode: "TEMPORARY",
    };
    const receipt = {
      ...verifiedReceipt,
      state: "RESPONSE_COMPLETE",
      citationUrls: provenance.citationUrls,
      toolProvenance: provenance.toolProvenance,
      responseArtifactSha256: responseSha256,
      sentAt,
    };
    await writePrivate(join(runDirectory, "response.txt"), responseBytes);
    await writePrivateJson(join(runDirectory, "provider.json"), provider);
    await writePrivateJson(join(runDirectory, "provenance.json"), { schemaVersion: 1, studyId: STUDY_ID, opaqueInputId: record.opaqueInputId, capturedAt: completedAt, ...provenance });
    await writePrivateJson(join(runDirectory, "transport-receipt.json"), receipt);
    await writePrivateJson(join(runDirectory, "response-ready.json"), { schemaVersion: 1, studyId: STUDY_ID, opaqueInputId: record.opaqueInputId, responseSha256, transportReceiptSha256: sha256(Buffer.from(canonicalJson(receipt), "utf8")), recordedAt: completedAt });
    return { status: "RESPONSE_READY", opaqueInputId: record.opaqueInputId, sequence: record.sequence, responseSha256 };
  } catch (error) {
    await recordFailure({ runDirectory, runId: record.opaqueInputId, attempt, stage, sourceSha256, observedComposerSha256, messageMayHaveBeenSent, error });
    throw error;
  }
}

async function runOne() {
  const workspace = resolve(requiredArgument("--workspace"));
  const manifest = validateManifest(await readJson(resolve(requiredArgument("--manifest"))));
  const runId = requiredArgument("--run-id");
  const record = manifest.records.find((candidate) => candidate.opaqueInputId === runId);
  if (!record) throw new Error("VPS_RUN_ID_UNKNOWN");
  const runDirectory = join(workspace, "runs", runId);
  if (await exists(join(runDirectory, "local-sealed.json"))) {
    process.stdout.write(`${JSON.stringify({ status: "SKIP_SEALED", opaqueInputId: runId, sequence: record.sequence })}\n`);
    process.exit(0);
  }
  if (await exists(join(runDirectory, "response-ready.json"))) {
    process.stdout.write(`${JSON.stringify({ status: "SKIP_RESPONSE_READY", opaqueInputId: runId, sequence: record.sequence })}\n`);
    process.exit(0);
  }
  if (await exists(join(runDirectory, "ambiguity-receipt.json"))) throw new Error("POST_SEND_AMBIGUITY_REQUIRES_STOP");
  if (await exists(runDirectory)) {
    const sentAttempts = (await readdir(runDirectory)).map((name) => /^attempt-(\d+)-sent\.json$/u.exec(name)?.[1])
      .filter(Boolean).map(Number).sort((left, right) => left - right);
    if (sentAttempts.length > 0) {
      const attempt = sentAttempts.at(-1);
      await recordFailure({
        runDirectory,
        runId,
        attempt,
        stage: "RESPONSE_CAPTURE",
        sourceSha256: record.expectedSha256,
        observedComposerSha256: record.expectedSha256,
        messageMayHaveBeenSent: true,
        error: new Error("INTERRUPTED_AFTER_SEND_CAPTURE_AMBIGUOUS"),
      });
      throw new Error("POST_SEND_AMBIGUITY_REQUIRES_STOP");
    }
  }
  let prior = await priorAttemptCount(runDirectory);
  while (prior < MAXIMUM_ATTEMPTS) {
    const attempt = prior + 1;
    try {
      const result = await runAttempt({ workspace, record, attempt });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exit(0);
    } catch (error) {
      if (await exists(join(runDirectory, "ambiguity-receipt.json"))) throw error;
      prior = await priorAttemptCount(runDirectory);
      if (prior >= MAXIMUM_ATTEMPTS) throw error;
    }
  }
  throw new Error("GENERATION_TRANSPORT_ATTEMPT_CEILING_EXHAUSTED");
}

async function markSealed() {
  const workspace = resolve(requiredArgument("--workspace"));
  const runId = requiredArgument("--run-id");
  const captureSha256 = requiredArgument("--capture-sha256");
  if (!/^run-[0-9a-f]{24}$/u.test(runId) || !/^[0-9a-f]{64}$/u.test(captureSha256)) throw new Error("LOCAL_SEAL_ARGUMENT_INVALID");
  const runDirectory = join(workspace, "runs", runId);
  const ready = await readJson(join(runDirectory, "response-ready.json"));
  const response = await readFile(join(runDirectory, "response.txt"));
  if (ready.responseSha256 !== sha256(response)) throw new Error("LOCAL_SEAL_RESPONSE_IDENTITY_MISMATCH");
  const receipt = { schemaVersion: 1, studyId: STUDY_ID, opaqueInputId: runId, responseSha256: ready.responseSha256, localCaptureSha256: captureSha256, sealedAt: now() };
  await writePrivateJson(join(runDirectory, "local-sealed.json"), receipt);
  process.stdout.write(`${JSON.stringify({ status: "LOCAL_SEAL_RECORDED", opaqueInputId: runId, responseSha256: ready.responseSha256 })}\n`);
  process.exit(0);
}

async function preSendAcceptance() {
  const browser = await connect();
  const { page, tabCount } = await ensureChatGptPage(browser.contexts());
  await establishFreshTemporaryUnpersonalized(page);
  const model = await ensureExactModelAndReasoning(page);
  const sourceText = `${"synthetic-vps-cdp-exactness-αβγ".repeat(5_600)}\nterminal`;
  const source = textIdentity(sourceText);
  if (source.utf8Bytes < 167_433) throw new Error("SYNTHETIC_PACKET_SIZE_TOO_SMALL");
  const composer = await insertAndVerifyComposer(page, sourceText, source);
  await findSendButton(page);
  const ui = await attestUi(page, tabCount, true);
  await page.locator("#prompt-textarea").filter({ visible: true }).evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) element.value = "";
    else if (element instanceof HTMLElement) element.innerText = "";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "deleteContent", data: null }));
  });
  const cleared = await composerObservation(page);
  if (cleared.composerUtf8Bytes !== 0) throw new Error("SYNTHETIC_COMPOSER_CLEAR_FAILED");
  process.stdout.write(`${JSON.stringify({
    status: "PRE_SEND_ACCEPTANCE_PASS",
    cdpAttached: true,
    authenticated: ui.authenticated,
    tabCount,
    sourceUtf8Bytes: source.utf8Bytes,
    sourceSha256: source.sha256,
    composerSha256: composer.composerSha256,
    modelVisibleLabel: ui.modelVisibleLabel,
    reasoningVisibleLabel: ui.reasoningVisibleLabel,
    reasoningOrdinal: ui.reasoningOrdinal,
    chatMode: ui.chatMode,
    personalization: ui.personalization,
    modelSelected: model.modelSelected,
    sent: false,
  })}\n`);
  process.exit(0);
}

const command = process.argv[2];
try {
  if (command === "probe") await probe();
  else if (command === "verify-transfer") await verifyTransfer();
  else if (command === "run-one") await runOne();
  else if (command === "mark-sealed") await markSealed();
  else if (command === "pre-send-acceptance") await preSendAcceptance();
  else throw new Error(`UNKNOWN_COMMAND_${command ?? "MISSING"}`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: "FAILED", failureCode: safeFailureCode(error), recordedAt: now() })}\n`);
  process.exit(1);
}
