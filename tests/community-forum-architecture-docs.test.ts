import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const CONTRACT_URL = new URL(
  "../docs/community-health-forum-and-public-lead-contract-v0.1.0.json",
  import.meta.url
);
const COMMUNITY_LEAD_FIXTURE_URL = new URL(
  "../docs/fixtures/community-lead-andy-like-v0.1.0.json",
  import.meta.url
);
const PUBLIC_LEAD_FIXTURE_URL = new URL(
  "../docs/fixtures/public-lead-andy-like-v0.1.0.json",
  import.meta.url
);

interface ContractDocument {
  schema_version?: string;
  record_type?: unknown;
  $defs: {
    sourceDistance: { enum: string[] };
    verificationState: { enum: string[] };
    evidenceCapability: { enum: string[] };
    publicLeadVersion: { allOf: unknown[] };
    signalCluster: { properties: Record<string, unknown> };
  };
}

interface CommunityLeadFixture {
  schema_version: string;
  record_type: string;
  payload: {
    reporter: {
      reporter_role: string;
      information_origin: string;
      source_distance: string;
      verification_state: string;
    };
    intervention_episodes: Array<{
      episode_type: string;
      components: Array<{ name: string }>;
    }>;
    outcomes: Array<{ reported_direction: string }>;
    verification_state: string;
    evidence_capability: string;
    formal_evidence_relationship: string;
    completeness: {
      overall_band: string;
      missing_material_fields: string[];
    };
    consents: {
      public_lead: { decision: string };
      direct_quote: { decision: string };
      documents_or_media: { decision: string };
    };
  };
}

interface PublicLeadFixture {
  schema_version: string;
  record_type: string;
  payload: {
    publication_object_type: string;
    reporter_publication_consent: { decision: string };
    subject_exact_version_approval: null | { decision: string };
    deidentification_review: { outcome: string };
    subject_identifiable_in_public_version: boolean;
    direct_subject_quote_present: boolean;
    documents_or_media_present: boolean;
    verification_state: string;
    evidence_capability: string;
    formal_evidence_relationship: string;
    limitations: string[];
    published_at: string | null;
    status: string;
  };
}

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

