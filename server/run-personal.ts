// このPCでAPIと無料の一時HTTPS接続を維持する。株価・キーはGitへ送らない。
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const binary = process.env.CLOUDFLARED_PATH;
const pages = process.env.PAGES_CHECKOUT;
const runtimeDir = process.env.DATA_DIR;
if (!binary || !pages || !runtimeDir) throw new Error('CLOUDFLARED_PATH / PAGES_CHECKOUT / DATA_DIRが必要です');
mkdirSync(runtimeDir, {recursive:true});
const log = (text: string) => process.stdout.write(text);
let stopped = false;
let api: ReturnType<typeof spawn> | undefined, tunnel: ReturnType<typeof spawn> | undefined;
function runApi() {
  api = spawn(process.execPath, ['--import','tsx','server/index.ts'], {env:process.env, windowsHide:true});
  api.stdout?.on('data', chunk => log(String(chunk))); api.stderr?.on('data', chunk => log(String(chunk)));
  api.on('exit', () => { if (!stopped) setTimeout(runApi, 10_000); });
}
let lastPublished = '';
function publish(url: string) {
  if (url === lastPublished) return;
  if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url)) return;
  try {
    writeFileSync(join(pages!, 'api-endpoint.json'), JSON.stringify({version:1, url, updatedAt:new Date().toISOString()}));
    const git = (args: string[]) => execFileSync('git',args,{cwd:pages!,windowsHide:true,stdio:'pipe'});
    git(['add','api-endpoint.json']);
    if (git(['diff','--cached','--name-only']).toString().trim()) git(['commit','-m','Update personal API connection address']);
    git(['push','origin','gh-pages']);
    writeFileSync(join(runtimeDir!, 'api-url.txt'), url);
    lastPublished = url; log(`本人用API接続先を更新: ${url}\n`);
  } catch { log('接続先URLの公開に失敗。次回再試行します\n'); setTimeout(() => publish(url),60_000); }
}
function runTunnel() {
  tunnel = spawn(binary!, ['tunnel','--no-autoupdate','--url',`http://127.0.0.1:${process.env.PORT ?? '8787'}`],{windowsHide:true});
  tunnel.stderr?.on('data',chunk => {
    const text=String(chunk); log(text);
    const url=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if(url) publish(url);
  });
  tunnel.on('exit',()=>{ if(!stopped) setTimeout(runTunnel,15_000); });
}
runApi(); runTunnel();
function stop(){ stopped=true; api?.kill(); tunnel?.kill(); setTimeout(()=>process.exit(),1000); }
process.on('SIGTERM',stop); process.on('SIGINT',stop);
