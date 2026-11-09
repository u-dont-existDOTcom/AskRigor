/**
 * An audit's checks against the document it was read from (AskRigor#431). A run sent a study audit with the paper's DOI
 * as source_primary_identifier, while the document it had acquired was identified by its PMCID; one combined
 * "source identity or completeness mismatch" didn't say which, and the audit was left unrepaired. Each check now fails
 * on its own, with the value the audit sent and the one the acquisition holds. Both come from the AI's own calls, an
 * identifier and a hash of a public document, so returning them discloses nothing new.
 */

/** Which source check failed: the primary identifier, the content SHA-256, or the document's completeness. */
export type AuditSourceCheck = "identifier" | "content_sha256" | "completeness";

/** One failed check: what the audit sent, and what the acquired document holds. */
export interface AuditSourceMismatch {
  readonly check: AuditSourceCheck;
  readonly sent: string;
  readonly expected: string;
}

/** The acquired document's source fields the checks read. */
interface AuditedSource {
  readonly primary_identifier: string;
  readonly content_sha256: string;
  readonly document_completeness?: string;
}

/** An audit's own source fields. */
interface AuditSourceFields {
  readonly source_primary_identifier: string;
  readonly source_content_sha256: string;
}

const FULL_TEXT = "full_text_with_body";

/** The checks that fail, each exactly: equal strings pass; nothing else is read. */
export function auditSourceMismatches(
  source: AuditedSource,
  submission: AuditSourceFields,
  checkCompleteness: boolean
): AuditSourceMismatch[] {
  return [
    ...(submission.source_primary_identifier === source.primary_identifier ? [] : [{
      check: "identifier" as const, sent: submission.source_primary_identifier, expected: source.primary_identifier
    }]),
    ...(submission.source_content_sha256 === source.content_sha256 ? [] : [{
      check: "content_sha256" as const, sent: submission.source_content_sha256, expected: source.content_sha256
    }]),
    ...(!checkCompleteness || source.document_completeness === FULL_TEXT ? [] : [{
      check: "completeness" as const, sent: FULL_TEXT, expected: source.document_completeness ?? "unknown"
    }])
  ];
}

/**
 * An audit refused because its source does not match the acquired document. Its message keeps the old words first, so
 * anything that matched them still does, then says which check failed, the values to send, and that the audit stays
 * open until it is resubmitted.
 */
export class AuditSourceMismatchError extends Error {
  readonly mismatches: readonly AuditSourceMismatch[];

  constructor(audit: string, mismatches: readonly AuditSourceMismatch[]) {
    super(auditSourceMismatchMessage(audit, mismatches));
    this.name = "AuditSourceMismatchError";
    this.mismatches = Object.freeze([...mismatches]);
  }
}

/** Throws AuditSourceMismatchError naming every failed check; returns when all pass. */
export function verifyAuditSource(
  audit: string,
  source: AuditedSource,
  submission: AuditSourceFields,
  checkCompleteness = true
): void {
  const mismatches = auditSourceMismatches(source, submission, checkCompleteness);
  if (mismatches.length > 0) throw new AuditSourceMismatchError(audit, mismatches);
}

function auditSourceMismatchMessage(audit: string, mismatches: readonly AuditSourceMismatch[]): string {
  const parts = mismatches.map(({ check, sent, expected }) =>
    check === "identifier"
      ? `source_primary_identifier is ${JSON.stringify(sent)}, but the acquired document's primary identifier is ` +
        `${JSON.stringify(expected)}`
      : check === "content_sha256"
        ? `source_content_sha256 is ${JSON.stringify(sent)}, but the acquired document's content SHA-256 is ` +
          `${JSON.stringify(expected)} (its coverage_receipt.source_content_sha256)`
        : `the acquired document's completeness is ${JSON.stringify(expected)}, not ${JSON.stringify(sent)}`);
  const repairable = mismatches.some(({ check }) => check !== "completeness");
  const incomplete = mismatches.some(({ check }) => check === "completeness");
  return `${audit} source identity or completeness mismatch: ${parts.join("; ")}. The audit was not validated and ` +
    "stays open" + (incomplete
      ? ": no audit validates on a document that is not full text with body, so cite the study as read from what " +
        "was acquired, or acquire a complete full text and audit that."
      : repairable
        ? ": resubmit it with these values, which come from this document_handle's acquisition, to validate it."
        : ".");
}
