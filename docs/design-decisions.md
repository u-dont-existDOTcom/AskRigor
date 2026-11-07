# Design decisions

How to use this:

1. Read the entries for an area before you redesign anything in it.
2. Each entry says what we chose, why, what we decided not to do, and when.
3. When a decision changes, edit its entry, keep the date of the change, and say briefly what it replaced.
4. Owner answer numbers (such as "240a") point to the owner's private decisions page; the protocols, docs and release records here hold the detail.
5. Add an entry whenever the owner decides something a later change could undo by accident.

## Research and sources

**A first pass stops early (about three videos read or two search rounds) and ends by offering what a deeper pass would focus on.**\
Why: a full-depth answer took up to two and a half hours, most of it the model working through steps, not waiting on sources.\
Not done: the old fixed minimum of eight videos and six programs. · Decided: 27 to 29 Sep 2026 (the owner); shipped 1 Oct.

**Before researching, the AI writes the quick answer it would give without AskRigor, and the final answer ends with what the research confirmed, corrected or qualified.**\
Why: the owner wants people to see how the answer is better than a plain AI answer.\
Not done: keeping a copy of the quick answer (see Privacy and safety). · Decided: 20 Oct 2026 (owner answer 140b); free accounts too, 27 Oct (190a); kept when one claim went unchecked, 1 Nov (210b).

**The answer opens with a short answer, and lists first the safest options that could work.**\
Why: answers ran through their methods before the practical part, and the owner asked for the safest things to try first, "which are generally not drugs anyway".\
Not done: a blanket "non-drug first" rule. · Decided: 15 Oct 2026 (owner answer 93a); 17 Oct (121a).

**Say how sure, plainly: keep a bottom line when the evidence is weak, say doubt in the first person, and give results as people out of 100 with a one-word evidence grade.**\
Why: studies show "out of 100" counts with a grade are understood best, a personal "I'm not sure" helps while a vague hedge doesn't, and dropping the bottom line hurts when evidence is uncertain.\
Not done: a relative figure or a number needed to treat on its own; on the Atlas, a number needed to treat for a difference that could be zero. · Decided: 4 Nov 2026 (owner answer 239 a1); Atlas numbers, 2 Nov (225a).

**Say who paid for each key study, and whether its authors work for the maker, or that the paper doesn't say.**\
Why: people rank conflicts of interest just behind medical training, and "no outside funding" can sit beside a study the maker paid for.\
Decided: 21 Oct 2026 (owner answer 130a); every key study, 4 Nov (239 a1).

**For a practical claim, look for agreement across independent kinds of evidence; one study can't carry it alone when others exist.**\
Why: a large, noticeable effect should leave traces outside the study that found it, such as other trials and the reports of people who used it.\
Not done: ranking a disputed effect by its largest estimate. · Decided: 6 to 7 Oct 2026 (the owner's consilience rule; owner question 40: A).

**Show what each claim rests on: beside each study, how it was read (abstract only, full text, methods audited); beside each key claim, the paper's own sentence and conclusion, which AskRigor's code finds word for word.**\
Why: the top thing people want from AI answers is that the source really says it, and proving a paper exists doesn't show that.\
Not done: stopping an answer when a quote isn't found; it stays a note, since a badly extracted paper could stop a good answer. · Decided: 11 Oct 2026 (read depth, owner answer 71a); 4 Nov (source line, 237a and 239 a1); labels checked against what was read, 5 Nov (262a).

**Count groups of people, not papers: keep a small map of the studies behind a combined conclusion, and check exactly that quotes, trial registrations and shared groups line up.**\
Why: hidden duplicate reports once made a drug look 23% more effective, and 58 of 67 trials in top journals reported outcomes that differed from their registration.\
Not done: a seventh stopping check for a trial counted twice (249b); each finding is a note. · Decided: 5 Nov 2026 (owner answer 249a).

**Take full texts from free public routes first, use the operator's own study library for other people only when the same study is public elsewhere, and never call a study unavailable because one route failed.**\
Why: the library is the operator's own, shared only once a full search shows the paper is public (others get the public link, never the file); and a failed route or dead link proves nothing.\
Not done: paid article tools without the person's yes. · Decided: 9 Oct 2026 (owner answers 57a, 59A; question 62); free accounts, 22 Oct (157a); a service that keeps failing becomes a stated limit, 17 Oct (113a).

