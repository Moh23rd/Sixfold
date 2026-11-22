/* The text-in, report-out half of the launch death report.

   Everything here takes buffers the smoke has already read — the crash buffer,
   the events ring and an ANR dump — and turns them into the lines a failing job
   prints. Keeping adb out of this file is what lets
   `scripts/lib/death-report.test.mjs` hold the report to the buffers a real
   dying launch left behind (run 45027793423), instead of needing an emulator to
   discover that the report has drifted. */

const TIMESTAMPED = /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;

/* The crash buffer, from the newest block that belongs to this launch. A Java
   crash block opens with FATAL EXCEPTION and a native tombstone with its
   banner, but the last line that names the package is usually a stack frame —
   anchoring there started the report in the middle of the block and dropped the
   one line that says what threw. Find the block's own header, and fall back to
   two lines before the name when the buffer does not carry one.

   The buffer also keeps blocks from earlier launches, so a known pid narrows
   the search the way the events report already does. Both crash formats name
   the pid on a line that also names the package: `Process: pkg, PID: 2954` and
   the tombstone's `pid: 2954, tid: ... >>> pkg <<<`. When no block names the
   pid, this launch left no crash of its own and the events buffer answers. */
const CRASH_HEADER = /FATAL EXCEPTION|Fatal signal \d+|\*\*\* \*\*\* \*\*\*/;

export function crashReport(text, packageName, pid = '') {
  const lines = String(text || '').trim().split('\n');
  const named = lines.findLastIndex(
    (line) => line.includes(packageName) && (!pid || line.includes(pid))
  );
  if (named < 0) return [];
  let header = -1;
  // Bounded so a buffer without a header cannot rewind into an older block.
  for (let at = named; at >= Math.max(0, named - 200); at -= 1) {
    if (CRASH_HEADER.test(lines[at])) {
      header = at;
      break;
    }
  }
  const from = header >= 0 ? header : Math.max(0, named - 2);
  return lines.slice(from, from + 40).map((line) => `crash: ${line}`);
}

/* The events ring, filtered to this launch's death.

   The whole ring is read, not a tail of it. The ring is a few thousand lines,
   and the emulator's other processes keep writing to it, so by the time a
   launch is called dead — the devtools wait alone can spend most of a minute
   after a death — a fixed tail can already have rolled past the record that
   opened the failure. That is how a forced input-dispatch ANR was reported with
   only `am_kill ... user request after error` although the `am_anr` line
   written before the trace dump was still in the ring.

   A whole-buffer read opens with logcat's own `--------- beginning of ...`
   switches, which carry no time. The ring's reach is the first line that does,
   so the report quotes that instead of the header. */
export function eventReport(text, packageName, pid = '') {
  const all = String(text || '')
    .split('\n')
    .filter((line) => line.trim());
  const oldest = all.find((line) => TIMESTAMPED.test(line));
  const events = all
    .filter((line) => line.includes(packageName) && /am_(crash|anr|kill|proc_died)/.test(line))
    // Another launch's death is not this one's answer; the events record names
    // the pid in its second field.
    .filter((line) => !pid || line.includes(`,${pid},`));
  const report = events.map((line) => `event: ${line.trim()}`);
  if (all.length) {
    // Say how far back the ring still reaches: an absent record only means
    // something when the buffer still covers the moment it was written.
    report.push(
      `event: the events buffer held ${all.length} lines, the oldest from ${
        oldest ? oldest.slice(0, 18) : 'a line without a timestamp'
      }`
    );
  }
  return report;
}

/* Both buffers, assembled in the order a failing job prints them. */
export function parseDeathReport({ crashText = '', eventsText = '', packageName, pid = '' }) {
  const report = crashReport(crashText, packageName, pid).concat(
    eventReport(eventsText, packageName, pid)
  );
  return report.length ? report : ['no crash, ANR or kill was recorded for the app'];
}

/* What a dump with no section for the app says. describeDeath reads the same
   string to know that its Subject belongs to another process. */
const FOREIGN_TRACE = ' does not name ';

/* The platform's own account of a stalled launch: the ANR dump of the app's
   threads. Each section is headed by `----- pid N ...` (the process's threads)
   or `----- Waiting Channels: pid N ...` (the kernel waits). The app's are the
   ones with its Cmd line; a process frozen before it could be dumped has only
   the second kind. */
export function anrTraceLines(text, name, packageName) {
  const lines = String(text || '').split('\n');
  const sections = [];
  for (let at = 0; at < lines.length; at++) {
    const header = /^----- (?:pid|Waiting Channels: pid) (\d+)/.exec(lines[at]);
    if (!header) continue;
    const end = lines.findIndex((line, after) => after > at && line === `----- end ${header[1]} -----`);
    sections.push({ from: at, to: end > at ? end : lines.length - 1 });
  }
  const ours = sections.filter((section) =>
    lines.slice(section.from, section.to + 1).some((line) => line.startsWith(`Cmd line: ${packageName}`))
  );
  if (!ours.length) {
    return [`anr: /data/anr/${name}${FOREIGN_TRACE}${packageName}; its head follows`].concat(
      lines.slice(0, 40).map((line) => `anr: ${line}`)
    );
  }
  const block = lines.slice(ours[0].from, ours[ours.length - 1].to + 1);
  // The subject is the platform's own statement of what timed out, and it is
  // what the failing annotation quotes. It heads the file, so find it rather
  // than assume the offset.
  const subject = lines.find((line) => line.startsWith('Subject: '));
  const reason = subject ? [`anr: ${subject}`] : [];
  const shown = block.slice(0, 200).map((line) => `anr: ${line}`);
  if (block.length > 200) shown.push(`anr: (${block.length - 200} more lines in /data/anr/${name})`);
  return [`anr: /data/anr/${name}`].concat(reason, shown);
}

/* The one line a failing check carries. The trace's `Subject:` names what the
   app failed to answer, which is the closest thing to a cause; the events
   buffer says what the platform did about it afterwards ("user request after
   error" only means the ANR dialog was suppressed and the app ended). Neither
   alone explains a dead launch, so quote both when both are there. A crash has
   no trace subject, so its recorded event or FATAL EXCEPTION line is the
   cause. */
export function describeDeath(report, trace = []) {
  // A dump with no section for the app is another process's, and its Subject
  // explains that process's stall. Quoting it here would name the wrong cause
  // for this launch, so only a trace that named the app can answer.
  const named = trace.length > 0 && !trace[0].includes(FOREIGN_TRACE);
  const subject = named
    ? (trace.find((line) => line.startsWith('anr: Subject: ')) || '').replace(
        /^anr: Subject: /,
        ''
      )
    : '';
  const recorded =
    report.find((entry) => /^event: .*am_(anr|kill|crash)/.test(entry)) ||
    report.find((entry) => entry.startsWith('crash: '));
  const detail = recorded ? recorded.replace(/^(event|crash): /, '') : '';
  if (subject) return detail ? `${subject}; the platform recorded: ${detail}` : subject;
  return detail || 'no cause was recorded';
}
