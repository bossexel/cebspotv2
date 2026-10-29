# CebSpot final-defense rehearsal

Prepared October 27, 2026, Asia/Manila. This is a fictional defense grounded in repository evidence. Dialogue, panel personalities, demonstration fixtures, and possible outcomes are rehearsal material. Research results and panel approval are not invented.

Read this as the lead proponent defending **CebSpot: A Mobile Application for Discovery and Leisure in Cebu City**. Replace first-person plural with the actual team's speaking arrangements. Each member must describe only work they actually performed.

## 1. Know the position before entering the room

The defensible contribution is an Android application connecting Cebu venue discovery, community information, and reservations at participating venues, with an Android owner interface and a separate web administrator console. Its technical contribution includes data flow across roles, inventory rules, authorization, asynchronous payment handling, and media processing.

The contribution does not establish that CebSpot outperforms existing discovery services, eliminates fraudulent reviews, increases business revenue, or has achieved user acceptance. Those statements require their own evidence.

**Material document finding:** extraction of `CebSpot_Manuscript_Aligned_READY_TO_PASS_20260601-202043.docx` found Chapter 3's implementation/testing section followed by references, without a Chapter 4 results section. The manuscript also describes older manual/demo payment behavior and makes completed-survey, expert-evaluation, usability, and release-readiness assertions that need underlying records. Check the actual submission copy and required institutional chapter structure. A filename is not proof that a manuscript is complete.

**Material deployment finding:** `deployment-2026-10-25.md` records Android 1.0.4/version code 12, hosted admin and face-service deployment, and two feed/media migrations. It explicitly records missing endpoints and services for an older reservation/account overhaul. Do not claim that every feature in the current source is installed on the hosted backend.

Source snapshot inspected: `5c8f0c0f559c161a4dbdab20d00a763802de6a6c`. This is distinct from the October 25 release source recorded in deployment notes. The actual evaluated APK, backend revision, test dates, and manuscript must identify the same evaluation scope.

## 2. The room and speaking discipline

The chair is impatient, the technical panelist asks for database evidence, and the research panelist questions every conclusion. They have already failed other teams. Our response is short, direct, and supported by a screen, record, test, or explicit limitation.

Answer in this sequence: **answer the question, explain the mechanism, identify the evidence, state the boundary if material.** Stop when the question is answered. Avoid defending an incorrect sentence merely because it appears in the paper.

Keep a frozen APK, source identifier, schema/migration manifest, test report, requirement traceability table, actual participant results, and issue register available. A backup recording must be labeled with its build, date, environment, and whether data is synthetic.

## 3. Opening presentation: approximately 10–12 minutes

### 0:00–1:15 — State the problem and contribution

**Me:** “Good morning, panel members. We present CebSpot: A Mobile Application for Discovery and Leisure in Cebu City.

“Consider a person planning an evening with friends. The task involves choosing a venue, checking its location and community information, and arranging a table where reservations are supported. CebSpot brings these steps into one Cebu-focused workflow.

“Our contribution is the implementation of that workflow across three roles: the Spotter who discovers and books, the owner who manages the assigned venue, and the administrator who reviews contributions and handles privileged actions. We will demonstrate the supported behavior and show the evidence behind our conclusions.”

**Chair:** “Those are features. What exactly is your problem?”

**Me:** “The problem addressed is fragmentation between venue information, community feedback, and booking coordination. We operationalize it through concrete tasks: finding an eligible venue, reviewing its information, and submitting and managing a reservation. A claim that these tasks are faster or easier needs comparative measurements; I will not infer that from the feature list.”

### 1:15–2:30 — Connect the objectives to evidence

**Me:** “The manuscript identifies five objectives: a user-friendly discovery application, reservations at selected venues, map-based nearby and suggested discovery, owner promotion and management, and payment integration.

“For evaluation, each objective needs a requirement, a test, and an observed outcome. We can inspect the discovery interface and filter logic; exercise reservation rules; inspect the similar-place ranking; exercise an assigned owner's tools; and verify a payment through the provider-to-backend confirmation path.

