import { afterEach, describe, expect, it } from "vitest";

import { atlasRouteOf } from "../apps/research-mcp/src/atlas/pages-http.js";
import { atlasPageProblems } from "../apps/research-mcp/src/atlas/pages.js";
import {
  ATLAS_LOGIN_COOKIE, ATLAS_SESSION_COOKIE, csrfToken, openSession, participantKeyFor,
} from "../apps/research-mcp/src/atlas/participation.js";
import {
  CLIENT_ID, ISSUER, SUBJECT, closeAtlasServers, cookiePart, expectPageHeaders, fixture, tokenFor,
} from "./helpers/atlas-participation-fixture.js";

afterEach(closeAtlasServers);

const PATHS = ["/atlas", "/atlas/changes", "/atlas/topics/velmor-syndrome", "/atlas/findings/P-1001"];
const header = (body: string) => body.slice(body.indexOf("<header"), body.indexOf("</header>") + "</header>".length);
const AT = "2026-10-26T00:00:00.000Z";

/** Keep a name on a vote-only participant, so its presence on a public page would prove a cache leak. */
async function namedReader(f: Awaited<ReturnType<typeof fixture>>, name = "Ana") {
  const session = await f.signIn();
  const key = participantKeyFor(f.settings, SUBJECT);
  await f.store.setVote(key, "P-1001", "agree", AT);
  const comment = await f.store.postComment(key, "P-1001", "A comment.", AT, name);
  await f.store.deleteComment(key, comment);
  return session;
}

