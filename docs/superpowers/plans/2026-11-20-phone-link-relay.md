# Phone link: AskRigor's own relay to the owner's laptop runner (plan and design as built)

Status (21 Nov 2026): built and reviewed; this branch is pushed as a draft pull request for the owner to look at (owner
answer 396b). The release is a separate owner question and needs his typed "release". Nothing here is deployed.

Decisions: the owner wanted his phone to reach his laptop's research runner (16 Nov 2026, answer 320a) and chose
AskRigor's own link rather than Tailscale (20 Nov, answer 385b), accepting that whoever controls askrigor.com could
serve a changed phone page that uses the link while it is open. The entry in `docs/design-decisions.md` records both.

Where the code is: this branch holds the relay (`apps/phone-relay/`), its tests and Compose file, the Caddy blocks and
the phone page's policy, the built phone page (`site/phone/`), the site validator's rules for it, and the privacy
texts. The laptop side (the connector, the runner page's Phone panel and the phone page's sources) is in the owner's
runner repository, which is not on GitHub; `site/phone/BUILD.json` names the runner commit each build came from.

## 1. How it works

- The phone opens https://askrigor.com/phone/, the runner's own page built for the phone. The laptop's connector keeps
  one outgoing WebSocket to the relay; the phone connects to the same relay. Nothing on the laptop is opened to the
  internet.
- Everything between phone and laptop is sealed with Noise from a maintained library, noise-handshake 4.2.1:
  pairing `Noise_XXpsk0_25519_ChaChaPoly_BLAKE2b`, every connection `Noise_IK_25519_ChaChaPoly_BLAKE2b`. No key mixing
  of our own. The laptop uses libsodium (sodium-native), the phone the audited @noble libraries through a short shim;
  both pass the published IK vectors and an XXpsk0 vector made by an independent implementation.
- Pairing, at the laptop only: the QR code carries the laptop's static key and a one-time 32-byte secret (the PSK)
  after `#`, so it never reaches the server. Only a device that saw the code can finish the handshake. Six digits from
  the finished handshake are shown on the phone and typed on the laptop, which keeps the phone only then. One attempt
  per code; any failure, cancel or five minutes end it.
- Every connection is a fresh IK handshake. A changed, replayed, missing or reordered frame fails to open and the
  connection is dropped.
- Where the browser has X25519 in WebCrypto, the phone's key is non-extractable: page code can't copy its bytes. That
  stops copying, not use (see the limits).
