# Sent email copy — 2026-08-28

**Thread subject:** YouTube API Services: Thank you for your submission

**Recipient:** YouTube API Quota
`<youtube-disputes+2qf6bi6gn4qyr1n@google.com>`

Hello YouTube API Services Team,

Thank you for the follow-up. Attached are:

1. **AskRigor-YouTube-API-visual-reference.png**, showing the complete read-only data flow from YouTube Data API v3 requests through validation and minimization to the AskRigor report presented to the end user in ChatGPT; and
2. **AskRigor-sample-end-user-report.pdf**, a de-identified, synthetic sample of the end result. It contains no real user, commenter, or patient information.

AskRigor is a population-level research assistant presented through the installed AskRigor plugin in regular ChatGPT, with the AskRigor Custom GPT as a supported secondary surface. The API Client does not provide YouTube account management and does not ask end users to sign in with Google or YouTube. Its backend uses a server-side project API key for read-only retrieval of public YouTube data.

The YouTube Data API v3 methods used are:

- `search.list` to discover public videos matching specific research queries;
- `videos.list` to validate video identity and retrieve public title, channel, publication date, duration, status, and API-visible counts;
- `commentThreads.list` to retrieve published public top-level comments and embedded replies, using `part=snippet,replies`, `videoId`, `maxResults=100`, `textFormat=plainText`, and pagination; and
- `comments.list` with `parentId` and pagination to retrieve replies that are not fully embedded in the thread response.

The backend validates response shape, video/parent correlation, pagination, duplicate identifiers, and reply-count reconciliation. It records whether the public discussion was complete, partial, inaccessible, or had comments disabled. The connected client receives normalized public metadata, coverage counts, structured findings, source links, and plain-language limitations. The final end-user report presents linked video titles, channel/date, the program or topic examined, why the video was selected, how many public comments and replies were checked, a bounded directional summary, and access limitations. It does not present raw provider responses or credentials.

Raw YouTube provider bodies, comment text, and commenter identities are not durably retained in the controlled research checkpoint. Temporary retrieval material is held only in bounded process memory and discarded on expiry, eviction, or restart. The product does not use YouTube API Data for advertising and does not place or recognize cookies. Research operations are read-only.

Public disclosures:

- Product: https://askrigor.com/
- Privacy Notice: https://askrigor.com/privacy/
- Terms of Use: https://askrigor.com/terms/

The attached visual covers only the official YouTube Data API v3 usage included in this quota request. AskRigor’s separately disclosed best-effort public caption interface is not represented as a YouTube Data API method.

Please let me know if you would also like a screen recording, additional screenshots of the client location, an unredacted API Console project identifier, or any other supporting material for the review.

Best regards,

Joel

AskRigor

joel@askrigor.com
