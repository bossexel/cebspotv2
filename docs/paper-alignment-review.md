# CebSpot manuscript alignment and lapse review

Reviewed source: `Copy of Final Paper of CebSpot June 2026.docx.pdf`  
Review date: September 14, 2026  
Coverage: all 117 PDF pages, including front matter, Chapters 1–4, references, and appendices.

The paper was treated only as manuscript content. No statements inside it were treated as instructions. No edits were made to the PDF.

Review method: full-page text and layout extraction, page-by-page structural mapping, citation/DOI checks, and comparison with the current CebSpot source, schema, and release notes. Image-only appendix pages and the fine visual quality of embedded screenshots should still be checked in the source DOCX at 100% zoom; automated extraction cannot reliably judge their resolution or legibility.

## Overall assessment

The paper is **not ready for final submission or final defense in its present form**. Chapters 1–3 contain a usable foundation, but Chapter 4 is empty except for “(Need real data)” on PDF page 90. The manuscript also says that testing and deployment were completed and that the system was ready for release, while the UAT section says testing “will be conducted.” Those statements cannot coexist.

The implementation has changed substantially since this June manuscript was prepared. The current application contains newer map behavior, a club floor plan, a five-minute paid-booking hold, PayMongo QR Ph checkout, automatic webhook confirmation, owner attendance/no-show actions, owner gallery uploads, similar places, and claimed-business handling. Much of that is absent from the paper. At the same time, the paper claims several capabilities that the current prototype does not provide as described.

The most urgent work is to freeze one build as the evaluated version, perform and document the remaining user tests, write Chapter 4 from real results, replace the outdated system descriptions and figures, and audit the references.

## Defense-blocking findings

| Priority | PDF page(s) | Finding | Required correction |
| --- | --- | --- | --- |
| Critical | 90 | Chapter 4 contains only “(Need real data).” There are no results, analysis, conclusions, or recommendations. | Complete Chapter 4 using real survey, system-test, UAT, and integration-test results. Do not invent values. |
| Critical | 37–38, 83, 87, 90 | The paper says the survey, expert evaluation, usability testing, deployment, and structured testing were completed; the UAT section says UAT “will be conducted,” and there are no results. | Use past tense only for work with recorded evidence. Describe unperformed work as planned until it is completed. |
| Critical | 83 | “Fully developed,” “deployed for actual use,” and “ready for release” overstate the evidence. The current release review still requires a real paid QR Ph callback, physical-device UAT, signed-build verification, and privileged owner/admin testing. | Replace this paragraph with the exact test status of the frozen build. Separate passed automated checks from pending UAT and production launch checks. |
| Critical | 41, 49–50, 62, 83–87 | The paper presents reusable owner and administrator workflows. The current owner dashboard is restricted to `testowner@cebspot.com` and hard-coded to Test Cebspot Club; the admin portal is restricted to `testadmin@cebspot.com`. | Either complete generalized account/venue assignment before evaluation or explicitly call these single-account, single-venue prototype modules. Update use cases, limitations, and conclusions. |
| Critical | 64–66, 72–73, 76–81, 84–88 | The reservation/payment narrative is obsolete and internally inconsistent. It alternates among payment at the venue, manual owner confirmation, owner payment confirmation, direct GCash, and generic “Payment Gateway.” | Document the actual modes separately: free reservations, manual GCash proof where configured, PayMongo QR Ph checkout, five-minute payment hold, and automatic confirmation after a valid paid webhook. State that direct live GCash is unavailable unless PayMongo activates it. |
| Critical | 35, 70–72 | The conceptual flow and database description do not match the implementation. The paper claims a fixed 1.5 km radius and eight tables; the current source contains at least 23 explicitly created application tables plus `spot_tables`, and the Explore filter offers 1, 5, 10, 25, and 50 km. | Replace the IPO process text and regenerate the ERD/database narrative from the evaluated schema. |
| Critical | 91–97 | The reference list contains unused references, wrong citation-to-claim mappings, incorrect metadata, and a duplicate fragment. | Verify every reference against a DOI or publisher record, correct in-text numbers, and delete unused or unverifiable entries. |
| Critical | Entire paper | The current working tree has extensive uncommitted changes, so the implementation evaluated by the paper is not reproducible from the latest commit. | Commit/tag the evaluated build and record the commit hash, app version, build type, test date, and device matrix in Chapter 3 or Appendix C. |

