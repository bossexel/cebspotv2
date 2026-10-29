# Photo-processing compatibility repair and preview rollout

## Diagnosis and version evidence

The source-level mismatch is confirmed. Commit `82279cd` introduced a server gate requiring `X-Idempotency-Key`; its Android creation path also began sending the header. The documented October 28 Android release source `8d0e830` and the later preview update source `b560293` predate that client change. The currently served public Expo manifest was read for metadata only and reports Android runtime `1.0.4`, preview update ID `01a1818e-c970-7de8-816b-1f4602dba113`, created `2026-10-28T08:09:40.976Z`, matching the October 28 release record. That client source does not send the header.

The user-provided Render evidence says `/health` returned 200 while `POST /api/anonymize-jobs` returned 400. A read-only request during this task also returned 200 from `/health`. Health proves the service responds; it does not identify its deployed commit. Render's public health response exposes no revision, and no Render dashboard deployment record or service credentials were available for inspection. Therefore the actual deployed Render commit is **unknown**. The reported POST rejection is consistent with a missing idempotency header, and local reproduction/source inspection confirm that behavior in the strict server version, but the live 400 response body/request headers were not captured here. A malformed multipart body, invalid token, timeout or another deployed revision remains possible until a sanitized log shows the rejection detail and request metadata.

The served EAS update is not proof of what any particular phone has installed. No real-device runtime, channel or update ID was collected. The documented October 28 release targets Android runtime `1.0.4` on the `preview` channel and environment. `app.json` derives runtime from app version; the EAS preview profile also targets `preview`. The photo-client change is JavaScript and does not add native dependencies. Existing 1.0.4 preview installations can receive an OTA update. Runtime 1.0.3 cannot receive a 1.0.4 update and needs the compatible 1.0.4 preview APK first.

## Repository correction

New Android requests create one syntactically valid request key for each logical photo job and reuse it for all transport retries. The multipart field remains `image`, and the authenticated session header remains attached. The server now accepts an absent key only as a compatibility path for already-installed clients: it authenticates and rate/capacity-checks first, applies the same upload-size, multipart, MIME and image-signature validation, then binds the accepted image's SHA-256 digest to a job scoped to the authenticated owner. Repeating the same legacy upload returns that owner's existing job. A malformed key that is present still returns 400. Keyed clients retain the original request-key deduplication behavior. Authentication, image processing, quotas, validation and private result access are unchanged.

The browser photo caller was inspected but intentionally left unchanged: the server compatibility path handles callers without a key, and customer/owner browser flows are outside the supported Android-client scope. Photo-processing failure occurs before Storage upload and submission insertion.

The legacy compatibility path should remain enabled while supported 1.0.4 installations may still run an older update. Remove it only in a later, separately reviewed release after server-side metrics establish that no supported client needs it. Do not log authorization values, request keys, image bytes, hashes, user identifiers or private response bodies. Existing request logs can confirm the rejection stage without recording those fields.

## Validation performed

All tests used synthetic PNG bytes, synthetic session values, mock transport and local service code. No real account, photo, live POST, hosted service mutation or deployed workflow was used.

- `node --test tests/remediation/upload-clients.test.cjs`: **8 passed, 0 failed**. Covers authenticated Android creation/poll/result download, request-key shape, multipart field, same key on a transport retry, health cold-start recovery, failed processing, and no public Storage upload or submission insert after processing failure.
- `face-blur-service/venv/Scripts/python.exe -m pytest tests -q` with `PYTHON_DOTENV_DISABLED=1`: **26 passed, 0 failed**, one upstream pytest deprecation warning. Covers valid keyed replay, missing-key compatibility, malformed-key rejection, legacy content-digest replay across multipart boundaries, per-user isolation, authentication before body reads, private polling/result access, MIME/size checks, timeout/interruption cleanup, quota/concurrency and processing failure cleanup.
- `npm run typecheck`: **passed**.
- `npm run build:android` and `npm run build`: **passed** with `EXPO_NO_DOTENV=1`; these are local exports only.
- `ABOUT_EXPORT_DIR=dist node tests/about/about.cjs`: **failed** in the pre-existing privacy-policy reference assertion because its expected policy text differs from the current `src/constants/privacy.ts` content. It failed before reaching the new release-diagnostic assertions. I did not change that unrelated policy or its fixture.
- The initial system-Python pytest invocation could not run because pytest is not installed in system Python; the existing service virtual environment was used successfully. No package installation was needed.

