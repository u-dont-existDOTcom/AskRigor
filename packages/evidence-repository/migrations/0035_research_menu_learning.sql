SET search_path TO __SCHEMA__, public;

-- Owner answer 303a (14 November 2026), from the owner's words in chat on 13 November: "can we also learn from users
-- menu choices (especially if they give reasons), and let users turn on learn mode for their own menu choices?" Learn
-- mode is a setting like the research style (0033), off unless the person turns it on by saying so, and only for the
-- owner's dev accounts while AskRigor's own planning call is tried there. When it is on, AskRigor keeps that account's
-- own answers to the menu of next tasks, with the person's reason in their own words when they gave one, the newest 20,
-- and gives them to its own planning call. Turning it off deletes them. Nothing of any other account is kept.
--
-- And the call record's twin of plan_next (0034): the lane AskRigor's own plan gave a register_plain_answer call.
--
-- Safe to run again: the columns and the table come once, the checks by name.
ALTER TABLE research_use_accounts
  ADD COLUMN IF NOT EXISTS learn_menu_choices boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN research_use_accounts.learn_menu_choices IS
  'Learn mode (owner answer 303a): true once the person turned it on, false by default; while true AskRigor keeps this account''s own menu choices in research_menu_choices. Turning it off deletes them. A setting only.';

-- One row for each menu a person answered while learn mode was on. It holds no research target, no task wording and
-- no answer, and refers to nothing that holds a question.
CREATE TABLE IF NOT EXISTS research_menu_choices (
  account_key text NOT NULL,
  chosen_at timestamptz NOT NULL,
  lane text,
  you_decide boolean NOT NULL,
  tasks jsonb NOT NULL,
  reason text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'research_menu_choices_lane_check'
      AND conrelid = 'research_menu_choices'::regclass
  ) THEN
    ALTER TABLE research_menu_choices
      ADD CONSTRAINT research_menu_choices_lane_check CHECK (lane IS NULL OR lane IN ('research', 'light'));
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'research_menu_choices_tasks_check'
      AND conrelid = 'research_menu_choices'::regclass
  ) THEN
    ALTER TABLE research_menu_choices
      ADD CONSTRAINT research_menu_choices_tasks_check CHECK (jsonb_typeof(tasks) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'research_menu_choices_reason_check'
      AND conrelid = 'research_menu_choices'::regclass
  ) THEN
    ALTER TABLE research_menu_choices
      ADD CONSTRAINT research_menu_choices_reason_check CHECK (reason IS NULL OR char_length(reason) <= 300);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS research_menu_choices_account_chosen_at
  ON research_menu_choices (account_key, chosen_at DESC);

COMMENT ON TABLE research_menu_choices IS
  'Learn mode (owner answer 303a): a dev account''s own answers to the menu of next tasks, kept only while its learn_menu_choices is true, the newest 20, deleted when learn mode is turned off. No research target, task wording or answer.';
COMMENT ON COLUMN research_menu_choices.account_key IS
  'The derived account key of the account that answered the menu (as research_use_accounts holds it).';
COMMENT ON COLUMN research_menu_choices.chosen_at IS
  'When AskRigor received the person''s answer to the menu.';
COMMENT ON COLUMN research_menu_choices.lane IS
  'The menu''s lane: research, or light for AskRigor''s own light plan (owner answer 302); NULL when not known.';
COMMENT ON COLUMN research_menu_choices.you_decide IS
  'True when the person left the allocation to the AI ("you decide"): the allocation was the menu''s own recommendation.';
COMMENT ON COLUMN research_menu_choices.tasks IS
  'One entry per task of the menu, in its order: kind, could_change, recommended (true or false) and minutes, the minutes the person gave it, 0 when none. Never the task''s wording.';
COMMENT ON COLUMN research_menu_choices.reason IS
  'Why the person chose as they did, in their own words, at most 300 characters, or NULL when they gave no reason. It holds whatever they wrote, health details included.';

REVOKE ALL ON TABLE research_menu_choices FROM PUBLIC;
-- The canonical reader's default table grants must not expose a person's own choices and reasons, as the call record
-- is kept from it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE research_menu_choices FROM askrigor_reader;
  END IF;
END
$$;

-- The lane AskRigor's own plan gave a register_plain_answer call (owner answer 302): research, light or aside, taken
-- from AskRigor's own result (research_plan.lane), never from anything the person or the AI wrote. NULL for every other
-- call, which the check enforces.
ALTER TABLE research_call_record
  ADD COLUMN IF NOT EXISTS plan_lane text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'research_call_record_plan_lane_check'
      AND conrelid = 'research_call_record'::regclass
  ) THEN
    ALTER TABLE research_call_record
      ADD CONSTRAINT research_call_record_plan_lane_check CHECK (
        plan_lane IS NULL
        OR (
          plan_lane IN ('research', 'light', 'aside')
          AND tool = 'manage_research_access'
          -- A NULL action would leave the comparison NULL, which a check admits.
          AND action IS NOT NULL
          AND action = 'register_plain_answer'
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN research_call_record.plan_lane IS
  'The lane AskRigor''s own plan gave a register_plain_answer call, research, light or aside (owner answer 302), from AskRigor''s own result; NULL for every other call.';

REVOKE ALL ON TABLE research_call_record FROM PUBLIC;
-- The canonical reader's default table grants must not expose this private account record.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE research_call_record FROM askrigor_reader;
  END IF;
END
$$;
