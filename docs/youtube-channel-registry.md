# YouTube channel registry: the seed (30 Oct 2026)

The owner's idea (30 Oct): find the highest-value channels in each health category, "so we aren't only crossing our
fingers and hoping when we search videos". In AskRigor#390's run, the most relevant video came from a channel no search
had reached. This is the seed: channels the owner named and candidates Gemini found, each confirmed through YouTube's
API (`channels`, 1 unit). None is checked yet: before use, AskRigor audits a few of each channel's videos against the
studies and samples their comments. Open discovery stays, so the registry adds sources and never narrows them; HRP's
limits on creator-success bias and platform selection still apply.

**Alongside open search, never instead of it** (the owner, 30 Oct: "if the channel fits the search you could check it
along with whatever pops up"). When a listed channel fits the question, AskRigor reads its uploads as well as what open
search finds. Size isn't value: a small channel with one person's detailed recovery story can be the best source a
question has, and open search is how those are found. One that proves its worth can join the registry.

The registry keeps channel IDs and our own notes. Everything else, such as subscriber counts and upload lists, is
fetched live, as YouTube's rules for stored API data require.

## Kinds of value

Each channel is labelled with the kinds of value it has, and none means its claims are true:

- **Methods:** shows specific, named methods (exercises, tests, doses), not general advice.
- **Hard cases:** takes people others couldn't help, and shows its tests, its reasoning and the follow-up.
- **Outcomes:** its comments carry firsthand outcomes. Judged from a sample drawn without regard to outcome (every k-th
  comment in the platform's order): the share of comments with an outcome, and the ratio of reported improvement to
  reported worsening, per video and per method, with the counts. The ratio shows which way commenters' reports lean,
  not how often the method works (HRP `DirectionLabelsNeedOutcomeNeutralSelection`, `NoPopulationRateFromForumSample`).
  Measured on 31 Oct for eleven videos: every comment the API shows, read in the audit's order with repeats dropped;
  the 400 whose IDs rank lowest by SHA-256 (the audit's own outcome-blind ranking); each read by Codex and counted by
  code. The counts are people who say they did the video's method. Most "better" reports are immediate or undated,
  so they say little about lasting results, and people who were helped may comment more often than people who weren't.
  The counts are on the owner's private page, never here: anything drawn from YouTube comments stays off public pages
  (owner answers 173 and 175, and what AskRigor told YouTube on 25 Oct).
  A video's counts describe that video, not its channel: judging a channel needs many of its videos mapped (the owner,
  31 Oct; at least five, `docs/superpowers/plans/2026-10-31-video-comment-maps.md`).
- **Recovery story:** a person's own detailed account of getting better, often on a small channel: what they did, for
  how long, how it was measured, and how they are now. It is one person's account, and recoveries are what gets filmed,
  so it is a lead and an outcome report, never a rate; it is kept apart from independent commenters (HRP
  `YouTubeCreatorCommentCorpusHandling`). The first, from the owner: SHAPEFIXER's "GROWING MY HIP BACK"
  (`XpZHKGGCK-o`), below.
- **Leads:** ideas worth testing, on weaker or contested evidence; a lead starts a study search and never settles a
  question.
- **Critique:** examines studies' methods and their limits.
- **Benchmark:** careful and evidence-heavy, useful to check other sources against.

Cautions name what a reader should weigh: products the channel sells, a school of thought whose central claims are
contested, or content that isn't clinical.

## The seed

"Owner" marks a channel the owner named; "Gemini" one Gemini's search suggested; "discovery" one the 31 Oct web
search found through people's reports elsewhere that its video worked for them.

### Neck, back, joints and sports injuries

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Jon Saunders (`@drjonsaunders`) | `UCnTpcPc8C6NvX718XsRPBzA` | methods: neck, jaw and SCM work, dizziness | | owner |
| Dr. Rahim Gonstead Chiropractor (`@drrahim`) | `UCIpqRCu9dbj6MqlRJiP9M4A` | hard cases; methods: examination, palpation, gait, multi-part follow-ups | spinal manipulation, the neck included; full-spine X-rays | owner |
| Squat University (`@squatuniversity`) | `UCyPYQTT20IgzVw92LDvtClw` | methods: test, treat, retest | | Gemini |
| ATHLEAN-X (`@athleanx`) | `UCe0TLA0EsQbE-MjuHXevj2A` | methods: exercise mechanics | to check: products | Gemini |
| Conor Harris (`@conorharris`) | `UC634L9eG-YsskyzWxnp9BJA` | methods, leads: breathing and rib-cage position | a contested school (PRI) | Gemini |
| Zac Cupples (`@zaccupplespt`) | `UCKrx8MQ1G7bRWkxN_adE32A` | methods, leads: breathing and rib-cage position | a contested school (PRI) | Gemini |
| Madalina - Spine and Neuro Physiotherapist (`@madalinaphysio`) | `UCwIn3IlKa4ufQYiR8IO9z0A` | methods: a seated pelvis correction and hip strengthening (`_ZpipFtSZ90`); outcomes measured 31 Oct (the counts stay off public pages) | absolute claims with no evidence shown (back pain is "always" muscle imbalance, never the disc; a viewer's legs aren't different lengths, only the pelvis is rotated); an account from 2013 that began posting in September 2026; the credentials are the channel's own | owner |
| SHAPEFIXER (`@shapefixer`) | `UCM1Va_ObWwANw1lrnUSQ6bw` | recovery story: a man's hip arthritis without surgery (`XpZHKGGCK-o`: diet, collagen, glucosamine and chondroitin, fasting, gentle exercise, weight loss); outcomes measured 31 Oct (the counts stay off public pages); leads | sells a hip-arthritis course; one person's account, with an X-ray claim; most of the channel is now about a carnivore diet | owner |
| Foundation Training (`@foundationtraining`) | `UCOkRpabTWz-G5dRqsABppDQ` | methods: a 12-minute posterior-chain routine (`4BOTvaRaDjI`); outcomes measured 31 Oct (the counts stay off public pages) | sells subscriptions, books and training | discovery |
| Bob & Brad (`@bobandbrad`) | `UCmTe0LsfEbpkDpgrxKAWbRA` | methods: chin tucks and neck extension for a pinched nerve (`u7Gy9Q_Yhck`); outcomes measured 31 Oct (the counts stay off public pages) | sells massage devices and equipment | discovery |
| The Kneesovertoesguy (`@thekneesovertoesguy`) | `UCGybO-bWZ3W6URh42sdMQiw` | methods: a graded knee programme that starts with walking backwards (`YrH8pi09HGc`) | sells coaching, books and equipment; deep knee bending | discovery |
| The Plantar Fasciitis Doc (`@theplantarfasciitisdoc`) | `UCxHitnvhAznFUfxE2VbnXaA` | methods: exercises for morning heel pain (`ChIYCEfudAQ`); outcomes measured 31 Oct (the counts stay off public pages) | sells a course and a home kit; advises against orthotics and night splints | discovery |

### Dizziness and balance

Dr. Jon Saunders, above.

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| University of Colorado Denver (`@ucdenvervideo`) | `UCgN5l28PnUqWcqB-wRS8OCg` | methods, benchmark: Dr. Carol Foster's half-somersault for positional vertigo (`mQR6b7CAiqk`); outcomes measured 31 Oct (the counts stay off public pages) | a university's channel, not hers; for positional vertigo (BPPV) only; she sells a book | discovery |
| The Steady Coach (`@thesteadycoach`) | `UCl0GoD4zpqkdaoszwDeN6nw` | methods, hard cases: somatic tracking for chronic dizziness (`pMNYwd3iMbU`); outcomes measured 31 Oct (the counts stay off public pages) | sells coaching; inner-ear and other causes come first | discovery |

### Diet, weight, blood sugar and the heart

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Eric Berg DC (`@drberg`) | `UC3w193M5tYPJqF0Hi-7U-2g` | leads: naturopathic | sells his own supplements; rigour varies | owner |
| Dr. Sten Ekberg (`@drekberg`) | `UCIe2pR6PE0dae9BunJ38F7w` | leads: blood tests, metabolic health | to check: products | Gemini |
| Peter Attia MD (`@peterattiamd`) | `UC8kGsMa0LygSX9nkBcBH1Sg` | benchmark, critique: long interviews with researchers | to check: products | Gemini |
| Low Carb Down Under (`@lowcarbdownunder`) | `UCcTTiHZtNpiqD2EubIO5HFw` | leads: conference lectures | one dietary school | Gemini |
| Chris Masterjohn, PhD (`@chrismasterjohn`) | `UCSJJM-c27d_DiuaqcZAOMUg` | leads: nutrient biochemistry | to check: products | Gemini |
| EONutrition (`@eonutrition`) | `UCFqXidfUsI0vm73xsBMIQdQ` | leads: thiamine and other nutrients | to check: products | Gemini |
| Jay Feldman Wellness (`@jfwellness`) | `UC5xJsVwWW5FvIy3BbeYXhWA` | leads | a contested school (Ray Peat's) | Gemini |
| Danny Roddy (`@dannyroddy`) | `UCQGwMyjFvF-N2c6RDQIV8sw` | leads | a contested school (Ray Peat's) | Gemini |
| Mike Fave (`@mikefave`) | `UCOGrgxcfdgT-KnS2m0T9C7w` | leads | a contested school (Ray Peat's) | Gemini |
| Jason Fung (`@drjasonfung`) | `UCoyL4iGArWn5Hu0V_sAhK2w` | methods, leads: intermittent fasting for beginners (`jqZsS03dlPk`) | sells books and coaching; not without a doctor for anyone on insulin or other glucose-lowering drugs | discovery |
| Plantiful Kiki (`@plantifulkiki`) | `UCurFC25hDz2n6h8IaGsVOAQ` | recovery story, methods: her 70-pound loss on high-starch, low-fat eating (`0wpyXzGajwE`) | sells cookbooks and programmes; one person's story | discovery |
| Beat Diabetes! (`@beatdiabetes3`) | `UCmKsQWqGmDPIWgrVqGYbc3w` | methods: testing glucose after ordinary meals before changing them (`AhN_EGDYNj4`) | sells books and video series | discovery |
| Glucose Revolution (`@glucoserevolution`) | `UCsQdi6X-12eUKBBBze46STA` | methods, leads: food order, a walk after meals, vinegar (`1PkshTBkWZ8`) | sells books, courses and a supplement; dietitians criticise its framing of glucose spikes | discovery |
| York Cardiology (`@yorkcardiology`) | `UCxtbUzEzRpX1B9sGbRudG6g` | methods, leads: magnesium for ectopic beats (`FvCLqWTY3qk`); outcomes measured 31 Oct (the counts stay off public pages) | a cardiologist's private practice; magnesium with kidney disease | discovery |
| NutritionFacts.org (`@nutritionfactsorg`) | `UCddn8dUxYdgJz3Qr5mjADtA` | methods, critique: hibiscus tea for blood pressure (`ZEAB1-Bkgs4`) | a plant-based advocacy nonprofit; one report of low blood pressure on the tea | discovery |

### Gut health

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Michael Ruscio, DC, DNM (`@drrusciodc`) | `UCRSG-nLPicq1r8uyM0zLMwA` | critique: unvalidated gut tests; methods | to check: products | Gemini |
| Kick It Naturally (`@kickitnaturally`) | `UCEN08D5qYz8EHvwixHckYbg` | leads: digestion and bile | to check: products | Gemini |
| Michelle Kenway (`@michellephysio`) | `UCPQS5BOA_GLQKCc07ZCOjJg` | methods, benchmark: "moo to poo" bowel emptying, which an NHS service links (`QDk93cvZAuk`); outcomes measured 31 Oct (the counts stay off public pages) | sells pelvic-health books and products | discovery |
| The Pelvic Health Lady (`@thepelvichealthlady`) | `UCMZJvEpg9PQXHlv3h8hhtjw` | methods: the "I love you" abdominal massage, which an NHS service links (`JTOkKVlBHzk`) | a clinic's channel; few comments | discovery |

### Mental health

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Josef, Taper Clinic (`@taperclinic`) | `UCT0HW8jp8xDuczBnO7Kg7rA` | methods, outcomes: tapering off psychiatric drugs; critique: the hidden costs of psychiatric treatments; leads: everyday exposures such as caffeine, which he takes his patients off | a critic of mainstream psychiatric prescribing | owner |
| HealthyGamerGG (`@healthygamergg`) | `UClHVl2N3jPEbkNJVx-ItQIQ` | leads: psychology | contested in parts | owner |
| Andrew Huberman (`@hubermanlab`) | `UC2D2CMWXMOVWx7giW1n3LIg` | methods, leads: the physiological sigh (`rBdhqBGqiMc`) | sponsorships and supplement ties; the relief reported is short-term | discovery |
| Therapy in a Nutshell (`@therapyinanutshell`) | `UCpuqYFKLkcEryEieomiAv3Q` | methods: a guided walkthrough for panic attacks that stops fighting the alarm (`2CQpyA485wc`); outcomes measured 31 Oct (the counts stay off public pages) | sells courses; a first or unusual attack needs a medical check | discovery |

### Sleep

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| TheLankyLefty27 (`@freecpapadvice`) | `UCg_Rj5qrxlCo4OX6MMq08gQ` | methods: reading CPAP and sleep-study data | to check: products | Gemini |
| CPAP Reviews (`@cpapreviews`) | `UCyB30b5W8LzOUngKmrTtGXQ` | methods: CPAP set-up and data | equipment reviews; to check: sponsors | Gemini |
| Vik Veer - ENT Surgeon (`@vikveerentsurgeon`) | `UC_fHttZRzm6XyaziXSAaWEA` | methods, education: ENT examinations, sleep-endoscopy footage | | Gemini |
| The Sleep Coach School (`@thesleepcoachschool8192`) | `UC_tdQDMQon0CfD0xAbZPNDg` | methods: coaching for insomnia | to check: sells coaching | Gemini |
| Michael Sealey (`@michaelsealey`) | `UC9GoqHypa-SDrGPMyeBkjKw` | methods: sleep hypnosis for a racing mind (`uuzJffTliSc`) | sells recordings | discovery |
| Insomnia Coach (`@insomniacoach`) | `UCL5LsLUeVA2j_Vsl5625shQ` | methods, benchmark: stimulus control from CBT-I (`3ndAEIjZ7IA`) | sells coaching; sleep restriction can raise anxiety at first | discovery |

### Women's health

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Stacy Sims Official (`@drstacysims`) | `UCPD55VPa1ZWx1a_nzWC2VJA` | leads, methods: training and nutrition for women | to check: products | Gemini |
| Dr. Kelly Casperson, M.D. (`@kellycaspersonmd`) | `UCalNuuq2IHBHeK3bJ3gyUYQ` | education: urology and menopause | | Gemini |
| Dr. Mary Claire Haver, MD (`@drmaryclaire`) | `UCHFffg5HmfoId6E8WTVOc5Q` | education, leads: menopause | to check: products | Gemini |
| Natalie Crawford, MD (`@nataliecrawfordmd`) | `UCRZamIB-DWuVPJuc0bKhwzg` | education: fertility | | Gemini |
| Dr. Bri's Vibrant Pelvic Health (`@vibrantpelvichealth`) | `UC8P8jYUnqtkxbTdJ2_xwWuQ` | methods: pelvic-floor release stretches, which an NHS service links (`R3Rydb1nZU4`) | sells programmes; release is for a tight pelvic floor, not a weak one | discovery |
| nourishmovelove (`@nourishmovelove`) | `UCIiI9tAbgvSPPL_50gefFtw` | methods: a postpartum core routine for a split abdomen (`u4z7sBiGFA8`) | sells an app and programmes | discovery |

### Strength and fitness

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| The Bioneer (`@thebioneer`) | `UCIh_TPYPqjJuS_-nOfAIlfg` | leads, methods: training ideas from many schools | | Gemini |
| E3 Rehab (`@e3rehab`) | `UCkb9jgRxR2D5bc1fSDofwtA` | methods: loading programmes for tendon, disc and joint injuries | to check: products | Gemini |
| Garage Strength (`@garagestrength`) | `UCZEEC1w4jP1cV2dibuDFwIQ` | methods: athletic coaching | | Gemini |
| Revive Stronger (`@revivestronger`) | `UC6wB_e6YQncYgpv_QrMGHCQ` | critique, benchmark: discussions with researchers | | Gemini |
| Strength Side (`@strengthside`) | `UC9BNGVGr_lvbn3d23ckuVOA` | methods: ground positions and primal movement for hips, knees, ankles and spine (`2Fmx-iHsKYg`: cross-legged sitting, kneeling, deep squat, pigeon, gorilla); outcomes measured 31 Oct (the counts stay off public pages) | sells a mobility programme; "the ground will remodel your hips" is the channel's claim | owner |
| Caroline Girvan (`@carolinegirvan`) | `UCpis3RcTw6t47XO0R_KY4WQ` | methods: free dumbbell programmes (`SCxNnWW2zB8`) | sells an app | discovery |
| Hybrid Calisthenics (`@hybridcalisthenics`) | `UCeJFgNahi--FKs0oJyeRDEw` | methods: a scalable bodyweight routine for beginners (`gOkCJ57IvNg`) | sells a book and equipment | discovery |

### Supplements

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| ConsumerLab.com (`@consumerlabplus`) | `UC8v5bD6ABSHnXpJggz2MW2A` | critique: independent lab tests of products on sale | a paid testing service | Gemini |
| More Plates More Dates (`@moreplatesmoredates`) | `UCoR7CHkMETs3ByOv74OAbFw` | critique: label dissection; leads | to check: products and sponsors | Gemini |
| Physionic (`@physionic`) | `UCj3p_1jOCJXB_L_we-DjLbA` | critique, leads: supplement mechanisms and effect sizes | to check: products | Gemini |
| Lucas Aoun - Boost Your Biology (`@boostyourbiology`) | `UC4O8s5Eir3A0ULQ-0HOJr8Q` | leads: little-studied compounds | to check: commercial supplement ties | Gemini |
| The Diary Of A CEO (`@thediaryofaceo`) | `UCGq-a57w-aPwyi3pW7XLiHw` | leads: an interview on vitamin D and B vitamins for sleep (`BbGv7GTbRN8`) | an interview show with sponsors; the guest sells her protocol; reports go both ways on high doses | discovery |

### Long COVID and ME/CFS

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Jarred Younger, PhD (`@youngerlab`) | `UCoVoOvIX90IMEZCbBf_ycEA` | leads: a research lab's work on neuroinflammation and fatigue | | Gemini |
| Bateman Horne Center (`@batemanhornecenter`) | `UCjdso7oUeJT90mL0PdHr0vQ` | methods: clinical tests and care for ME/CFS | | Gemini |
| Gez Medinger (`@rundmc1`) | `UCln_SCEd4JiGkHIUZd1VlXw` | outcomes: patients' surveys of treatments | surveys whose respondents choose themselves | Gemini |
| Raelan Agle (`@raelanagle`) | `UCy4EjD4exCbtuGQkSa71ozA` | outcomes: long interviews with people who recovered | people who recovered only | Gemini |
| Ally Boothroyd, Sarovara Yoga (`@sarovarayoga`) | `UCE92Hzq1rGv3dGJcx6o0b3Q` | methods: yoga nidra for rest (`9r8jXUvsi3w`) | sells classes and recordings; the relief reported is in the moment | discovery |

### Teeth and mouth

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Living Well With Dr. Michelle Jorgensen (`@livingwellwithdrmichelle`) | `UC2DNZSwQbT7XeHxYXwqon0g` | leads: biological dentistry, airway | a contested school | Gemini |
| IAOMT (`@iaomt`) | `UCo87raXcBdqq8w-1U_SFq-Q` | methods: amalgam removal precautions; leads | an advocacy organisation | Gemini |

### Long-term illnesses and the environment

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Jill Carnahan, MD (`@drjillcarnahan`) | `UC-Tg7FE_TgHuCLGrHgP8sdw` | leads: mould illness, mast cells | contested diagnoses | Gemini |
| Yoga With Adriene (`@yogawithadriene`) | `UCFKE7WVJfvaHW5q283SxchA` | methods: gentle yoga for chronic pain, which a US Veterans Affairs pain programme lists (`BFaXfQpxnps`) | sells a membership; too much at once can flare pain | discovery |

### Medicine, evidence and research in general

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| MedCram (`@medcram`) | `UCG-iSMVtWbbwDDXgXXypARQ` | education; leads | | Gemini |
| Vinay Prasad MD MPH (`@vprasadmdmph`) | `UCUibd0E2kdF9N9e-EmIbUew` | critique: trial methods, surrogate endpoints | | Gemini |
| Chubbyemu (`@chubbyemu`) | `UCKOvOaJv4GK-oDqx-sj7VVg` | education: published case reports of poisonings and rare emergencies | | Gemini |
| Michael Levin's Academic Content (`@drmichaellevin`) | `UC3pVafx6EZqXVI2V_Efu2uw` | leads: frontier biology research | not clinical | Gemini |

Gemini's descriptions are not kept. They make many strong, unchecked claims (about melatonin, mould genetics and
reversing cancer, among others); the registry keeps the channels, and AskRigor checks claims one by one when a question
needs them.

## Next

- Check each channel: AskRigor audits a few of its videos against the studies, samples its comments (the share with an
  outcome, and the improvement-to-worsening ratio, with counts), and confirms or changes its labels.
- Every category has candidates now (74 channels: the owner's eight, Gemini's 41 and the discovery's 25). More come from the channels that
  surface in research, and from the owner.
- 31 Oct, on the owner's Codex: the comment ratio of the owner's three videos, through AskRigor's own audit (its sample
  is drawn by hash, without regard to outcome; Codex judges each comment, and code counts); and a discovery of
  DIY-treatment videos with outcome reports in many places (the owner: "find the most interesting and useful videos for
  DIY treatments that work amazingly well and then maybe look at those channels"), by web search only, each video then
  checked by ID through the API.
- Use it: the build after #387, through each channel's upload list (`docs/superpowers/plans/2026-10-30-next-build-after-387.md`).