**Send study-library requests one at a time.**\
Why: requests sent together came back "busy", runs asked up to 16 times for one paper, and after the change library errors fell from 43% of tries to none.\
Not done: parallel requests again after the library added a queue, until a bigger test shows they work. · Decided: 1 Nov 2026 (released with owner answer 214a); kept 3 Nov.

**AskRigor researches any field; health is the owner's focus, not a limit.**\
Why: the owner, 3 Nov: "AskRigor isn't only for health, that's just what i focus on".\
Not done: dismissing a tool or source because it's outside medicine. · Decided: 3 Nov 2026 (the owner).

## The final check

**Only six checks can stop an answer: real sources, studies described as they were read, numbers that add up, safety claims backed by a search for harms, nothing taken back coming back, and a claim-by-claim comparison with the quick answer.**\
Why: the old check passed on the first try once in 124 runs, mostly over paperwork, because code can check exact things but not whether the research was good.\
Not done: a seventh stopping check, asked for several times (a quote not found, a trial counted twice). · Decided: 29 Oct 2026 (owner answers 193a, 195a); the sixth, 2 Nov (217b).

**Everything else the check finds comes back once, as a note to the AI or a limit the answer states, and a check that can't pass stops after 10 rounds in a turn and says why.**\
Why: the owner wanted a limit "so we don't end up in a loop", and to "tell them WHY the check failed", with a bug report when nothing else can be done.\
Not done: simplifying answers so they pass (the owner: "no need to dumb down the answers"). · Decided: 24 Oct 2026 (owner answers 169, 172a); skipped checks named, 27 Oct (187); notes, 29 Oct (195a).

**AskRigor can't see or hold back the answer a person reads, so it makes the check visible: a closing check line, and a folded panel with what was checked, every limit and the checked figures.**\
Why: answers were often reworded after the check and another instruction didn't stop it; a figure missing from the panel's list was added after the check.\
Not done: repeating the whole checked answer in the panel (dropped 2 Nov). · Decided: 16 Oct 2026 (owner answers 99a, 100a); folded panel, 2 Nov (217b); checked figures, 2 Nov (220a).

**Under a passing check, the answer states in its own words only the limits that change what the person should believe or do; the panel lists them all.**\
Why: checks gave long lists of limits about the research itself (ten for one simple everyday question), and answers pasted them word for word.\
Not done: printing every limit in every answer. · Decided: 30 Oct 2026 (owner answer 205a).

**Judgments of meaning go to a model, or to an exact check of what the model declares; word lists and patterns decide only exact, structural questions.**\
Why: a word list can't judge paraphrase, negation or relevance, works only in the languages it lists, and such fixes kept letting the same failure back in.\
Not done: fixing a meaning check by adding words (the scout's English group-word list was dropped, 30 Oct, 201a). · Decided: 29 Sep 2026 (AskRigor's agent rules, from the shared development rules); refined 20 Oct.

**A second model, the meaning judge, reads what exact checks can't, but only adds notes and never stops an answer; it is for the owner's own test accounts and stays off until measured.**\
Why: in tests, model checkers found about a third to a half of what the regression judges found, with false alarms, so they fit as a second opinion, not a gate.\
Not done: a model check on other people's answers before payments and a privacy change (their health details would go to the model's company). · Decided: 2 Nov 2026 (owner answer 221); models measured 30 Oct (198a).

## The Atlas and cards

**The Atlas has two layers: research AskRigor keeps and reuses, and public pages that show only what's high value and hard to find; every research answer looks up the Atlas first and says how it builds on each finding.**\
Why: the owner: the Atlas stores answers AskRigor can draw from "to not redo research that was already done", but the public display "should not just be all the stored research".\
Not done: withdrawing weak findings to tidy the pages, which also removes them from research; they are "kept for AskRigor's research" instead. · Decided: 26 to 27 Oct 2026 (research builds on the Atlas); 3 Nov (owner answers 231a, 234a).

**A finding from AI research stays off the pages until a separate AI's quick-answer test shows that it would change someone's mind about something important.**\
Why: an AI can't fairly judge its own card, and 9 of the 13 findings the research lanes had published repeated a quick answer.\
Not done: publishing cards as soon as they're saved (24 Oct, 168a, replaced); test questions that name the option, which find its paper almost every time. · Decided: 4 Nov 2026 (owner answers 240a, 241a); the bar, 5 Nov (the owner).

