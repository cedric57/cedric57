// Sélectionne la dernière vidéo LONGUE (Shorts exclus) et écrit une carte
// avec miniature cliquable dans la section YOUTUBE-VIDEOS-LIST de README.md.
import { readFile, writeFile } from 'node:fs/promises';

const CHANNEL_ID = 'UCX_e4D9B0Z_Drh19cWc4SgA';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const README_PATH = 'README.md';
const TAG_START = '<!-- YOUTUBE-VIDEOS-LIST:START -->';
const TAG_END = '<!-- YOUTUBE-VIDEOS-LIST:END -->';
const MAX_ENTRIES = 15;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cookie': 'CONSENT=YES+1',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function fetchRetry(url, options = {}, tries = 2) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000), ...options });
    } catch (err) {
      if (i >= tries) throw err;
      await sleep(2000);
    }
  }
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseEntries(xml) {
  const entries = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const b = m[1];
    const id = b.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = b.match(/<title>([^<]*)<\/title>/)?.[1];
    const url = b.match(/<link[^>]*href="([^"]+)"/)?.[1];
    const published = b.match(/<published>([^<]+)<\/published>/)?.[1];
    if (id && title && url) entries.push({ id, title: decodeEntities(title), url, published });
  }
  return entries.sort((a, b) => new Date(b.published) - new Date(a.published));
}

// /shorts/ID répond 200 pour un Short, redirige (303) vers /watch pour une vidéo classique.
async function isShort(videoId) {
  const res = await fetchRetry(`https://www.youtube.com/shorts/${videoId}`, { redirect: 'manual' });
  if (res.status === 200) return true;
  if (res.status >= 300 && res.status < 400) return false;
  throw new Error(`statut inattendu ${res.status}`);
}

const feedRes = await fetchRetry(FEED_URL);
if (!feedRes.ok) { console.error(`Flux RSS inaccessible (${feedRes.status})`); process.exit(1); }
const entries = parseEntries(await feedRes.text()).slice(0, MAX_ENTRIES);
if (!entries.length) { console.error('Aucune entrée dans le flux RSS.'); process.exit(1); }

let chosen = null;
for (const entry of entries) {
  if (/#shorts?\b/i.test(entry.title)) { console.log(`⏭️  Titre #Shorts : ${entry.title}`); continue; }
  try {
    if (await isShort(entry.id)) { console.log(`⏭️  Short : ${entry.title}`); await sleep(150); continue; }
    chosen = entry;
    break;
  } catch (err) {
    console.log(`⚠️  Sonde impossible pour ${entry.id} (${err.message}) → entrée ignorée`);
  }
  await sleep(150);
}

if (!chosen) {
  console.log('Aucune vidéo longue dans les 15 dernières entrées → README inchangé.');
  process.exit(0);
}

const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(chosen.published));
const title = escHtml(chosen.title);
const url = escHtml(chosen.url);
const card = [
  '<table>',
  '  <tr>',
  `    <td width="240"><a href="${url}"><img src="https://i.ytimg.com/vi/${chosen.id}/mqdefault.jpg" width="240" alt="Miniature : ${title}" /></a></td>`,
  `    <td><a href="${url}"><b>🎬 ${title}</b></a><br /><sub>StatDash · publiée le ${date} · vidéo longue</sub></td>`,
  '  </tr>',
  '</table>',
].join('\n');
const block = `${TAG_START}\n${card}\n${TAG_END}`;

const readme = await readFile(README_PATH, 'utf8');
const start = readme.indexOf(TAG_START);
const end = readme.indexOf(TAG_END);
if (start === -1 || end === -1 || end < start) {
  console.error('Marqueurs YOUTUBE-VIDEOS-LIST introuvables dans README.md.');
  process.exit(1);
}
const updated = readme.slice(0, start) + block + readme.slice(end + TAG_END.length);

if (updated === readme) { console.log('Section déjà à jour.'); process.exit(0); }
await writeFile(README_PATH, updated);
console.log(`✅ Carte générée pour : ${chosen.title}`);