“There are two wording boundaries. User-friendly requires participant evaluation. Trending requires a defined measure of change over time; a Popular feed alone does not demonstrate it. Any required behavior absent from the evaluated build stays visible as a gap.”

### 2:30–3:30 — Explain the methodology accurately

**Me:** “The manuscript describes developmental research supported by descriptive methods, with Agile Scrum guiding implementation. Developmental research concerns building and evaluating the artifact. Descriptive work concerns users' reported needs and experiences. Scrum concerns how implementation work was organized.

“The evidence for those statements must be the actual instruments, responses, analysis, backlog, iteration records, and changes. Automated tests provide engineering evidence. They do not substitute for participant evaluation.”

If those records are unavailable, say: “The paper describes those activities, but I cannot substantiate a completed evaluation without its records. The results must be supplied or the claim corrected before final submission.”

### 3:30–5:00 — Explain the architecture

**Me:** “Customers and owners use the Android application built with React Native and Expo. Administrators use a separate web interface. Shared services connect the interfaces to Supabase authentication, PostgreSQL, storage, and server functions.

“The map uses Leaflet through the app's map surface. Haversine calculations provide geographic straight-line distances. Routing is a separate operation and dependency.

“Payment checkout and webhook processing belong on the server. The backend checks the reservation and caller, prepares the payment request, and processes verified provider events. Opening the return page alone cannot establish that a reservation is paid.

“The supported photo-processing paths use a separate Python face-anonymization service. Detection and image processing are separate from the recommendation logic.”

### 5:00–8:30 — Demonstrate one coherent journey

Use synthetic accounts and a prepared demonstration venue in an isolated backend. Do not create an actual customer charge or alter a real venue just to make the demonstration dramatic.

**Me:** “Our scenario is a Spotter arranging a table for four. I will show discovery first, then reservation handling, then the owner and administrator responsibilities.”

1. Open the evaluated Android build. Identify the build and environment.
2. Search a known venue and apply category/rating/distance filters. State that Explore offers 1, 5, 10, 25, and 50 km, with 10 km as the default in the inspected source.
3. Open the venue. Show its location, venue information, review surface, and supported booking entry.
4. Open Similar Places. Explain category matching, then distance and tie-breakers. Do not describe it as trained personalization.
5. Select a prepared date, time, party size, and available physical table. Explain that selection UI is not proof of a database hold; the backend must recheck availability.
6. Submit a free test reservation if this flow is verified in the isolated evaluated environment. Show the persisted record and actual state rather than promising a generic immediate confirmation rule.
7. If the paid objective is mandatory, execute a separate provider test-mode journey. Show amount/currency, provider reference, validated callback, and persisted reservation/payment outcome. A free booking is not a substitute for this objective.
8. Switch to a separate owner session. Show only the assigned venue and the permitted action for that fixture.
9. In the separate admin console, show a prepared pending contribution and the review outcome. Verify public visibility from an ordinary session.

**Me:** “This demonstrates the relationship among the roles. The venue's configured policy and actual backend state determine the available actions. We distinguish pending payment, paid payment, confirmed reservation, and completed attendance.”

If any prerequisite is missing, show the available layer, explicitly identify the missing layer, and mark the required end-to-end case unverified. Do not narrate an unexecuted success.

### 8:30–10:00 — Present results with their scope

**Me:** “The October 27 preparation rerun completed 330 selected tests: 325 passed, five were skipped, and none failed. TypeScript validation also passed. These checks cover several layers, including source assertions, service behavior, and isolated database and handler tests. They are not 325 participant acceptance cases. The October 25 deployment record separately reports its earlier 321-pass run; these overlapping runs must not be added together.

“The October 24 walkthrough separately records 22 fixture UI observations, 11 intercepted browser map checks, and 30 focused client regressions. It explicitly states that no Android device was attached. Those findings support particular interaction checks; they do not establish native-device acceptance or live booking and payment success.

“The deployment record also reports a signed Android APK. A successful build and signature establish an artifact, not successful installation and completion of every core task on a phone.

“Participant counts, task completion, questionnaire results, and conclusions must come from the actual study dataset. I will show those records where available and identify any missing results.”