describe("the Atlas header and shared cache", () => {
  it("offers sign-in returning to each public page, and caches no reader's name or form token", async () => {
    const f = await fixture();
    const session = await namedReader(f, 'Ana <& "ابن');
    const opened = openSession(f.settings, session.slice(session.indexOf("=") + 1), new Date())!;
    for (const path of PATHS) {
      const anonymous = await f.get(path);
      expect(header(anonymous.body)).toContain(`href="${f.base}/atlas/auth/login?return=${encodeURIComponent(path)}">Sign in</a>`);
      expect(header(anonymous.body)).not.toContain("Your account");
      expect(anonymous.response.headers.get("cache-control")).toBe("no-cache");
      expect(anonymous.response.headers.get("vary")).toBe("Cookie");
      expect(anonymous.response.headers.getSetCookie()).toEqual([]);
      const signedIn = await f.get(path, session);
      expect(header(signedIn.body)).toContain('href="/atlas/account">Your account (<bdi>Ana &lt;&amp; &quot;ابن</bdi>)</a>');
      expect(header(signedIn.body)).not.toContain("/atlas/auth/login");
      expect(signedIn.response.headers.get("cache-control")).toBe("private, no-store");
      expect(signedIn.response.headers.get("vary")).toBe("Cookie");
      expect(atlasPageProblems(signedIn.body)).toEqual([]);
      expectPageHeaders(signedIn.response);
      const head = await fetch(`${f.base}${path}`, { method: "HEAD", headers: { cookie: session } });
      expect(head.headers.get("cache-control")).toBe("private, no-store");
      expect(head.headers.get("vary")).toBe("Cookie");
      expect(await head.text()).toBe("");
      const again = await f.get(path);
      expect(again.body).toBe(anonymous.body);
      expect(again.body).not.toContain("Ana");
      for (const purpose of ["vote:P-1001", "comment:P-1001", "name", "sign-out", "sign-out-everywhere", "forget"]) {
        expect(again.body).not.toContain(csrfToken(f.settings, opened, purpose));
      }
    }
  });

  it("shows Your account without a name before the first comment, including on the own-comments page", async () => {
    const f = await fixture();
    const session = await f.signIn();
    for (const path of [...PATHS, "/atlas/account/comments"]) {
      const page = await f.get(path, session);
      expect(header(page.body)).toContain('<a href="/atlas/account">Your account</a>');
      expect(header(page.body)).not.toContain("/atlas/auth/login");
      expect(page.response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("keeps the original header and disables the account route while participation is off", async () => {
    const f = await fixture({ participation: false });
    for (const path of PATHS) {
      const page = await f.get(path);
      expect(header(page.body)).not.toMatch(/Sign in|Your account|auth\/login/u);
      expect(page.response.headers.get("vary")).toBeNull();
      expect(page.response.headers.get("cache-control")).toBe("no-cache");
    }
    expect(atlasRouteOf("/atlas/account")).toBeUndefined();
    expect(atlasRouteOf("/atlas/account", true)).toEqual({ kind: "account" });
    for (const method of ["GET", "HEAD"]) {
      expect((await fetch(`${f.base}/atlas/account`, { method })).status).toBe(404);
    }
  });

  it("renders known notices uncached on home, changes and topic pages, without contaminating the cached page", async () => {
    const f = await fixture();
    for (const path of PATHS.slice(0, 3)) {
      const plain = await f.get(path);
      for (const [done, words] of [["signed-in", "You are signed in: you can vote and comment."],
        ["signed-out", "You are signed out."], ["renamed", "Your display name is saved."],
        ["forgotten", "Everything you held in the Atlas is deleted:"]] as const) {
        const notice = await f.get(`${path}?done=${done}`);
        expect(notice.body).toContain(`role="status">${words}`);
        expect(notice.response.headers.get("cache-control")).toBe("private, no-store");
        expect(notice.response.headers.get("vary")).toBe("Cookie");
        expectPageHeaders(notice.response);
      }
      expect((await f.get(path)).body).toBe(plain.body);
      for (const done of ["constructor", "__proto__", "toString", "unrecognized"]) {
        const unknown = await f.get(`${path}?done=${done}`);
        expect(unknown.body).toBe(plain.body);
        expect(unknown.response.headers.get("cache-control")).toBe("no-cache");
      }
    }
  });

  it("signs in from each public page and returns there with the signed-in notice", async () => {
    const f = await fixture();
    for (const path of [...PATHS, "/atlas/account"]) {
      const login = await f.get(`/atlas/auth/login?return=${encodeURIComponent(path)}`);
      const location = new URL(login.response.headers.get("location")!);
      f.tenant.next.nonce = location.searchParams.get("nonce")!;
      const callback = await f.get(`/atlas/auth/callback?code=synthetic-code&state=${location.searchParams.get("state")}`,
        cookiePart(login.response, ATLAS_LOGIN_COOKIE));
      expect(callback.response.status).toBe(303);
      expect(callback.response.headers.get("location")).toBe(`${path}?done=signed-in`);
      const after = await f.get(`${path}?done=signed-in`, cookiePart(callback.response, ATLAS_SESSION_COOKIE));
      expect(after.body).toContain('role="status">You are signed in: you can vote and comment.');
      expect(header(after.body)).toContain("Your account</a>");
      expect(after.response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("keeps the reader's account entry on not-found and form-error pages, which are private", async () => {
    const f = await fixture();
    const session = await namedReader(f);
    for (const path of ["/atlas/missing", "/atlas/topics/missing", "/atlas/findings/P-9999"]) {
      const page = await f.get(path, session);
      expect(page.response.status).toBe(404);
      expect(header(page.body)).toContain("Your account (<bdi>Ana</bdi>)</a>");
      expect(page.response.headers.get("cache-control")).toBe("private, no-store");
    }
    const account = (await f.get("/atlas/account", session)).body;
    const refused = await f.post("/atlas/account/delete", { csrf: tokenFor(account, "/atlas/account/delete"),
      return: "/atlas/account" }, { cookie: session });
    expect(refused.status).toBe(422);
    expect(header(await refused.text())).toContain("Your account (<bdi>Ana</bdi>)</a>");
    expect(refused.headers.get("cache-control")).toBe("private, no-store");
    expect(f.store.snapshot().votes).toBe(1);
  });
});

describe("Your account", () => {
  it("is a short sign-in page when signed out and answers HEAD with the same private headers", async () => {
    const f = await fixture();
    const session = await f.signIn();
    for (const cookie of [undefined, session]) {
      const page = await f.get("/atlas/account", cookie);
      expect(page.response.status).toBe(200);
      expect(page.response.headers.get("cache-control")).toBe("private, no-store");
      expect(page.response.headers.get("vary")).toBe("Cookie");
      expectPageHeaders(page.response);
      if (cookie === undefined) {
        expect(page.body).toContain(`href="${f.base}/atlas/auth/login?return=%2Fatlas%2Faccount"`);
        expect(page.body).not.toContain("<form");
        expect(page.response.headers.getSetCookie()).toEqual([]);
      } else {
        expect(header(page.body)).toContain('href="/atlas/account" aria-current="page">Your account</a>');
        expect(page.body).toContain("You are signed in with your AskRigor account.");
        expect(page.body).toContain("You choose a display name with your first comment.");
        expect(page.body).not.toContain('action="/atlas/account/name"');
      }
      const head = await fetch(`${f.base}/atlas/account`, { method: "HEAD",
        ...(cookie === undefined ? {} : { headers: { cookie } }) });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      for (const name of ["cache-control", "vary", "content-type"]) expect(head.headers.get(name)).toBe(page.response.headers.get(name));
      expectPageHeaders(head);
    }
    expect((await f.post("/atlas/account", {})).status).toBe(405);
  });

  it("holds the existing forms and their exact tokens, with the account return path and truthful privacy words", async () => {
    const f = await fixture();
    const session = await namedReader(f);
    const page = (await f.get("/atlas/account", session)).body;
    const opened = openSession(f.settings, session.slice(session.indexOf("=") + 1), new Date())!;
    expect(page).toContain("Your display name is <strong><bdi>Ana</bdi></strong>.");
    expect(header(page)).toContain('aria-current="page">Your account (<bdi>Ana</bdi>)</a>');
    expect(page).toContain('<a href="/atlas/account/comments">Your votes and comments</a>');
    for (const [action, purpose] of [["/atlas/account/name", "name"], ["/atlas/auth/logout", "sign-out"],
      ["/atlas/auth/logout-everywhere", "sign-out-everywhere"], ["/atlas/account/delete", "forget"]]) {
      expect(tokenFor(page, action!)).toBe(csrfToken(f.settings, opened, purpose!));
    }
    expect(page.match(/name="return" value="\/atlas\/account"/gu)).toHaveLength(4);
    expect(page).toContain('<input type="checkbox" id="forget-confirm" name="confirm" value="yes" required>');
    expect(page).toContain("your reports, under a key derived");
    expect(page).toContain("never your email address");
    expect(page).toContain("no record\nof which pages you read");
    expect(atlasPageProblems(page)).toEqual([]);
    const finding = (await f.get("/atlas/findings/P-1001", session)).body;
    expect(finding).toContain('<p><a href="/atlas/account">Your account</a>, to find your votes and comments and manage your account</p>');
    expect(finding).toContain('action="/atlas/findings/P-1001/vote"');
    expect(finding).toContain('action="/atlas/findings/P-1001/comments"');
    expect(finding).not.toMatch(/action="\/atlas\/(?:account|auth)\//u);
  });

  it.each([
    ["/atlas/account/name", { displayName: "Ana Maria" }, "renamed", "Your display name is saved."],
    ["/atlas/auth/logout", {}, "signed-out", "You are signed out."],
    ["/atlas/auth/logout-everywhere", {}, "signed-out-everywhere", "You are signed out of the Atlas everywhere:"],
    ["/atlas/account/delete", { confirm: "yes" }, "forgotten", "Everything you held in the Atlas is deleted:"],
  ] as const)("returns %s to the account page with its notice", async (action, fields, done, notice) => {
    const f = await fixture();
    const session = await namedReader(f);
    const page = (await f.get("/atlas/account", session)).body;
    const response = await f.post(action, { ...fields, csrf: tokenFor(page, action), return: "/atlas/account" }, { cookie: session });
    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(location).toBe(`/atlas/account?done=${done}${done === "renamed" || done === "forgotten" ? "#comments" : ""}`);
    const after = await f.get(location, done === "renamed" ? session : undefined);
    expect(after.body).toContain(`role="status">${notice}`);
    expect(after.response.headers.get("cache-control")).toBe("private, no-store");
    if (done === "renamed") expect(header(after.body)).toContain("Ana Maria");
    else expect(header(after.body)).toContain(">Sign in</a>");
    if (done === "signed-out" || done === "signed-out-everywhere") {
      expect(after.body).toContain(`href="${ISSUER}v2/logout?client_id=${CLIENT_ID}&amp;returnTo=`);
      expect(after.body).toContain(">sign out of it too</a>");
    }
  });

  it("is accessible with no published findings and clears a stale session on public pages", async () => {
    const f = await fixture();
    const session = await f.signIn();
    await f.publications.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1001", "P-1002", "P-1003"],
      ownerReason: "Not published.", withdrawnAt: AT });
    expect((await f.get("/atlas/account", session)).response.status).toBe(200);
    expect(header((await f.get("/atlas", session)).body)).toContain("Your account</a>");
    for (const path of PATHS) {
      const page = await f.get(path, `${ATLAS_SESSION_COOKIE}=invalid`);
      expect(header(page.body)).toContain(">Sign in</a>");
      expect(page.response.headers.getSetCookie()[0]).toContain(`${ATLAS_SESSION_COOKIE}=; Path=/; Max-Age=0`);
    }
  });
});

describe("the Atlas's refusals cost nothing more", () => {
  it("answers a rate-limited request with the plain header, reading no session and nothing from the database", async () => {
    let allowed = Number.POSITIVE_INFINITY;
    const calls: string[] = [];
    const f = await fixture({
      rateLimiter: { size: 0, consume: () => allowed-- > 0 },
      wrapStore: (inner) => new Proxy(inner, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value !== "function" ? value : (...args: unknown[]) => {
            calls.push(String(property));
            return (value as (...parameters: unknown[]) => unknown).apply(target, args);
          };
        },
      }),
    });
    const session = await f.signIn();
    allowed = 0;
    calls.length = 0;
    const { response, body } = await f.get("/atlas", session);
    expect(response.status).toBe(429);
    expect(calls).toEqual([]);
    expect(header(body)).not.toContain("Your account");
    expect(header(body)).not.toContain("Sign in");
    expect(response.headers.get("cache-control")).toContain("private");
  });
});
