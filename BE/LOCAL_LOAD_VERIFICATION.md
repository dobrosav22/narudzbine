# Qualified local load — Linux profile accepted; earlier failures retained

## Current qualified Linux execution — PASSED

2026-10-23, runfc900ebe-39bd-4ed1-b5ac-71f9b9b803d5 after fresh1,591-test/source/exact-artifact gates. Same100 organizations/1,000 business accounts plus one platform account/250,000 products/100,000 historical orders/10 million historical lines.250 actual CSV confirmations and50 constrained history groups; all-route warmup0 failures; VACUUM/ANALYZE/CHECKPOINT passed. Full payload and original thresholds/durations/provider/stock flags retained. Normal60s core maintenance eligible before measurement (context age3,006,810ms). No additional observer/profiler or competing build/probe during this run.

| Phase | Duration | Actual HTTP / achieved | Failed tasks / dropped requests | p95 read / write / submission / report ms |
| --- | --- | --- | --- | --- |
| sustained 50rps | 1800.000s | 90,000 / 50.0000rps | 0 / 0 | 97.596 / 99.642 / 208.249 / 361.261 |
| burst 100rps | 300.024s | 30,000 / 99.9920rps | 0 / 0 | 157.842 / 140.428 / 272.615 / 363.431 |

**120,000 successful actual responses**:99,000 HTTP200 +21,000 HTTP201; no HTTP errors, failed tasks, dropped/late traffic or deadlocks. All read/write/submission/report/CSV targets passed; CSV confirmation p956816.377ms/250. Five synchronized submissions per scheduled second, observed peak9 concurrent submissions. The measured profile has designAcceptance=true; operator/Java/Docker attachment exit0. This is local acceptance for this explicit profile, not a managed-provider/hosting guarantee.

All689 frozen inputs unchanged. Operator636 inputs/digest6d4d1b3b3d724f85e1e385ba9e494b59049230b38edb80412ec2f2f6dbeee18e,1,020 packaged classes matched JARa4cf937e2c9e7626cdee1a2031e7a23180ddd4619d4e2205a3873c3f8543d161; imagesha256:cf0056326c7a5ffeb100bfa9dbfae8621685c9cd99cf9ca12a416fe7f041e16e.1,420 actual application/database resource samples. Exact labelled application/PostgreSQL/internal network cleanup verified; no resources remain. Parent exec75608 and regression4741 ended. Raw complete/partial/provenance/control/resources are BE/target/local-load-*fc900ebe*.json[l], parent.tools/linux-local-load-then-full.log/child.tools/local-load-linux-final-full.log. [Fresh verification/review](LINUX_LOCAL_LOAD_VERIFICATION.md).

Actual local engine536c8aa3-6719-4d74-8de7-ff20213a0779,6 CPUs/16,737,832,960 memory bytes; Java heap1GiB/runtime32/PG ceiling100. Versioned PostgreSQL profile v1:shared_buffers2GB/wal_buffers16MB/max_wal_size8GB/min_wal_size1GB/checkpoint15min/0.9 target/256MiB shared memory. fsync/synchronous_commit/full_page_writes on, replica WAL. WAL capacity is soft; crash replay/managed settings/budget remain unproven. Non-root actual Linux shipping classes, source read-only/backend target writable, no Docker socket/published ports, fixed private database alias and before-migration run nonce. Both real nonce/ownership refusal controls passed. All production authorization/lifecycle/read-activity/group-delay/64 prototypes remain unpromoted; production source is unchanged from the accepted artifact.

Provider workers and stock tracking are off as declared in the profile; retained queues are reported rather than interpreted as provider throughput or drain acceptance. Actual identity/email/push/storage/provider/client/hosted/legal/operator/reconciled-recovery/custody and production release gates remain separate. Earlier full Windows/default-profile failures and diagnostics below are preserved; a Linux pass does not rewrite them.


## Latest full execution —5f37f9f6-cfcf-487e-bb92-e5dac6d271c4 —FAILED

