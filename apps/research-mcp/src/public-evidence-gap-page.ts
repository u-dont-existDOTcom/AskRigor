export const PUBLIC_EVIDENCE_GAP_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>What precedes spontaneous prolactinoma remission? · AskRigor</title>
  <meta name="description" content="Contribute a partial or complete longitudinal case to an unresolved AskRigor evidence gap.">
  <link rel="stylesheet" href="/evidence-gap-intake.css">
  <script src="/evidence-gap-intake.js" defer></script>
</head>
<body>
  <header class="site-header"><a href="/" class="wordmark">AskRigor</a><span>Evidence gap intake</span></header>
  <main>
    <section class="hero">
      <div>
        <p class="eyebrow">Help resolve a specific unanswered question</p>
        <h1>What precedes spontaneous prolactinoma remission?</h1>
        <p class="lead">We are collecting both remission cases and similar cases that did <strong>not</strong> remit. A partial case is still useful and will stay labeled partial.</p>
        <a class="button primary" href="#contribute">Contribute my case</a>
      </div>
      <aside class="plain-card accent">
        <p class="label">This is observational</p>
        <p>AskRigor does not diagnose remission or tell you to change medication, pregnancy plans, surgery, implants, diet, or supplements.</p>
      </aside>
    </section>

    <section class="context-grid" aria-label="Question context">
      <article class="plain-card"><p class="label">What is known</p><p>Remission and regression are reported in several contexts, but submitted cases cannot establish frequency or causation on their own.</p></article>
      <article class="plain-card"><p class="label">What remains unknown</p><p>Timing, treatment context, documentation, and comparison-case coverage remain incomplete.</p></article>
      <article class="plain-card comparison"><p class="label">Why non-remission matters</p><p>Having a suspected transition without remission is just as valuable. It helps test whether the transition actually distinguishes outcomes.</p></article>
    </section>

    <section class="targets" aria-labelledby="targets-title">
      <p class="eyebrow">Cases we need</p>
      <h2 id="targets-title">Remission and comparison cases</h2>
      <div class="target-list">
        <span>Untreated remission</span><span class="comparison-tag">Untreated non-remission</span>
        <span>Post-pregnancy remission</span><span class="comparison-tag">Post-pregnancy non-remission</span>
        <span>Post-menopause remission</span><span class="comparison-tag">Post-menopause non-remission</span>
        <span>DA-withdrawal remission</span><span class="comparison-tag">DA-withdrawal recurrence</span>
        <span>Possible apoplexy before regression</span><span>Implant or explant with follow-up</span>
      </div>
    </section>

    <section id="contribute" class="workspace" aria-labelledby="form-title">
      <div class="section-heading">
        <div><p class="eyebrow">Contribute your experience</p><h2 id="form-title">Tell us what happened as best you can</h2></div>
        <p>Four short steps · optional fields can be skipped</p>
      </div>
      <ol class="stepper" aria-label="Form progress">
        <li class="active" data-marker="1">1 <span>Source</span></li>
        <li data-marker="2">2 <span>Your account</span></li>
        <li data-marker="3">3 <span>Details</span></li>
        <li data-marker="4">4 <span>Consent</span></li>
      </ol>
      <div id="status" class="status" role="status" aria-live="polite"></div>

      <form id="source-form" class="step" data-step="1">
        <fieldset>
          <legend>Whose experience are you describing?</legend>
          <div class="choice-grid">
            <label><input type="radio" name="provenance" value="SELF" checked> My own</label>
            <label><input type="radio" name="provenance" value="DIRECT_OBSERVER"> I directly observed it</label>
            <label><input type="radio" name="provenance" value="SUBJECT_RELAYED"> The person told me</label>
            <label><input type="radio" name="provenance" value="HEARSAY"> I heard it indirectly</label>
          </div>
        </fieldset>
        <input name="website" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="privacy-note"><strong>Private by default.</strong> Your raw submission is not put on a public case page. You will receive a recovery key used to inspect or withdraw it. Read the <a href="https://askrigor.com/privacy" target="_blank" rel="noopener">Privacy Notice</a> before continuing.</p>
        <button class="button primary" type="submit">Start my case</button>
      </form>

      <form id="narrative-form" class="step" data-step="2" hidden>
        <label for="narrative"><strong>Before seeing candidate explanations, what changed?</strong></label>
        <p>During the period before your prolactin or tumor changed—or during the comparison period if it did not remit—what changed in your health, body, medications, environment, or life? Include things even if you are unsure they mattered.</p>
        <p class="field-help">Please leave out names, email addresses, phone numbers, and exact street addresses. This answer is encrypted before database storage and saved before structured prompts.</p>
        <textarea id="narrative" name="narrative" rows="8" minlength="3" maxlength="8000" required></textarea>
        <button class="button primary" type="submit">Save my account</button>
      </form>

      <form id="details-form" class="step" data-step="3" hidden>
        <p class="skip-note"><strong>Everything below is optional.</strong> Skip what you do not know. Your case will be retained and labeled partial.</p>
        <div class="field-grid">
          <label>Outcome
            <select name="outcome"><option value="">Not sure / skip</option><option value="REPORTED_REMISSION">Reported remission</option><option value="BIOCHEMICAL_REMISSION">Treatment-free biochemical remission</option><option value="IMAGING_REGRESSION">Imaging regression</option><option value="NO_VISIBLE_LESION_REPORTED">No visible lesion reported</option><option value="STABLE">Stable / no remission</option><option value="PROGRESSION">Progression / no remission</option><option value="RECURRENCE">Recurrence</option><option value="UNCLEAR">Unclear</option></select>
          </label>
          <label>Transition or comparison exposure
            <select name="exposure"><option value="">Not sure / skip</option><option value="PREGNANCY_POSTPARTUM">Pregnancy / postpartum</option><option value="MENOPAUSE">Perimenopause / menopause</option><option value="POSSIBLE_APOPLEXY">Severe headache or possible apoplexy</option><option value="DOPAMINE_AGONIST_WITHDRAWAL">Dopamine-agonist withdrawal</option><option value="BREAST_IMPLANT">Breast implant</option><option value="BREAST_EXPLANT">Explant</option><option value="MAJOR_ILLNESS">Major illness</option><option value="MEDICATION_CHANGE">Medication change</option><option value="STRESS_STATE_CHANGE">Major stress-state change</option><option value="OTHER_TRANSITION">Other transition</option><option value="NO_SUSPECTED_TRANSITION">No suspected transition</option><option value="UNKNOWN">Unknown</option></select>
          </label>
          <label>Treatment context
            <select name="treatmentContext"><option value="">Not sure / skip</option><option value="NO_PRIOR_DOPAMINE_AGONIST">No prior dopamine agonist</option><option value="PREVIOUSLY_TREATED">Previously treated</option><option value="CURRENTLY_TREATED">Currently treated</option><option value="TREATMENT_WITHDRAWN">Treatment withdrawn</option><option value="SURGERY">Surgery</option><option value="RADIATION">Radiation</option><option value="UNKNOWN">Unknown</option></select>
          </label>
          <label>Diagnosis year <input name="diagnosisYear" inputmode="numeric" pattern="[0-9]{4}" placeholder="e.g. 2018"></label>
          <label>When did the transition happen? <input name="transitionTiming" maxlength="240" placeholder="Approximate dates are fine"></label>
          <label>Prolactin before <input name="prolactinBefore" maxlength="120" placeholder="Value, unit, approximate date"></label>
          <label>Prolactin after <input name="prolactinAfter" maxlength="120" placeholder="Value, unit, approximate date"></label>
          <label>Tumor before <input name="tumorBefore" maxlength="160" placeholder="MRI date and size if known"></label>
          <label>Tumor after <input name="tumorAfter" maxlength="160" placeholder="MRI date and result if known"></label>
        </div>
        <label>Other changes you want AskRigor to examine<textarea name="otherChanges" rows="4" maxlength="1500"></textarea></label>
        <div class="choice-grid compact">
          <label><input type="checkbox" name="baselineDocumented"> I have baseline lab/MRI documentation</label>
          <label><input type="checkbox" name="followupDocumented"> I have follow-up lab/MRI documentation</label>
        </div>
        <button class="button primary" type="submit">Continue with what I have</button>
      </form>

      <form id="consent-form" class="step" data-step="4" hidden>
        <div id="partial-summary" class="partial-summary"></div>
        <div class="consent-list">
          <label><input type="checkbox" name="privateGptAnalysis" required> I allow AskRigor to send a bounded, basically redacted projection of this case to my private reviewer in OpenAI ChatGPT for analysis as an unverified evidence lead. I understand basic redaction may miss indirect identifiers.</label>
          <label><input type="checkbox" name="deidentifiedAggregateUse"> I allow de-identified aggregate summaries from this case to be used publicly.</label>
          <label><input type="checkbox" name="futureFollowup"> Ask follow-up questions if I return with this case's recovery key.</label>
          <label><input type="checkbox" name="observationalAcknowledgement" required> I understand this is observational evidence collection, not diagnosis or treatment advice.</label>
        </div>
        <button class="button primary" type="submit">Submit my case</button>
      </form>

      <div id="complete" class="complete" hidden>
        <p class="eyebrow">Case submitted</p><h3 id="complete-title"></h3>
        <p id="complete-copy"></p>
        <div class="key-box"><span>Submission ID</span><code id="submission-id"></code><span>Recovery key</span><code id="recovery-key"></code></div>
        <p class="field-help">Save both values. AskRigor stores only a hash of the recovery key and cannot show it again.</p>
        <button id="withdraw-current" class="button danger" type="button">Withdraw and remove my active case content</button>
      </div>
    </section>

    <section class="resume" aria-labelledby="resume-title"><p class="eyebrow">Return to a case</p><h2 id="resume-title">Inspect or withdraw your submission</h2>
      <form id="resume-form" class="resume-form"><label>Submission ID <input name="submissionId" required></label><label>Recovery key <input name="recoveryKey" required></label><button class="button secondary" type="submit">Open my case</button></form>
      <pre id="resume-result" hidden></pre>
    </section>
  </main>
  <footer>AskRigor · observational evidence collection · participant-reported cases remain unverified until supporting evidence is reviewed</footer>
