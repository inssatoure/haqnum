import 'server-only';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string;
    if (p && existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return 'ffmpeg';
}

/** Lance ffmpeg et renvoie la sortie (stdout) en Buffer. */
export function runFfmpeg(args: string[], timeoutMs = 240_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', ...args]);
    const out: Buffer[] = [];
    let err = '';
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('ffmpeg : délai dépassé'));
    }, timeoutMs);
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg (${code}) : ${err.slice(0, 400)}`));
    });
  });
}

/** Extrait une fenêtre audio (mono 16 kHz, MP3 32 kbit/s) depuis une URL : léger pour Whisper. */
export function audioWindow(url: string, startS: number, durationS: number): Promise<Buffer> {
  return runFfmpeg(['-ss', String(startS), '-t', String(durationS), '-i', url, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'mp3', 'pipe:1']);
}

/** Recolle plusieurs morceaux (URLs) en un seul MP3 léger. */
export function concatAudio(urls: string[]): Promise<Buffer> {
  const inputs = urls.flatMap((u) => ['-i', u]);
  const filter = urls.map((_, i) => `[${i}:a]`).join('') + `concat=n=${urls.length}:v=0:a=1[a]`;
  return runFfmpeg([...inputs, '-filter_complex', filter, '-map', '[a]', '-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'mp3', 'pipe:1'], 280_000);
}
