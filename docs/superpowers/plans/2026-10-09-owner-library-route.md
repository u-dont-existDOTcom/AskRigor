# Owner library route (owner question 59: A)

## Authority

- **Owner question 57 (2026-10-09):** InfoAccess is the owner's own collected study library, and it is "not for free
  plugin users, only paid users and me".
- **Owner question 59 (2026-10-09):** the owner answered "59A make sure you search all the links to papers that
  chatgpt can access like researchgate, academia.edu and whatever other sites before assuming it's not public." The
  approved terms are on the owner questions page:
  - the owner's account may read any paper in the library;
  - anyone else may read a paper from the library only while the same paper is public, checked on every use, with
    the public link given and never the owner's file;
  - openly licensed papers may always be read;
  - papers that were never public, such as ones an author sent, are for the owner's own research only.
- **Base:** this builds on #287 (full-text route recovery, phases 1 and 1b) and ships with it.

## The route

1. **Placement:** a fourth route, `owner_library`, in `acquireOpenFullText`. It runs after Europe PMC, Unpaywall and
   the candidates, and only when a library is configured and the caller's access allows it.
2. **Access** is decided in the app layer from the verified sign-in, never from tool input:
   - the configured owner subject gets `owner`;
   - an account with an active paid private entitlement gets `public_only`;
   - every other account gets no route, and no attempt is listed.
3. **`owner`:** fetch by DOI, then admit the copy like any other: identity on PDF pages 1 and 2 (DOI, PII or title),
   and readable methods, results and discussion.
4. **`public_only`:** the library copy is used only when, in the same call, the same paper has a public basis:
   - a public page that passed the identity checks and shows the paper's own text beyond its abstract, even if
     only partly: a fetched candidate URL, or an AI-supplied search-index copy that passed the exact-abstract check.
     This is the case of a ResearchGate or Academia.edu page that the AI's search reached but AskRigor cannot read
     in full itself;
   - or an open license on Unpaywall's record (`cc-*`).

   An abstract-only page, or a bare URL AskRigor could not read, is not a public copy of the paper.
   (Implementation review, 2026-10-09: a public copy that AskRigor admits in full is returned as it is, and the library
   is not consulted. The library only fills a gap, for the owner too.)
5. **Search first (the owner's condition):**
   - The route returns `not_public` only after `public_copy_search` is declared. That declaration records the AI's
     exact title and DOI searches over the sites its search reaches, such as ResearchGate, Academia.edu, author and
     lab pages, repositories and publishers.
   - Without the declaration, the existing "search first" next step is returned instead of a terminal state.
   - A bare URL that AskRigor could not read, with no AI-supplied text, is not a public basis.
6. **Provenance:**
   - Admitted text records `retrieval_provider: owner_library`.
   - For `public_only`, it also records `public_basis`: the route and the public URL.
   - The answer cites the public URL. The library copy is never linked or handed out.
7. **Interface:**
   - Only the InfoAccess tool `get_article_pdf` is used. It is free, and the paid tools are never called.
   - The tool returns a link, a size and a SHA-256.
   - AskRigor downloads the bytes in memory, up to 64 MiB, checks the size and SHA-256, extracts the text with the
     existing PDF extractor, and discards the bytes.
   - Configuration: `ASKRIGOR_INFOACCESS_URL`, and `ASKRIGOR_INFOACCESS_TOKEN` for a dedicated server token. The owner
     sets both in production; Claude never types a key there. If either is absent, the route is off.
8. **Data:** InfoAccess receives the DOI only: no question, health detail or account data. Nothing is stored after
   the call. A failure (unavailable, timeout, checksum mismatch) is a route failure, never a statement that the paper
   is inaccessible.

## Tests (no network)

- The owner's account reads a library copy, and the copy is admitted.
- A `public_only` account reads a library copy when a verified candidate or open license exists, and the public URL
  is recorded.
- A `public_only` account gets `not_public` after a declared search with no public basis.
- A `public_only` account gets the "search first" step when no search was declared.
- A free account gets no `owner_library` attempt.
- A SHA-256 mismatch or a wrong paper is refused.
- An InfoAccess outage is an error attempt.
- No paid InfoAccess tool is ever called.

## Owner items before release

- The privacy-page sentence, for exact-text approval.
- A dedicated InfoAccess server token, set by the owner in production.
- The release question, together with #287.