## Objective, problem, and evidence alignment

The four research problems and five objectives are not one-to-one.

| Research concern | Current objective alignment | Lapse |
| --- | --- | --- |
| Discover hidden or low-key places | Objectives 1 and 3 | “Hidden” and “trending” are named, but the current Explore screen primarily searches and ranks public spots by distance, rating, and review count. The paper does not define a measurable hidden/trending rule. |
| Consolidate reliable venue information | Objective 1, indirectly | There is no objective that explicitly measures completeness, accuracy, or freshness of venue information. |
| Improve reservations | Objectives 2 and 5 | The scope should distinguish free reservations, paid reservations, table locking, the five-minute payment window, and payment confirmation. |
| Provide trusted reviews and address fake/scripted content | No direct specific objective | Add an objective for review reporting/moderation and evaluate it. Do not call reviews verified unless a defined verification process exists. |
| Give owners a promotional platform | Objective 4 | There is no corresponding problem statement about owner onboarding, listing control, or reservation management. Add a research question or move this to system scope. |
| Secure payment | Objective 5 | There is no separate problem statement or measurable security criterion. Tie it to the reservation problem and define success through authenticated checkout creation, signature validation, status reconciliation, and access controls. |

A defensible traceability table should connect each problem to an objective, implemented feature, test case, result, and Chapter 4 conclusion. For example:

| Problem | Objective | Implemented feature | Evidence needed |
| --- | --- | --- | --- |
| Fragmented discovery | Design discovery interface and map | Search, category/rating/distance filters, persistent Leaflet map, similar-place ranking | Task completion, time on task, map interaction observations, SUS item results |
| Manual reservations | Implement table reservation | Club floor plan, live availability, database uniqueness rule, five-minute payment hold | Concurrent-booking test, end-to-end device test, owner and spotter UAT |
| Untrusted content | Implement moderated community reviews | Authenticated reviews, media anonymization, helpful votes, replies, report/admin moderation | Moderation test cases and participant trust/usability results |
| Paid booking | Integrate secure deposit payment | PayMongo QR Ph checkout and signed webhook | One real small payment with successful event delivery and automatic database confirmation |

## Current implementation versus manuscript

