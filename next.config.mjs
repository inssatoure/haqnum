import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Le dépôt contient une autre app à la racine : on fixe la racine de ce projet.
  outputFileTracingRoot: here,
  outputFileTracingIncludes: {
    '/api/transcribe': ['./node_modules/ffmpeg-static/ffmpeg'],
    '/api/diarize': ['./node_modules/ffmpeg-static/ffmpeg'],
  },
  serverExternalPackages: ['ffmpeg-static'],
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] }];
  },
};
export default nextConfig;
