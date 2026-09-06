import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

// Internal runtime backend, never accepts a launch plan from a browser/request.
export async function supervise(file: string, args: string[], options: {
  logPath: string; timeoutMs: number; signal?: AbortSignal;
  cwd?: string; env?: NodeJS.ProcessEnv; onStarted?: () => Promise<void>;
}): Promise<{ code: number | null; reason: string | null; closed: true }> {
  const log = createWriteStream(options.logPath,{flags:'wx'});
  await once(log,'open'); // no process exists if opening the log fails
  const launch: SpawnOptionsWithoutStdio = {cwd:options.cwd,env:options.env,windowsHide:true,detached:process.platform!=='win32'};
  const child = spawn(file,args,launch);
  let reason: string | null = null; let closed = false; let logFailed = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  // Install listeners synchronously, before any await or filesystem work.
  const completed = new Promise<number | null>(resolve=>{
    child.on('error',()=>{reason ??= 'launch-failed';});
    child.once('close',code=>{closed=true;resolve(code);});
  });
  function terminate(force: boolean) {
    if(closed || !child.pid || child.exitCode!==null || child.signalCode!==null) return;
    if(process.platform==='win32') {
      // Only the live handle created above, never a PID recovered from a status file.
      const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      killer.on('error',()=>{if(!closed)child.kill('SIGKILL');});
    } else {
      try {process.kill(-child.pid,force?'SIGKILL':'SIGTERM');} catch {child.kill(force?'SIGKILL':'SIGTERM');}
    }
  }
  function stop(why: string) {
    if(closed) return;
    reason ??= why; terminate(false);
    escalation ??= setTimeout(()=>terminate(true),3000);
  }
  log.on('error',()=>{logFailed=true;stop('log-write-failed');});
  child.stdout.pipe(log,{end:false}); child.stderr.pipe(log,{end:false}); child.stdin.end();
  const interrupt=()=>stop('cancelled');
  process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  options.signal?.addEventListener('abort',interrupt,{once:true});
  const timeout=setTimeout(()=>stop('timed-out'),options.timeoutMs);
  if(options.signal?.aborted) interrupt();
  let code: number | null=null;
  try {
    // Callback failure also terminates and reconciles the owned process.
    try {await options.onStarted?.();} catch {stop('status-write-failed');}
    code=await completed;
  } finally {
    if(!closed){stop('supervisor-failed');await completed;}
    clearTimeout(timeout);if(escalation)clearTimeout(escalation);
    process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
    options.signal?.removeEventListener('abort',interrupt);
    if(!logFailed) {const finished=once(log,'finish').catch(()=>{reason ??='log-write-failed';});log.end();await finished;}
    else log.destroy();
  }
  return {code,reason,closed:true};
}