Do not add overlapping historical test totals. Present a current rerun separately with its date, command, count, and limits.

### 10:00–12:00 — Give limitations and conclude

**Me:** “The important boundaries are native-device acceptance, provider callback verification, the exact backend rollout, and the alignment of the manuscript with the evaluated build. There are also documented interface findings, including saved-load error messaging and location labels.

“CebSpot's technical contribution is the connected discovery and reservation workflow and the rules that support it across roles. Our conclusions must be proportional to the evidence: implementation and isolated verification establish specific behavior; actual users and a complete deployed test environment establish acceptance. We are ready to show the implementation, explain its decisions, and account for the remaining findings.”

## 4. Strict panel cross-examination

### A. Relevance, originality, and scope

**Panel:** “Why build this when people already use maps and social media?”

**Me:** “CebSpot's proposed value is connecting Cebu venue information, contributions, and participating-venue reservations in a single workflow. We are not claiming existing platforms lack all of these capabilities. Our study must show whether the integrated local workflow meets its users' needs.”

**Follow-up:** “Prove that users need it.”

**Me:** “The appropriate evidence is the needs-assessment instrument and actual responses. If those records are unavailable, I can defend the design rationale and implemented workflow, but I cannot claim the need has been empirically established.”

**Panel:** “What is original about it?”

**Me:** “The project contributes the design, implementation, and evaluation of this local workflow and its data and authorization rules. We do not claim to have invented maps, online reviews, payments, or a new recommendation algorithm.”

**Panel:** “Define a hidden spot.”

**Me:** “In the project's motivation, it means a lesser-known venue that can be contributed and discovered locally. The inspected source does not establish a validated hiddenness score. I would not label a venue objectively hidden without defining and testing that classification.”

**Panel:** “Your objective says trending. Where is the trend?”

**Me:** “Trending needs a time-based definition and evidence of change. Popularity or recent creation alone is insufficient. If that required behavior is absent, it is a remaining objective gap requiring implementation and evaluation, or a formally approved scope revision.”

**Panel:** “Why only Android?”

**Me:** “The delivery scope concentrates customer and owner development and testing on Android, while retaining a separate administrator web console. iOS and customer/owner browser delivery are outside the current supported scope. Our compatibility conclusion must match that scope and the tested devices.”

**Panel:** “Why do you have Circles and rewards when the problem is reservations?”

**Me:** “They support social coordination and contribution. The central demonstration remains discovery, venue information, booking, and owner handling. Extra features do not compensate for an incomplete mandatory workflow, and their acceptance should be evaluated separately.”

### B. Research and academic validity

**Panel:** “What is the difference between your research design and Scrum?”

**Me:** “The research design describes how we build knowledge and evaluate the artifact. Scrum describes the organization of development work. A sprint record cannot replace a survey dataset, and a satisfaction mean cannot replace a transaction-integrity test.”

**Panel:** “Show your actual sprints.”

**Me:** “We should show the dated backlog, scope, iteration outputs, and review changes that exist. If the records establish iterative development but not full Scrum practice, the methodology wording should be narrowed.”

**Panel:** “How many respondents did you have?”

**Me:** “I will use the actual consent and response records. One reviewed UAT plan had inconsistent counts: 20 Spotters, one owner, and two admins totals 23, while another owner count implied 27. Those are planning inconsistencies, not evidence of participation. The final report must reconcile planned, recruited, completed, and valid counts by role.”

**Panel:** “How did you calculate your mean?”

**Me:** “For an item, we sum each rating multiplied by its response count and divide by valid responses for that item. Missing and not-applicable answers need an explicit rule. Role means should not be equally averaged unless that is the approved analysis method. We retain the raw counts and use the interpretation scale defined before analysis.”

**Panel:** “Does a high rating prove security?”

**Me:** “It supports respondents' perceptions on the question asked. Security needs separate technical evidence such as direct unauthorized requests, cross-account access tests, and backend policy checks. We do not use a questionnaire score as proof of resistance to attack.”

**Panel:** “Are you ISO certified?”

