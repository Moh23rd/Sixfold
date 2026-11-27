/* Why the app is no longer the window on screen, read from the buffers the
   smoke has already collected. Kept separate from adb so the classification can
   be held to real records without an emulator (scripts/lib/app-removal.test.mjs).

   The distinction matters: a provider the app holds a connection to can die
   under it (the API 34 image did this with the GMS fonts provider), and Android
   then kills the client and removes its task. That is not the app's failure, so
   the smoke repeats the assertion once. A crash, an ANR or an app-requested
   kill is the app's failure and must never be retried, or a regression could
   pass on a second attempt. */

const PROVIDER_OR_MEMORY = /depends on provider|low ?memory|lowmemorykiller|lmkd|empty/i;
// Android records an ANR kill as "user request after error". A plain "user
// request" is a force-stop someone sent, which is neither retryable nor a
// crash, so it falls through to the unexplained case.
const APP_REQUESTED = /user request after error|\banr\b/i;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Returns { crashed, external, line }:
   - crashed: the app itself crashed, stalled or was killed after an error;
   - external: the platform killed it for a reason outside the app (a dying
     provider it depends on, or memory pressure);
   - line: the record quoted in the failure, when there is one. */
export function classifyRemoval({ crashText = '', eventsText = '', mainText = '', packageName }) {
  const pkg = String(packageName || '').trim();
  if (!pkg) throw new Error('classifyRemoval needs a package name');
  const name = escapeRegExp(pkg);

  const events = String(eventsText)
    .split('\n')
    .filter((line) => line.includes(pkg));
  const main = String(mainText).split('\n');
  const crash = String(crashText);

  const anrEvent = events.some((line) => /\bam_anr\b/.test(line));
  const crashEvent = events.some((line) => /\bam_crash\b/.test(line));
  const errorKill = events.some((line) => /\bam_kill\b/.test(line) && APP_REQUESTED.test(line));
  // The buffer can also hold another app's fatal block that merely mentions
  // this package, so a crash here is the conservative answer: no retry.
  const fatal = crash.includes(pkg) && /FATAL EXCEPTION|Fatal signal \d+/.test(crash);
  const anrMain = new RegExp('ANR in ' + name).test(String(mainText));

  const killEvents = events.filter((line) => /\bam_kill\b/.test(line));
  const killMain = main
    .filter((line) => line.includes(pkg) && /Killing \d+:/.test(line))
    .pop() || '';
  const reasonSource = killEvents.length ? killEvents[killEvents.length - 1] : killMain;
  const external = !anrEvent && !crashEvent && !errorKill && !fatal && !anrMain && PROVIDER_OR_MEMORY.test(reasonSource);

  return {
    crashed: anrEvent || crashEvent || errorKill || fatal || anrMain,
    external,
    line: (reasonSource || killMain || '').trim()
  };
}
