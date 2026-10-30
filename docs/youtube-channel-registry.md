# YouTube channel registry: the seed (30 Oct 2026)

The owner's idea (30 Oct): find the highest-value channels in each health category, "so we aren't only crossing our
fingers and hoping when we search videos". In AskRigor#390's run, the most relevant video came from a channel no search
had reached. This is the seed: channels the owner named and candidates Gemini found, each confirmed through YouTube's
API (`channels`, 1 unit). None is checked yet: before use, AskRigor audits a few of each channel's videos against the
studies and samples their comments. Open discovery stays, so the registry adds sources and never narrows them; HRP's
limits on creator-success bias and platform selection still apply.

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
- **Leads:** ideas worth testing, on weaker or contested evidence; a lead starts a study search and never settles a
  question.
- **Critique:** examines studies' methods and their limits.
- **Benchmark:** careful and evidence-heavy, useful to check other sources against.

Cautions name what a reader should weigh: products the channel sells, a school of thought whose central claims are
contested, or content that isn't clinical.

## The seed

"Owner" marks a channel the owner named; "Gemini" one Gemini's search suggested.

### Neck, back, joints and sports injuries

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Jon Saunders (`@drjonsaunders`) | `UCnTpcPc8C6NvX718XsRPBzA` | methods: neck, jaw and SCM work, dizziness | | owner |
| Dr. Rahim Gonstead Chiropractor (`@drrahim`) | `UCIpqRCu9dbj6MqlRJiP9M4A` | hard cases; methods: examination, palpation, gait, multi-part follow-ups | spinal manipulation, the neck included; full-spine X-rays | owner |
| Squat University (`@squatuniversity`) | `UCyPYQTT20IgzVw92LDvtClw` | methods: test, treat, retest | | Gemini |
| ATHLEAN-X (`@athleanx`) | `UCe0TLA0EsQbE-MjuHXevj2A` | methods: exercise mechanics | to check: products | Gemini |
| Conor Harris (`@conorharris`) | `UC634L9eG-YsskyzWxnp9BJA` | methods, leads: breathing and rib-cage position | a contested school (PRI) | Gemini |
| Zac Cupples (`@zaccupplespt`) | `UCKrx8MQ1G7bRWkxN_adE32A` | methods, leads: breathing and rib-cage position | a contested school (PRI) | Gemini |

### Dizziness and balance

Dr. Jon Saunders, above.

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

### Gut health

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Michael Ruscio, DC, DNM (`@drrusciodc`) | `UCRSG-nLPicq1r8uyM0zLMwA` | critique: unvalidated gut tests; methods | to check: products | Gemini |
| Kick It Naturally (`@kickitnaturally`) | `UCEN08D5qYz8EHvwixHckYbg` | leads: digestion and bile | to check: products | Gemini |

### Mental health

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Dr. Josef, Taper Clinic (`@taperclinic`) | `UCT0HW8jp8xDuczBnO7Kg7rA` | methods, outcomes: tapering off psychiatric drugs | centred on the harms of psychiatric drugs | owner |
| HealthyGamerGG (`@healthygamergg`) | `UClHVl2N3jPEbkNJVx-ItQIQ` | leads: psychology | contested in parts | owner |

### Teeth and mouth

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Living Well With Dr. Michelle Jorgensen (`@livingwellwithdrmichelle`) | `UC2DNZSwQbT7XeHxYXwqon0g` | leads: biological dentistry, airway | a contested school | Gemini |
| IAOMT (`@iaomt`) | `UCo87raXcBdqq8w-1U_SFq-Q` | methods: amalgam removal precautions; leads | an advocacy organisation | Gemini |

### Long-term illnesses and the environment

| Channel | ID | Value | Cautions | From |
|---|---|---|---|---|
| Jill Carnahan, MD (`@drjillcarnahan`) | `UC-Tg7FE_TgHuCLGrHgP8sdw` | leads: mould illness, mast cells | contested diagnoses | Gemini |

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
- Fill the categories with no channel yet: sleep, women's health, strength and fitness, supplements, and long COVID and
  ME/CFS.
- Use it: the build after #387, through each channel's upload list (`docs/superpowers/plans/2026-10-30-next-build-after-387.md`).