**Me:** “No certification is established by this repository. If the study uses a software quality framework, the paper must identify its edition, selected characteristics, instrument, and measurements. Alignment of an evaluation instrument is different from certification.”

**Panel:** “Where is Chapter 4?”

**Me:** “In the supplied DOCX I inspected, the testing section is followed by references and I found no Chapter 4 results section. If that is the submitted copy and a results chapter is required, it is a substantive omission. It must be completed from actual records. I will not invent a result or treat an automated test report as a completed human evaluation.”

**Panel:** “Then why should you pass?”

**Me:** “The implementation and available verification should be evaluated on their evidence. The manuscript and mandatory study requirements must also satisfy the rubric. If required results are missing, this presentation cannot cure that omission; they must be supplied and reviewed. I am asking for assessment of demonstrated work and clearly identified corrections, not exemption from a required component.”

### C. Discovery and recommendations

**Panel:** “How does search work?”

**Me:** “In the inspected implementation, search uses normalized substring matching against loaded venue names, addresses, and categories, combined with category, minimum-rating, and distance filters. Discovery has a 500-row retrieval limit. Filtering those rows does not guarantee a complete search over an arbitrarily large dataset.”

**Panel:** “How is distance calculated?”

**Me:** “Haversine distance uses the two coordinate pairs to estimate geographic straight-line distance. It is not road distance or travel time. The Similar Places feature measures from the viewed venue, while discovery uses the user's available coordinate or a Cebu reference point.”

**Panel:** “If I deny location, why does it say near me?”

**Me:** “Discovery can continue from a Cebu reference point, but wording implying the device's location is misleading. The October 24 walkthrough records that issue. The label should state the reference point until a user coordinate is available. That wording defect limits the accuracy of the current presentation.”

**Panel:** “Explain your AI recommendation.”

**Me:** “The Similar Places implementation is a deterministic rule-based ranking. It assigns 8 for a primary category match, 4 per exact category-label match, and 1 per shared non-generic category word. It excludes the current venue and nonpublic venues and requires positive category relevance. It then sorts by category score, venue-to-venue distance, rating, review count, recency, and name, returning up to six by default.”

**Follow-up:** “Why those weights?”

**Me:** “They are design heuristics that prioritize primary category matching. The code does not establish that they are optimal. To claim improvement, we would compare the ranking with simple baselines using the same candidates and actual relevance judgments or task outcomes.”

**Panel:** “Your manuscript says 1.5 km.”

**Me:** “The inspected Explore implementation supports 1, 5, 10, 25, and 50 km with a 10-km default. A fixed 1.5-km statement would describe a different requirement or version. The evaluated requirement and manuscript need reconciliation; we should not claim both.”

### D. Data, reservations, and payments

**Panel:** “What are the important database relationships?”

**Me:** “A reservation links a customer to a venue and its selected inventory and schedule. Owner assignment links an authorized business account to a venue. Payment attempts and provider events support transaction processing separately from the reservation's attendance state. The ERD must be generated from the evaluated schema, including newer relationships, rather than assuming an old fixed table count.”

**Panel:** “Two people reserve the same table at the same time. What happens?”

**Me:** “The client can display stale availability, so the authoritative decision belongs in the database. The repository defines active-booking conflict rules and transactional checks for the applicable table and schedule semantics. In the evaluated environment, we must demonstrate that two independent accounts targeting the same constrained inventory produce only the permitted active allocation. A losing request needs a clear response and no unintended charge.”

**Follow-up:** “So zero overbooking?”

**Me:** “I can state the invariant and show the isolated tests that exercise it. A guarantee about the hosted system also requires the matching rules to be deployed and the actual concurrency case to pass. A local test is not that deployment evidence.”

**Panel:** “Is the five-minute timer locking the table?”

**Me:** “A selection timer is an interface behavior. A persisted backend hold and its server deadline are separate. We must show which flow creates a hold, what inventory it covers, and how expiry releases it. A timer animation alone establishes none of those properties.”

**Panel:** “Why not just trust the customer payment screenshot?”

