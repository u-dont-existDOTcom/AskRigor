import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(new URL("../", import.meta.url).pathname);

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
    expect(installer).toContain("/opt/askrigor/active/compose.yaml");
    expect(installer).toContain("/opt/askrigor/active/compose.https.yaml");
    expect(installer).toContain("/opt/askrigor/active/Caddyfile");
    expect(installer).toContain("assert_root_owned_secure_path");
    expect(installer).toContain("path must not be a symlink");
    expect(installer).toContain("path must be owned by root");
    expect(installer).toContain("path must not be group/world writable");
    expect(installer).toContain("staged_archive");
    expect(installer.indexOf("sha256sum --check")).toBeLessThan(installer.indexOf("tar -xzf"));
    expect(installer.indexOf("tar -xzf")).toBeLessThan(installer.indexOf('ln -s -- "$release_path/site"'));
    expect(installer).toContain("previous_current_target");
    expect(installer).toContain("--no-env-resolution");
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
});