2026-10-23, after accepted1,591-test order-page exact-artifact gates. Qualified100 organizations/1,000 accounts/250,000 products/100,000 historical orders/10 million lines;250 CSV confirmations/50 constrained history groups. All-route warmup0; VACUUM/ANALYZE/CHECKPOINT passed. Complete payload, runtime32, synchronous durability and original targets unchanged.

| Phase | Duration | Issued / achieved | Failed tasks / dropped requests | p95 read / write / submission / report ms |
| --- | --- | --- | --- | --- |
| Sustained50rps |1800.818s|90,000 /49.9773rps|18 /0|566.655 /633.877 /895.062 /1138.604|
| Burst100rps |301.913s|23,900 /79.1619rps|0 /6,100|1616.813 /1786.375 /2005.290 /1975.959|

113,900 actual responses:93,492 HTTP200 +20,390 HTTP201 +18 HTTP503. CSV confirmation p9510141.062ms/250; late scheduler seconds0, deadlocks0. All686 frozen inputs unchanged; operator633 inputs/digestc2f2369bb48fe0b76942fe808db299dc182c5bb13ac5dfc165cc7215e7bb30d3;1,020 classes matched JARa4cf937e2c9e7626cdee1a2031e7a23180ddd4619d4e2205a3873c3f8543d161.905 resource samples. Operator exited1 and verified owned cleanup; exact label inventory empty. Parent exec13336, lock observer93346 and JVM counter process67290 ended. Complete report/provenance/partial/resources BE/target/local-load-*5f37f9f6*.json[l]; parent.tools/order-page-decode-then-full.log/child.tools/local-load-order-page-decode-full.log.

18 HTTP503 clustered near sustained minute9, including a private SQLTransientConnectionException. Read-only normalized lock observation/JVM counters were added only after failure;120-second CPU-only JFR was added during the already-failed burst. Later durations are diagnostic, not untouched acceptance. Twelve lock samples include WALWrite and idle-in-transaction/client waits. JVM samples after failure show zero full collections; initial pause/root cause was not captured. CPU sample1,146 Java/5,577 native events includes parsing/serialization and native socket polling; polling samples are not CPU percentages. No request bodies/environment/property recording.

Checkpoint/WAL aggregate counters include fixture construction (80 requested/eight timed checkpoints and51.38GB WAL at the first observation), not measured-only totals. Checkpoint log timing and WAL waits support testing an explicit local memory/WAL profile; they do not prove the initial timeout cause. [Next selected profile](LOCAL_DATABASE_PROFILE_IMPLEMENTATION.md) preserves all durability/targets and records resource/recovery tradeoffs. The per-page decoder is correct but this run does not prove a capacity improvement. Earlier failures remain retained below.

## Latest full execution —763675d0-c4da-453f-b68e-559df59b1317 —burst FAILED

2026-10-23, after accepted1,590-test short-report-authority/atomic-fanout exact-artifact gates. Same qualified100 organizations/1,000 accounts/250,000 products/100,000 historical orders/10 million lines;250 actual CSV confirmations/50 constrained groups; all-route warmup0; VACUUM/ANALYZE/CHECKPOINT passed; runtime32 observed. Providers/stock tracking off as declared; core maintenance remained eligible. No workload/payload/timeout/durability/target change, no additional profiler/lock observer during this run.

| Phase | Duration | Issued / achieved | Failed tasks / dropped requests | p95 read / write / submission / report ms |
| --- | --- | --- | --- | --- |
| Sustained50rps |1800.004s|90,000 /49.9999rps|0 /0|216.332 /220.928 /382.735 /564.311|
| Burst100rps |300.416s|28,175 /93.7867rps|25 /1,800|1166.758 /1280.459 /1540.983 /2224.278|

118,175 actual responses:97,340 HTTP200 +20,814 HTTP201 +21 HTTP503. All sustained rate/latency/failure/drop gates passed; burst did not. CSV confirmation p958688.244ms/250; no late scheduler seconds; deadlocks0. No blanket design-capacity pass. All686 frozen inputs unchanged; operator633 input digest8645dbb8ca823727ddb249b3b1a2adeac4611bf5d11e957667bddbe6761d2f12,1,019 packaged classes matched JAR031c333fb5678e7d00a51ac2aea493848b6d105a68a861b85353e458def45b3d.803 resource samples; labelled DB inventory was empty after completion. Complete report/provenance/partial/resources BE/target/local-load-*763675d0*.json[l], parent.tools/commercial-guards-then-full.log/child.tools/local-load-commercial-guards-full.log. Previous failures remain below.

