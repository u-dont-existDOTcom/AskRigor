const byId = (id) => document.getElementById(id);

let currentContributionId = null;
let state = null;

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP_${response.status}`);
  return body;
}

function setStatus(message, isError = false) {
  const status = byId("form-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function showStep(step) {
  document.querySelectorAll("[data-step]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== step;
  });
  document.querySelectorAll("[data-step-marker]").forEach((marker) => {
    marker.classList.toggle("active", Number(marker.dataset.stepMarker) <= step);
  });
  if (step < 5) byId("contribution-complete").hidden = true;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function evidenceChip(text) {
  return textElement("span", "evidence-chip", text);
}

function renderFrontier(snapshot) {
  const container = byId("frontier-cards");
  container.replaceChildren();
  const contributions = new Map(
    snapshot.contributions.map((item) => [item.leadId, item]),
  );
  for (const card of snapshot.frontier.cards) {
    const contribution = contributions.get(card.leadId);
    const article = document.createElement("article");
    article.className = "lead-card";
    article.dataset.testid = `frontier-card-${card.reportedDirection.toLowerCase()}`;

    const topline = document.createElement("div");
    topline.className = "lead-topline";
    topline.append(
      textElement("h3", "", card.publicTitle),
      textElement(
        "span",
        `direction ${card.reportedDirection.toLowerCase().replaceAll("_", "-")}`,
        card.reportedDirection === "NO_CLEAR_CHANGE"
          ? "Non-remission comparator"
          : "Reported remission lead",
      ),
    );
    article.append(topline);
    article.append(textElement("p", "source-label", card.sourceDistanceLabel));

    const evidence = document.createElement("div");
    evidence.className = "evidence-row";
    evidence.append(
      evidenceChip(card.verificationState.replaceAll("_", " ")),
      evidenceChip(card.completenessBand),
      evidenceChip(card.evidenceCapability.replaceAll("_", " ")),
      evidenceChip(`lead v${card.leadVersion}`),
      evidenceChip(`${card.challengeCount} challenge${card.challengeCount === 1 ? "" : "s"}`),
    );
    article.append(evidence);

    const missing = contribution?.missingMaterialFields ?? [];
    if (missing.length > 0) {
      article.append(textElement("p", "label", "Still missing"));
      const list = document.createElement("ul");
      list.className = "missing-list";
      for (const field of missing) list.append(textElement("li", "", field));
      article.append(list);
    }

    if (contribution && !contribution.syntheticSeed) {
      const actions = document.createElement("div");
      actions.className = "lead-actions";
      for (const [label, action, kind] of [
        ["Challenge scope", "challenge", "secondary"],
        ["Add correction", "correct", "secondary"],
        ["Withdraw", "withdraw", "danger"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `button small ${kind}`;
        button.textContent = label;
        button.dataset.action = action;
        button.dataset.contributionId = contribution.contributionId;
        actions.append(button);
      }
      article.append(actions);
    }
    container.append(article);
  }

  const tombstones = byId("tombstones");
  tombstones.replaceChildren();
  for (const item of snapshot.tombstones) {
    tombstones.append(
      textElement(
        "div",
        "tombstone",
        `Withdrawn synthetic projection ${item.publicVersionId}: public content retained = no. Linked research dependencies require review.`,
      ),
    );
  }
}

function renderResearch(snapshot) {
  const boundary = snapshot.researchBoundary;
  const container = byId("research-boundary");
  container.replaceChildren();
  const cards = [
    [
      "Evidence check",
      boundary.evidenceCheck.matchedEvidenceStatus.replaceAll("_", " "),
      boundary.evidenceCheck.summary,
    ],
    ["Research question", `Version ${boundary.question.questionVersion}`, boundary.question.questionText],
    [
      "Draft proposal",
      `${boundary.proposal.proposalType.replaceAll("_", " ")} · recruitment inactive`,
      boundary.proposal.designSummary,
    ],
  ];
  for (const [title, status, copy] of cards) {
    const article = document.createElement("article");
    article.className = "research-card";
    article.append(
      textElement("p", "label", title),
      textElement("h3", "", status),
      textElement("p", "", copy),
    );
    container.append(article);
  }
  if (boundary.dependencyReviewRequired) {
    container.append(
      textElement(
        "p",
        "denominator-warning",
        `Source change requires review (${boundary.latestChangeReason}). Nothing is automatically reinterpreted or launched.`,
      ),
    );
  }
}

function render(snapshot) {
  state = snapshot;
  byId("gap-question").textContent = snapshot.gap.researchQuestion;
  byId("known-copy").textContent = snapshot.gap.known;
  byId("unresolved-copy").textContent = snapshot.gap.unresolved;
  byId("comparison-copy").textContent = snapshot.gap.comparisonNeed;
  byId("remission-count").textContent = snapshot.comparatorCoverage.remissionLeads;
  byId("comparator-count").textContent = snapshot.comparatorCoverage.nonRemissionComparators;
  byId("comparison-message").textContent = snapshot.comparatorCoverage.recruitmentMessage;
  renderFrontier(snapshot);
  renderResearch(snapshot);
}

async function refresh() {
  render(await request("/api/state"));
}

byId("provenance-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    const result = await request("/api/contributions/start", {
      method: "POST",
      body: JSON.stringify({ provenance: form.get("provenance") }),
    });
    currentContributionId = result.contributionId;
    setStatus("Synthetic draft opened. The next answer is stored before structured prompts.");
    showStep(2);
  } catch (error) {
    setStatus(error.message, true);
  }
});

byId("narrative-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    await request(`/api/contributions/${currentContributionId}/narrative`, {
      method: "POST",
      body: JSON.stringify({ narrative: form.get("narrative") }),
    });
    setStatus("Private synthetic account saved. Structured candidate fields are now unlocked.");
    showStep(3);
  } catch (error) {
    setStatus(error.message, true);
  }
});

byId("details-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    const body = {
      outcome: form.get("outcome"),
      exposure: form.get("exposure"),
      treatmentContext: form.get("treatmentContext"),
      timingKnown: form.has("timingKnown"),
      persistenceKnown: form.has("persistenceKnown"),
      baselineDocumented: form.has("baselineDocumented"),
      followupDocumented: form.has("followupDocumented"),
    };
    const response = await request(
      `/api/contributions/${currentContributionId}/details`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const preview = response.result.preview;
    byId("preview-title").textContent = preview.publicTitle;
    byId("preview-copy").textContent = preview.publicParaphrase;
    byId("preview-source").textContent = preview.sourceDistanceLabel;
    const limitations = byId("preview-limitations");
    limitations.replaceChildren();
    for (const item of preview.limitations) {
      limitations.append(textElement("li", "", item));
    }
    setStatus("Review the exact deidentified synthetic projection before opting in.");
    showStep(4);
  } catch (error) {
    setStatus(error.message, true);
  }
});

byId("consent-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    const response = await request(
      `/api/contributions/${currentContributionId}/publish`,
      {
        method: "POST",
        body: JSON.stringify({
          syntheticOnly: form.has("syntheticOnly"),
          publicLead: form.has("publicLead"),
          recontact: form.has("recontact"),
        }),
      },
    );
    render(response.state);
    showStep(5);
    byId("contribution-complete").hidden = false;
    byId("completion-title").textContent = "Bounded synthetic research lead added";
    byId("completion-copy").textContent =
      "The projection is visible below at its actual verification and completeness level. Use its controls to test challenge, correction, and withdrawal propagation.";
    setStatus("Bounded synthetic lead added at its actual evidence level. Correction, challenge, and withdrawal controls are now visible.");
    byId("frontier").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error.message, true);
  }
});

byId("frontier-cards").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  try {
    const response = await request(
      `/api/contributions/${button.dataset.contributionId}/${button.dataset.action}`,
      { method: "POST", body: "{}" },
    );
    render(response.state);
    const messages = {
      challenge: "Scope challenge recorded without changing evidence strength.",
      correct: "Correction created a contiguous version; remaining missingness is still visible.",
      withdraw: "Projection removed. A no-content tombstone and research dependency review remain.",
    };
    setStatus(messages[button.dataset.action]);
    if (button.dataset.action === "withdraw") {
      byId("completion-title").textContent = "Synthetic projection withdrawn";
      byId("completion-copy").textContent =
        "Public content was removed. A no-content tombstone remains and linked research dependencies require review.";
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

refresh().catch((error) => setStatus(error.message, true));