describe("Community Health Forum and Public Lead Frontier architecture", () => {
  it("keeps the contract and both synthetic fixtures valid JSON", async () => {
    const [contract, communityLead, publicLead] = await Promise.all([
      readJson<ContractDocument>(CONTRACT_URL),
      readJson<CommunityLeadFixture>(COMMUNITY_LEAD_FIXTURE_URL),
      readJson<PublicLeadFixture>(PUBLIC_LEAD_FIXTURE_URL)
    ]);

    expect(contract.$defs.publicLeadVersion.allOf).toHaveLength(2);
    expect(communityLead.schema_version).toBe("0.1.0");
    expect(communityLead.record_type).toBe("COMMUNITY_LEAD");
    expect(publicLead.schema_version).toBe("0.1.0");
    expect(publicLead.record_type).toBe("PUBLIC_LEAD_VERSION");
  });

  it("models public visibility independently from source distance, verification, and evidence capability", async () => {
    const contract = await readJson<ContractDocument>(CONTRACT_URL);

    expect(contract.$defs.sourceDistance.enum).toEqual(
      expect.arrayContaining([
        "FIRSTHAND_SUBJECT",
        "FIRSTHAND_OBSERVER",
        "ONE_HOP_SUBJECT_RELAY",
        "MULTI_HOP_HEARSAY",
        "PUBLIC_SOURCE_EXTRACTED"
      ])
    );
    expect(contract.$defs.verificationState.enum).toContain("UNVERIFIED");
    expect(contract.$defs.evidenceCapability.enum).toEqual(
      expect.arrayContaining([
        "LEAD_ONLY",
        "DESCRIPTIVE_REPORT_ONLY",
        "COMBINATION_ASSOCIATION_ONLY",
        "PROSPECTIVE_N_OF_1_SIGNAL",
        "FORMAL_EVIDENCE_LINKED"
      ])
    );
  });

  it("permits the synthetic one-hop friend-relayed report to become a deidentified public research lead without pretending it is subject approved", async () => {
    const [communityLead, publicLead] = await Promise.all([
      readJson<CommunityLeadFixture>(COMMUNITY_LEAD_FIXTURE_URL),
      readJson<PublicLeadFixture>(PUBLIC_LEAD_FIXTURE_URL)
    ]);

    expect(communityLead.payload.reporter).toMatchObject({
      reporter_role: "FRIEND",
      information_origin: "SUBJECT_RELAYED_TO_REPORTER",
      source_distance: "ONE_HOP_SUBJECT_RELAY",
      verification_state: "UNVERIFIED"
    });
    expect(communityLead.payload.verification_state).toBe("UNVERIFIED");
    expect(communityLead.payload.evidence_capability).toBe("COMBINATION_ASSOCIATION_ONLY");
    expect(communityLead.payload.formal_evidence_relationship).toBe("NOT_CHECKED");

    expect(publicLead.payload).toMatchObject({
      publication_object_type: "PUBLIC_RESEARCH_LEAD",
      reporter_publication_consent: { decision: "YES" },
      subject_exact_version_approval: null,
      deidentification_review: { outcome: "PASS" },
      subject_identifiable_in_public_version: false,
      direct_subject_quote_present: false,
      documents_or_media_present: false,
      verification_state: "UNVERIFIED",
      evidence_capability: "COMBINATION_ASSOCIATION_ONLY",
      formal_evidence_relationship: "NOT_CHECKED",
      published_at: null,
      status: "APPROVED"
    });
    expect(publicLead.payload.limitations.length).toBeGreaterThanOrEqual(5);
  });

  it("preserves the Andy-like regimen as one combination episode rather than three independent successes", async () => {
    const communityLead = await readJson<CommunityLeadFixture>(COMMUNITY_LEAD_FIXTURE_URL);
    const episode = communityLead.payload.intervention_episodes[0];

    expect(communityLead.payload.intervention_episodes).toHaveLength(1);
    expect(episode?.episode_type).toBe("COMBINATION");
    expect(episode?.components.map((component) => component.name)).toEqual([
      "Low-dose naltrexone (LDN)",
      "Low-dose NAD+ injections",
      "Low-dose tirzepatide"
    ]);
    expect(communityLead.payload.outcomes).toHaveLength(1);
    expect(communityLead.payload.outcomes[0]?.reported_direction).toBe("IMPROVED");
    expect(communityLead.payload.completeness.overall_band).toBe("PARTIAL");
    expect(communityLead.payload.completeness.missing_material_fields).toEqual(
      expect.arrayContaining([
        "diagnostic basis",
        "exact doses and frequencies",
        "start dates and sequencing",
        "co-interventions",
        "adverse effects"
      ])
    );
  });

  it("requires reporter permission and withholds subject quotations and media from the synthetic secondhand public lead", async () => {
    const communityLead = await readJson<CommunityLeadFixture>(COMMUNITY_LEAD_FIXTURE_URL);

    expect(communityLead.payload.consents.public_lead.decision).toBe("YES");
    expect(communityLead.payload.consents.direct_quote.decision).toBe("NO");
    expect(communityLead.payload.consents.documents_or_media.decision).toBe("NO");
  });

  it("prohibits naive effectiveness percentages in community signal clusters", async () => {
    const contract = await readJson<ContractDocument>(CONTRACT_URL);
    const serializedClusterContract = JSON.stringify(contract.$defs.signalCluster);

    expect(serializedClusterContract).toContain("effectiveness_percentage_display_permitted");
    expect(serializedClusterContract).toContain('"const":false');
    expect(serializedClusterContract).toContain("source_distance_counts");
    expect(serializedClusterContract).toContain("independent_source_count");
  });

  it("contains distinct conditional publication rules for public narratives and public research leads", async () => {
    const contract = await readJson<ContractDocument>(CONTRACT_URL);
    const serializedPublicationContract = JSON.stringify(contract.$defs.publicLeadVersion.allOf);

    expect(serializedPublicationContract).toContain("PUBLIC_NARRATIVE");
    expect(serializedPublicationContract).toContain("PUBLIC_RESEARCH_LEAD");
    expect(serializedPublicationContract).toContain("subject_exact_version_approval");
    expect(serializedPublicationContract).toContain("reporter_publication_consent");
    expect(serializedPublicationContract).toContain("deidentification_review");
    expect(serializedPublicationContract).toContain("subject_identifiable_in_public_version");
    expect(serializedPublicationContract).toContain("direct_subject_quote_present");
    expect(serializedPublicationContract).toContain("documents_or_media_present");
  });
});