**A shown card carries the whole picture (what's known and not, the options, safety, research and people's reports), with the new parts highlighted.**\
Why: the owner, 5 Nov: a card with only what beats the quick answer "wouldn't be enough to base a decision on".\
Not done: showing a finding on a test pass alone; none is shown until cards can hold the whole picture. · Decided: 5 Nov 2026 (the owner).

**A later card replaces an earlier one only when it answers the same question.**\
Why: a lane's next pass withdrew the card with its best find, because every new card replaced all earlier cards under one research target.\
Decided: 4 Nov 2026 (owner answer 240a).

**Rank findings by how strong and unusual they are, check the strongest hardest, and label what no person has reviewed (kept out of search engines).**\
Why: the owner wants "high quality useful information especially that is hard to find", and "the stronger the claim is, the higher it ranks, but the more it needs checking"; unreviewed AI pages also risk spam penalties and expected EU labelling rules.\
Not done: holding findings for naming a product, a harm, inhaled use or a serious illness (dropped 2 Nov). · Decided: 2 Nov 2026 (the owner's rule; owner answer 224a for the label).

**A published finding stays while it is valid: corrected with a dated note, taken down when someone shows it is wrong, rewritten if it could identify anyone; a contributor can cut every tie to a card at any time, with no reason needed.**\
Why: the owner: a person deleting a card "can't remove valid findings, only if they realized the findings were invalid".\
Not done: deleting valid findings on request (only the person's link to them goes). · Decided: 22 Oct 2026 (owner answers 159, 162a).

**Free research shares its checked findings with the Atlas; paid private research saves only when the person says yes for that answer; research the AI declares personal only is never saved.**\
Why: free use is paid for by sharing what its research finds, while paid users decide answer by answer.\
Decided: 1 Sep 2026 (free and paid modes); 30 Sep (automatic free saves, owner answer 11); 22 Oct (156a).

**Each finding page shows the research behind it: the papers' own short sentences (found word for word in text AskRigor fetched itself), how each paper was read, the strongest thing against it, and what people report beside it.**\
Why: the owner: "we need all the research that backs the interesting finding right there for people to inspect".\
Not done: quotes from the owner's library copies or from text the AI supplied; anything drawn from YouTube comments. · Decided: 5 Nov 2026 (owner answers 252a, 255a).

**Cards that fail on a technicality are kept privately for review, never published; rescuing one means rereading the paper and sending a corrected card through the final check.**\
Why: the owner, 4 Nov: "so we don't lose findings on technicalities".\
Decided: 4 Nov 2026 (owner answer 242a).

## People's reports and forums

**People's own reports of what worked come first, Earth Clinic style, with AskRigor's research around each; reports come through a person's own AI or the Atlas form.**\
Why: the owner, 3 Nov: people submitting what worked for them, "like earthclinic, but with the additional research around it", is one of the Atlas's main points.\
Not done: an Atlas built mainly from AI-found study findings (the 2 Nov plan). · Decided: 3 Nov 2026 (the owner; owner answer 229a).

**A report publishes once AI checks find it safe to try; a needed caution is added and labelled as an AI warning, and only reports the AI can't judge go to the owner.**\
Why: the owner: "if it's safe to try, people can try it ... only send me the stuff you can't understand if it's safe to publish or if it's too crazy".\
Not done: the owner approving every report. · Decided: 3 Nov 2026 (owner answer 229a).

**AskRigor reads forum threads itself, whole and with replies, searches a named list of good forums when the topic fits, and links on the Atlas the threads behind a finding, without usernames or post text.**\
Why: through the AI's own web search, answers read a median of two or three threads and many pages wouldn't open; usernames never reach the AI, so each person counts once and no one is named.\
Not done: Reddit's own API (hard to get, and the owner says its data runs months behind); passing any bot check. · Decided: 1 Nov 2026 (owner answers 211a, 213b, 215a); links, 5 Nov (253a); forum list, 6 Nov (265a).

**Count people, not posts or reviews: only people who used the exact thing count for it, comparisons give both doses, a post is judged after reading its whole thread, and reviews that read as machine-written are flagged as a clue.**\
Why: a thread about a product isn't evidence that anyone in it took it, and a switch that also changed the dose doesn't compare the two.\
Not done: AI-text detector scores; the owner: AI models "can often tell when something sounds human vs ai". · Decided: 12 Oct 2026 (owner answer 83); 16 Oct (99a); 22 Oct (161a).

**A forum signal can stand without studies, judged by how many people report what and how good their reports are; a study counts against it only if it measured what the reports measured.**\
Why: the owner, 5 Nov: "forum signal works even if no studies support it, if we find consilience between reports and especially if there's mechanistic explanation", saying when no studies were found.\
Not done: treating "no study found" as evidence against people's reports. · Decided: 5 Nov 2026 (owner answers 251a, 252a, 254a).

**What people report should lead to study searches, and study findings back to people's reports; one report of a cheap, low-risk option from someone who tried it gets one study search.**\
Why: in recent runs only 28 of 159 leads people raised got a study search, and a cheap option named in both a comment and a guideline went unsearched.\
Not done: more wording alone, since the rule already existed; each lead now gets its search or "not searched" and why. · Decided: 5 Nov 2026 (owner answers 250a, 251a).

**No popularity votes: readers report a problem with a finding, and people add "it worked for me too" or "it didn't" to a report, counted once per person.**\
Why: a problem report names what's wrong and sends the finding to review, while votes can be gamed and favour agreeable claims.\
Not done: agree and disagree votes on findings (on since 25 Oct; replaced in the next Atlas release). · Decided: 2 Nov 2026 (owner answer 223a); 3 Nov (229a).

## Video and YouTube

**Nothing drawn from YouTube comments goes on a public page until YouTube agrees: such findings are held privately, and the source is never hidden to get around the rule.**\
Why: AskRigor told YouTube such counts would appear only in people's own research answers, and its larger YouTube quota covers only the use it described.\
Not done: publishing comment findings without naming YouTube (218a); YouTube links on Atlas pages. · Decided: 22 to 25 Oct 2026 (owner answers 159, 170, 173); 31 Oct (208b); 2 Nov (218a, 219b, 227).

**What comments show is kept privately meanwhile: AskRigor's summaries and the owner's comment maps are kept for review, reused in no one else's answers, and deleted if YouTube asks; a check refuses any push that would publish a map's numbers.**\
Why: the owner, 31 Oct: YouTube's rules "don't prevent me from having my own information, they just don't permit us to make public stuff without approval", and this repository is public.\
Not done: deleting summaries on day 30 (replaced 25 Oct, 175a); rewriting older public records that mention YouTube's own comment totals (212b). · Decided: 25 Oct 2026 (175a); 31 Oct (208b); 1 Nov (212b); 3 Nov (228a).

**YouTube searches stay on YouTube's official API, within its limits: videos found by the Gemini scout or web search are read by their ID, and a spent search quota becomes a stated limit, never a stop.**\
Why: YouTube's rules forbid scraping and getting around the quota, and AskRigor's YouTube quota covers only the use it described to YouTube.\
Not done: yt-dlp or other website readers, Bright Data, extra keys or projects for more quota, or calls made only to raise usage. · Decided: 29 to 30 Oct 2026 (owner answer 206a); scout first since 27 Sep.

**Videos themselves are read through Google's Gemini API, which watches the public video; when a video couldn't be read, the answer says its account comes only from the title and description.**\
Why: YouTube's unofficial transcript route isn't allowed under OpenAI's plugin rules, and an answer must never describe a video it couldn't read as if it had (the owner's report #359).\
Not done: YouTube's unofficial transcript interface. · Decided: 2 to 3 Oct 2026 (owner answer 23A); released 4 Oct; 22 Oct (#359).

## Privacy and safety

**AskRigor keeps nothing of people's conversations by default: no request log (only a startup line), no copy of the quick answer (only signed fingerprints of its claims, which the AI carries), and no reading history on the Atlas.**\
Why: the privacy page promises it, and keeping people's health text would need a new promise and a retention period.\
Not done: even a one-line error log without a privacy-page change; keeping real users' answers to learn from. · Decided: 3 Oct 2026 (owner question 31); 25 Oct (reading history); 2 Nov (quick answer).

**A question and answer are shared for improvement only when the person says yes and confirms the exact de-identified copy, which is kept encrypted with nothing naming the account, for 90 days, and deleted sooner with its code.**\
Why: the owner, 30 Oct: "we aren't logging every question/answer but just the ones users send for improvement".\
Decided: 30 Oct 2026 (owner answer 200a).

**AskRigor never gets past bot checks, CAPTCHAs, logins or paywalls, and respects robots.txt; a page that refuses stays unread.**\
Why: it is a standing safety rule, and the owner agrees such passes are "impossible per AI safety rules".\
Not done: unlocking or scraping services that get past these checks. · Decided: 7 Oct 2026 (owner question 45); 1 Nov (owner answer 213b).

**A bug report is shown to the person first and sent only after their yes, with no personal details; a longer report only from people who turn it on.**\
Why: a report goes out on the person's behalf, so they see it and say yes first, and the owner didn't want long reports in chat unless the person turns them on.\
Decided: 12 Oct 2026 (owner answer 78a); 17 Oct (109a); 21 Oct (154).

**Serious rare harms are searched by name, apart from common side effects, and a harm not searched is reported as not checked, never as absent.**\
Why: the owner, 20 Oct, on making it optional: "wouldn't that basically make it optional and then someone might die?"\
Decided: 20 Oct 2026 (owner answer 128b); a harm search behind safety claims is one of the six stopping checks since 29 Oct.

**Outside services get only what they need: Google's Gemini gets a public video link or a screened description of a group of people, never a person's name, question or health details.**\
Why: Google's terms say not to send personal information to its free services, and its reviewers may read free-tier requests.\
Not done: tests on Gemini's free tier. · Decided: 27 Sep 2026 (names in scout searches); 3 Oct ("check this video"); 21 Oct (155).

**Sign-up never reveals whether an email already has an account; the message points to "Log in" instead.**\
Why: for a health research tool, having an account says something about a person.\
Not done: turning off Auth0's generic sign-up message. · Decided: 27 to 28 Sep 2026 (the owner set it up).

## Spending and models

**AskRigor spends nothing on paid model calls of its own, except uses the owner approves one by one: today the meaning judge on the owner's monthly Claude API credit, and Gemini for videos under AskRigor's own monthly cap.**\
Why: every cost is the owner's call, made in advance with a ceiling, and paid users' own model use, once payments exist, is theirs to pay.\
Not done: paid paths a coding worker proposes on its own; spending beyond the credit. · Decided: by 1 Sep 2026 (spending policy); Gemini, 27 Sep; paid users, 29 Oct; 2 Nov (owner answer 221).

**Model work runs on the owner's subscription plans; paid API calls only for what a real product would have to pay.**\
Why: the owner, 2 Nov, after a costly pilot: "make sure before you spend so much that it's actually worthwhile", and "why we need to use the api credits if there's no web app".\
Not done: spending before a free check of the setup, or in one big run instead of stages with a stop rule set beforehand. · Decided: 2 to 3 Nov 2026 (owner answer 226b).

**The plugin in people's own AI apps is the product; there is no AskRigor web app for now.**\
Why: a web app pays for every answer's model use, the owner doubts "anyone will pay that much", and a trial found its answers about level with the ChatGPT app's.\
Not done: a hosted app on people's own ChatGPT plans until OpenAI approves (the owner applied 30 Oct, 202a). · Decided: 30 Oct 2026 (the owner); trial ended 3 Nov (226).

**Personal logins stay off servers: no ChatGPT or Codex subscription login on AskRigor's server.**\
Why: a subscription is for one person's use, not for serving AskRigor's users, and a bug or break-in on the server could act as that account.\
Decided: 17 Oct 2026 (owner question 118); 2 Nov (221).

**Free users are told what a paid feature would add, only where the paid version really does it on their app; ChatGPT answers say what they couldn't check and link a page, without naming another app or plan.**\
Why: the owner, 2 Oct: free users should "know that they are missing out on paid features whenever they are", and OpenAI's rules cover what the plugin itself says.\
Not done: silently dropping paid features; a line about anything nobody can buy or use there. · Decided: 2 Oct 2026 (owner question 22); 3 Oct (32: B).

## Releases, the tool list and apps

**The tool list is frozen: new inputs go in a tool's later_inputs field, new actions only in runtime choices, and only adding or removing a tool changes the list, with one app refresh.**\
Why: ChatGPT keeps an app's tool list until someone presses Refresh, and AskRigor used to change its list nearly every release, stranding open chats.\
Not done: changing a published field or description in between (such fixes wait in tool-list-changes-waiting.md). · Decided: 27 Oct 2026 (owner answer 189a); apps told when to refresh since 22 Oct.

**Every tool result also carries its payload as text, except in ChatGPT, which shows the model both; a protocol page's bytes go in raw, so an app that reads only text can check them.**\
Why: some apps hand the model only a result's text, so the protocol, its index, PubMed records and full-text pages never reached it there (lesson #59), while ChatGPT's context and time limits make a copy costly. A call is ChatGPT's only by exact signals: a `_meta` key starting `openai/`, or a User-Agent starting `openai-mcp/`; any other call gets the copy, since a copy costs tokens where a missing payload breaks research.\
Not done: patches tool by tool; guessing the app from anything else; changing the tool list. · Decided: 7 Nov 2026 (lesson #59's build; not yet released).

**New work targets the ChatGPT app, the Claude connector and the Codex plugin, not Custom GPTs.**\
Why: the owner, 17 Oct: "GPTs are on the way out, so it doesn't make sense to build a new feature for custom GPT if it doesn't work for plugins".\
Decided: 27 Sep 2026; 17 Oct (the owner).

**AskRigor's listing in ChatGPT's app directory waits until it works well enough.**\
Why: the owner, 28 Oct: "it still often fails its own checks and doesn't explain why", and people would be sending bug reports nonstop.\
Decided: 28 Oct 2026 (owner answer 192c); still waiting, 5 Nov (258a).

**Every release needs the owner's yes; lessons and reported fixes are built as soon as they're triaged, and the owner is asked first only when a change alters clinical or scientific method.**\
Why: not recorded beyond the owner's choice; releases bundle several lessons.\
Decided: 21 Oct 2026 (owner answer 148a).

**After each release the owner's regression list runs, a release waits while a run is going so the build under test doesn't change, and test runs never save or show cards.**\
Why: a run is what shows whether fixes work in real conversations, and test cards aren't real findings.\
Not done: calling a case fixed after one good run (it needs two passing runs in a row). · Decided: 24 Oct 2026 (test cards set aside, 171); 26 Oct (185b); 29 Oct (193a); 5 Nov (247a; test marker, 257a).

## The site and support

**The site leads with fairness, not price: better health information shouldn't depend on what you pay.**\
Why: the owner, 5 Nov: "Why should people with money have better information, especially about health? AskRigor narrows the gap, with the help of people like you."\
Not done: leading with "free". · Decided: 5 Nov 2026 (the owner).

**"Add AskRigor" gives Claude's steps today, says AskRigor is coming to ChatGPT's app directory, and suggests "Always allow" for AskRigor's tools.**\
Why: free ChatGPT can't add an app by its address while Claude's free plan can add one custom connector, and one piece of research makes dozens of tool calls.\
Decided: 5 Nov 2026 (owner answer 258a; the owner on "Always allow").

**Money for AskRigor is support for its development, through GitHub Sponsors, a Stripe payment link and a Bitcoin address, not a donation.**\
Why: it goes to Mayan Roots LLC, which builds AskRigor, and isn't tax-deductible.\
Not done: calling it a donation; CoinPayments for any coin, which needs the owner's own merchant account first. · Decided: 6 Nov 2026 (owner answer 264a); the Bitcoin address, 6 Nov (the owner).

**Bigger research jobs: people ask for a quote by email from the Support page, the owner quotes each job by hand, and nothing is charged unless the quote is accepted.**\
Why: the owner, 7 Nov: "just a request form for now then and i'll do custom quotes by hand". Site pages run no scripts or forms, so the request is an email with four questions filled in, and the site stores nothing. A quote says how the job will be done, which AI services will read the question and whether anything from it may be published.\
Not done, for now: automatic prices, and paid alerts, which people can set up as an alert job on their own AI with AskRigor (the owner: "prob no point on that, idk"). · Decided: 7 Nov 2026 (the owner).

**The roadmap is public and open to comments; AskRigor's AI reads each one into the plan, and a person reviews anything that isn't clearly good.**\
Why: the owner asked for a public roadmap of the short- and long-range plans that people can comment on.\
Decided: 5 Nov 2026 (the owner); comments open with the Atlas, email until then.

**Site and Atlas pages run no scripts and no inline styles, under a strict content security policy.**\
Why: not recorded.\
Decided: by 25 Oct 2026 (the Atlas pages' security headers); topic maps drawn without scripts, 26 Oct (183b).