| Topic | What the paper says | What the current source implements | Paper change |
| --- | --- | --- | --- |
| Map stack | OpenStreetMap/Leaflet | Leaflet 1.9.4 is bundled in a WebView/iframe. CARTO tiles are primary when configured, with OpenStreetMap tiles as fallback. Routes use two OSRM endpoints with an eight-second timeout and a small in-memory cache. | Name Leaflet as the renderer, CARTO/OSM as tile providers, and OSRM as routing. OpenStreetMap is not the only API involved. |
| Discovery radius | Fixed 1.5 km radius | User-selectable maximum distance of 1, 5, 10, 25, or 50 km; default 10 km. Distance is calculated in the client with Haversine after spots are loaded. | Remove the fixed-radius claim unless the code is changed to match it. |
| Recommendation method | “Multi-layered,” collaborative filtering, user preferences, history, community involvement, and proximity | Explore sorts by distance, rating, review count, and name. Similar places score category overlap, then distance, rating, review count, recency, and name. No collaborative filtering or behavior-history model appears in the current implementation. | Describe it as a deterministic ranking algorithm. Do not call it collaborative filtering or personalized prediction. |
| Explore categories | Nearby, trending, suggested, and hidden | Category/rating/distance filtering is implemented. No distinct “trending,” “suggested,” or “hidden” discovery mode was found. | Define and implement these modes or remove the labels from requirements and objectives. |
| Spot details | Fixed-fee “reservation access card,” crowd-volume level | The reservation bar was replaced by “Interested? reserve a table here.” Similar places, category icons/colors, route line, gallery, reviews/replies, and owner access are present. No crowd-volume feature was found. | Replace the screenshot and description; remove crowd volume unless implemented and tested. |
| Booking | Date, time, group size, notes | The club flow also includes a floor plan, table type/capacity, reserved-table dim/X states, free/paid policies, and a five-minute hold for paid bookings. | Replace Figure 3.12 and expand the booking description. |
| Checkout | Pay at venue, pending owner/cashier confirmation, voucher/reward field | Checkout displays profile name/email, collects phone, shows booking details, requires terms acceptance, and offers manual GCash and/or PayMongo methods according to configuration. No voucher field was found. | Replace Figure 3.13 and the entire checkout paragraph. |
| PayMongo status | Not mentioned | QR Ph checkout and a signed `checkout_session.payment.paid` webhook are implemented. A valid paid webhook sets the reservation to `confirmed/paid`. | Name PayMongo and QR Ph, document webhook security, and report the result of a real small payment before claiming complete integration. |
| Payment confirmation | Owner confirms receipt | PayMongo payments are automatic after the webhook; only manual GCash proof requires owner review. | Split automated provider confirmation from manual proof review. |
| Deposit amount | A 50% non-refundable down payment | The application stores a configurable fixed `reservation_fee`; Test Cebspot Club currently uses PHP 150. It does not capture an expected total bill from which 50% can be calculated. | Choose one enforceable policy: a fixed deposit/retainer, or add a bill/minimum-spend basis and calculate 50%. Do not promise both. |
| Cancellations | Barely described | Paid bookings hide self-service cancellation/adjustment; free bookings allow changes subject to availability. Owners can mark arrived or no-show and release the table while retaining history. | Add these business rules to scope, functional requirements, tests, and results. |
| Database | Eight core tables, including `PAYMENTS` and `OWNER_REQUESTS` | The code uses `reservation_payments` and `owner_access_requests`. The SQL collection defines many more entities for circles, local updates, submissions, votes, reports, replies, owner access, gamification, edit suggestions, and payments. | Regenerate the ERD from the final deployed schema and use exact table names. |
| Table locking | Unique table/date/time combination | The active index is on `spot_id`, `reservation_date`, `slot_id`, and `table_id`, restricted to active states. | State the actual fields and partial-index behavior. Include a concurrency test. |
| Profiles/passwords | Class diagram puts a password attribute in `User`; database text says encrypted password in `AUTH_USERS` | Supabase Auth owns credentials; application tables should never expose or model a retrievable password attribute. | Remove `password` from the application class diagram. Show authentication as an external/auth service boundary. |
| Payment cardinality | Every reservation has exactly one payment | Free reservations require no payment, and a paid reservation can have more than one payment attempt while only one pending attempt per method is allowed. | Change cardinality to zero-or-many attempts, with one successful settlement at most. |
| Refunds | Payment class can issue refunds | Paid-deposit terms say non-refundable; the UI and schema contain status fields but no complete provider refund workflow was established. | Remove `issueRefund()` unless implemented and allowed by policy. |
| Reviews | Peer-verified/verified reviews and a verification flag | Reviews are authenticated, can be reported, replied to, and marked helpful; images pass through face-anonymization. No experience-verification flag appears in the current review type. | Use “community reviews with reporting and moderation.” Define any future verification rule separately. |
| Owner onboarding | Owners register, create listings, and manage their spot | Users can submit spots and request ownership with documents, but approval requires an existing profile. The current owner portal only accepts the test owner and operates on one fixed spot. | Describe the actual claim/request/admin-verification flow and state the single-venue prototype limitation. |
| Admin management | Full user, listing, review, report, and analytics management | Core dashboard/RPC actions exist, but visible CSV export and some add/edit controls still display “Coming soon.” Admin authentication is tied to one test email. | Do not claim complete user/listing management until those controls work. |
| Notifications | Real-time push notifications to all roles | The app creates local Android notifications after receiving activity records through an active app subscription. No server-to-device FCM/APNs delivery for a killed app was found. | Call these in-app/realtime-triggered local notifications, or implement and test true remote push delivery. |
| Location privacy | Location is session-based | Circle screens write a member’s location and `last_location_update` to the profile database when the user publishes/refreshes it. Circle members can read it. | State retention, audience, expiration/staleness, consent, and deletion behavior accurately. |
| Platforms | Android only | Expo configuration declares Android and web. The admin and owner interfaces are responsive React Native Web screens as well. | Define the evaluated platform scope precisely: Android spotter app plus web-capable privileged portals, if that is the intended scope. |