- The relay cannot read or change frames. Laptop seats and pairing rooms need a signature by a key on the relay's
  list (the owner's laptop only, in this version); a phone seat needs its laptop present. Limits apply before the
  upgrade, per socket, per address and in all; a stalled reader is dropped. The relay prints one line at start and
  nothing else. Its container is read-only, without capabilities or new privileges, small in memory, CPU and
  processes, and not on the database network.

What the laptop enforces, whatever a phone sends: the phone sends `{action, args}` from a fixed table, never paths;
the connector checks every field again and builds the one local call itself; the runner page accepts phone calls only
with the connector's own code and only for a phone the connector reports paired now. Every phone start is Claude only,
with no ChatGPT steps or comparison, a time limit and a plan-share aim at most the owner's, starts an hour and a day
from all phones together and runs at once, all checked under the jobs' lock with the pairing. All are set on the
laptop's panel. A phone may answer the plan's question only for runs started from a phone; it can stop any run.

Unpairing, at the laptop: the page refuses the phone at once, in memory, and writes it durably to its own record of
unpaired phones before the connector hears; the record survives restarts, and an unreadable record refuses every phone
until the owner repairs it. Switching the link off cancels the connector's code first, then signals it, holds
automatic restarts back in memory, and only then saves the switch. Pairings also end on their date (30 days by
default).

## 2. Reviews, and the rules they led to

Codex red-teamed the first design read-only (its hand-made key exchange and its page-trust claim were replaced by the
design above) and then reviewed the built code in eight rounds; Fable rechecked it three times and checked the final
sorting of what was left. Each round's findings were fixed.

After the sixth review the same kind of fault had come back several times: a state recorded or reported in one step
and its effect applied in another, with a step between that can fail. Instead of more local fixes, three rules were
adopted:

1. A pairing's commit point is the rename inside the store's own write; anything that fails after it shuts every
   phone out but reports the pairing as made.
2. Protective effects come before persistence: switching off stops the link before the switch is saved, with an
   explicit off latch that only Switch on releases.
3. Each run started from the page gets a systemd user scope of its own, which owns its cleanup; the page scans no
   process trees. Stop signals the runner through a pidfd (the process, never a reusable number), ends the runner's
   own group after a grace, and the scope's end is kept as due in the run's record until the scope is seen empty.

After the eighth review, the rule for what to fix was: anything that lets someone run the runner without a valid
pairing, keeps an unpaired or switched-off phone in, or spends past the owner's limits. Nothing open is in those
classes on a single failure; everything else is a stated limit below.

## 3. Limits, stated to the owner

- The phone page comes from askrigor.com each time it opens. Whoever controls that server, its deploy or this
  repository could serve a changed page that does what the phone can, within the laptop's limits, and could leave code
  in the phone's browser that keeps using the link until the phone is unpaired at the laptop. Accepted in 385b. A
  packaged phone app would remove this; it is a much bigger build and not part of this.
- Whoever holds the unlocked phone holds the runner within those limits; a lost phone is unpaired at the laptop.
- The laptop must be on, awake, online, with the runner's page running and the link on.
- The plan share is an aim the runner works to from its own estimates, not a meter.
- The time stop is the runner page's own watch: if the page is stopped or closed during a phone run, that run has no
  time stop until the page starts again.
- A slow stop: if the runner is slow to end its steps and systemd does not answer, a step can run on until systemd
  answers; the run says so.
- A failing disk: a switch-off whose save fails keeps the link off while the page runs, but a page restart brings it
  back on; a save that lands but can't be synced, followed by a power cut, can bring back the previous switch or
  limits; a power cut as a pairing finishes can lose that pairing. Each is reported at the time.
- Re-pairing a phone replaces its old pairing as soon as the phone has its part; if the laptop's last step then fails,
  the phone needs one more pairing.
- Rare on the owner's laptop: a connector that can't be force-ended when the page is out of file handles (everything it
  sends is refused); a run record from before this version reaching another run on Stop (none exists there); kernels
  before 6.9 signal the runner alone instead of its group.

## 4. Tests

- Relay: `tests/phone-relay.test.ts` covers every rule of the relay's spec (seats, signatures, rooms, limits,
  backpressure, address handling, health). Site: `tests/public-site.test.ts`, `tests/public-site-deployment.test.ts`
  and `scripts/validate-public-site.mts` pin the phone page's files, hashes, policy and Caddy blocks.
- Runner (in its own repository): the Noise vectors on both backends, the whole link through the real app, connector,
  a stand-in relay and the phone client; the pairing's two writes broken at every step; run scopes, signals and
  revocation, including systemd not answering, a second page on the same runs folder and a failing save at switch-off.
- The release kit, against a stand-in host: the proof that today's site setup can be rebuilt exactly, staging,
  retries, and rollback's check, verify and mark.
- In a phone-sized browser, end to end on the laptop (earlier rounds): pair, digits, start, the runner's question
  answered on the phone, the answer shown.

## 5. Release and rollback (only after the owner's typed "release")

Build the image from the merge; add `/opt/askrigor/phone-relay.env` (root-only: the laptop's relay public key and the
site's Atlas proxy secret); bring up `askrigor-phone-relay` with `infra/phone-relay/compose.yaml`; install the site
(Caddy blocks and `site/phone/`) with the existing installer; check `/relay/health`, `/phone/`, its headers and one
relay join. Before anything changes, the release checks that today's site setup can be rebuilt exactly from its own
files and keeps a copy. Rollback first checks it can put back exactly today's setup, then stops the relay, puts back
today's site and checks what Caddy serves; the relay keeps no data. On the laptop, the Phone panel's switch turns the
link off. The release kit is kept with the release notes outside this repository and has run only against a stand-in.
