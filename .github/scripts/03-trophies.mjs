// Génère dist/github-trophies.svg — 7 trophées style "matrix", zéro Vercel.
// Données : API GitHub via le GITHUB_TOKEN du workflow.
// Rangs : seuils explicites ci-dessous (S/A/B/C), calibrés généreusement — à toi de les ajuster.
// Sortie déterministe (pas de date) → commit uniquement quand un chiffre ou un rang change.
import { mkdir, writeFile } from 'node:fs/promises';

const USER = 'cedric57';
const OUT = 'dist/github-trophies.svg';
const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN manquant.'); process.exit(1); }

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': `${USER}-trophies`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, tries = 3) {
  for (let i = 1; ; i++) {
    const res = await fetch(API + path, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (res.ok) return res.json();
    if ((res.status === 403 || res.status === 429) && i < tries) {
      const wait = Number(res.headers.get('retry-after') || 5) * 1000;
      console.log(`⏳ ${res.status} sur ${path} — pause ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${res.status} sur ${path}`);
  }
}

// ---- Collecte (commits publics uniquement, comme les trophées d'origine) ----
const user = await api(`/users/${USER}`);
let stars = 0;
for (let page = 1; page <= 5; page++) {
  const repos = await api(`/users/${USER}/repos?per_page=100&type=owner&page=${page}`);
  stars += repos.reduce((a, r) => a + (r.fork ? 0 : r.stargazers_count), 0);
  if (repos.length < 100) break;
}
const commits = (await api(`/search/commits?q=author:${USER}&per_page=1`)).total_count;
const prs     = (await api(`/search/issues?q=author:${USER}+type:pr&per_page=1`)).total_count;
const issues  = (await api(`/search/issues?q=author:${USER}+type:issue&per_page=1`)).total_count;
const reviews = (await api(`/search/issues?q=reviewed-by:${USER}+type:pr&per_page=1`)).total_count;

// ---- Rangs : seuils maison, transparents et éditables ----
// (le repo d'origine utilise des percentiles opaques ; ici tu maîtrises la règle)
const THRESHOLDS = {
  stars:     { S: 500,  A: 5,   B: 2,   C: 1 },
  commits:   { S: 2000, A: 400, B: 200, C: 50 },
  prs:       { S: 200,  A: 100, B: 20,  C: 5 },
  issues:    { S: 100,  A: 20,  B: 1,   C: 0 },
  followers: { S: 100,  A: 5,   B: 2,   C: 1 },
  repos:     { S: 50,   A: 10,  B: 5,   C: 1 },
  reviews:   { S: 50,   A: 20,  B: 1,   C: 0 },
};
const rank = (v, t) => (v >= t.S ? 'S' : v >= t.A ? 'A' : v >= t.B ? 'B' : v >= t.C ? 'C' : '?');
const RANK_COLOR = { S: '#FFD700', A: '#3FB950', B: '#F0B429', C: '#8B949E', '?': '#484F58' };

const METRICS = [
  { key: 'stars',     label: 'Stars',     value: stars,          icon: 'star' },
  { key: 'commits',   label: 'Commits',   value: commits,        icon: 'commit' },
  { key: 'prs',       label: 'PRs',       value: prs,            icon: 'pr' },
  { key: 'issues',    label: 'Issues',    value: issues,         icon: 'issue' },
  { key: 'followers', label: 'Followers', value: user.followers, icon: 'people' },
  { key: 'repos',     label: 'Repos',     value: user.public_repos, icon: 'repo' },
  { key: 'reviews',   label: 'Reviews',   value: reviews,        icon: 'eye' },
];

// ---- Icônes vectorielles (24×24) : pas d'emoji → rendu identique partout ----
const ICONS = {
  star:   '<path d="M12 2l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.2 1.3-6.6L2.5 9l6.6-.8z" fill="ICON" stroke="none"/>',
  commit: '<circle cx="12" cy="12" r="4"/><path d="M2 12h6M16 12h6"/>',
  pr:     '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 8.5v7M18 8.5v3a4 4 0 0 1-4 4h-5"/>',
  issue:  '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.6" fill="ICON" stroke="none"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.6.3 4.5 2.1 4.5 4.4"/>',
  repo:   '<path d="M5 3h14v18H7a2 2 0 0 1-2-2V3z"/><path d="M5 17a2 2 0 0 1 2-2h12"/>',
  eye:    '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
};

// ---- Rendu SVG ----
const W = 110, H = 110, GAP = 8;
const width = METRICS.length * W + (METRICS.length - 1) * GAP;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Trophées GitHub de ${USER}">`;
METRICS.forEach((m, i) => {
  const x = i * (W + GAP);
  const r = rank(m.value, THRESHOLDS[m.key]);
  const color = RANK_COLOR[r];
  const icon = ICONS[m.icon].replaceAll('ICON', '#68B587');
  svg += `<g transform="translate(${x},0)">`;
  svg += `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8" fill="#0D1117" stroke="#21262D"/>`;
  svg += `<g transform="translate(${(W - 28) / 2},12) scale(1.1667)" fill="none" stroke="#68B587" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`;
  svg += `<text x="${W / 2}" y="60" text-anchor="middle" font-family="Segoe UI,Verdana,sans-serif" font-size="11" fill="#68B587">${m.label}</text>`;
  svg += `<text x="${W / 2}" y="85" text-anchor="middle" font-family="Segoe UI,Verdana,sans-serif" font-size="20" font-weight="700" fill="${color}">${r}</text>`;
  svg += `<text x="${W / 2}" y="100" text-anchor="middle" font-family="Segoe UI,Verdana,sans-serif" font-size="9" fill="#8B949E">${m.value.toLocaleString('fr-FR')}</text>`;
  svg += `</g>`;
});
svg += '</svg>\n';

await mkdir('dist', { recursive: true });
await writeFile(OUT, svg);
console.log(`✅ ${OUT} généré :`);
METRICS.forEach((m) => console.log(`   ${m.label.padEnd(10)} ${String(m.value).padStart(6)}  → ${rank(m.value, THRESHOLDS[m.key])}`));
