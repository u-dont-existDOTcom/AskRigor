import { digestCanonicalJson } from "./incident-contracts.js";
import type {
  LessonIncidentEvidence,
  LessonIncidentProvenance,
} from "./incident-contracts.js";
import type { LessonIncidentVault } from "./file-incident-vault.js";

export interface LessonIncidentReplayPacket {
  schema_version: "askrigor_lesson_incident_replay_packet_v1";
  incident: LessonIncidentProvenance;
  development_evidence: true;
  prompt_window: Array<{
    role: "user" | "assistant";
    content_utf8: string;
    sha256: string;
  }>;
  expected_invariant: {
    category: string;
    finding: string;
    evidence_basis: string;
  };
  replay_digest: string;
}

export interface LessonIncidentReplayManifest {
  schema_version: "askrigor_lesson_incident_replay_manifest_v1";
  incident: LessonIncidentProvenance;
  development_evidence: true;
  expected_invariant: {
    category: string;
    digest: string;
  };
  raw_window_location: "owner_private_incident_vault";
}

export function createLessonIncidentReplayPacket(
  vault: Pick<LessonIncidentVault, "read">,
  incidentId: string,
): LessonIncidentReplayPacket {
  const record = vault.read(incidentId);
  const withoutDigest = {
    schema_version: "askrigor_lesson_incident_replay_packet_v1" as const,
    incident: provenance(record),
    development_evidence: true as const,
    prompt_window: record.window.map((message) => ({
      role: message.role,
      content_utf8: message.content_utf8,
      sha256: message.sha256,
    })),
    expected_invariant: {
      category: record.validated_defect.category,
      finding: record.validated_defect.finding,
      evidence_basis: record.validated_defect.evidence_basis,
    },
  };
  return {
    ...withoutDigest,
    replay_digest: digestCanonicalJson(withoutDigest),
  };
}

export function createLessonIncidentReplayManifest(
  record: LessonIncidentEvidence,
): LessonIncidentReplayManifest {
  return {
    schema_version: "askrigor_lesson_incident_replay_manifest_v1",
    incident: provenance(record),
    development_evidence: true,
    expected_invariant: {
      category: record.validated_defect.category,
      digest: digestCanonicalJson({
        finding: record.validated_defect.finding,
        evidence_basis: record.validated_defect.evidence_basis,
      }),
    },
    raw_window_location: "owner_private_incident_vault",
  };
}

function provenance(record: LessonIncidentEvidence): LessonIncidentProvenance {
  return {
    incident_id: record.incident_id,
    incident_sha256: record.incident_sha256,
    preservation_status: record.preservation_status,
  };
}
