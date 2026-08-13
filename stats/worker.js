// flybrain-stats: password-protected live analytics for flybrain.app.
// Queries the Cloudflare GraphQL Analytics API on every load, so the
// numbers are always current. Secrets: STATS_PASSWORD, CF_ANALYTICS_TOKEN,
// CF_ZONE_ID (set via wrangler secret put).

const GQL = 'https://api.cloudflare.com/client/v4/graphql';

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="flybrain stats"' }
  });
}

function checkAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = atob(header.slice(6)); } catch (e) { return false; }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return password === env.STATS_PASSWORD;
}

async function gql(env, query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.CF_ANALYTICS_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  const body = await res.json();
  if (body.errors && body.errors.length) {
    throw new Error(body.errors.map(e => e.message).join('; '));
  }
  return body.data;
}

function sinceDate(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function sinceTime(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function fetchStats(env, days) {
  const zoneQuery = `
    query($zone: String!, $since: String!) {
      viewer {
        zones(filter: { zoneTag: $zone }) {
          totals: httpRequests1dGroups(limit: 1, filter: { date_geq: $since }) {
            sum { requests pageViews }
            uniq { uniques }
          }
          countries: httpRequests1dGroups(limit: 40, filter: { date_geq: $since }) {
            sum { countryMap { clientCountryName requests } }
          }
        }
      }
    }`;

  const rumQuery = `
    query($account: String!, $since: Time!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          pageviews: rumPageloadEventsAdaptiveGroups(
            limit: 1,
            filter: { datetime_geq: $since, requestHost: "flybrain.app" }
          ) {
            count
            sum { visits }
          }
          referers: rumPageloadEventsAdaptiveGroups(
            limit: 10,
            filter: { datetime_geq: $since, requestHost: "flybrain.app" },
            orderBy: [count_DESC]
          ) {
            count
            dimensions { refererHost }
          }
          rumCountries: rumPageloadEventsAdaptiveGroups(
            limit: 10,
            filter: { datetime_geq: $since, requestHost: "flybrain.app" },
            orderBy: [count_DESC]
          ) {
            count
            dimensions { countryName }
          }
          perf: rumPerformanceEventsAdaptiveGroups(
            limit: 1,
            filter: { datetime_geq: $since, requestHost: "flybrain.app" }
          ) {
            quantiles { pageLoadTimeP50 pageLoadTimeP75 }
          }
        }
      }
    }`;

  const out = { days, zone: null, rum: null, errors: [] };
  try {
    out.zone = await gql(env, zoneQuery, { zone: env.CF_ZONE_ID, since: sinceDate(days) });
  } catch (e) { out.errors.push('zone: ' + e.message); }
  try {
    out.rum = await gql(env, rumQuery, { account: '4845299d3631fda0ba15f8a1d753e855', since: sinceTime(days) });
  } catch (e) { out.errors.push('rum: ' + e.message); }
  return out;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render(stats) {
  const zone = stats.zone && stats.zone.viewer.zones[0];
  const acct = stats.rum && stats.rum.viewer.accounts[0];

  const totals = zone && zone.totals[0];
  const requests = totals ? totals.sum.requests : null;
  const uniques = totals ? totals.uniq.uniques : null;

  const pv = acct && acct.pageviews[0];
  const pageViews = pv ? pv.count : null;
  const visits = pv && pv.sum ? pv.sum.visits : null;

  const perf = acct && acct.perf[0];
  const p50 = perf ? Math.round(perf.quantiles.pageLoadTimeP50 / 1000) : null;
  const p75 = perf ? Math.round(perf.quantiles.pageLoadTimeP75 / 1000) : null;

  // Country list: prefer RUM (visitors), fall back to zone country map
  let countries = [];
  if (acct && acct.rumCountries.length) {
    countries = acct.rumCountries.map(g => [g.dimensions.countryName, g.count]);
  } else if (zone && zone.countries[0]) {
    countries = (zone.countries[0].sum.countryMap || [])
      .sort((a, b) => b.requests - a.requests).slice(0, 10)
      .map(c => [c.clientCountryName, c.requests]);
  }

  const referers = acct ? acct.referers
    .filter(g => g.dimensions.refererHost && g.dimensions.refererHost !== 'flybrain.app')
    .map(g => [g.dimensions.refererHost, g.count]) : [];

  const stat = (label, value) =>
    `<div class="stat"><div class="num">${value == null ? '&ndash;' : esc(value.toLocaleString ? value.toLocaleString('en-US') : value)}</div><div class="lab">${label}</div></div>`;

  const list = (title, rows, unit) => `
    <div class="card"><h2>${title}</h2>${rows.length === 0 ? '<p class="empty">No data yet in this window.</p>'
      : '<table>' + rows.map(([k, v]) => `<tr><td>${esc(k || 'Direct / unknown')}</td><td class="v">${v.toLocaleString('en-US')} ${unit}</td></tr>`).join('') + '</table>'}</div>`;

  const rangeLink = d => `<a href="?days=${d}" class="${stats.days === d ? 'on' : ''}">${d === 1 ? '24h' : d + 'd'}</a>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>flybrain.app analytics</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<style>
:root { --k-blue:#1b2db5; --k-navy:#252d4f; --k-lime:#cfd600; --bg:#f0f0ed; --surface:#fff; --border:#dcdcd6; --muted:#5a5f73; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--k-navy); }
header { background: var(--surface); border-bottom: 3px solid var(--k-lime); padding: 14px 22px; display:flex; align-items:center; justify-content:space-between; }
header h1 { font-size: 1rem; margin: 0; }
header .sub { color: var(--muted); font-size: .75rem; }
.ranges a { color: var(--muted); text-decoration:none; margin-left: 10px; font-size:.85rem; padding: 4px 10px; border-radius: 8px; }
.ranges a.on { background: var(--k-blue); color:#fff; }
main { max-width: 860px; margin: 0 auto; padding: 22px; }
.stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 12px; margin-bottom: 18px; }
.stat { background: var(--surface); border:1px solid var(--border); border-radius: 12px; padding: 14px; text-align:center; }
.stat .num { font-size: 1.6rem; font-weight: 800; color: var(--k-blue); font-variant-numeric: tabular-nums; }
.stat .lab { font-size: .68rem; letter-spacing:.06em; text-transform: uppercase; color: var(--muted); margin-top: 4px; }
.cards { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px,1fr)); gap: 12px; }
.card { background: var(--surface); border:1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.card h2 { font-size:.8rem; letter-spacing:.05em; text-transform:uppercase; color: var(--muted); margin: 0 0 8px; }
table { width:100%; border-collapse: collapse; font-size:.85rem; }
td { padding: 4px 0; border-bottom: 1px solid var(--border); }
td.v { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
tr:last-child td { border-bottom: none; }
.empty { color: var(--muted); font-size:.8rem; }
.err { color:#b3261e; font-size:.75rem; margin-top:14px; }
footer { text-align:center; color: var(--muted); font-size:.7rem; padding: 18px; }
</style></head>
<body>
<header>
  <div><h1>flybrain.app analytics</h1><div class="sub">Live from Cloudflare, generated ${new Date().toISOString().replace('T',' ').slice(0,16)} UTC</div></div>
  <nav class="ranges">${rangeLink(1)}${rangeLink(7)}${rangeLink(30)}</nav>
</header>
<main>
  <div class="stats">
    ${stat('Visits', visits)}
    ${stat('Page views', pageViews)}
    ${stat('Unique visitors', uniques)}
    ${stat('Requests', requests)}
    ${stat('Load p50', p50 == null ? null : p50 + ' ms')}
    ${stat('Load p75', p75 == null ? null : p75 + ' ms')}
  </div>
  <div class="cards">
    ${list('Countries', countries, 'views')}
    ${list('Referrers', referers, 'views')}
  </div>
  ${stats.errors.length ? '<div class="err">Partial data: ' + esc(stats.errors.join(' | ')) + '</div>' : ''}
</main>
<footer>Kainos Workday AI CoE &middot; visits and page views from Web Analytics (RUM); uniques and requests from zone HTTP analytics</footer>
</body></html>`;
}

export default {
  async fetch(request, env) {
    if (!checkAuth(request, env)) return unauthorized();
    const url = new URL(request.url);
    const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10) || 7));
    const stats = await fetchStats(env, days);
    return new Response(render(stats), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
};