Source inspection confirms the full order page parses up to25 complete100-line snapshots independently. Next bounded optimization preserves every wire field and current header/authority: decode identical immutable line arrays once within that same page read, reading fresh SQL content for every row. It is not yet implemented or proven to fix burst capacity. No endpoint/payload reduction, benchmark substitution or cross-request permission/data cache.


## Latest full execution —75344c46-3b2c-4650-ae31-842aa3e46091 —FAILED

2026-10-23, after accepted1,586-test/read-admission/runtime32 exact-artifact gates. Qualified100 organizations/1,000 business accounts/250,000 products/100,000 historical orders/10 million lines;250 actual CSV confirmations and50 constrained history groups. All-route warmup0 failures, VACUUM/ANALYZE/CHECKPOINT passed. Provider delivery and stock tracking were off as previously declared. Ordinary maintenance became eligible after the fixture's one-hour initial delay; providersDisabled is not a claim that core maintenance was disabled. Runtime pool32 observed; original deadlines/durability/targets unchanged.

| Phase | Duration | Issued / achieved | Failed tasks / dropped requests | p95 read / write / submission / report ms |
| --- | --- | --- | --- | --- |
| Sustained50rps |1800.341s|89,980 /49.979rps|11 /0|371.399 /363.382 /717.247 /648.311|
| Burst100rps |300.439s|28,573 /95.104rps|22 /1,400|1158.350 /1264.943 /1670.170 /1629.462|

118,553 actual responses:97,680 HTTP200 +20,847 HTTP201 +26 HTTP503;33 failed lifecycle/read tasks are not the same counter as26 HTTP errors. Scheduled intents9,000 +1,430; no late scheduler seconds; deadlocks0. CSV confirmation p959278.662ms/250. Sustained latencies and report/submission bounds passed, but any HTTP/task failure rejects acceptance. Burst rate/read/write/drops also failed. No pass inferred from the reduced-data32 result.

First7 HTTP503/11 failed tasks clustered near sustained minute4; private error SQL55P03. Later normalized blockers showed ordinary notice/delivery/replay inserts idle in transaction with client wait, including about3.4s transaction age during burst. This supports reducing client round trips while holding business guards, not a proven single root cause for the initial cluster. Observed replay compaction max4489.6ms. Read-only checkpoint/WAL counters and jstat were sampled after failure; the cluster preceded the next timed checkpoint and no full GC was observed. A one-second read-only long-lock observer was added after failure (26 samples). Later durations remain full diagnostic measurements, not untouched capacity acceptance. No code/settings/data/timeout change or automatic action retry during the run.

Current source stayed frozen686 inputs; operator633 inputs digestc9f650fafa5e2dd9986a121a5fbad4e4b0d17c4a5b5da843d72f033c2eb88c44,1,017 packaged classes matched JAR e08f24693c49140f9523890f000cbdf3628bac73d4d716d10c96827cbf7181be.799 database resource samples. Complete report/provenance/partial/resources under BE/target/local-load-*75344c46*.json[ l]; operator .tools/local-load-read-admission-full.log. Narrow diagnostic files .tools/load-75344c46-*.json/.jsonl/.log. Final labelled container inventory was empty; observer ended when owned DB was removed. No hosted/provider/legal/operator/custody/client/production claim.

Next bounded batch: short report authority guards plus bounded atomic notification fanout, with real post-snapshot authority and late-batch rollback tests, full frozen/artifact gates and another isolated capacity check. This candidate has not yet been implemented or shown to fix capacity. Earlier full failures below remain historical evidence.