**Me:** “Manual proof and provider payment are different workflows. A screenshot is a submitted claim for authorized review. Provider payment should be verified through the backend's validated provider information and callback. The confirmation mechanism must match the configured payment method.”

**Panel:** “What if I change the amount in the app?”

**Me:** “The server must use the stored reservation amount and validate the applicable payment information. The local payment suite includes wrong-amount and wrong-currency rejection cases. The deployed function and schema must be verified before claiming the hosted flow enforces the same behavior.”

**Panel:** “Payment succeeds but the app closes.”

**Me:** “Payment completion must be independent of an open screen. The provider event and backend processing establish the persisted outcome. When the user returns, the app reads that state. A lost return navigation should not require another payment attempt just to discover whether the first succeeded.”

**Panel:** “What if the callback arrives twice or late?”

**Me:** “The newer local design uses durable attempts, event identity, and atomic transitions. Duplicate events should preserve the accepted outcome; an old failed attempt must not overwrite a newer paid outcome. Completed attendance must not reopen because a payment message repeats. We show the actual regression cases and distinguish their local verification from deployment.”

**Panel:** “Are all of those fixes live?”

**Me:** “The October 25 deployment notes explicitly say the earlier reservation/account overhaul remains absent from the hosted database and list missing services. I cannot claim it is live based on source code. The environment needs that rollout and verification before it demonstrates those features end to end.”

**Panel:** “Is GCash integrated?”

**Me:** “We must identify the exact method and mode: manual GCash proof, direct provider GCash, or PayMongo QR Ph. They are not interchangeable. Account capability and build configuration determine which provider methods are offered. A simulated return or a proof upload does not establish a successful provider transaction.”

**Panel:** “What about refunds?”

**Me:** “Refund processing cannot be inferred from reservation cancellation. If the evaluated build does not execute provider refunds, that limitation and its operational handling must be stated. We should not promise automatic refunds without a tested path.”

### E. Authorization, privacy, media, and trust

**Panel:** “Could an ordinary customer open the owner route?”

**Me:** “A route guard helps the interface, but the backend must still authorize each request. The meaningful test is whether the customer can read or mutate protected venue data through a direct request. Owners must also be isolated from other owners' venues.”

**Panel:** “If your public Supabase key is in the APK, is the database compromised?”

**Me:** “The public client key is not an administrator credential. Protection relies on the authenticated identity, database policies, storage rules, and server-side authorization. A service-role or provider secret must remain server-side. The presence of RLS alone does not prove its policies are correct; cross-user requests must be tested.”

**Panel:** “Are you compliant with all privacy requirements?”

**Me:** “I can describe the implemented controls and the data flows. I cannot infer complete compliance from a permission dialog, privacy page, or test suite. Organizational policies, retention, consent, third-party processing, and actual deployment need their own assessment.”

**Panel:** “Does face blurring guarantee anonymity?”

**Me:** “No. Automated detection may miss faces, and other details may identify someone. The October 25 record includes a no-face image and a one-face sample; these are processing checks, not a detection-accuracy benchmark. Media types and upload paths also differ. We need representative testing and a user review step rather than promising perfect anonymization.”

**Panel:** “Can I stop sharing my Circle location?”

**Me:** “The newer local implementation exposes start/stop controls and defines consent-bound publication with generation checks against delayed updates. But the October 25 notes indicate relevant older backend work is not fully deployed. The evaluated environment must prove stop, access isolation, and delayed-write rejection before we claim effective live revocation. Previously delivered offline copies cannot be remotely erased.”

**Panel:** “Can a user delete their account?”

**Me:** “There is a newer resumable deletion implementation and local tests, but the deployment record says the deletion service and related functions were missing. Showing a deletion explanation screen is not evidence that deployed deletion completes. Financial obligations and any retained records also need explicit treatment.”

**Panel:** “How do you stop fake reviews?”

**Me:** “The available approach includes authenticated participation, reporting, and administrator moderation. It does not prove a reviewer visited or that the review is true. We cannot claim automated fake-review detection or guaranteed authenticity without a suitable mechanism and evaluation.”

