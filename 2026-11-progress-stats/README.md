# SIVACOR progress report — statistics, Nov 2025 – Nov 2026

Source: production MongoDB dump restored into `deploy-dev` (`wt_mongo`, database `girder`).
The newest data in the dump is from 2026-11-15, and the first user dates from 2025-11-17, so
"the last 12 months" covers the platform's whole life. Counts below don't include the 2 admin
accounts.

## Users and institutions

- **112 registered users**, 76 of whom submitted at least once (`lastJobId` set).
- New sign-ups per month: Nov 6 · Dec 13 · Jan 4 · Feb 7 · Mar 4 · Apr 9 · May 6 · Jun 5 ·
  Jul 11 · **Aug 19** · Sep 6 · **Oct 19** · Nov 3.
- **47 distinct institutions** by email domain. **38** of them have at least one user who
  submitted.
  - 28 US universities and 19 other organisations, across **8 countries**: US, UK, Canada,
    Switzerland, Germany, Italy, France and Sweden.
  - Besides universities, users come from central banks (Federal Reserve, Bundesbank, Banca
    d'Italia), the IMF, J-PAL, the AEA, ZBW and IWH-Halle.
  - These are lower bounds. 38 users signed up with no institutional email (18 ORCID placeholder
    addresses, plus gmail and similar), and 22 of those submitted.
- Logins: 75 used Globus and 40 used ORCID.

## Submissions and jobs

- **At least 949 submissions.** By month: Nov 47 · Dec 91 · Jan 40 · Feb 62 · Mar 22 · Apr 100 ·
  May 110 · Jun 68 · Jul 46 · **Aug 132** · Sep 91 · **Oct 129** · Nov 11 (partial).
  - It's a lower bound because the 14-day retention sweep now deletes a submission's records
    outright. Older ones survive only as redacted skeletons.
- **About 6,065 Girder jobs in total**: 5,840 pipeline-step jobs and 225 submission jobs.

## Execution records (348 runs, 2026-08-06 → 2026-11-13)

This is where the hardware data comes from. The records started on 2026-08-06, so nothing earlier
is covered.

**Runs per VM flavour**, from the hardware each run actually landed on:

| Flavour | vCPU / RAM | Runs | Completed | Run-hours |
|---|---|---|---|---|
| m3.medium | 8 / 30 GB | 235 | 96 | 159 |
| m3.large | 16 / 60 GB | 76 | 33 | 664 |
| m3.xl | 32 / 125 GB | 6 | 3 | 109 |
| m3.2xl | 64 / 250 GB | 18 | 5 | 498 |
| unknown (reaped before reporting) | – | 13 | 0 | 150 |

- Size requested in the picker: 30 GB 185 · 60 GB 46 · 125 GB 4 · 250 GB 18 · not recorded (runs
  from before the picker existed) 95.
- About 30 runs landed on m3.large without asking for it, because before 2026-08-20 the platform
  sent every submission to one default flavour.
- **Outcomes:** 137 completed, 201 failed, 10 reaped by the platform.
  - Failure codes: non-zero exit 72, Stata error 69, main file missing 26, unexpected 18, out of
    memory 7, reaped (no heartbeat / no worker) 10, image pull failed 5, out of disk 3.
  - Most failures are errors in the researcher's own code, which is the verification service
    doing its job.
- **Analysis steps by stack (488 in total):** Stata 257 (53 %), R 158 (32 %), Dynare/MATLAB 62
  (13 %), Julia 11. 56 steps ran with the network cut off.
- **Package size:** under 10 MB 71 · 10–100 MB 122 · 100 MB–1 GB 71 · 1–5 GB 39 · over 5 GB 35.
- **Runtime:** median run 8.7 min, 90th percentile 9.7 h, longest 155 h (6.5 days). Steps used
  about 8,100 CPU-hours in total.
- **35 runs requested a scratch volume** (the Cinder volumes feature).

## Jetstream2 usage since 2026-09-21

Per-user accounting started on 2026-09-21, so this covers about 8 weeks.

- **About 27,800 SU**: 24,505 SU charged to 29 researchers, plus 3,260 SU of platform-caused
  failures that the platform absorbed rather than charging to anyone.
- **About 740 VM-hours** across 170 VMs that each served one submission. By size: 30 GB 137,
  60 GB 20, 125 GB 2, 250 GB 8.
- **About 170,000 GB-hours** of scratch volume.

## Major improvements in using Jetstream2 resources

- **Autoscaling worker fleet (`sivacor-autoscaler`, live since 2026-08-05).** Production used to
  be one always-on m3.large. Now each queued submission gets its own short-lived OpenStack VM,
  which is deleted as soon as the work finishes. The allocation is charged only while something is
  actually being verified, and the fleet drops to zero when idle. Safeguards built in:
  - an instance cap set below the quota;
  - "quota full" is treated as wait-and-retry, not as a failure;
  - a circuit breaker stops creating VMs if new ones keep failing to come up;
  - a maximum VM lifetime;
  - a cleanup that deletes VMs which never took a job.
- **Researcher-chosen worker sizes (live since 2026-08-20).** There are four sizes: 30 and 60 GB
  for everyone, 125 and 250 GB for approved users only. Most runs now use the cheapest size
  instead of one fixed default, and 70 % of runs did use the 30 GB size. The platform assigns each
  submission to a specific VM, oldest first, while respecting the instance, CPU and RAM quotas.
- **On-demand scratch volumes (live since 2026-08-21).** Very large packages get a block volume
  that is created with their VM and destroyed with it, instead of everyone getting a large disk.
  It's opt-in and capped per user, and a cleanup job deletes any volume nothing is using.
- **Images pulled on demand.** Workers download analysis images when needed instead of keeping a
  library of prebuilt VM images, and the platform measured the disk space each image really needs
  to decide whether it fits.
- **Platform failures detected and cleaned up instead of leaking resources.** Worker heartbeats, a
  cleanup for stalled or abandoned runs, a 168-hour run limit, and a fix for worker hang-ups and
  lost connections to the job queue. A dead run no longer keeps a VM alive.
- **Per-user usage accounting (since 2026-09-21).** SU-hours, VM-hours and volume GB-hours are
  measured from each VM's real lifetime and recorded per researcher, with platform-caused failures
  charged to the platform. This is what makes the allocation figures above reportable at all.
- **Anonymous per-run records kept permanently.** These give the hardware, outcome and resource
  data the right-sizing decisions above were based on, such as the per-image disk needs.

## How these numbers were derived

Every figure above comes from `stats.js` in this directory, which is read-only. To reproduce:

```sh
deploy-dev/restore_dump.sh <production-dump.gz>     # restore into deploy-dev's wt_mongo
SINCE=2025-11-01 reports/2026-11-progress-stats/run.sh
```

`SINCE=2025-11-01` covers the platform's first job (2025-11-14). Leave `SINCE` unset and the
window is the last 12 months, which would drop the first two days of submissions. `SINCE` filters
users, jobs and execution records. The usage totals are cumulative since accounting began
(2026-09-21) and can't be limited to a window. The output names every institution domain and
every image, so the hand-written groupings above (countries, organisation types) can be checked
against it.

**Personal domains are kept out of this public repo.** Three users signed up with a personal
vanity domain. Each of those names a person, so they live in `personal_domains.txt` beside the
script (one domain per line, gitignored), not in the code. Without that file, those three count as
institutions and the total reads 50, not 47. Ask the SIVACOR team for the file.

What each figure is computed from:

| Statistic | Source |
|---|---|
| Users, sign-ups per month | `user.created`; `admin: true` accounts excluded |
| Submitted at least once | `user.lastJobId` exists |
| Institutions | email domain, lower-cased and reduced to its organisation (`fas.harvard.edu` → `harvard.edu`, `economics.ox.ac.uk` → `ox.ac.uk`); personal and placeholder domains excluded (`gmail.com`, `qq.com`, `outlook.com`, `foxmail.com`, `orcid.org`, personal vanity domains, `sivacor.org`) |
| Login provider | `user.oauth[].provider` |
| Submissions | `job` documents with `type: "celery"` and title `Moving … to submission collection` (the `prepare_submission` step, one per submission) |
| Total jobs | `job` counted by `type` |
| Flavour, outcomes, stacks, sizes, runtimes | `sivacor_execution_record`; flavour inferred from `worker.ncpu` / `worker.mem_total_bytes`, matched against the `sivacor.worker_sizes` setting; requested size from `stages[0].requested_memory_gb`; stack from `stages[].image_name` |
| SU, VM-hours, VMs per size, volume GB-hours | `user.sivacorUsage` summed (`suHours`, `instanceHours`, `bySize`, `volumeGbHours`) plus `sivacor_usage_totals` doc `house` |

Caveats:

- Submissions and jobs are lower bounds, because retention deletes them.
- Execution records start on 2026-08-06, and usage accounting starts on 2026-09-21.
- Institution counts include the team's own institutions (Illinois, Cornell / AEA data editor).