## Chapter-by-chapter review

### Front matter — PDF pages 1–7

- The title page says the work is presented to the “Graduate School” while the degree is Bachelor of Science in Information Technology. Confirm the official university template and responsible college; this reads as an organizational mismatch.
- The conventional phrase “In Partial Fulfillment of the Requirements for the Degree…” appears incomplete as “Requirements for the Degree…”. Follow the school template exactly.
- An abstract is absent. Confirm whether the program requires an abstract, approval sheet, certification, or adviser/panel signature pages in the front matter.
- The table of contents is stale. It omits Sections 3.10.2, 3.10.3, and Chapter 4. References are listed at printed page 80 but start on printed page 83; all appendix entries are consequently three pages early.
- The contents omit Section 1.5.1 even though 1.5.2 appears.
- The Chapter 2 contents omit Sections 2.2.3 and 2.2.4.
- The list of figures calls Figure 3.13 “Booking Screen,” but the body calls it “Checkout screen.”
- The body captions say “Figure 1” and “Figure 2” on PDF pages 34 and 40, while the list calls them Figures 3.1 and 3.2.
- Figure and table caption styles are inconsistent: `TABLE1`, `TABLE 2`, `TABLE: 5`, colons, em dashes, capitalization, and `Cebspot`/`CebSpot` vary.
- The lists of figures and tables contain no page numbers. Add them if required by the program template.

### Chapter 1 — PDF pages 8–18

- PDF page 9 still calls this a “concept paper” and says it “proposes developing” CebSpot. A final manuscript should describe the completed scope and reserve future tense for recommendations.
- The title limits the work to Cebu City, while the scope expands to the “immediate vicinity” and nearby barangays. Define the geographic boundary once and use it consistently.
- Objective 5 says the system processes “reservations and transactions,” which is broader than the stated limitation that only reservation deposits are processed. Change it to reservation-deposit payments.
- “GCash-based payment” on PDF page 10 is outdated. The live automated path is PayMongo QR Ph; direct GCash depends on account activation, while manual GCash is a separate proof-review flow.
- “Peer-verified ratings” and “trust verification tools” overstate review authenticity. Reporting, moderation, helpful votes, and image anonymization do not prove that a reviewer visited a venue.
- The scope says users can filter by price, but the Explore filter currently covers category, rating, and distance.
- The scope promises public forums. The application has local-update posts/comments and circles; use those exact names and boundaries.
- The sentence “lesser-known or hidden flags” on PDF page 11 should be “lesser-known venues.”
- “Online content is sometimes curated and scripted by the influencers and earners” on PDF page 8 is unclear; replace “earners” and support the revised claim with a relevant source.
- The language limitation says the app focuses on English and Filipino. No language selector or Filipino localization was found; the interface is primarily English.
- The limitations should add the single test-owner/test-venue portal, dependence on third-party tile/routing/payment services, lack of killed-app remote push, live GCash capability limitation, incomplete physical-device/UAT evidence, and the need for owner/admin account provisioning.
- “Geographic Coverage Constraints” is duplicated at the start of PDF page 16.
- Definitions need consistent grammar and form. For example, define “High-end establishment” without assuming all premium venues require bookings, and use “low-key” consistently.