</body>
</html>`;

export const PUBLIC_EVIDENCE_GAP_CSS = `:root{color-scheme:light;--ink:#14231f;--muted:#596b65;--paper:#f6f4ee;--card:#fff;--line:#d9ded9;--green:#155c49;--green2:#dff2e9;--amber:#9a5b12;--amber2:#fff0d5;--red:#9d2c2c;--shadow:0 18px 45px rgba(20,35,31,.08)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.site-header{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - 1180px)/2));border-bottom:1px solid var(--line);background:rgba(246,244,238,.96);position:sticky;top:0;z-index:4}.wordmark{font:800 22px/1 Georgia,serif;color:var(--ink);text-decoration:none}.site-header span{color:var(--muted);font-size:14px}main{max-width:1180px;margin:auto;padding:56px 24px 90px}.hero{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.7fr);gap:34px;align-items:center;padding-bottom:50px}.eyebrow,.label{text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:12px;color:var(--green);margin:0 0 12px}h1,h2,h3{font-family:Georgia,serif;line-height:1.08;margin:.15em 0 .45em}h1{font-size:clamp(42px,6vw,72px);max-width:900px}h2{font-size:clamp(30px,4vw,46px)}h3{font-size:24px}.lead{font-size:21px;max-width:780px;color:#33453f;margin-bottom:28px}.plain-card,.workspace,.resume,.targets{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}.plain-card{padding:26px}.plain-card.accent{border-top:5px solid var(--amber)}.plain-card.comparison{border-top:5px solid var(--green)}.context-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.targets{margin:22px 0 46px;padding:30px}.target-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.target-list span{padding:12px 14px;background:#eef3ef;border-radius:10px}.target-list .comparison-tag{background:var(--green2);font-weight:700}.workspace{padding:34px}.section-heading{display:flex;justify-content:space-between;gap:28px;align-items:end}.section-heading>p{color:var(--muted)}.stepper{display:grid;grid-template-columns:repeat(4,1fr);list-style:none;padding:0;margin:28px 0 34px;gap:8px}.stepper li{border-top:4px solid var(--line);padding:8px;color:var(--muted);font-weight:800}.stepper li.active{border-color:var(--green);color:var(--green)}.stepper span{font-weight:600;font-size:13px}.step{max-width:880px}.step p{color:var(--muted)}fieldset{border:0;padding:0;margin:0 0 22px}legend{font:700 21px Georgia,serif;margin-bottom:12px}.choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.choice-grid label,.consent-list label{background:#f2f5f2;border:1px solid var(--line);border-radius:11px;padding:12px}.choice-grid.compact{margin:18px 0}.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:15px}label{display:block;font-weight:650}input,select,textarea{width:100%;margin-top:6px;border:1px solid #b9c4be;border-radius:9px;padding:11px 12px;font:inherit;background:#fff;color:var(--ink)}input[type=radio],input[type=checkbox]{width:auto;margin:0 8px 0 0;accent-color:var(--green)}textarea{resize:vertical}.button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;padding:12px 18px;font:800 15px/1 inherit;text-decoration:none;cursor:pointer}.button.primary{background:var(--green);color:#fff}.button.secondary{background:#e6ece8;color:var(--ink)}.button.danger{background:#f7dfdf;color:var(--red)}.privacy-note,.skip-note,.partial-summary{background:var(--amber2);padding:14px 16px;border-radius:10px}.field-help{font-size:14px;color:var(--muted)}.consent-list{display:grid;gap:10px;margin-bottom:20px}.status{min-height:28px;font-weight:700;color:var(--green)}.status.error{color:var(--red)}.complete{border-top:1px solid var(--line);padding-top:25px}.key-box{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;background:#14231f;color:#fff;border-radius:12px;padding:18px;margin:18px 0}.key-box code{overflow-wrap:anywhere}.resume{margin-top:28px;padding:30px}.resume-form{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end}.resume pre{white-space:pre-wrap;background:#14231f;color:#e8f5ef;border-radius:12px;padding:18px;overflow:auto}.honeypot{position:absolute;left:-9999px}footer{padding:30px;text-align:center;color:var(--muted);border-top:1px solid var(--line)}@media(max-width:760px){main{padding:34px 16px 70px}.hero,.context-grid,.field-grid,.choice-grid,.target-list,.resume-form{grid-template-columns:1fr}.workspace,.resume,.targets{padding:22px}.section-heading{display:block}.stepper span{display:none}h1{font-size:42px}.site-header{padding:0 16px}.key-box{grid-template-columns:1fr}}`;

export const PUBLIC_EVIDENCE_GAP_JS = `const q=(s)=>document.querySelector(s);let current=null;const slug='prolactinoma-spontaneous-remission';
async function api(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};const response=await fetch(path,{...options,headers});const body=await response.json();if(!response.ok)throw new Error(body.error||('HTTP_'+response.status));return body}
function status(message,error=false){const node=q('#status');node.textContent=message;node.classList.toggle('error',error)}
function show(step){document.querySelectorAll('[data-step]').forEach((node)=>node.hidden=Number(node.dataset.step)!==step);document.querySelectorAll('[data-marker]').forEach((node)=>node.classList.toggle('active',Number(node.dataset.marker)<=step))}
function auth(key){return{Authorization:'Bearer '+key}}
function value(form,name){const item=form.get(name);return typeof item==='string'&&item.trim()?item.trim():null}
q('#source-form').addEventListener('submit',async(event)=>{event.preventDefault();try{const form=new FormData(event.currentTarget);const result=await api('/api/evidence-gaps/'+slug+'/submissions/start',{method:'POST',body:JSON.stringify({provenance:form.get('provenance'),website:form.get('website')})});current=result;localStorage.setItem('askrigor-gap-'+result.submissionId,JSON.stringify(result));status('Draft opened. Your unprompted account is saved before structured prompts.');show(2)}catch(error){status(error.message,true)}});
q('#narrative-form').addEventListener('submit',async(event)=>{event.preventDefault();try{const form=new FormData(event.currentTarget);await api('/api/evidence-gap-submissions/'+current.submissionId+'/narrative',{method:'POST',headers:auth(current.recoveryKey),body:JSON.stringify({narrative:form.get('narrative')})});status('Your private account is saved. Add whatever details you know, or skip them.');show(3)}catch(error){status(error.message,true)}});
q('#details-form').addEventListener('submit',async(event)=>{event.preventDefault();try{const form=new FormData(event.currentTarget);const year=value(form,'diagnosisYear');const details={outcome:value(form,'outcome'),exposure:value(form,'exposure'),treatmentContext:value(form,'treatmentContext'),diagnosisYear:year?Number(year):null,transitionTiming:value(form,'transitionTiming'),prolactinBefore:value(form,'prolactinBefore'),prolactinAfter:value(form,'prolactinAfter'),tumorBefore:value(form,'tumorBefore'),tumorAfter:value(form,'tumorAfter'),otherChanges:value(form,'otherChanges'),baselineDocumented:form.has('baselineDocumented'),followupDocumented:form.has('followupDocumented')};const result=await api('/api/evidence-gap-submissions/'+current.submissionId+'/details',{method:'POST',headers:auth(current.recoveryKey),body:JSON.stringify(details)});q('#partial-summary').textContent=result.partial?'Your case is accepted as partial. Still missing: '+result.missingFields.join('; ')+'.':'Your structured fields are substantial, but the case remains participant-reported and unverified.';status('Review consent and submit.');show(4)}catch(error){status(error.message,true)}});
q('#consent-form').addEventListener('submit',async(event)=>{event.preventDefault();try{const form=new FormData(event.currentTarget);const result=await api('/api/evidence-gap-submissions/'+current.submissionId+'/submit',{method:'POST',headers:auth(current.recoveryKey),body:JSON.stringify({privateGptAnalysis:form.has('privateGptAnalysis'),deidentifiedAggregateUse:form.has('deidentifiedAggregateUse'),futureFollowup:form.has('futureFollowup'),noticeVersion:'public-gap-intake-v2-2026-08-31',observationalAcknowledgement:form.has('observationalAcknowledgement')})});q('#complete').hidden=false;q('#complete-title').textContent=result.participantPseudonym+' · '+result.completenessLabel;q('#complete-copy').textContent=result.partial?'Your partial case is in the private AskRigor/GPT review queue. Missing information stays visible; the case is not discarded.':'Your participant-reported case is in the private AskRigor/GPT review queue.';q('#submission-id').textContent=current.submissionId;q('#recovery-key').textContent=current.recoveryKey;status('Case submitted. Save your recovery key.');show(5)}catch(error){status(error.message,true)}});
q('#withdraw-current').addEventListener('click',async()=>{if(!current||!confirm('Remove the active stored case content? This cannot be undone.'))return;try{const result=await api('/api/evidence-gap-submissions/'+current.submissionId+'/withdraw',{method:'POST',headers:auth(current.recoveryKey),body:'{}'});q('#complete-title').textContent='Case withdrawn';q('#complete-copy').textContent='The active narrative, structured details, consent, and review-queue item were removed. A no-content withdrawal record remains.';q('#withdraw-current').hidden=true;status(result.status==='WITHDRAWN'?'Case content removed.':'Withdrawal state updated.')}catch(error){status(error.message,true)}});
q('#resume-form').addEventListener('submit',async(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);try{const id=value(form,'submissionId');const key=value(form,'recoveryKey');const result=await api('/api/evidence-gap-submissions/'+id,{headers:auth(key)});current={submissionId:id,recoveryKey:key,participantPseudonym:result.participantPseudonym};q('#resume-result').hidden=false;q('#resume-result').textContent=JSON.stringify({participantPseudonym:result.participantPseudonym,status:result.status,completenessLabel:result.completenessLabel,partial:result.partial,missingFields:result.missingFields,details:result.details,consent:result.consent},null,2);status('Your case state is shown below.')}catch(error){status(error.message,true)}});`;
