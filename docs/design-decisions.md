# Design decisions

How to use this:

1. Read the entries for an area before you redesign anything in it.
2. Each entry says what we chose, why, what we decided not to do, and when.
3. When a decision changes, edit its entry, keep the date of the change, and say briefly what it replaced.
4. Owner answer numbers (such as "240a") point to the owner's private decisions page; the protocols, docs and release records here hold the detail.
5. Add an entry whenever the owner decides something a later change could undo by accident.

## Research and sources

**The word "significant" is linted for misuse in research answers, not banned from English prose.**\
Why: the owner clarified on 13 November 2026 that statistical significance must not replace effect size, and that ordinary meanings (important or substantial) remain legitimate. The deterministic scanner offers advisory detection of high-confidence unsafe inferences; the optional existing semantic judge evaluates context in its current call without a new paid API request.\
Not done: a word ban, automatically classifying substantial real-world improvements as statistical, adding a seventh final-check blocking rule, or using regex to decide human meaning. This supersedes only the earlier ban on word lists, not the semantic-judgment boundary. Proposed 13 November 2026; not yet released.

**A first pass stops early (about three videos read or two search rounds) and ends by offering what a deeper pass would focus on.**\
Why: a full-depth answer took up to two and a half hours, most of it the model working through steps, not waiting on sources.\
Not done: the old fixed minimum of eight videos and six programs. · Decided: 27 to 29 Sep 2026 (the owner); shipped 1 Oct.

**Before researching, the AI writes the quick answer it would give without AskRigor, and the final answer ends with what the research confirmed, corrected or qualified.**\
Why: the owner wants people to see how the answer is better than a plain AI answer.\
Not done: keeping a copy of the quick answer (see Privacy and safety). · Decided: 20 Oct 2026 (owner answer 140b); free accounts too, 27 Oct (190a); kept when one claim went unchecked, 1 Nov (210b).

**Research the person can steer: the framing goes with the quick answer, a cheap screen ends in a numbered menu of next tasks with times, and each account sets its research style once: guided, balanced (the default) or autonomous, with a check-back allowance of 10 minutes.**\
Why: the owner's report AskRigor#434 (8 Nov): a 52-minute run stayed on a question asked backwards and gave less than the one-minute quick answer. The owner asked to frame first, ask only what could redirect the research, screen, then share out the time by task number ("1. 5 min, 2. 4 min, 7. 1 min"). HRP already had these steps and none ran, so AskRigor's results now say them where the AI acts: `register_plain_answer` takes the framing, `plan_research` makes the menu, and the quick-answer note says how long the research took.\
Not done: refusing research tools out of order before the soft version is measured; a web app that runs the research (about $5 to $10 a question); keeping any research plan on the server; time estimates from anything but planning ranges until the regression runs measure them. · Decided: 9 Nov 2026 (owner answer 279a); built and released 9 Nov.

**What each key observational study adjusted for: the AI looks at each variable's likely role, and the answer mentions only adjustments that look doubtful on a quick check, unless the person chose to see all of them.**\
Why: the owner, 9 Nov, answering 279: listing every adjusted variable "could be quite a lot of variables... default balanced mode might only mention the adjustments you think on a quick check look potentially inappropriate or controversial and might warrant further investigation".\
Not done: every adjusted variable by default; a blocking check. · Decided: 9 Nov 2026 (owner answer 279a).

**The menu's time estimates are measured, not guessed: per source, a paper read in full 1 to 2.5 minutes, a forum thread 0.5 to 1.5, a method audit 2 to 4, a video's comments 1 to 4, a search 0.5 to 2.5; and the menu adds the final check and writing the answer, 4 to 10 minutes. An emergency's urgent action comes before any menu.**\
Why: the owner, 9 Nov ("Start them"): 14 regression questions through Codex's AskRigor app on the live build, timed event by event. The starting estimates were two to five times too long per source, and left out the 6.7 minutes (median) of checking and writing; with the new values 12 of 13 measured runs fall inside the predicted range. The antivenom emergency got a menu and 17 minutes of research before its answer; HRP already forbids that (`ParallelEmergencyAndAdjunctQuestions`). Every first menu call was refused for guessed fields, so the screen now spells them out.\
Not done: per-call times as the estimate (Codex runs calls in parallel, so they read 10 to 40 times too short); a change to the five-minute threshold, which was the owner's (the next entry, 10 Nov). In-sample, one model at one effort: later runs confirm or correct the values. · Decided: 9 Nov 2026 (measured; the owner's go-ahead); released 9 Nov (owner answer 285a).