2026-10-23, run b0da6370-8226-4277-9648-98908a570722. Source-bound complete/provenance/partial/resource files are BE/target/local-load[-provenance|-partial|-resources]-<runId>.json[ l ]; operator log .tools/local-load-qualified-serial-full.log. All684 accepted frozen inputs remained unchanged; operator631-input digest e5e582dd51ea9b15dfd334d68ae09965a0bd3a204262595136ec6c2d65d264aa. Tested1,016 packaged classes/JAR104e593408515d92d482516b383a6788fbc8dfbb6ede6c6f1abe3c88793d7a98 match [functional acceptance](LOAD_DIAGNOSTICS_VERIFICATION.md). Java/operator exit1 is the expected failed acceptance, not a successful test run.

Actual100 organizations/1,000 permanent business accounts plus one separate platform setup account;100 active users.250 actual API import confirmations completed (249,950 imported plus50 initial products=250,000), CSV confirmation p958,568.4ms<30,000ms.50 real100-line delivered template orders plus99,950 explicitly generated constrained historical orders=100,000 historical orders/10 million lines. No fabricated HTTP execution/audit claim for generated history. Full count checks, release of bulk-loader connections, VACUUM/ANALYZE/CHECKPOINT and all measured-route warmup passed; zero warmup failures. Original runtime pool10/admission/2s lock wait/durability remained unchanged. Full fixture database ended at18,118,186,687 bytes.

| Measured phase | Actual execution | Failures / scheduling | p95 milliseconds |
| --- | --- | --- | --- |
|50rps30min |1,800.023s;89,975 issued requests;49.985rps;9,000 scheduled order intents |43 failed tasks; zero scheduling drops/late seconds |reads598.5 (target<500); writes618.2 (<1,000); submissions741.0 (<2,000); reports2,577.0 (<5,000) |
|100rps5min |301.444s including drain;22,859 issued requests;75.832rps;1,145 scheduled order intents |13 failed tasks;7,100 dropped scheduled requests; zero late seconds |reads1,747.5; writes2,021.2; submissions2,036.4; reports4,554.3 |

All112,834 issued HTTP attempts returned:92,518 HTTP200,20,268 HTTP201,48 HTTP503.56 failed independent tasks are not equated with48 failed requests. No uncertain action retried or resumed. Peak16 concurrent submissions, required synchronized group5; database deadlocks0. Actual fsync/synchronous_commit/full_page_writes were on.791 database resource samples retained; Windows client/server shared a1GiB JVM,1,760.984 CPU seconds/2,101.899 measured wall seconds. This is local diagnostic evidence, not hosted sizing, device/client integration or provider throughput. Provider workers and historical stock tracking were off; tracked stock/races/credits are separate functional gates.

The private diagnostic samples include lock expiry SQL55P03 and SQLTransientConnectionException pool acquisition failures, without messages/SQL/parameters. Normalized runtime query aggregates show summary reporting591,681.8ms over459 calls, the largest recorded query total; organization write/share lock queries also accumulated wait/execution time. This identifies useful investigation, not a definitive root cause. Read-only checkpoint/WAL snapshots are in .tools/local-load-b0da6370-database-counters[-late].txt; no GUC changed.

After the run had already failed, a bounded180s CPU-only JFR overlapped late sustained/early burst:2026-10-23 07:00:43 UTC start. Empty allowlist configuration selected only ExecutionSample/NativeMethodSample; summary confirms1,962 Java/8,609 native samples plus JFR metadata/checkpoints, zero environment/system-property/body/SQL events. Native samples include idle/blocked polling and must not be described as CPU percentages. Java samples show server-side JSON processing among hot frames; they do not establish client decoding as the cause. Raw/derived artifacts .tools/local-load-b0da6370-cpu.* are local diagnostics. This observation means these final intervals are not an untouched capacity benchmark; acceptance was already false and remains false.

Both durations completed despite failures. Operator verified the exact owned database was absent after shutdown; no unrelated resources removed. **G-05 design-load acceptance remains FAILED.** All functional/artifact gates above stay valid; no business/API/frontend/provider/hosted/legal/recovery/production completion is inferred. Continue a bounded evidence-led performance batch, preserving this run and every failed earlier setup/calibration.