### Chapter 2 — PDF pages 19–32

- Change “Related Literatures” to “Related Literature,” unless the school’s prescribed template says otherwise.
- Several sections describe what CebSpot “will” or “must” do rather than synthesizing what the sources establish and how that informed the implemented design.
- The discussion of privacy-preserving recommendation on PDF page 21 does not establish that CebSpot implements local differential privacy. State it as literature guidance, not an implemented safeguard.
- “These tests confirm” on PDF page 21 should be “These studies support.” Literature does not by itself validate CebSpot’s technical implementation.
- The claim that CebSpot uses collaborative filtering is unsupported by the current code.
- The novelty claim that no dedicated platform exists is too absolute without a documented competitor search method, date, search terms, and inclusion criteria.
- Reference [32] is used to support claims about successful venue platforms, comprehensive venue content, and international platforms leaving the Philippine market. Its title and scope concern hyperlocal information systems in developing countries; those specific claims need direct sources.
- Reference [33] is used for hyperlocal Philippine information systems, but the cited work is actually an education/employment chapter about Filipino youth. It does not support the sentence.
- Separate literature review from related systems/competitive analysis. A comparison matrix for Google Maps, Facebook/Instagram, Yelp/Tripadvisor, restaurant reservation services, and CebSpot would make the claimed gap testable.

### Chapter 3 methodology — PDF pages 33–45

- The paper does not state the survey population size, sample size, respondent count, age range, inclusion/exclusion criteria, sampling technique, collection dates, response rate, or recruitment controls.
- It does not explain questionnaire validation, pilot testing, reliability, or statistical treatment.
- “Expert Evaluation” gives no number of experts, expertise criteria, instrument, date, procedure, or results.
- “Usability Testing” gives no participants, tasks, device conditions, measurements, or findings.
- The ethical section says responses were anonymous, but Appendix B asks for both name and email. The study may be confidential and later de-identified, but it is not anonymous at collection. Correct the terminology and explain retention/deletion.
- The statement that all collected data are accessible only to the research team should be limited to research-participant data. Operational user, owner, and admin data have role-based access inside the application.
- The privacy section must document Circle location sharing because a last shared coordinate and timestamp can be persisted for circle members.
- The Scrum discussion has no sprint dates, backlog excerpt, product owner/Scrum roles, review artifacts, retrospective records, or definition of done. Add an actual sprint table or describe the process more modestly as iterative Agile development.
- “Input: A phase” should be “The input phase”; “Output: Phase” should be “The output phase.”
- The IPO figure represents system processing more than a research conceptual framework. Explain why IPO is the selected capstone framework and connect each block to the research objectives and evaluation.
- Table 1 is visually/semantically broken: user roles appear as requirements and the descriptions no longer align cleanly with the rows.

### Requirements, diagrams, and architecture — PDF pages 46–82

