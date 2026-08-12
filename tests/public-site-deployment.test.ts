import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(new URL("../", import.meta.url).pathname);
const archiveScript = resolve(root, "scripts/create-public-site-archive.sh");
const installerScript = resolve(root, "ops/public-site/install-public-site.sh");

const bash = (script: string) => spawnSync("bash", ["-c", script], {
  cwd: root,
  encoding: "utf8"
});

let caddy: string;
let compose: string;
let installer: string;
let archiveCreator: string;

beforeAll(async () => {
  caddy = await readFile(resolve(root, "ops/public-site/Caddyfile.site"), "utf8");
  compose = await readFile(resolve(root, "ops/public-site/compose.site.yaml"), "utf8");
  installer = await readFile(resolve(root, "ops/public-site/install-public-site.sh"), "utf8");
  archiveCreator = await readFile(resolve(root, "scripts/create-public-site-archive.sh"), "utf8");
});

describe("public-site deployment packet", () => {
  it("serves only the apex site with the required hardening and route boundary", () => {
    expect(caddy).toContain("askrigor.com {");
    expect(caddy).toContain("root * /srv/askrigor-site");
    expect(caddy).toContain("Content-Security-Policy");
    expect(caddy).toContain("default-src 'none'");
    expect(caddy).toContain("style-src 'self'");
    expect(caddy).toContain("X-Frame-Options DENY");
    expect(caddy).toContain("X-Content-Type-Options nosniff");
    expect(caddy).toContain("Referrer-Policy strict-origin-when-cross-origin");
    expect(caddy).toContain('Strict-Transport-Security "max-age=31536000"');
    expect(caddy).toContain("Permissions-Policy");
    expect(caddy).toContain("-Server");
    expect(caddy).toContain("encode zstd gzip");
    expect(caddy).toContain("/privacy/index.html");
    expect(caddy).toContain("/terms/index.html");
    expect(caddy).toContain("/support/index.html");
    expect(caddy).toContain("path /assets/*");
    expect(caddy).toContain("respond 404");
    expect(caddy).not.toContain("mcp.askrigor.com");
    expect(caddy).not.toContain("includeSubDomains");
    expect(caddy).not.toContain("preload");
  });

  it("overlays only the two read-only Caddy mounts", () => {
    expect(compose).toContain("/opt/askrigor/site/current:/srv/askrigor-site:ro");
    expect(compose).toContain("/opt/askrigor/site/state/Caddyfile:/etc/caddy/Caddyfile:ro");
    expect(compose).not.toMatch(/research-mcp:/);
    expect(compose).not.toMatch(/^\s+(?:ports|networks|image|command|environment|env_file):/m);
    expect(compose).not.toMatch(/:\s*rw(?:\s|$)/m);
  });

  it("creates deterministic, narrowly scoped, fail-closed release archives", () => {
    expect(archiveCreator).toContain("set -Eeuo pipefail");
    expect(archiveCreator).toContain('[[ "$#" -eq 2 ]]');
    expect(archiveCreator).toContain('git rev-parse --verify "${commit}^{commit}"');
    expect(archiveCreator).toContain('git archive --format=tar "$commit" site ops/public-site');
    expect(archiveCreator).toContain("gzip -n");
    expect(archiveCreator).toContain("sha256sum");
    expect(archiveCreator).toContain("basename");
    expect(archiveCreator).toContain("git archive contains a symlink");
    expect(archiveCreator).toContain("archive member is outside the allowed roots");
    expect(archiveCreator).toContain("private-key-like archive member");
    expect(archiveCreator).toContain("npm run test:site");
  });

  it("installs transactionally and arms a Caddy-only rollback before switching", () => {
    expect(installer).toContain("set -Eeuo pipefail");
    expect(installer).toContain('[[ "$#" -eq 3 ]]');
    expect(installer).toContain("must run as root");
    expect(installer).toContain("/opt/askrigor/site/releases");
    expect(installer).toContain("/opt/askrigor/site/state");
    expect(installer).toContain("/opt/askrigor/site/current");
    expect(installer).toContain("base_compose=/opt/askrigor/compose.yaml");
    expect(installer).toContain("https_release_link=/opt/askrigor/active-https");
    expect(installer).toContain("https_compose=$resolved_https_compose");
    expect(installer).toContain("production_caddyfile=$resolved_production_caddyfile");
    expect(installer).not.toContain("/opt/askrigor/active-https/compose.https.yaml");
    expect(installer).not.toContain("/opt/askrigor/active-https/Caddyfile");
    expect(installer).not.toContain("/opt/askrigor/active/");
    expect(installer).toContain('assert_root_owned_secure_parent_chain "$https_releases_root/release"');
    expect(installer).toContain('assert_owned_secure_path "$resolved_https_release/compose.https.yaml" file "$expected_owner"');
    expect(installer).toContain('assert_owned_secure_path "$resolved_https_release/Caddyfile" file "$expected_owner"');
    expect(installer).toContain("assert_root_owned_secure_path");
    expect(installer).toContain("path must not be a symlink");
    expect(installer).toContain("path must be owned by root");
    expect(installer).toContain("path must not be group/world writable");
    expect(installer).toContain("staged_archive");
    expect(installer.indexOf("sha256sum --check")).toBeLessThan(installer.indexOf("tar -xzf"));
    expect(installer.indexOf("tar -xzf")).toBeLessThan(installer.indexOf('ln -s -- "$release_path/site"'));
    expect(installer).toContain("previous_current_target");
    expect(installer).toContain("--no-env-resolution");
    expect(installer).toContain("--format json");
    expect(installer).toContain("verify_compose_delta()");
    expect(installer).toContain("create_host_path: false");
    expect(installer).toContain("rollback_armed=1");
    expect(installer.indexOf("caddy validate")).toBeLessThan(installer.indexOf("rollback_armed=1"));
    expect(installer.indexOf("rollback_armed=1")).toBeLessThan(
      installer.indexOf('ln -s -- "$release_path/site"')
    );
    expect(installer).toContain("trap rollback ERR");
    expect(installer).toContain("restore_previous_state");
    expect(installer).toContain("--no-deps --force-recreate caddy");
    expect(installer).not.toContain("--force-recreate research-mcp");
    expect(installer).toContain("/health");
    expect(installer).toContain("https://askrigor.com/");
    expect(installer).toContain("https://askrigor.com/privacy");
    expect(installer).toContain("https://askrigor.com/terms");
    expect(installer).toContain("https://askrigor.com/support");
    expect(installer).toContain("apex HTTPS prerequisite failed");
    expect(installer).toContain("preserved failed release artifacts");
  });

  it("permits only a secure active-https selector below the HTTPS release root", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "askrigor-https-selector-"));
    try {
      const releases = join(temporary, "releases/https");
      const release = join(releases, "2026-08-12");
      const selector = join(temporary, "active-https");
      const fixtureUid = process.getuid?.() ?? 1000;
      await mkdir(release, { recursive: true });
      await chmod(join(temporary, "releases"), 0o755);
      await chmod(releases, 0o755);
      await chmod(release, 0o755);
      await writeFile(join(release, "compose.https.yaml"), "services: {}\n");
      await writeFile(join(release, "Caddyfile"), "mcp.askrigor.com { respond 200 }\n");
      await chmod(join(release, "compose.https.yaml"), 0o644);
      await chmod(join(release, "Caddyfile"), 0o644);
      await symlink(release, selector);

      const accepted = bash(`
        source "${installerScript}"
        resolve_https_release "${selector}" "${releases}" "${fixtureUid}"
        [[ "$resolved_https_release" == "${release}" ]]
      `);
      expect(accepted.status, accepted.stderr).toBe(0);

      const outside = join(temporary, "outside");
      await mkdir(outside);
      await rm(selector);
      await symlink(outside, selector);
      const rejectedOutside = bash(`
        source "${installerScript}"
        resolve_https_release "${selector}" "${releases}" "${fixtureUid}"
      `);
      expect(rejectedOutside.status).not.toBe(0);
      expect(rejectedOutside.stderr).toContain("below the HTTPS releases root");

      await rm(selector);
      await writeFile(selector, "not a selector\n");
      const rejectedRegular = bash(`
        source "${installerScript}"
        resolve_https_release "${selector}" "${releases}" "${fixtureUid}"
      `);
      expect(rejectedRegular.status).not.toBe(0);
      expect(rejectedRegular.stderr).toContain("must be a symlink");

      await rm(selector);
      await symlink(release, selector);
      const rejectedOwner = bash(`
        source "${installerScript}"
        resolve_https_release "${selector}" "${releases}" "$(( ${fixtureUid} + 1 ))"
      `);
      expect(rejectedOwner.status).not.toBe(0);
      expect(rejectedOwner.stderr).toContain("selector must be owned by root");

      const hiddenTarget = join(releases, "hidden-target");
      const hiddenLink = join(releases, "hidden-link");
      await mkdir(join(hiddenTarget, "release"), { recursive: true });
      await chmod(hiddenTarget, 0o755);
      await chmod(join(hiddenTarget, "release"), 0o755);
      await writeFile(join(hiddenTarget, "release/compose.https.yaml"), "services: {}\n");
      await writeFile(join(hiddenTarget, "release/Caddyfile"), "mcp.askrigor.com { respond 200 }\n");
      await chmod(join(hiddenTarget, "release/compose.https.yaml"), 0o644);
      await chmod(join(hiddenTarget, "release/Caddyfile"), 0o644);
      await symlink(hiddenTarget, hiddenLink);
      await rm(selector);
      await symlink(join(hiddenLink, "release"), selector);
      const rejectedHiddenLink = bash(`
        source "${installerScript}"
        resolve_https_release "${selector}" "${releases}" "${fixtureUid}"
      `);
      expect(rejectedHiddenLink.status).not.toBe(0);
      expect(rejectedHiddenLink.stderr).toContain("path must not be a symlink");

      const writableParent = join(releases, "writable-parent");
      const writableRelease = join(writableParent, "release");
      await mkdir(writableRelease, { recursive: true });
      await chmod(writableParent, 0o775);
      await chmod(writableRelease, 0o755);
      await writeFile(join(writableRelease, "compose.https.yaml"), "services: {}\n");
      await writeFile(join(writableRelease, "Caddyfile"), "mcp.askrigor.com { respond 200 }\n");
      await chmod(join(writableRelease, "compose.https.yaml"), 0o644);
      await chmod(join(writableRelease, "Caddyfile"), 0o644);
      await rm(selector);
      await symlink(writableRelease, selector);
      const rejectedWritable = bash(`
        source "${installerScript}"
        resolve_https_release "${selector}" "${releases}" "${fixtureUid}"
      `);
      expect(rejectedWritable.status).not.toBe(0);
      expect(rejectedWritable.stderr).toContain("path must not be group/world writable");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("loads only unique validated public Caddy interpolation values", () => {
    const valid = bash(`
      source "${installerScript}"
      docker() {
        printf '%s\n' \
          'ASKRIGOR_HOSTNAME=mcp.askrigor.com' \
          'ASKRIGOR_DIRECT_DNS_ONLY=true'
      }
      extract_public_caddy_environment container-id
      [[ "$caddy_hostname" == mcp.askrigor.com ]]
      [[ "$caddy_direct_dns_only" == true ]]
    `);
    expect(valid.status, valid.stderr).toBe(0);

    const duplicate = bash(`
      source "${installerScript}"
      docker() {
        printf '%s\n' \
          'ASKRIGOR_HOSTNAME=mcp.askrigor.com' \
          'ASKRIGOR_HOSTNAME=other.example' \
          'ASKRIGOR_DIRECT_DNS_ONLY=true'
      }
      extract_public_caddy_environment container-id
    `);
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr).toContain("duplicate public Caddy variable");

    const malformed = bash(`
      source "${installerScript}"
      docker() {
        printf '%s\n' \
          'ASKRIGOR_HOSTNAME=mcp.askrigor.com' \
          'ASKRIGOR_DIRECT_DNS_ONLY=true;touch_/tmp/no'
      }
      extract_public_caddy_environment container-id
    `);
    expect(malformed.status).not.toBe(0);
    expect(malformed.stderr).toContain("malformed ASKRIGOR_DIRECT_DNS_ONLY");
    expect(installer).toContain("compose_environment=(");
    expect(installer).toContain("env -i");
    expect(installer).toContain("caddy_caddyfile=$production_caddyfile");
    expect(installer).not.toContain("env_file");

    const cleanEnvironment = bash(`
      source "${installerScript}"
      compose_environment=(
        env -i
        PATH=/usr/bin:/bin
        HOME=/root
        ASKRIGOR_HOSTNAME=mcp.askrigor.com
        ASKRIGOR_DIRECT_DNS_ONLY=true
        ASKRIGOR_CADDYFILE=/validated/Caddyfile
      )
      export SHOULD_NOT_REACH_COMPOSE=secret
      run_compose_command /usr/bin/env
    `);
    expect(cleanEnvironment.status, cleanEnvironment.stderr).toBe(0);
    expect(cleanEnvironment.stdout).toContain("ASKRIGOR_HOSTNAME=mcp.askrigor.com");
    expect(cleanEnvironment.stdout).toContain("ASKRIGOR_CADDYFILE=/validated/Caddyfile");
    expect(cleanEnvironment.stdout).not.toContain("SHOULD_NOT_REACH_COMPOSE");
  });

  it("rejects unsupported public Caddy interpolation values that are syntactically safe", () => {
    const unsupported = bash(`
      source "${installerScript}"
      docker() {
        printf '%s\n' \
          'ASKRIGOR_HOSTNAME=mcp.askrigor.com' \
          'ASKRIGOR_DIRECT_DNS_ONLY=unexpected'
      }
      extract_public_caddy_environment container-id
    `);
    expect(unsupported.status).not.toBe(0);
    expect(unsupported.stderr).toContain("unexpected ASKRIGOR_DIRECT_DNS_ONLY");
  });

  it("requires exactly one running Caddy container from the validated Compose files", () => {
    const accepted = bash(`
      source "${installerScript}"
      docker() { printf 'caddy-container-id\n'; }
      discover_live_caddy_container /opt/askrigor/compose.yaml,/resolved/compose.https.yaml
      [[ "$live_caddy_container_id" == caddy-container-id ]]
    `);
    expect(accepted.status, accepted.stderr).toBe(0);

    for (const output of ["", "one\ntwo\n"]) {
      const rejected = bash(`
        source "${installerScript}"
        docker() { printf ${JSON.stringify(output)}; }
        discover_live_caddy_container /opt/askrigor/compose.yaml,/resolved/compose.https.yaml
      `);
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain("exactly one running Caddy container");
    }
  });

  it("never embeds or invokes forbidden deployment material", () => {
    const allDeploymentFiles = [caddy, compose, installer, archiveCreator];
    for (const file of allDeploymentFiles) {
      expect(file).not.toContain("YOUTUBE_API_KEY");
      expect(file).not.toContain("NCBI_API_KEY");
      expect(file).not.toContain("runtime.env");
      expect(file).not.toContain(".app.json");
      expect(file).not.toContain("docker compose down");
      expect(file).not.toContain("research-mcp --force-recreate");
      expect(file).not.toContain("chmod 777");
      expect(file).not.toContain("StrictHostKeyChecking=no");
      expect(file).not.toContain("-----BEGIN PRIVATE KEY-----");
    }
  });

  it("rejects linked archive members and publishes without clobbering under races", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "askrigor-archive-contract-"));
    try {
      const payload = join(temporary, "payload");
      await mkdir(join(payload, "site"), { recursive: true });
      await writeFile(join(payload, "site/index.html"), "safe\n");
      await symlink("index.html", join(payload, "site/link"));
      const archive = join(temporary, "linked.tar.gz");
      const made = spawnSync("tar", ["-czf", archive, "-C", payload, "site"], { encoding: "utf8" });
      expect(made.status, made.stderr).toBe(0);

      const rejected = bash(`
        source "${archiveScript}"
        validate_archive_membership "${archive}" "${temporary}/members" "${temporary}/verbose"
      `);
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain("symlink or hard link");

      const destination = join(temporary, "packet.tar.gz");
      await writeFile(destination, "original\n");
      const existing = bash(`
        source "${archiveScript}"
        printf 'replacement\n' >"${temporary}/replacement"
        publish_no_clobber "${temporary}/replacement" "${destination}"
      `);
      expect(existing.status).not.toBe(0);
      expect(await readFile(destination, "utf8")).toBe("original\n");

      await rm(destination);
      const linkSink = join(temporary, "link-sink");
      await mkdir(linkSink);
      await symlink(linkSink, destination);
      const linkedDestination = bash(`
        source "${archiveScript}"
        printf 'replacement\n' >"${temporary}/replacement-through-link"
        publish_no_clobber "${temporary}/replacement-through-link" "${destination}"
      `);
      expect(linkedDestination.status).not.toBe(0);
      await rm(destination);

      const raced = bash(`
        source "${archiveScript}"
        set +e
        printf 'first\n' >"${temporary}/first"
        printf 'second\n' >"${temporary}/second"
        publish_no_clobber "${temporary}/first" "${destination}" & first_pid=$!
        publish_no_clobber "${temporary}/second" "${destination}" & second_pid=$!
        wait "$first_pid"; first_status=$?
        wait "$second_pid"; second_status=$?
        [[ $(( (first_status == 0) + (second_status == 0) )) -eq 1 ]]
      `);
      expect(raced.status, raced.stderr).toBe(0);
      expect(["first\n", "second\n"]).toContain(await readFile(destination, "utf8"));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("overrides first-install validation mounts at the same targets without creating live paths", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "askrigor-first-install-"));
    try {
      const liveCaddyfile = join(temporary, "state/Caddyfile");
      const liveSite = join(temporary, "current");
      const stagedCaddyfile = join(temporary, "staged/Caddyfile");
      const stagedSite = join(temporary, "release/site");
      const base = join(temporary, "compose.base.yaml");
      const site = join(temporary, "compose.site.yaml");
      const validation = join(temporary, "compose.validation.yaml");
      await mkdir(join(temporary, "staged"), { recursive: true });
      await mkdir(stagedSite, { recursive: true });
      await writeFile(stagedCaddyfile, "askrigor.com { respond 200 }\n");
      await writeFile(base, `services:\n  caddy:\n    image: caddy:2.10.0@sha256:${"a".repeat(64)}\n`);
      await writeFile(site, `services:\n  caddy:\n    volumes:\n      - ${liveSite}:/srv/askrigor-site:ro\n      - ${liveCaddyfile}:/etc/caddy/Caddyfile:ro\n`);

      const rendered = bash(`
        source "${installerScript}"
        write_validation_overlay "${validation}" "${stagedCaddyfile}" "${stagedSite}"
        docker compose -f "${base}" -f "${site}" -f "${validation}" \\
          config --no-env-resolution --no-interpolate --no-path-resolution --format json
      `);
      expect(rendered.status, rendered.stderr).toBe(0);
      const config = JSON.parse(rendered.stdout);
      const volumes = config.services.caddy.volumes as Array<Record<string, unknown>>;
      expect(volumes.find((volume) => volume.target === "/etc/caddy/Caddyfile")).toMatchObject({
        source: stagedCaddyfile,
        read_only: true,
        bind: { create_host_path: false }
      });
      expect(volumes.find((volume) => volume.target === "/srv/askrigor-site")).toMatchObject({
        source: stagedSite,
        read_only: true,
        bind: { create_host_path: false }
      });
      await expect(readFile(liveCaddyfile)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("allows only the reviewed Caddy mounts and requires the exact pinned production image", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "askrigor-compose-delta-"));
    try {
      const pinned = `caddy:2.10.0@sha256:${"b".repeat(64)}`;
      const baseConfig = {
        name: "askrigor",
        services: {
          caddy: {
            image: pinned,
            command: ["caddy", "run"],
            ports: [{ target: 443, published: "443", protocol: "tcp", mode: "ingress" }],
            volumes: [{ type: "bind", source: "/opt/askrigor/active-https/Caddyfile", target: "/etc/caddy/Caddyfile", read_only: true }]
          },
          "research-mcp": { image: `askrigor@sha256:${"c".repeat(64)}`, networks: { default: null } }
        },
        networks: { default: { name: "askrigor_default" } }
      };
      const candidateConfig = structuredClone(baseConfig);
      candidateConfig.services.caddy.volumes = [
        { type: "bind", source: "/opt/askrigor/site/state/Caddyfile", target: "/etc/caddy/Caddyfile", read_only: true, bind: { create_host_path: false } },
        { type: "bind", source: "/opt/askrigor/site/current", target: "/srv/askrigor-site", read_only: true, bind: { create_host_path: false } }
      ];
      const baseFile = join(temporary, "base.json");
      const candidateFile = join(temporary, "candidate.json");
      await writeFile(baseFile, JSON.stringify(baseConfig));
      await writeFile(candidateFile, JSON.stringify(candidateConfig));

      const accepted = bash(`source "${installerScript}"; verify_compose_delta "${baseFile}" "${candidateFile}"`);
      expect(accepted.status, accepted.stderr).toBe(0);

      const mutations = [
        ["extra service", (value: any) => { value.services.audit = { image: "busybox" }; }],
        ["command", (value: any) => { value.services.caddy.command = ["sh"]; }],
        ["privilege", (value: any) => { value.services.caddy.privileged = true; }],
        ["image", (value: any) => { value.services.caddy.image = `caddy:other@sha256:${"d".repeat(64)}`; }]
      ] as const;
      for (const [label, mutate] of mutations) {
        const changed = structuredClone(candidateConfig) as any;
        mutate(changed);
        await writeFile(candidateFile, JSON.stringify(changed));
        const rejected = bash(`source "${installerScript}"; verify_compose_delta "${baseFile}" "${candidateFile}"`);
        expect(rejected.status, `${label}: ${rejected.stderr}`).not.toBe(0);
      }

      const unpinnedBase = structuredClone(baseConfig);
      const unpinnedCandidate = structuredClone(candidateConfig);
      unpinnedBase.services.caddy.image = "caddy:2.10.0";
      unpinnedCandidate.services.caddy.image = "caddy:2.10.0";
      await writeFile(baseFile, JSON.stringify(unpinnedBase));
      await writeFile(candidateFile, JSON.stringify(unpinnedCandidate));
      const unpinned = bash(`source "${installerScript}"; verify_compose_delta "${baseFile}" "${candidateFile}"`);
      expect(unpinned.status).not.toBe(0);
      expect(unpinned.stderr).toContain("pinned production Caddy image");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("rejects a forbidden delta without executing a candidate-supplied verifier", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "askrigor-malicious-verifier-"));
    try {
      const release = join(temporary, "release");
      const packetOps = join(release, "ops/public-site");
      const packetSite = join(release, "site");
      const marker = join(temporary, "candidate-verifier-executed");
      const maliciousVerifier = join(packetOps, "verify-compose-delta.mjs");
      await mkdir(packetOps, { recursive: true });
      await mkdir(join(packetSite, "assets"), { recursive: true });
      for (const page of ["index.html", "privacy/index.html", "terms/index.html", "support/index.html"]) {
        await mkdir(join(packetSite, page, ".."), { recursive: true });
        await writeFile(join(packetSite, page), "<!doctype html><title>fixture</title>\n");
      }
      await writeFile(join(packetSite, "assets/site.css"), "body {}\n");
      await writeFile(maliciousVerifier, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "executed\\n");\n`);
      await chmod(maliciousVerifier, 0o755);
      await writeFile(join(packetOps, "compose.site.yaml"), "services:\n  audit:\n    image: busybox\n");
      await writeFile(join(packetOps, "Caddyfile.site"), "askrigor.com { respond 200 }\n");
      await writeFile(join(packetOps, "install-public-site.sh"), "#!/usr/bin/env bash\nexit 0\n");
      const packet = join(temporary, "candidate.tar.gz");
      const archived = spawnSync("tar", ["-czf", packet, "-C", release, "site", "ops"], { encoding: "utf8" });
      expect(archived.status, archived.stderr).toBe(0);
      const structurallyAccepted = bash(`
        source "${archiveScript}"
        validate_archive_membership "${packet}" "${temporary}/members" "${temporary}/verbose"
      `);
      expect(structurallyAccepted.status, structurallyAccepted.stderr).toBe(0);

      const pinned = `caddy:2.10.0@sha256:${"e".repeat(64)}`;
      const base = {
        services: {
          caddy: {
            image: pinned,
            volumes: [{ type: "bind", source: "/opt/askrigor/active-https/Caddyfile", target: "/etc/caddy/Caddyfile", read_only: true }]
          }
        }
      };
      const candidate: any = structuredClone(base);
      candidate.services.caddy.volumes = [
        { type: "bind", source: "/opt/askrigor/site/state/Caddyfile", target: "/etc/caddy/Caddyfile", read_only: true, bind: { create_host_path: false } },
        { type: "bind", source: "/opt/askrigor/site/current", target: "/srv/askrigor-site", read_only: true, bind: { create_host_path: false } }
      ];
      candidate.services.audit = { image: "busybox" };
      const baseFile = join(temporary, "base.json");
      const candidateFile = join(temporary, "candidate.json");
      await writeFile(baseFile, JSON.stringify(base));
      await writeFile(candidateFile, JSON.stringify(candidate));

      const legacyPath = spawnSync("node", [maliciousVerifier, baseFile, candidateFile], { encoding: "utf8" });
      expect(legacyPath.status, legacyPath.stderr).toBe(0);
      expect(await readFile(marker, "utf8")).toBe("executed\n");
      await rm(marker);

      const productionPath = bash(`
        source "${installerScript}"
        compose_delta_verifier="${maliciousVerifier}"
        verify_compose_delta "${baseFile}" "${candidateFile}"
      `);
      expect(productionPath.status).not.toBe(0);
      expect(productionPath.stderr).toContain("outside the two reviewed Caddy mounts");
      await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
      expect(installer).not.toContain('node "$compose_delta_verifier"');
      expect(installer).not.toMatch(/(?:bash|sh|node)\s+[^\n]*\$release_path/);
      expect(installer).not.toMatch(/(?:source|\.)\s+[^\n]*\$(?:release_path|packet_)/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("does not recreate Caddy when any rollback restoration step fails", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "askrigor-rollback-contract-"));
    try {
      const state = join(temporary, "state");
      const siteRoot = join(temporary, "site-root");
      const releaseSite = join(temporary, "releases/previous/site");
      await mkdir(state, { recursive: true });
      await mkdir(siteRoot, { recursive: true });
      await mkdir(releaseSite, { recursive: true });
      await writeFile(join(state, "Caddyfile"), "new\n");
      await writeFile(join(state, "compose.site.yaml"), "new\n");
      await writeFile(join(temporary, "overlay.previous"), "old overlay\n");
      await symlink(releaseSite, join(siteRoot, "current"));
      await chmod(state, 0o755);

      const result = bash(`
        source "${installerScript}"
        state_root="${state}"
        site_root="${siteRoot}"
        current_link="${join(siteRoot, "current")}"
        next_current_link="${join(siteRoot, ".current.new")}"
        previous_current_target="${releaseSite}"
        previous_caddyfile_present=1
        previous_overlay_present=1
        previous_caddyfile_backup="${join(temporary, "missing-caddy.previous")}"
        previous_overlay_backup="${join(temporary, "overlay.previous")}"
        staging_path="${temporary}"
        release_path="${join(temporary, "release") }"
        marker="${join(temporary, "recreated") }"
        recreate_previous_caddy_only() { touch "$marker"; }
        probe_http_200() { return 0; }
        set +e
        perform_rollback
        rollback_status=$?
        [[ "$rollback_status" -ne 0 && ! -e "$marker" ]]
      `);
      expect(result.status, result.stderr).toBe(0);
      await expect(readFile(join(temporary, "recreated"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