**Balanced asks before researching when the recommended tasks could take more than about 10 minutes, or when the person's choices could steer the research, which the AI says from its screen (`steering_could_help` on the menu, counted as yes when left out; on a dev account, the question it would ask the person, or none, `steering_choice`); it goes on without asking only for a precise question whose tasks fit in about 10 minutes.**\
Why: the owner, 10 Nov, answering 284: balanced "should ask if the research could take longer than 10 mins OR if there is reason to believe from the initial analysis that steering could direct the research more usefully, which i'd say it usually can unless the prompt is quite precise". With the measured times all 14 timing-run menus came to more than five minutes, so the five-minute rule asked before nearly every question without saying why. HRP's `StructuredUserSteeringAndApproval` makes the same split: approval required unless the scope is clear. When it asks for the person's choices, the AI says in one line what they could change. The timing runs on the released rule (owner's go-ahead, 10 Nov, 20:31 UTC): the rule gave the right next step on all 14 menus, 8 asking and 6 going on, but the model said its menu could not be steered on all 14, open questions included (a person's own three symptoms, an oil whose form changes its strength), so every ask came from the time estimate. The field's wording now carries HRP's own test: true when a choice the person could make, or something only they know, could materially change what the research checks, even when the question is clearly worded; false only when the question already fixes all of that (released 12 Nov). On the owner's ChatGPT that day (10 runs) the AI gave no judgment on any menu, so the default decided every short one, and the control question, one figure from one named trial, got the menu twice instead of an answer. The owner, 12 Nov: "those choices should have not been given as choices since they were required to answer the question", and to try the change on the owner's account first (owner answer 294c). So on a dev account, a menu whose ask rests only on the judgment left out plans nothing until the AI gives it: the result hands the call back with the judgment's place marked and the test both ways, true, the usual case, when a choice of the person's or something only they know could materially change what is checked, false when no choice is left to them because the question fixes it and every task is needed to answer. Whether it is needed is read from the rule itself (the same menu with false would go on). Round 4 of the owner's ChatGPT runs, on the build that required it (#440, live 12 Nov, 23:58 UTC; the runs on 13 Nov, 00:03 to 00:39 UTC): the control got false and a checked answer in one turn, for the first time, and the orange-peel and Syrian-rue questions got true and asked; but the PewDiePie and SMILES questions got false and went straight to a checked answer. Asked why, the AI named a choice of the person's both times: "I judged that all three checks were necessary to answer the question and that asking you to choose among them would merely delay the research. However, you could have clarified whether the comparison concerned Chinese AI-distillation attempts specifically or China's broader AI-development capabilities ... therefore, true would have been defensible, and my false judgment was too categorical"; and "I interpreted your question as a narrowly specified factual verification of one trial ... You could have chosen a broader comparison of dietary interventions against antidepressant trials ... I selected the narrow approach myself." So a bare yes or no let "every task is needed" stand for "nothing to ask", though the reading or the comparison was the AI's own pick. The owner, 13 Nov: "for pewdiepie, i do recall it answered mostly the wrong question", choosing 296b: the AI must first try to name a choice of the person's that could change the research, and asks whenever it can name one. So the menu takes `steering_choice`, the one question the AI would ask this person before researching, or the word none; on every account that gives it, a named question counts as yes and none as no, in place of `steering_could_help`. On a dev account, a menu whose decision rests on the judgment (planned as steerable it would ask, planned as not steerable it would go on, read from the rule itself) plans nothing until it carries one: the yes or no alone, true or false, is handed back with the question's place marked and the test. The test: try to name the question first; none only when the question itself fixes exactly what to look up, as with one result of one named study; and that every task on the menu is needed to answer is not by itself a reason for none, since the person may mean a different reading or comparison than the one the AI picked. When the menu asks and a question was named, the reply puts that question to the person with the menu, in place of the general line on what their choices could change. AskRigor checks only that a `steering_choice` was given and whether it is exactly the word none, in any letter case: none is a value of the field, as true and false are of the other, not a judgment, and any other text is a named question, so what is unclear asks. A menu of any other account that gives no `steering_choice` is planned as before, until the owner's five test questions show that naming the question tells a precise question from an open one. Round 5, on the build that asked for the question only in a refusal (13 Nov, 02:51 to 03:18 UTC): the control carried none and answered, and the PewDiePie and Syrian-rue questions named a question and asked; but the orange-peel and SMILES questions carried none and went straight to a checked answer, and in both the AI's first call had already said no question was needed, before AskRigor had asked for one. The owner chose 297c: on a dev account the AI is asked for the question where it first learns the menu (the menu's shape at the screen, the next step after the quick answer, and the example a refused menu comes back with), and when it still writes none, the answer says in one line, before anything else, how it read the question, so a reading the person did not mean shows at once. The owner, of that round: "the orange peel question is a perfect example of wasted time without steering". Round 6, on that build (13 Nov, 12:22 to 12:45 UTC): 2 of 5. Asked at the screen, the control's AI named a question in its first call and the look-up got a question in place of its answer ("none would have been the better choice", it said afterwards), and two open questions still wrote none. The owner chose 298b: the asking at the screen is taken back, so `register_plain_answer` gives a dev account the words it gives every account; the refused menu's marked place and the reading said first stay; and whether a question is open is to be tried as AskRigor's own model call, on dev accounts, beside this path.\
Not done: a word list or a check that decides whether a question is precise, or whether what `steering_choice` holds is a question (the model's judgment, in any language; only the exact value `none` is read, and since 13 Nov a value that is neither it nor a sentence, such as `none_needed`, is handed back for one of the two, after the control's AI wrote that and got the menu); deciding it from the menu, such as "every task recommended means go on", which an open question's menu meets too; requiring the named question on every account before it is measured; reading the answer's first line to check that it says the reading (the model's to say); counting the final check and writing in the 10 minutes; a blocking check. Replaced: five minutes of recommended research (9 Nov); on dev accounts, the yes or no required on 12 Nov (owner answer 294c), by the named question (13 Nov, owner answer 296b). · Decided: 10 Nov 2026 (owner answer 284, in the owner's words); released 10 Nov (owner answer 286a); the field's wording after the 10 Nov runs, released 12 Nov; the judgment required on dev accounts, 12 Nov (owner answer 294c), released 12 Nov (owner answer 295a); the named question on dev accounts, 13 Nov (owner answer 296b), released 13 Nov; asked for at the screen, and the reading said first after none, 13 Nov (owner answer 297c), released 13 Nov; the asking at the screen taken back, 13 Nov (owner answer 298b).

**On a dev account AskRigor plans the research itself: when the quick answer is registered, one model call of AskRigor's own looks up what the question is about (two web searches at most), names the one question to put to the person, or none, and lists the tasks; the person's AI gets that as a menu ready to send, and screens and plans itself only when the call is off, over its limits or fails.**\
Why: the owner, 13 Nov: "perhaps the research plan should be tried directly as an api call rather than hope the AI can figure it out, especially if the AI is not a very high thinking one", having seen ChatGPT's free models take "Ajax" for a football club; and "we want to get the best of a chain of answers in the first answer". Rounds 4 to 6 of the owner's ChatGPT runs left the judgment to the person's AI, with a yes or no, then a named question, then the question asked for earlier: 3, 3 and 2 of 5 by the criteria, a different question failing each time. Tried offline the same day: with the question alone a model took Ajax for the football club 6 times of 6; with up to two searches, two Claude models and a GPT model wrote none for the control and named a question for the four open ones. The call as built, on Opus 5.5 at low effort: 5 of 5 on the test questions, on which its wording was tuned, and 7 of 8 wider ones as expected (none for a named trial, one video, an emergency; a question for "the best treatments for depression"; a question about the concentration of nebulized hydrogen peroxide where none was expected), at 6 to 9 cents and 10 to 22 seconds. It plans best from the person's own words, so a dev account's AI passes them on; AskRigor keeps none. Owner answer 298b: built for dev accounts and tried for a week beside the other way, beneath the USD 3 a day the owner set for the meaning judge.\
Not done: every account (the owner's direction, with about 10 calls a day for a free account and a word when they are used up: it needs a spend ceiling and the notice to say the question goes to Anthropic); telling a weak AI from a strong one (apps don't say which model runs); checking the call's reading against anything; a second call after the person answers (the AI adapts the tasks, as before). · Decided: 13 Nov 2026 (owner answer 298b, in the owner's Inbox and typed in chat).

**On a dev account AskRigor reviews the draft at the final check: one model call of AskRigor's own reads the person's words and the draft (two web searches at most) and names up to three things the person would most likely have to ask next; the check adds them as one note, as advice, and changes nothing else.**\
Why: the owner, 13 Nov, choosing 301a: a good first answer is the one a chain of follow-up questions would have ended on, and AskRigor can ask that of a model itself rather than leave it to the person's AI. It is advice only because owner answers 193a, 195a and 217b allow the final check no new blocking check: its status, next steps, receipts and findings card are the same with the review as without it. A question is reviewed once (a key of the account and the person's words, for an hour), so the AI revises once and checks again, and a review that did not run says so in one line. The owner raised the ceiling for all paid Claude API features together from USD 3 to 7 a day for it ("you could spend upo to $7 per day if needed").\
Not done: every account; a blocking check on what it finds; showing it on the call record or the account page; the rubric is the owner's and may be replaced (its version is in the key). · Decided: 13 Nov 2026 (owner answer 301a, in the owner's Inbox).