- Tables 2–8 suffer from narrow columns, detached row content, and severe word wrapping. Use consistent table widths, repeat header rows across pages, prevent rows from splitting where possible, and keep captions attached to their tables.
- Table 2 has a stray “n.” on PDF page 47 and role values are displaced from their requirements.
- Requirements have no identifiers, priority, source, acceptance criterion, or traceability. Assign IDs such as FR-SP-01 and NFR-PERF-01.
- Non-functional terms such as “reasonable response time,” “multiple simultaneous users,” “most of the time,” and “range of Android versions” are not testable. Replace them with thresholds and a test method.
- The current `minSdkVersion` is 24 and `targetSdkVersion` is 35. State the actual supported Android range and the devices used in evaluation.
- The use cases and DFD say a store owner creates a spot listing. The current product separates community spot submission, admin approval, ownership request, and owner management of an assigned spot. Redraw this flow.
- The DFD says P5 records confirmed reservations immediately, while paid reservations are first `pending_payment` and become confirmed after a paid webhook. Free reservations can be confirmed without payment.
- The class diagram contains implementation-inaccurate attributes and methods: password in `User`, verification flag in `Review`, `issueRefund()` in `Payment`, and exactly one payment per reservation.
- The eight-table database diagram is obsolete. It also names `PAYMENTS` and `OWNER_REQUESTS`, which differ from the actual `reservation_payments` and `owner_access_requests` tables.
- The claim that a composite latitude/longitude index prevents full scans is not supported by the checked-in schema, and a basic B-tree pair is not equivalent to a geospatial radius index. The current implementation filters distances in the client. Document that honestly; describe PostGIS only as future work.
- The architecture should show direct Supabase client operations, Row-Level Security, Storage buckets, Realtime subscriptions, Supabase Edge Functions for PayMongo, external tile/routing providers, and the image-anonymization service.
- Page 79 introduces backend technologies but repeats the frontend narrative. Replace it with a backend-specific introduction.
- Page 77 says “Supabase developed and tested user authentication”; the researchers/team developed and tested the feature using Supabase.
- Use exact product names and casing: JavaScript, TypeScript, GitHub, npm, Expo Router, Supabase Auth, Supabase Realtime, Row-Level Security, PayMongo, QR Ph, OpenStreetMap, CARTO, OSRM, Leaflet, and React Native WebView.
- The repository uses npm with `package-lock.json`; do not claim both npm and Yarn unless both were actually used and evidenced.

### Testing, business model, and Chapter 4 — PDF pages 83–90

- A test plan is a plan, not a result. Table 9 contains expected outcomes only and does not record actual result, pass/fail, tester, date, build, device, or evidence.
- Table 9 numbering and cells are displaced. Test 4 appears to start with an expected outcome instead of an objective.
- The acceptance criterion “minimal difficulty” is subjective and undefined. Set thresholds such as task-completion percentage, zero critical defects, maximum acceptable error rate, and target SUS interpretation.
- PDF page 83 says formal metrics are future work, while PDF page 87 says SUS, completion time, and errors will be used. Choose a final protocol and report it consistently.
- Appendix B does not include the SUS instrument or role-specific UAT task sheets described on PDF page 87.
- Automated tests can support functional evidence but do not replace UAT. Current engineering notes report 78 automated checks, while physical-device and real privileged-role tests remain open. Record the exact command/output for the frozen build in an appendix.
- The business model should label revenue streams as proposed and distinguish PayMongo from GCash. CebSpot has no basis to call GCash a “key partner” without a partnership agreement.
- Reservation fees, PayMongo processing costs, platform revenue, and the venue’s deposit must be separated. The terms say processing fees are non-refundable, but the business model does not state who pays them or how the platform records them.
- Premium subscriptions, promoted listings, tourism partnerships, and Play Store distribution are future plans, not implemented results.
- Write Chapter 4 only after data collection. A suitable structure is: respondent profile; requirements-survey results; functional/integration test results; UAT task results; SUS results; discussion by objective; conclusions; limitations; recommendations.

### References — PDF pages 91–97

Eight listed references are never cited in the body: **[34], [35], [38], [46], [47], [48], [49], and [50]**. Cite them where they truly support a claim or remove them.

The following items need immediate correction:

