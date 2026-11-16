// SIVACOR progress-report statistics. Read-only.
//
// Run against a Girder MongoDB (production dump restored into deploy-dev):
//   ./run.sh                       # defaults: since 12 months ago
//   SINCE=2025-11-16 ./run.sh
//
// SINCE filters users, jobs and execution records by creation date. The usage
// totals (user.sivacorUsage, sivacor_usage_totals) are cumulative since
// accounting began and cannot be windowed.

var since = (typeof SINCE !== "undefined") ? new Date(SINCE)
    : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
var sinceDay = since.toISOString().slice(0, 10);

function h(t) { print("\n## " + t); }
function line(rows, k, v) { return rows.map(function (x) { return k(x) + ": " + v(x); }).join(" · "); }
function byMonth(coll, match, field) {
    return coll.aggregate([
        {$match: match},
        {$group: {_id: {$dateToString: {format: "%Y-%m", date: "$" + field}}, n: {$sum: 1}}},
        {$sort: {_id: 1}}]).toArray();
}

print("# SIVACOR statistics since " + sinceDay);
var last = db.job.find({}, {created: 1}).sort({created: -1}).limit(1).toArray()[0];
print("newest job in this database: " + (last ? last.created.toISOString() : "none"));

// ---------------------------------------------------------------- users
h("Users");
var U = {admin: false, created: {$gte: since}};
print("non-admin users created: " + db.user.count(U));
print("of which submitted at least once (lastJobId set): " +
      db.user.count(Object.assign({lastJobId: {$exists: true, $ne: null}}, U)));
print("sign-ups per month: " + line(byMonth(db.user, U, "created"),
      function (x) { return x._id; }, function (x) { return x.n; }));
print("login providers: " + line(db.user.aggregate([
    {$match: U},
    {$unwind: "$oauth"},
    {$group: {_id: "$oauth.provider", n: {$sum: 1}}}]).toArray(),
    function (x) { return x._id; }, function (x) { return x.n; }));

// ---------------------------------------------------------- institutions
// Webmail and placeholder domains say nothing about affiliation. Personal
// vanity domains don't either, but each one names a person, so they are not
// listed here: run.sh reads them from the untracked personal_domains.txt and
// passes them in as EXTRA_PERSONAL.
var PERSONAL = ["gmail.com", "qq.com", "outlook.com", "foxmail.com", "hotmail.com",
                "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "orcid.org",
                "sivacor.org"].concat(typeof EXTRA_PERSONAL !== "undefined" ? EXTRA_PERSONAL : []);
// Reduce a host to its organisation: fas.harvard.edu -> harvard.edu,
// economics.ox.ac.uk -> ox.ac.uk (two-level public suffixes keep three labels).
function org(d) {
    var p = d.split(".");
    var n = /\.(ac|co|edu|gov|org)\.[a-z]{2}$/.test(d) ? 3 : 2;
    return p.slice(-n).join(".");
}
var inst = {}, active = {}, noInst = 0, noInstActive = 0;
db.user.find(U).forEach(function (u) {
    var d = (u.email || "").split("@")[1];
    if (!d) return;
    d = d.toLowerCase();
    var a = !!u.lastJobId;
    if (PERSONAL.indexOf(d) >= 0) { noInst++; if (a) noInstActive++; return; }
    var o = org(d);
    inst[o] = (inst[o] || 0) + 1;
    if (a) active[o] = (active[o] || 0) + 1;
});
h("Institutions (by email domain)");
print("distinct institutions: " + Object.keys(inst).length +
      ", with at least one submitter: " + Object.keys(active).length);
print("users without an institutional email: " + noInst + " (of which submitted: " + noInstActive + ")");
var tld = {};
Object.keys(inst).forEach(function (o) { var t = o.split(".").pop(); tld[t] = (tld[t] || 0) + 1; });
print("by top-level domain: " + JSON.stringify(tld));
print("all: " + Object.keys(inst).sort().map(function (o) { return o + "(" + inst[o] + ")"; }).join(" "));
print("with submitters: " + Object.keys(active).sort().join(" "));

// -------------------------------------------------------------- submissions
// prepare_submission is the head of every chain, one per submission, titled
// "Moving <file> to submission collection". Lower bound: the retention sweep
// deletes whole chains.
h("Submissions and jobs");
var HEAD = {type: "celery", title: /^Moving .* to submission collection$/, created: {$gte: since}};
print("submissions (prepare_submission jobs, lower bound): " + db.job.count(HEAD));
print("per month: " + line(byMonth(db.job, HEAD, "created"),
      function (x) { return x._id; }, function (x) { return x.n; }));
print("jobs by type: " + line(db.job.aggregate([
    {$match: {created: {$gte: since}}},
    {$group: {_id: "$type", n: {$sum: 1}}}]).toArray(),
    function (x) { return x._id; }, function (x) { return x.n; }));
print("total jobs: " + db.job.count({created: {$gte: since}}));

// -------------------------------------------------------- execution records
var E = db.sivacor_execution_record;
var EM = {date: {$gte: sinceDay}};
h("Execution records");
var r = E.aggregate([{$match: EM}, {$group: {_id: null, n: {$sum: 1}, min: {$min: "$date"}, max: {$max: "$date"}}}]).toArray()[0];
print("runs: " + (r ? r.n + " (" + r.min + " -> " + r.max + ")" : 0));