**On a dev account AskRigor's own plan also names a lane: research, as before; light, for one fact that one named source states, where the AI opens the source, quotes the line and checks the answer once, with no method audit, second search or review of the draft; or aside, for a plain look-up AskRigor's research would add nothing to, where the AI answers as it would without AskRigor, starting with "AskRigor says this question doesn't need AskRigor's research. Here is the regular AI's answer:".**\
Why: the owner (Inbox, 13 Nov, 21:20 UTC): "pitch lookup taking 9 minutes is kind of insane don't you think? ... we should figure out when to simply abandon the entire askrigor process if it's too much and say "askrigor says this question doesn't require askrigor, here's the regular AI's answer:"?"; then (Inbox, 14 Nov, 02:18 UTC) "could we do a combo of a and b, so if it's really for sure a light lookup askrigor wouldn't help with, go for a, otherwise if askrigor may help but it's still light, go with b?"; and in chat (14 Nov, 02:19 UTC) "yes 302a but also b?". The lane is the planning call's judgment, as the plan is; AskRigor only checks that the reply does not contradict itself (aside and light only with no question for the person, light only with one or two tasks and no method audit), and in doubt it is research. A light answer starts with "AskRigor light look-up: the source was opened and the line quoted; nothing else was checked. Say 'research it fully' for more." A guided account is still asked first, and a request for research brings the full research back through a new registration with the person's words. The cost the owner accepted: AskRigor checks nothing in a step-aside answer, and in a light look-up nothing but the quoted line and the final check's six checks.\
Not done: every account (the planning call runs only for dev accounts, inside its week's trial); a word list or rule that decides from the question which lane it is; a check of a step-aside answer; a review of a light look-up's draft. · Decided: 14 Nov 2026 (owner answer 302, a and b together, in the owner's Inbox and typed in chat).

