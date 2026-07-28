const fs = require('node:fs/promises');
const path = require('node:path');

const username = process.env.PROFILE_USERNAME || 'Akkiy-ckiliy';
const token = process.env.GITHUB_TOKEN || '';
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': `${username}-profile-card-generator`,
};
if (token) headers.Authorization = `Bearer ${token}`;

const colors = {
  bg: '#0d1117',
  panel: '#151b23',
  border: '#30363d',
  muted: '#8b949e',
  text: '#e6edf3',
  warm: '#f2cc8f',
  green: '#a7c957',
  blue: '#7dd3fc',
  orange: '#f2994a',
};

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[char]));
}

async function gh(apiPath) {
  const response = await fetch(`https://api.github.com${apiPath}`, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${apiPath}`);
  }
  return response.json();
}

async function listPublicRepos() {
  const repos = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await gh(`/users/${username}/repos?type=owner&sort=updated&per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((repo) => !repo.fork && !repo.archived);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date) {
  return date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

function recentMonths(count) {
  const now = new Date();
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)));
  }
  return months;
}

async function getLanguages(repos) {
  const totals = new Map();
  for (const repo of repos) {
    try {
      const languages = await gh(`/repos/${repo.owner.login}/${repo.name}/languages`);
      for (const [language, bytes] of Object.entries(languages)) {
        totals.set(language, (totals.get(language) || 0) + bytes);
      }
    } catch (error) {
      console.warn(`Skipping languages for ${repo.full_name}: ${error.message}`);
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

async function getCommitsByMonth(repos, months) {
  const counts = new Map(months.map((date) => [monthKey(date), 0]));
  const since = months[0].toISOString();
  let total = 0;
  let latest = null;

  for (const repo of repos) {
    try {
      const commits = await gh(`/repos/${repo.owner.login}/${repo.name}/commits?author=${username}&since=${encodeURIComponent(since)}&per_page=100`);
      for (const commit of commits) {
        const rawDate = commit.commit?.committer?.date || commit.commit?.author?.date;
        if (!rawDate) continue;
        const date = new Date(rawDate);
        const key = monthKey(date);
        if (counts.has(key)) {
          counts.set(key, counts.get(key) + 1);
          total += 1;
        }
        if (!latest || date > latest) latest = date;
      }
    } catch (error) {
      console.warn(`Skipping commits for ${repo.full_name}: ${error.message}`);
    }
  }

  return { counts, total, latest };
}

function formatJst(date) {
  if (!date) return 'No recent public commit';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  });
}

function languageBar(languages) {
  const top = languages.slice(0, 4);
  const palette = ['#3178c6', '#a8b9cc', '#f7df1e', '#dea584'];
  const total = top.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
  let x = 0;
  const rects = top.map(([language, bytes], index) => {
    const width = index === top.length - 1 ? 792 - x : Math.round((bytes / total) * 792);
    const rect = `<rect x="${x}" width="${width}" height="10" fill="${palette[index]}"/>`;
    x += width;
    return rect;
  }).join('');
  const labels = top.map(([language], index) => {
    const labelX = 18 + index * 190;
    return `<circle cx="${labelX}" cy="30" r="6" fill="${palette[index]}"/><text x="${labelX + 14}" y="35" fill="${colors.text}">${esc(language)}</text>`;
  }).join('');
  return `<rect width="792" height="10" rx="5" fill="${colors.border}"/><g clip-path="url(#barClip)">${rects}</g>${labels}`;
}

function overviewSvg({ repos, activeThisYear, latest, languages, generatedAt }) {
  const focus = languages.slice(0, 2).map(([name]) => name).join(' + ') || 'Learning';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="270" viewBox="0 0 900 270" role="img" aria-label="${esc(username)} GitHub overview">
  <defs><clipPath id="barClip"><rect width="792" height="10" rx="5"/></clipPath></defs>
  <rect width="900" height="270" rx="16" fill="${colors.bg}"/>
  <rect x="24" y="24" width="852" height="222" rx="14" fill="${colors.panel}" stroke="${colors.border}"/>
  <text x="54" y="70" fill="${colors.text}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">GitHub Overview</text>
  <text x="54" y="98" fill="${colors.muted}" font-family="Segoe UI, Arial, sans-serif" font-size="14">Auto-generated static SVG. Last generated: ${esc(generatedAt)} JST.</text>
  <g font-family="Segoe UI, Arial, sans-serif">
    <rect x="54" y="126" width="180" height="74" rx="12" fill="${colors.bg}" stroke="${colors.border}"/>
    <text x="74" y="154" fill="${colors.muted}" font-size="13">Public repos</text><text x="74" y="187" fill="${colors.warm}" font-size="34" font-weight="700">${repos.length}</text>
    <rect x="254" y="126" width="180" height="74" rx="12" fill="${colors.bg}" stroke="${colors.border}"/>
    <text x="274" y="154" fill="${colors.muted}" font-size="13">Active this year</text><text x="274" y="187" fill="${colors.green}" font-size="34" font-weight="700">${activeThisYear}</text>
    <rect x="454" y="126" width="210" height="74" rx="12" fill="${colors.bg}" stroke="${colors.border}"/>
    <text x="474" y="154" fill="${colors.muted}" font-size="13">Latest public work</text><text x="474" y="186" fill="${colors.blue}" font-size="23" font-weight="700">${esc(formatJst(latest))}</text>
    <rect x="684" y="126" width="142" height="74" rx="12" fill="${colors.bg}" stroke="${colors.border}"/>
    <text x="704" y="154" fill="${colors.muted}" font-size="13">Focus</text><text x="704" y="186" fill="${colors.orange}" font-size="19" font-weight="700">${esc(focus.slice(0, 12))}</text>
  </g>
  <g transform="translate(54 222)" font-family="Segoe UI, Arial, sans-serif" font-size="13">
    ${languageBar(languages)}
  </g>
</svg>
`;
}

function activitySvg({ months, counts, generatedAt }) {
  const values = months.map((date) => counts.get(monthKey(date)) || 0);
  const max = Math.max(1, ...values);
  const bars = months.map((date, index) => {
    const value = values[index];
    const height = Math.round((value / max) * 110);
    const x = 74 + index * 88;
    const y = 180 - height;
    return `<g><rect x="${x}" y="${y}" width="46" height="${height}" rx="6" fill="url(#b)"/><text x="${x + 23}" y="202" fill="${colors.muted}">${monthLabel(date)}</text><text x="${x + 23}" y="${Math.max(54, y - 10)}" fill="${colors.warm}" font-weight="700">${value}</text></g>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="250" viewBox="0 0 900 250" role="img" aria-label="Recent public activity">
  <defs><linearGradient id="b" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${colors.orange}"/><stop offset="1" stop-color="#2f80ed"/></linearGradient></defs>
  <rect width="900" height="250" rx="16" fill="${colors.bg}"/>
  <rect x="24" y="24" width="852" height="202" rx="14" fill="${colors.panel}" stroke="${colors.border}"/>
  <text x="54" y="66" fill="${colors.text}" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700">Recent Public Activity</text>
  <text x="54" y="92" fill="${colors.muted}" font-family="Segoe UI, Arial, sans-serif" font-size="14">Public commits by month. Last generated: ${esc(generatedAt)} JST.</text>
  <g font-family="Segoe UI, Arial, sans-serif" font-size="12" text-anchor="middle">
    <line x1="54" y1="180" x2="846" y2="180" stroke="${colors.border}"/><line x1="54" y1="120" x2="846" y2="120" stroke="#222a33" stroke-dasharray="4 8"/>
    ${bars}
  </g>
</svg>
`;
}

async function main() {
  const months = recentMonths(9);
  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  });

  const repos = await listPublicRepos();
  const [languages, commits] = await Promise.all([
    getLanguages(repos),
    getCommitsByMonth(repos, months),
  ]);

  const currentYear = new Date().getUTCFullYear();
  const activeThisYear = repos.filter((repo) => new Date(repo.pushed_at).getUTCFullYear() === currentYear).length;

  await fs.mkdir(path.join(process.cwd(), 'assets'), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), 'assets', 'github-overview.svg'), overviewSvg({
    repos,
    activeThisYear,
    latest: commits.latest,
    languages,
    generatedAt,
  }));
  await fs.writeFile(path.join(process.cwd(), 'assets', 'recent-activity.svg'), activitySvg({
    months,
    counts: commits.counts,
    generatedAt,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