**Panel:** “Your rewards encourage spam.”

**Me:** “That is an evaluation concern. Reference-based awards and participation rules constrain some repeated effects, but XP is not evidence of contribution quality. We need abuse cases and moderation evidence before claiming the rewards improve trustworthy participation.”

### F. Reliability, performance, and evidence quality

**Panel:** “How many users can it handle?”

**Me:** “The inspected performance assessment does not establish a supported concurrent-user capacity. Local algorithm measurements and mocked handler calls cannot be converted into a hosted-user claim. We need an isolated backend load run, booking-integrity checks, resource metrics, and physical-device measurements.”

**Panel:** “But your test report says everything passed.”

**Me:** “A test report describes the selected suite and environment. Source assertions, isolated SQL tests, intercepted browser tests, provider integration, device acceptance, and participant evaluation answer different questions. Skips and unexecuted cases remain visible. A green selected suite is useful evidence with a defined scope.”

**Panel:** “Your old report says payment and map tests failed.”

**Me:** “That is historical evidence for that version. Later notes document local payment remediation and 11 passing map checks. We should retain the earlier failure and show its corresponding fix and retest, rather than erase it or assume that a later pass verifies the deployment.”

**Panel:** “Does offline mode work?”

**Me:** “Some bundled information and local bookmark IDs can remain available. That is not complete offline venue search, current availability, or payment processing. The walkthrough found that a venue-load failure could incorrectly appear as an empty saved list, so that state needs correction and retesting.”

**Panel:** “What happens if the face service is asleep?”

**Me:** “The October 25 deployment notes record free-instance cold-start delays. The app needs an honest processing state, bounded retries, and recoverable failure. Compression reduces payload size; it does not eliminate service startup time.”

**Panel:** “Why should we trust you with an unfinished menu?”

**Me:** “The walkthrough records an Activity menu with no action. That is a real interface defect and should be implemented or removed. Its severity differs from payment corruption or unauthorized access, but we should not present the interaction as complete.”

**Panel:** “Who maintains this after graduation?”

**Me:** “The handover must identify an actual maintainer, account ownership, hosting obligations, backups, migration procedure, and support arrangements. Source control supports reproducibility, but does not supply an operations team. We must state whichever arrangements actually exist.”

**Panel:** “Did you use AI or copied libraries?”

**Me:** “We should disclose the tools and third-party components actually used under our institution's policy. We must understand and explain the implementation, review generated work, acknowledge dependencies, and own the accuracy of the submitted material. I will not invent an authorship history or team contribution.”

## 5. When the demonstration goes wrong

**Scenario: the venue request fails.**

**Me:** “The request failed in this environment. I will show the visible recovery behavior and make one controlled retry. If the dependency remains unavailable, I can show the dated recording and matching test evidence, labeled as prior evidence. Today's live step remains unsuccessful.”

**Scenario: payment stays pending.**

**Me:** “Pending is the observed state. We need to compare the provider reference, event delivery, and backend transaction. I will not manually label it paid to continue. The provider-integration objective is not demonstrated by this attempt.”

**Scenario: a panelist finds a defect.**

**Me:** “That result differs from the expected behavior. I will record the build, action, and observed outcome. If it affects a core invariant, it remains a blocking issue until corrected and retested. I can explain the intended mechanism, but I cannot claim this case passed.”

**Scenario: the panel says an app is not research.**

**Me:** “The artifact is one part of the capstone. The research contribution requires a documented problem, requirements, justified methods, actual evaluation, analysis, and conclusions supported by results. We should be assessed on both the artifact and that evidence. A demonstration alone does not satisfy all of them.”

**Scenario: a panelist interrupts repeatedly.**

**Me:** “The direct answer is [one sentence]. The supporting evidence is [one artifact]. The remaining boundary is [one sentence, if needed].”

Do not argue about tone, invoke failed classmates, ask for sympathy, or describe months of effort as proof of correctness.

## 6. Evidence to have within one click