**Learn mode, on a dev account only: off unless the person turns it on by saying so; while on, AskRigor keeps that account's own answers to the menu of next tasks (which tasks, how many minutes, whether it was "you decide") and the person's reason in their own words, the newest 20, and gives them to its own planning call; turning it off deletes them.**\
Why: the owner, in chat on 13 Nov 2026 at 21:46 UTC: "can we also learn from users menu choices (especially if they give reasons), and let users turn on learn mode for their own menu choices?"; then option a of question 303, chosen in the Inbox on 14 Nov at 02:18 UTC: "learn mode on your account now, inside the week's trial. It keeps your own choices and reasons and nothing of anyone else's." The question described it as a setting like the research style, off unless the person turns it on, whose menus would then recommend what they usually pick and stop asking what they always answer the same way, with the menu's last line naming it beside the three modes. It goes with the planning call (owner answer 298b), so it is for dev accounts only, while that call is on: no other account is offered it, its request to turn it on is refused whole, and nothing of its menus is kept or sent; turning it off is never refused, since it deletes what was kept. What the history means for the plan is the planning call's judgment, in its rubric's words (2026-11-14.2); AskRigor only counts and compares what the menu declares, and keeps the reason as given, cleaned to one line and cut to 300 characters. Whether an answer was "you decide" is read exactly: the allocation equals the menu's own recommendation.\
Not done: every account; the menu's own rule for when to ask reading the history (only the plan it informs changes); keeping a task's words, the research target or the answer; deleting the choices with the 7-day call record or on revoke (no path deletes an account's call record as a whole; revoke keeps the research style too). · Decided: 14 Nov 2026 (owner answer 303a, in the owner's Inbox); typed in chat as "303a" on 14 Nov at 10:07 UTC; released 14 Nov, 10:15 UTC (#461).

**On a dev account, balanced research does not ask again for the menu's length alone when the person's newest message told the AI to go on: AskRigor's own planning call judges whether it did, and the menu it hands over carries a signed mark for it.**\
Why: the owner's note of 14 Nov 2026, 00:54 UTC, on AskRigor#457: "A follow-up explicitly instructed the assistant to continue digging, with earlier comparator scope already fixed ... the `register_plain_answer` planner returned `research_plan.steering_choice: "none"`, with five substantive research tasks. Nevertheless, `plan_research` returned `researchMenu.next: "ask"`"; then option a of question 304, chosen in the Inbox on 14 Nov at 10:05 UTC: "when your latest message tells the AI to go on, continue or dig deeper, and the plan has no question for you, the research goes on with the recommended tasks without asking. The planning call judges whether your message says that. A first question still follows the 10-minute rule. The cost: a follow-up can then run longer than 10 minutes before you hear back." Whether a message says to go on is a judgment of meaning, so it is the planning call's, read from the newest of the person's messages when the AI passed on more than one; AskRigor checks shape only (such a message was there, the plan names no question, the lane is research). The mark is signed for the menu's tasks and its plain-answer receipt, so the AI cannot write one or move it to another menu, and AskRigor keeps nothing to check it. Guided research still asks, as it asks before every long task; a named question, a menu changed after the person saw it and a re-plan ask as before; the go-ahead says why it did not ask.\
Not done: every account (the planning call runs only for dev accounts); the AI declaring by itself that the person said to go on; a longer check-back allowance for such a follow-up (the recommended tasks are those of any menu); carrying over an allocation the person gave earlier in the conversation. · Decided: 14 Nov 2026 (owner answer 304a, in the owner's Inbox); built 14 Nov, not yet released: its release waits for "304a" typed in chat.

**A question AskRigor asks ends the turn: the result that asks puts the stop first and gives the message to send, a question gets no final check, and every research result says a research turn ends with the checked answer or with the question AskRigor said to ask, never with a progress report.**\
Why: the owner, 11 Nov: "it's still not asking me any steering questions". No menu or question appeared in 13 ChatGPT turns of 10 and 11 Nov. In the 10 Nov timing runs (Codex, live build) the rule asked on 9 of 15 first menus: the run stopped on 2, and six went on with 40 to 52 research calls, three of them on an allocation the AI made up for the person. The turns that stopped still ran the final check and ended on its line, so none of the 21 turns ended with a question. The ask came after the menu and was followed by five paragraphs on doing the tasks. The server instructions, the one text ChatGPT always has, never mentioned asking and still said "widen discovery until finalize_research accepts it", left from the final check before 29 Oct. HRP already allows a reply that only asks when steering is required (its preflight exit, and `StructuredUserSteeringAndApproval`: "begin no substantive source collection in the same response"). The reminder on every research result is the soft one planned on 9 Nov (owner answer 279a), worded so it needs no state. Round 3 of the owner's ChatGPT runs (12 Nov, build 1d877300): the ask hands over the "you decide" call ready to copy, with the recommended allocation in it, and any allocation naming an open task counted as the person's answer. In the orange-peel run the AI received the ask and 54 seconds later, in the same turn, sent exactly that call; AskRigor said go on, and it researched for 17 minutes without the person. Asked why: "I treated AskRigor's returned you_decide_later_inputs allocation as a usable default. That was an instruction-following error." The same prompt ignored the ask in round 2 as well (2 of 3 runs). So an allocation is the person's answer only when the AI declares it, with `person_answered` true in the menu: one sent with false or without it is not used, the recommendation is AskRigor's own, and the result says so before anything else, as the ask again and not as a call to correct (a menu that goes on whatever the person says, autonomous research or a short menu judged not steerable, says its tasks are AskRigor's own). The handed-over call carries `<true|false>` in `person_answered`'s place, so a copy sent as it is asks again. Whether the person answered is the model's knowledge, in any language: AskRigor checks only that it was declared true, and receives no word of the person's. It went to dev accounts first (released 12 Nov, 23:58 UTC). Round 4 on the owner's account (13 Nov, 00:03 to 00:39 UTC): no first turn went on with an allocation the person had not given, and a real "you decide" went on at the first `plan_research` call, while every other account still got the handed-over call as a usable default, which is how the AI took the person's answer for itself on 12 Nov. So since 13 Nov the requirement, the placeholder and the words are every account's: a fix, under the owner's standing rule for fixes, told to the owner that day with no objection. The same day, a research target that is not the one registered with the plain answer stops the go-ahead in `next_step` too (Greptile's review of 12 Nov, reproduced by an audit): the text carried the warning, but an app that hands its model the structured content was told only to do the tasks, and the answer ended without the comparison with the quick answer; `next_step` now says the correction before any ask and in place of the go-ahead.\
Not done: refusing research tools while a menu waits, and a menu card (two new tools): the owner's choice if the ChatGPT runs miss the bar (owner answer 288b), and the next step, in place of a second wording, if a first turn still goes on by declaring `person_answered` true without a reply. Also not done: a run handle on every call; a form (MCP elicitation, which AskRigor's per-request servers can't hold and classic ChatGPT doesn't show); reading the person's reply to check the declaration; a word list deciding what counts as a question or as an answer. · Decided: 11 Nov 2026; released 12 Nov (owner answer 292a); the person's answer declared on dev accounts, 12 Nov, released 12 Nov (owner answer 295a); on every account, and the research target's correction in `next_step`, 13 Nov, not yet released.

**`plan_research` reads the menu in the names the AI guesses (camelCase, a task's title, minutes as one number, null for a field left out, the allocation beside the menu or as user_allocation) and refuses only what it can't read, with the AI's own call corrected; an ask hands over the exact "you decide" call; a menu the AI changes on its own after the person saw it asks again.**\
Why: the owner's ChatGPT, 12 Nov, on the build that made the ask end the turn: the AI stopped at the menu on 7 of the first 8 open questions, but every run's first 2 to 5 menu calls were refused for guessed names (15 to 20 seconds each), and after "you decide" AskRigor refused five allocations, so the AI researched without one, about 9 minutes against the 7 it proposed. Greptile's review of 12 Nov: a re-plan before any task was done could add a task the person never saw. Each result carries a signed digest of what the person chose among (the number of tasks and each one's kind, what it could change and its loop), so a task added, removed or changed with no allocation from the person asks again, while a menu retyped in other words or with new time estimates doesn't ask twice. A call that carries the person's allocation goes on with it under every style, since they may have changed the menu themselves (Greptile's review of 12 Nov: autonomous research dropped it for the default tasks). An allocation is the person's only when the AI declares it (`person_answered`, the 11 Nov entry above: dev accounts on 12 Nov, every account since 13 Nov).\
Not done: inferring a task's kind or what it could change from its words (the AI's judgment); making `steering_could_help` required on every account, though the AI left it out on every ChatGPT menu of 12 Nov, so a precise question asks too (the owner's answers 294c and 296b try the judgment on dev accounts first, since 13 Nov as a question the AI names; the 10 Nov entry above). · Decided: 12 Nov 2026.

**AskRigor also searches OpenAlex, a free index of nearly all journals, as a later input of `search_europe_pmc` (`later_inputs.index` `all_journals`), so no app needs a refresh; the screen asks for it for plant, food, farming and traditional remedies, and a verified search counts as the source beyond PubMed and Europe PMC before anything is called not found.**\
Why: the owner, 9 Nov (283a), after the Syrian rue oil comparison: the paper that decided the question sat in a journal PubMed and Europe PMC don't index. Since 2026 OpenAlex meters use: without a key, every request from one server address shares a small free daily allowance (about 100 searches); a free key has its own (about 1,000), and getting one takes the owner's email. AskRigor never retries a refused search, so it never spends past the free allowance; a spent one comes back as rate_limited, and the result says the index could not be searched. Only the search words, date range, page size and cursor go to OpenAlex.\
Not done: a tool of its own (every app would need a refresh); OpenAlex among the Atlas card's searches (still PubMed, Europe PMC and ClinicalTrials.gov); a key, which is the owner's to get and add. · Decided: 9 Nov 2026 (owner answer 283a); released 9 Nov (owner answer 285a).

**When the answer turns on a form or preparation, the framing takes the question to be about the form people can buy or make, asks which form the person has when forms differ much in strength, and answers for each form until they say.**\
Why: the owner, 9 Nov (a reply in the Inbox on the Syrian rue oil check): "nobody sells syrian rue seed oil hexane extract (none that i can confirm), so people are talking about mixing the seeds in some household oil when they ask this question, but that should also be confirmed with the user". It applies HRP's `WholeInterventionIdentityTrace` (the tested against the sold version) and `UserReportedUseFidelity` (the form actually used), in the plain answer's framing request and the screen's guidance.\
Not done: a list of forms or a check (which forms matter is the model's judgment). · Decided: 9 Nov 2026 (the owner); released 9 Nov (owner answer 285a).

**A source's "significant", "rich", "high" or "substantial" is not a size: the AI finds the sense and the number behind the word, compares the number with what the question needs (for an amount, the amount in a usual dose), or says beside the claim that the source gives none.**\
Why: the owner, 9 Nov, after a Syrian rue oil comparison in which three ChatGPT modes without AskRigor called a seed oil potentially strong from an abstract that called it a rich source of the alkaloids and gave no amount: "significant is a weasel word in science with so many different possible meanings and often meaningless. we should make sure askrigor is really careful with that word." The paper's full text had the amounts (about 0.9% of the oil), and none of the four answers read it: the word is a reason to find the number, not to accept or dismiss the claim. HRP already says a bare significant label is not a magnitude (`effect_magnitude`, `NumericExposureOverridesAmbiguousLabels`); AskRigor's screen and menu now say it where sources are read.\
Not done: a word list or a blocking check (which sense a word has is the model's judgment, in any language). HRP 20.6.41 carries the rule itself, `WordsAreNotSizes` in `StatisticalAndClinicalInterpretation`, outside the core, with the stress test `RichSourceWithoutAnAmount`, in the words the owner approved (owner answer 282a, 9 Nov: "add both, as written"); released 9 Nov (owner answer 285a). · Decided: 9 Nov 2026 (the owner); the results' wording built and released 9 Nov.

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

**A passing check is the turn's last unless the draft itself changes, and then once more; notes about later inputs (the study map, the findings card, source lines) are for a later answer, and the shapes those inputs need are given before the first check.**\
Why: in the 10 Nov timing runs, 49 of 88 final-check calls came after the check had passed, 0 to 6 in a turn. Most were invited by notes about later inputs and by the study map's shape, which came only with a pass. All 17 checks that held an answer back were a turn's first, mostly over a reading the receipts already showed but whose entry came with guessed field names or none. Every pass also says it covers the six checks, not whether the search was complete: a research lane had read a pass as the end of discovery (lesson 56, 5 Nov).\
Not done: changing the six checks; dropping the 22 Oct rule that a draft changed after a pass is checked again. · Decided: 11 Nov 2026; released 12 Nov (owner answer 292a).

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

**The loop between people's reports and studies is a numbered task the person sees on the menu: a study search for something people reported, or a look at people's reports for something a study found.**\
Why: the owner, 9 Nov: "make sure we have the forum to study feedback loop in place when warranted, i really think that is a key feature that i've been asking for for a long time". On 5 Nov, judges reading 18 runs found 19 of 98 report leads searched in studies; a declaration checked only at the end didn't make the loop happen.\
Not done: a blocking check; a loop task for a question with no people's-report side. · Decided: 9 Nov 2026 (the owner); built and released 9 Nov.

**For something people take or do, such as a widely used old remedy, the quick screen looks at what people who used it report from the start, and a first menu with no task reading people's reports says to add one near the top when HRP's forum trigger applies.**\
Why: the owner, 9 Nov: AskRigor "should have thought to investigate first of all whether people actually use syrian rue oil as an MAOi, that's kind of obvious considering it is a very widely used very old herbal remedy". HRP's `ForumSignalDefaultTrigger` and `NoFixedStudiesThenCommunitySequence` already ask for this; the quick screen hadn't done it.\
Not done: a blocking check; changing a menu after the person allocated its tasks by number. · Decided: 9 Nov 2026 (the owner); built and released 9 Nov.

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
Not done: even a one-line error log without a privacy-page change; keeping real users' answers to learn from. · Decided: 3 Oct 2026 (owner question 31); 25 Oct (reading history); 2 Nov (quick answer). The content-free call record below is the one exception, with its own privacy-page change (9 Nov).

**A record of the calls AskRigor receives from each signed-in account, without their content, kept 7 days and shown only to that account.**\
Why: the owner's report AskRigor#434: twice a free ChatGPT account answered without calling AskRigor, and nothing could tell "never called" from "called and refused". Each entry holds the tool, the time, the route, whether ChatGPT's signals came with it, the outcome and the time taken.\
Not done: arguments, results, IP addresses, user agents or tokens; calls without a valid sign-in; showing it to anyone but the account, the owner included; keeping it past 7 days. · Decided: 9 Nov 2026 (owner answer 280a); privacy page changed first; built and released 9 Nov.

**A new free-use notice asks again only when it collects or publishes more than the one a person accepted; a wording-only version carries their yes forward, and the owner's own login accepts each new version by the owner's standing instruction.**\
Why: the owner, 6 Nov: "can we make it so that i don't have to keep accepting the askrigor notice every time you update? that's annoying". Each version declares in code, reviewed with it, whether it is material; the record keeps what was accepted, when and how (by the person, carried forward, or by the owner's instruction).\
Not done: treating dev accounts or any login but the one the owner's review admits as the owner's; enrolling, reactivating or switching a login for the owner; judging materiality from the notice's words; writing over a revoke or a switch to paid made at the same moment (the acceptance saves only onto the row as read). · Decided: 6 Nov 2026 (the owner); built 7 Nov, released 9 Nov.

**A question and answer are shared for improvement only when the person says yes and confirms the exact de-identified copy, which is kept encrypted with nothing naming the account, for 90 days, and deleted sooner with its code.**\
Why: the owner, 30 Oct: "we aren't logging every question/answer but just the ones users send for improvement".\
Decided: 30 Oct 2026 (owner answer 200a).

**AskRigor never gets past bot checks, CAPTCHAs, logins or paywalls, and respects robots.txt; a page that refuses stays unread.**\
Why: it is a standing safety rule, and the owner agrees such passes are "impossible per AI safety rules".\
Not done: unlocking or scraping services that get past these checks. · Decided: 7 Oct 2026 (owner question 45); 1 Nov (owner answer 213b).

**A bug report is shown to the person first and sent only after their yes, with no personal details; a longer report only from people who turn it on.**\
Why: a report goes out on the person's behalf, so they see it and say yes first, and the owner didn't want long reports in chat unless the person turns them on.\
Decided: 12 Oct 2026 (owner answer 78a); 17 Oct (109a); 21 Oct (154).

**One report per incident: a defect that can be debugged gets one detailed bug report, and a preference, feature request or style feedback one lesson, never both.**\
Why: the owner, in AskRigor#431: "Use one reporting path per problem; do not duplicate the same incident as both a bug report and a lesson candidate", after a run proposed both for one failure.\
Not done: changing the protocols or the skill for it without the owner's approval (the rule is in AskRigor's results and docs). · Decided: 7 Nov 2026 (the owner, AskRigor#431); released 9 Nov.

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

**AskRigor spends nothing on paid model calls of its own, except uses the owner approves one by one: today the meaning judge, the planning call and the review of a draft on the owner's monthly Claude API credit, whose daily caps together stay within USD 7 a day, and Gemini for videos under AskRigor's own monthly cap.**\
Why: every cost is the owner's call, made in advance with a ceiling, and paid users' own model use, once payments exist, is theirs to pay.\
Not done: paid paths a coding worker proposes on its own; spending beyond the credit. · Decided: by 1 Sep 2026 (spending policy); Gemini, 27 Sep; paid users, 29 Oct; 2 Nov (owner answer 221, USD 3 a day); the planning call, 13 Nov (298b); the review and the ceiling raised to USD 7 a day, 13 Nov (301a).

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
Why: some apps hand the model only a result's text, so the protocol, its index, PubMed records and full-text pages never reached it there (lesson #59), while ChatGPT's context and time limits make a copy costly. A call is ChatGPT's only by exact signals: a `_meta` key starting `openai/`, or a User-Agent starting `openai-mcp/`; any other call gets the copy, since a copy costs tokens where a missing payload breaks research. Each part stays under 50,000 characters, which Claude Code counts in the part it shows, and the whole under the about 150,000 claude.ai takes (measured 8 Nov).\
Not done: patches tool by tool; guessing the app from anything else; changing the tool list, a higher Claude Code limit included. · Decided: 7 Nov 2026 (lesson #59's build); released 9 Nov.

**New work targets the ChatGPT app, the Claude connector and the Codex plugin, not Custom GPTs.**\
Why: the owner, 17 Oct: "GPTs are on the way out, so it doesn't make sense to build a new feature for custom GPT if it doesn't work for plugins".\
Decided: 27 Sep 2026; 17 Oct (the owner).

**AskRigor's listing in ChatGPT's app directory waits until it works well enough.**\
Why: the owner, 28 Oct: "it still often fails its own checks and doesn't explain why", and people would be sending bug reports nonstop.\
Decided: 28 Oct 2026 (owner answer 192c); still waiting, 5 Nov (258a).

**A release whose changes are pure fixes goes out without asking; a release with any tradeoff needs the owner's yes first. Lessons and reported fixes are built as soon as they're triaged, and the owner is asked first only when a change alters clinical or scientific method.**\
Why: the owner, 12 Nov: "you can do releases without my yes if you don't think there's any downside to the decisions, and we can roll back if it looks like the release made things worse. just ask me if there are tradeoffs to consider first". A tradeoff is anything that changes what people see or are asked, costs money, changes the data kept or the privacy page, changes clinical or scientific method, or could make answers slower or shorter. Each release record says which rule it went out under, a rollback stays ready, and the next runs are watched. This replaced "every release needs the owner's yes" (21 Oct, owner answer 148a), which still holds for releases with a tradeoff.\
Not done: releasing while a regression run is going. · Decided: 21 Oct 2026 (owner answer 148a); 12 Nov 2026 (the owner, in chat).

**Dependabot's updates merge without asking once their full checks pass, several in one branch when main's up-to-date rule would make each wait for the next; merging releases nothing.**\
Why: the owner, 7 Nov (answer 276a), after six updates waited for a `@dependabot rebase` that never came.\
Not done: releasing an update without the owner's yes; merging one whose checks failed or never started. · Decided: 7 Nov 2026 (owner answer 276a).

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