| Reference | Problem found | Verification basis |
| --- | --- | --- |
| [1], [2], [3], [37], [40], [43]–[45] in Chapter 1 | Several numbers are attached to unrelated claims. For example, [1] is a GPS/web-service paper but is used to support a claim about Cebu social life; [3] is iZone but is used to support manual restaurant booking problems. | Compare each Chapter 1 sentence with the corresponding bibliography title and abstract. |
| [40]–[42] | The two sentences on PDF page 22 appear shifted. The UGC/online-trust claim belongs to [40], and the recommender/app-trust claim belongs to [41], not [41] and [42]. | [The Messenger article](https://doi.org/10.26623/themessenger.v17i1.11268) and [Simhadri and Vhaduri](https://doi.org/10.1007/978-3-031-32029-3_29). |
| [19] | The listed authors and pages do not match the indexed record. | The record gives Semblante, Catanduanes, Martin, Radaza, Bokingkito, and Velasco, pp. 821–835: [DOI record](https://doi.org/10.12785/ijcds/150159). |
| [26] | Paweł Gryka, the first author, is missing; only Artur Janicki is listed. | [Publisher record](https://doi.org/10.3390/app13106331). |
| [29] | The author, volume, year, and pages are wrong. The final article is by Lei Jin, Ke Zhang, Jianfeng Lu, and Yu-Ru Lin, volume 75, pp. 8895–8919, published in 2016. | [Publisher DOI](https://doi.org/10.1007/s11042-014-2317-3). |
| [33] | The authors, book title, and page range are wrong. The source is by Henry Motte-Muñoz, pp. 247–254, in *Anticipating and Preparing for Emerging Skills and Jobs*. It is also unrelated to the hyperlocal-system claim it currently supports. | [Springer chapter](https://doi.org/10.1007/978-981-15-7018-6_30). |
| [34] | The record is unused and has the wrong authors/year. The article is by Jae Hyung Park, Chul Won Lee, and Chanwook Do and was published in January 2026. | [Publisher DOI](https://doi.org/10.3390/healthcare14020246). |
| [37] | “vol. 975, no. 8887” appears to have mistaken the journal ISSN 0975-8887 for volume/issue data. A targeted exact-title search did not return a credible indexed record. | Verify from the original PDF/DOI or replace it. |
| [40] | “B. T. Khoa et al.” hides that Khoa is the third author. Use the citation style’s correct lead author/order. | The paper lists Nguyen Van Dat, Canh Chi Hoang, and Bui Thanh Khoa: [publisher DOI](https://doi.org/10.26623/themessenger.v17i1.11268). |
| [42] | The article is a real source, but verify whether the style uses the 2023 online-publication year or 2024 volume year and apply the rule consistently. | [Publisher DOI](https://doi.org/10.1108/JHTI-02-2023-0091). |
| [47], [48] | Targeted exact-title searches did not identify reliable matches for the bibliographic combinations as written. | Locate DOI/publisher records or remove/replace them. Both are currently unused. |
| Page 97 | A duplicate fragment from reference [45] (“Media Data Mining…”) appears before [48]. | Delete the stray fragment. |

Other reference cleanup:

- Add the missing opening bracket to reference `[1]`.
- Replace the generic DataReportal home-page URL in [15] with the exact report URL and access date.
- Correct `BMC Digit: health` in [14] to the journal’s official name, *BMC Digital Health*, and add its DOI: [10.1186/s44247-023-00007-2](https://doi.org/10.1186/s44247-023-00007-2).
- Remove the stray bullet before [34].
- Use one citation standard throughout. Include DOI links where available, consistent journal title treatment, complete page/article numbers, and consistent access dates for web sources.
- A valid source can still be irrelevant to a sentence. Verify claim support, not only title existence.

### Appendices — PDF pages 98–116

- Appendix page numbers are three pages later than the contents because the contents were not refreshed after Sections 3.10.2 and 3.10.3 were added.
- PDF pages 99 and 101 contain image-only or nearly blank extracted content. Confirm that approval/consultation and requirements documents are legible at normal zoom and have captions or identifiers.
- The survey on PDF page 102 asks for name and email despite the claim of anonymity. Remove unnecessary identifiers or describe a confidential/de-identified process.
- “Montly” on PDF page 102 must be “Monthly.”
- The demographic questions do not establish the intended respondent population clearly. “Course & Year” assumes students even though the scope includes locals, tourists, and owners.
- Several survey items are leading or presuppose the desired outcome. “CebSpot is a useful and reliable alternative” cannot be validly rated before participants have used the evaluated build.
- The instrument combines pre-development needs assessment and post-use evaluation concepts. Separate them into a requirements survey and a UAT/post-test questionnaire.
- Add the owner and admin UAT task sheets, SUS questionnaire, consent form, anonymized response summary, and calculation method referred to in Section 3.10.2.
- Tables on PDF pages 103–107 split words and questions across many lines. Reformat for readability and do not split a survey item across pages.
- Appendix C screenshots must be replaced with the final evaluated UI, especially Spot Details, Booking, Checkout, owner dashboard, admin console, claimed-business interface, and payment confirmation.
- Appendix D should contain the actual approved consent/ethics materials or identify them clearly. Appendix E should not be used as evidence that the paper is academically correct; automated grammar results do not validate methodology, citations, or claims.

## High-value sentence-level corrections

These are representative corrections to apply after the structural rewrite:

| PDF page | Current wording/problem | Direction |
| --- | --- | --- |
| 8 | “influencers and earners” | Use a clear term such as “content creators,” then cite a source that actually supports the claim. |
| 11 | “better-known giants” and “hidden flags” | Replace with “well-known establishments and lesser-known venues.” |
| 19 | “Related Literatures” | “Related Literature.” |
| 20 | “users can visibly discover” | “users can visually identify” or simply “users can discover.” |
| 21 | “These tests confirm…” | “These studies support…” |
| 34 | “Input: A phase captures…” | “Input phase: This phase captures…” |
| 35 | “Output: Phase delivers…” | “Output phase: This phase delivers…” |
| 38 | “responders” | “respondents.” |
| 40 | Spotter paragraph is a run-on and changes person from plural to “you” | Rewrite consistently in third person with separate capabilities. |
| 63 | “Users can also code via My Code” | “Users can share an invitation code through My Code.” |
| 77 | “Supabase developed and tested…” | “The team developed and tested… using React Native and Supabase.” |
| 78 | “Expo A development platform…” | “Expo is a React Native development platform that streamlines…” |
| 83 | “core workflows searching…” | Add punctuation and list the workflows clearly. |
| 87 | “three user roles Spotter…” | Add a colon or em dash before the role list. |
| 102 | “Montly” | “Monthly.” |

## Recommended revision sequence

1. **Freeze the evaluated system.** Commit or tag the intended build; record app version, environment, schema version, and device matrix.
2. **Resolve the scope decision.** Decide whether the study presents a general multi-venue product or a Test Cebspot Club prototype. The current implementation supports the second description more strongly for owner operations.
3. **Update Chapters 1 and 3 from the final build.** Correct the objectives, limitations, workflows, technology stack, ERD, DFD, class diagram, architecture, and screenshots.
4. **Run the missing evaluation.** Include representative Spotter, owner, and admin users; record task completion, time, errors, SUS, device details, and qualitative feedback. Complete the real paid QR Ph callback test if payment is claimed as complete.
5. **Write Chapter 4 from those results.** Answer every objective explicitly and acknowledge remaining prototype limitations.
6. **Repair the literature and references.** Re-map every citation to its actual claim and verify metadata from publisher/DOI records.
7. **Perform the final line and layout edit.** Fix tables, captions, terminology, grammar, hidden zero-width characters, page breaks, and figure readability.
8. **Regenerate all fields before export.** Refresh the table of contents, list of figures, list of tables, cross-references, and page numbers in the source DOCX, then export a new PDF and inspect it at 100% zoom.

The existing engineering test total and readiness percentages should appear only as dated implementation evidence. They are not research results and cannot substitute for the UAT and Chapter 4 analysis described by the manuscript.