// Flavour is inferred from the hardware the run landed on, named via the
// sivacor.worker_sizes catalogue (matched on vCPU count).
var sizes = (db.setting.findOne({key: "sivacor.worker_sizes"}) || {value: []}).value;
function flavor(ncpu) {
    for (var i = 0; i < sizes.length; i++) if (sizes[i].vcpus === ncpu) return sizes[i].flavor;
    return ncpu ? ncpu + " vCPU (not in catalogue)" : "unknown";
}
print("\nflavour | vCPU | RAM GB | runs | completed | run-hours");
E.aggregate([
    {$match: EM},
    {$group: {_id: "$worker.ncpu",
              mem: {$max: "$worker.mem_total_bytes"},
              n: {$sum: 1},
              ok: {$sum: {$cond: [{$eq: ["$status", "completed"]}, 1, 0]}},
              s: {$sum: "$total_duration_seconds"}}},
    {$sort: {_id: 1}}]).forEach(function (x) {
    print([flavor(x._id), x._id || "-", x.mem ? Math.round(x.mem / 1073741824) : "-",
           x.n, x.ok, (x.s / 3600).toFixed(1)].join(" | "));
});
print("\nrequested size (GB, first stage): " + line(E.aggregate([
    {$match: EM},
    {$group: {_id: {$arrayElemAt: ["$stages.requested_memory_gb", 0]}, n: {$sum: 1}}},
    {$sort: {_id: 1}}]).toArray(), function (x) { return x._id === null ? "not recorded" : x._id; },
    function (x) { return x.n; }));
print("status: " + line(E.aggregate([{$match: EM}, {$group: {_id: "$status", n: {$sum: 1}}}, {$sort: {n: -1}}]).toArray(),
      function (x) { return x._id; }, function (x) { return x.n; }));
print("failure codes: " + line(E.aggregate([
    {$match: Object.assign({"error.code": {$exists: true}}, EM)},
    {$group: {_id: "$error.code", n: {$sum: 1}}}, {$sort: {n: -1}}]).toArray(),
    function (x) { return x._id; }, function (x) { return x.n; }));
print("package size: " + line(E.aggregate([{$match: EM}, {$group: {_id: "$package_size_bucket", n: {$sum: 1}}}, {$sort: {n: -1}}]).toArray(),
      function (x) { return x._id; }, function (x) { return x.n; }));
print("stages per run: " + line(E.aggregate([{$match: EM}, {$group: {_id: "$n_stages", n: {$sum: 1}}}, {$sort: {_id: 1}}]).toArray(),
      function (x) { return x._id; }, function (x) { return x.n; }));
print("runs requesting a scratch volume: " + E.count(Object.assign({requested_disk_gb: {$gt: 0}}, EM)));

// Stacks: image family from the repository name.
function stack(img) {
    if (/stata/.test(img)) return "Stata";
    if (/^rocker\//.test(img)) return "R";
    if (/dynare|matlab/.test(img)) return "Dynare/MATLAB";
    if (/julia/.test(img)) return "Julia";
    return "other";
}
var st = {}, images = {}, nStages = 0, iso = 0, cpu = 0;
E.find(EM).forEach(function (x) {
    (x.stages || []).forEach(function (s) {
        nStages++;
        st[stack(s.image_name || "")] = (st[stack(s.image_name || "")] || 0) + 1;
        images[s.image_name] = (images[s.image_name] || 0) + 1;
        if (s.network_isolation) iso++;
        cpu += s.cpu_seconds_total || 0;
    });
});
print("analysis steps: " + nStages + ", network-isolated: " + iso +
      ", CPU-hours: " + (cpu / 3600).toFixed(0));
print("steps by stack: " + JSON.stringify(st));
print("steps by image: " + JSON.stringify(images));
var d = E.find(EM, {total_duration_seconds: 1}).map(function (x) { return x.total_duration_seconds || 0; })
    .sort(function (a, b) { return a - b; });
if (d.length) {
    print("run duration: median " + (d[Math.floor(d.length / 2)] / 60).toFixed(1) + " min, p90 " +
          (d[Math.floor(d.length * 0.9)] / 3600).toFixed(1) + " h, max " + (d[d.length - 1] / 3600).toFixed(1) + " h");
}

// ------------------------------------------------------------- JS2 usage
// Cumulative since accounting started; not windowed by SINCE.
h("Jetstream2 usage (cumulative since accounting began)");
var tot = {users: 0, submissions: 0, su: 0, ih: 0, vol: 0, since: null, bySize: {}};
db.user.find({sivacorUsage: {$exists: true}}).forEach(function (u) {
    var s = u.sivacorUsage;
    tot.users++;
    tot.submissions += s.submissions || 0;
    tot.su += s.suHours || 0;
    tot.ih += s.instanceHours || 0;
    tot.vol += s.volumeGbHours || 0;
    if (s.since && (!tot.since || s.since < tot.since)) tot.since = s.since;
    for (var k in (s.bySize || {})) tot.bySize[k] = (tot.bySize[k] || 0) + s.bySize[k];
});
var house = db.sivacor_usage_totals.findOne({_id: "house"}) || {};
print("accounting since: " + (tot.since ? tot.since.toISOString().slice(0, 10) : "-"));
print("researchers charged: " + tot.users + ", submissions charged: " + tot.submissions);
print("VMs by size (GB): " + JSON.stringify(tot.bySize));
print("SU-hours: researchers " + tot.su.toFixed(0) + " + house " + (house.suHours || 0).toFixed(0) +
      " = " + (tot.su + (house.suHours || 0)).toFixed(0));
print("house SU by reason: " + JSON.stringify(house.byReason || {}));
print("VM-hours: " + (tot.ih + (house.instanceHours || 0)).toFixed(0) +
      " (house VMs: " + (house.instances || 0) + ")");
print("volume GB-hours: " + (tot.vol + (house.volumeGbHours || 0)).toFixed(0));