These are local tests, not deployed or real-device acceptance. The body-level legacy digest must be computed after reading the upload, so a retried old-client request consumes bounded upload bandwidth before it can return the existing job. The server still enforces the configured body limit and owner quota before accepting it.

## Coordinated publication plan (prepared, not run)

1. **Verify target before release.** In Render, identify the service named `cebspot-face-anonymizer` and confirm its repository, branch, current deployed commit, environment and auto-deploy setting. `render.yaml` sets `autoDeploy: true`, so merging this PR into `main` may automatically deploy the backend. Check the service's actual dashboard setting and make sure the reviewed compatibility commit is ready before merging; do not assume a feature-branch push deploys it. Confirm an isolated preview/staging service exists before testing uploads. Do not use the public beta service as a synthetic test target.
2. **Deploy backend compatibility first.** On the isolated Render staging service, deploy this exact reviewed repository commit and run the local synthetic contract suite plus authenticated staging acceptance. Only after it passes, deploy that same commit to the verified beta face service. The repo's Render service ID is not present in `render.yaml`, and the actual Render deployment was not inspectable, so a safe literal service ID cannot be supplied here. Once an operator verifies the ID in Render, the CLI form is:

   ```powershell
   render deploys create <VERIFIED_FACE_SERVICE_ID> --commit <REVIEWED_COMPATIBILITY_COMMIT_SHA> --wait
   ```

   Replace both placeholders only after checking the selected service is `cebspot-face-anonymizer` in the intended environment. Alternatively, use Render Dashboard → that service → Manual Deploy → deploy the reviewed commit. Do not run either command as part of this task.

3. **Publish the Android preview OTA only after backend compatibility is healthy.** Check out the reviewed client commit and publish to the documented preview channel/environment, Android only:

   ```powershell
   $env:EXPO_NO_DOTENV = '1'
   npx eas update --channel preview --environment preview --platform android --message "Fix photo upload compatibility"
   ```

   The command was prepared but not run. Verify the EAS project and `preview` channel before publication; do not substitute `production`, submit a store build, or publish the 1.0.4 bundle to runtime 1.0.3. Since app runtime is `appVersion`, do not change `app.json` version for this JavaScript-only patch.

4. **Tell testers how to obtain and verify it.** A supported 1.0.4 preview tester should fully close and reopen CebSpot on a network, wait for the in-app update prompt, tap **Update**, then open About CebSpot and confirm `Update channel: preview`, `Update runtime: 1.0.4`, and that `Update ID` matches the newly published update's ID in EAS. The About page now exposes those values. A user on version/runtime 1.0.3 must first install the organization's 1.0.4 preview APK, then reopen and accept the OTA. Do not distribute an APK until its source/runtime/channel are verified. Expo Go is not the preview binary.

5. **Acceptance after publication.** On an isolated staging account, verify: authenticated synthetic image upload returns a job; poll reaches complete; result download is private and anonymized; same request key returns the same job; a no-key legacy request succeeds with the same validations and same-owner deduplication; another user cannot read the job/result; interrupted upload cleans its provisional job; processor failure produces no public Storage object or submission row; cold start recovers; and ordinary 400s are distinguishable from auth, multipart, timeout and capacity failures using sanitized server-side error categories. Then test on at least one actual 1.0.4 preview device and record its About values and a successful upload. Deployment/publication is not evidence that devices adopted the update.

## Rollback

- If the backend patch fails staging acceptance, do not promote it. Leave the current backend and OTA untouched while diagnosing.
- If the new backend fails after promotion, redeploy the previously verified face-service commit from Render. The prior strict backend may reject old 1.0.4 clients that do not send a key, so backend rollback restores the prior state but may restore the upload failure. Keep testers on the last known compatible preview update until a corrected backend is available.
- If the client update fails, publish a reviewed rollback update to the `preview` channel with runtime `1.0.4`, or use the EAS update rollback-to-embedded option only after verifying the embedded runtime's behavior. Do not roll back to `production` or change channel assignment. The server's no-key compatibility path keeps older clients working while a client rollback propagates.
- Confirm both service deployment and device update ID after rollback. Preserve the compatibility server behavior until the oldest supported installed client has been verified or support is explicitly withdrawn.

Expo documents channel/runtime eligibility and preview publishing in [EAS Update](https://docs.expo.dev/eas-update/deployment/) and rollback operations in [EAS Update rollbacks](https://docs.expo.dev/eas-update/rollbacks/). Render documents the deployment CLI in its [CLI reference](https://render.com/docs/cli-reference).