| Claim | Primary repository evidence | What it does not establish |
| --- | --- | --- |
| Supported platforms | `README.md`, `docs/android-only.md`, `app.json` | Device acceptance or iOS support |
| October 25 deployment and APK | `docs/deployment-2026-10-25.md` | That all earlier source migrations/services were deployed |
| Search and distance behavior | `app/index.tsx`, `src/services/spotService.ts`, `src/utils/distance.ts` | Complete search beyond the retrieval limit; road distance |
| Similar Places algorithm | `src/utils/similarSpots.ts` | Trained personalization, optimized weights, user preference |
| Schema and transitions | `supabase/migrations/`, `docs/payment-release-verification.md` | Hosted rollout merely from file existence |
| Local payment behavior | `tests/remediation/payment-handlers.test.cjs`, `tests/remediation/durable-payments.test.cjs` | Actual provider callback delivery or real user charges |
| Source/backend remediation history | `FINAL_AUDIT_CLOSURE.md`, `REMEDIATION_STATUS.md` | Final participant acceptance |
| Interface and map observations | `docs/user-walkthrough-2026-10-24.md` | Physical Android end-to-end acceptance |
| Performance limits | `tests/performance/ASSESSMENT.md` | Supported API concurrency or phone FPS |
| Planned UAT and inconsistencies | `docs/uat-plan-review.md`, `docs/uat-audit-alignment-2026-10-13.md` | That planned participants executed the cases |
| Actual research outcomes | Actual instruments, consent records, responses, execution logs, and approved analysis | These cannot be supplied by a rehearsal script |

## 7. Closing statement

**Chair:** “Give us your final reason to approve CebSpot.”

**Me:** “CebSpot deserves assessment as an implemented Cebu-focused discovery and reservation system with identifiable technical decisions and reviewable evidence. We can explain its data flow, role boundaries, recommendation rules, booking constraints, and payment architecture.

“Our claims must remain proportional to what was tested. We accept documented defects and required manuscript corrections, and we will support their closure with actual records. If a mandatory requirement remains unverified, we will identify it directly. We ask the panel to judge the completed work and its evidence against the rubric.”

There is no predetermined passing verdict. Where required research results or core acceptance cases are missing, the strongest preparation is completing them before the defense. A possible favorable rehearsal ending is approval with specified minor revisions **only after mandatory requirements and evidence are satisfied**. It is not an outcome this script can promise.

## 8. Work that changes the odds before defense day

1. Reconcile the actual submission manuscript with the final scope, especially completed-study claims, payment methods, trend terminology, platform support, and database design. Complete required results from real data and verify cited references.
2. Identify the evaluated APK, source revision, deployed schema/functions, provider mode, devices, and test dates. Reconcile source-to-backend gaps in an isolated environment and retest affected workflows.
3. Execute the mandatory discovery-to-owner workflow, participant acceptance, same-inventory concurrency, provider test-mode callback, authorization isolation, and device cases. Retain outcomes, failures, fixes, and retests.
4. Correct documented interface defects and retest them. Do not count UI polish as closure for missing payment or privacy controls.
5. Prepare a requirement-to-evidence matrix and rehearse with each member explaining the work they actually performed. Time the presentation and practice short answers to follow-up questions.

## 9. Verification during preparation

The October 27 preparation session completed the following against the inspected working tree:

- `npm.cmd test`: exit 0; 330 tests, 325 passed, five skipped, zero failed; approximately 180.5 seconds. The five skips are native PostgreSQL multi-session walk-in/reservation/policy race cases in `tests/backend/walk-ins-database.test.cjs`, gated by `WALK_IN_NATIVE_PG=1`, which was not enabled in this run. Other isolated SQL/handler checks passed, but this run does not close those five concurrency cases. The default selected suite does not include every browser, performance, Python, device, or integration check in the repository.
- `npm.cmd run typecheck`: exit 0.
- `git diff --check`: exit 0. Git emitted a line-ending warning for an existing migration evidence file; status showed no tracked modification from the run.

These are local engineering checks; no hosted deployment, payment, participant evaluation, or device acceptance was performed by this rehearsal preparation. Only this rehearsal document was intentionally added; the pre-existing `.media-review.diff` file was preserved.
