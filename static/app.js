(function () {
'use strict';

/* ---------------------------------------------------------------- helpers */
const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');

const PATHS = {
  chart: '<path d="M4 4v16h16"/><path d="M8 8h7M8 12h10M8 16h4"/>',
  chat: '<path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7.5L7 21v-3.5H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/><path d="M8 9.5h8M8 13h5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.8v.1"/>',
  upload: '<path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8" cy="8" r="1.4"/>',
  file: '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4"/>',
  filelines: '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4"/><path d="M9 12.5h6M9 16h6"/>',
  filecount: '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4"/><path d="M9 12.5h6M9 16h4"/>',
  clipboard: '<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9.5 3h5v3h-5z"/><path d="M9 11h6M9 15h4"/>',
  checkc: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
  alertc: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><path d="M12 16.3v.1"/>',
  warn: '<path d="M10.3 4.3 3 17.5A2 2 0 0 0 4.7 20.5h14.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5"/><path d="M12 17v.1"/>',
  download: '<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  check: '<path d="m6 12.5 4 4 8-9"/>',
  up: '<path d="M4 16l5-5 4 4 7-8"/><path d="M15 7h5v5"/>',
  down: '<path d="M4 8l5 5 4-4 7 8"/><path d="M15 17h5v-5"/>',
  minus: '<path d="M5 12h14"/>',
  bag: '<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  layers: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/>',
  code: '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4"/>'
};
PATHS.scale = '<path d="M12 4v16M7 20h10"/><path d="M5 7h14"/><path d="M5 7l-3 7a3.5 3.5 0 0 0 6 0L5 7zM19 7l-3 7a3.5 3.5 0 0 0 6 0L19 7z"/>';
const ic = (name, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + PATHS[name] + '</svg>';
const spinner = (cls) => '<svg class="ic spin ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="#F1D6C7"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/></svg>';

const ILLUS_EMPTY = '<svg class="illus" viewBox="0 0 200 140" aria-hidden="true"><rect x="40" y="22" width="92" height="104" rx="8" stroke="#EBC4AF"/><rect x="56" y="12" width="92" height="104" rx="8" fill="#FFFDF9"/><path d="M72 36h40M72 48h56M72 60h28"/><path d="M72 84v16M84 76v24M96 88v12M108 70v30"/><path d="M66 106h52"/><path d="M120 18h46a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8h-24l-12 10V60h-10a8 8 0 0 1-8-8V26" fill="#F8E7DC"/><path d="M136 36h24M136 44h16"/></svg>';
const ILLUS_ERROR = '<svg class="illus" viewBox="0 0 200 140" aria-hidden="true"><path d="M58 14h52l22 22v54" fill="#FFFDF9"/><path d="M110 14v22h22"/><path d="M58 14v76"/><path d="M58 90l12 8 12-8 12 8 12-8 12 8 14-8"/><path d="M58 106v20h74v-20" stroke="#EBC4AF"/><path d="M58 106l12-8M132 106l-12-8" stroke="#EBC4AF"/><path d="M74 44h28M74 56h40M74 68h20"/><circle cx="146" cy="40" r="20" fill="#F8E7DC"/><path d="M146 30v12"/><path d="M146 49v.1"/></svg>';

const METHOD_LABEL = {pre: 'Pretrained', tfidf: 'TF-IDF', bow: 'BoW'};
const METHOD_HELP = {
  pre: 'Pretrained: a transformer writes a new summary. Most fluent, slowest.',
  tfidf: 'TF-IDF: picks the sentences with the most distinctive words. Fast, never invents text.',
  bow: 'BoW: picks the sentences with the most frequent words. Fastest, simplest.'
};
const EXAMPLES = [
  {label: 'Crash', text: 'Since the last update the app crashes every time I open the camera. Useless now.'},
  {label: 'Happy user', text: 'Really smooth app, the new dark mode looks great and sync is fast.'},
  {label: 'Ads', text: 'Way too many ads, one pops up every time I switch tabs.'}
];

/* ---------------------------------------------------------------- state */
const S = {
  view: 'form',
  cfg: {countries: ['United States'], default_categories: [], built_by: '', github_url: ''},
  form: {appName: '', country: 'United States', apps: [], selected: '', searchMsg: '', searching: false,
         file: null, pasted: '', catMode: 'auto', cats: [], maxN: 300, method: 'tfidf'},
  jobId: null, prog: {step: 0, pct: 0, notes: ['', '', '', ''], steps: []}, loadingMeta: '',
  result: null, error: null, poll: null,
  tbl: {filter: 'all', q: '', page: 1},
  check: {text: EXAMPLES[0].text, result: null, busy: false, err: ''},
  cmp: {country: 'United States', maxN: 300, cats: [], slots: {a: {name: '', apps: [], selected: '', msg: '', busy: false}, b: {name: '', apps: [], selected: '', msg: '', busy: false}}},
  cres: null, kind: 'analyze'
};
const PAGE_SIZE = 10;

/* ---------------------------------------------------------------- layout */
function renderNav() {
  const active = {form: 'form', loading: S.kind === 'compare' ? 'compare' : 'form', error: S.kind === 'compare' ? 'compare' : 'form', results: 'form', compare: 'compare', cresults: 'compare', check: 'check', about: 'about'}[S.view];
  const items = [['form', 'chart', 'Analyze a file', '#/'], ['compare', 'scale', 'Compare apps', '#/compare'], ['check', 'chat', 'Check one review', '#/check'], ['about', 'info', 'About', '#/about']];
  $('#nav').innerHTML = items.map(([id, icon, label, href]) =>
    '<a href="' + href + '" data-nav="' + id + '"' + (active === id ? ' aria-current="page"' : '') + '>' + ic(icon) + label + '</a>').join('');
}

function render() {
  const main = $('#main');
  main.className = (S.view === 'check' || S.view === 'about') ? 'narrow' : '';
  const views = {form: viewForm, loading: viewLoading, results: viewResults, error: viewError, check: viewCheck, about: viewAbout, compare: viewCompare, cresults: viewCompareResults};
  main.innerHTML = views[S.view]();
  renderNav();
  if (S.view === 'results') updateTable();
  document.title = {form: 'Analyze a file', loading: 'Analyzing reviews', results: 'Results', error: 'We could not analyze this',
                    check: 'Check one review', about: 'About', compare: 'Compare apps', cresults: 'Comparison'}[S.view] + ' · App Reviews Analyzer';
}

function go(view) {
  S.view = view;
  const h = {form: '#/', check: '#/check', about: '#/about', results: '#/results', compare: '#/compare', cresults: '#/comparison'}[view];
  if (h && location.hash !== h) history.pushState(null, '', h);
  render();
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- form */
function countLines(t) { return t.split('\n').filter((l) => l.trim()).length; }

function viewForm() {
  const f = S.form;
  const appList = f.apps.length
    ? '<div class="applist" role="group" aria-label="Matching apps">' + f.apps.map((a) =>
        '<button type="button" class="appopt" data-act="pick-app" data-val="' + esc(a) + '" aria-pressed="' + (a === f.selected) + '">' +
        ic('bag', 's18') + '<span>' + esc(a.replace(/\s*\(\d+\)\s*$/, '')) + '</span></button>').join('') + '</div>'
    : '';
  const fileBlock = f.file
    ? '<div class="filechip">' + ic('file', 's18') + '<span>' + esc(f.file.name) + '</span><button type="button" class="iconbtn" data-act="remove-file" aria-label="Remove file">' + ic('x', 's18') + '</button></div>'
    : '<label for="csv" class="dropzone" id="dz">' +
        '<span class="dz-ic">' + ic('upload') + '</span>' +
        '<span class="dz-title">Drag and drop a CSV file here</span>' +
        '<span class="dz-sub">One review per row. We read the column named review, text or content. Dates, versions and stars are used when present.</span>' +
        '<span class="dz-btn">Choose file</span></label>';
  const catBlock = f.catMode === 'auto'
    ? '<span class="sub">The negative reviews are grouped by the words they share, and each group is named by its strongest words.</span>'
    : '<div class="chips">' + f.cats.map((c, i) =>
        '<span class="chip">' + esc(c) + '<button type="button" data-act="rm-cat" data-i="' + i + '" aria-label="Remove ' + esc(c) + '">' + ic('x', 's14') + '</button></span>').join('') +
        '<input id="cat-add" type="text" placeholder="Add a category" aria-label="Add a category"></div>' +
        '<span class="sub">Press Enter to add. Negative reviews are sorted into these.</span>';
  return '' +
  '<div class="head-col"><h1>Analyze a file</h1><p class="muted" style="max-width:680px">Pick an app, upload a CSV of app reviews or paste them below. We sort them by sentiment, group the complaints, show what to fix first and summarize what unhappy users say.</p></div>' +
  '<div class="form-grid">' +
  '<section class="card in" aria-labelledby="in-h">' +
    '<h2 id="in-h" class="with-ic">' + ic('upload') + 'Reviews</h2>' +
    '<div class="field"><label class="label" for="app-name">' + ic('bag', 's18') + 'Find an app on the App Store</label>' +
      '<div class="appfind"><input id="app-name" class="input" type="text" placeholder="e.g. Spotify" data-bind="appName" value="' + esc(f.appName) + '">' +
      '<select class="select" aria-label="Country" data-bind="country">' + S.cfg.countries.map((c) => '<option' + (c === f.country ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
      '<button type="button" class="btn" data-act="search"' + (f.searching ? ' disabled' : '') + '>' + (f.searching ? spinner('s18') : ic('search', 's18')) + 'Find app</button></div>' +
      (f.searchMsg ? '<span class="sub" role="status">' + esc(f.searchMsg) + '</span>' : '') + appList +
      '<span class="sub">Gets the latest public reviews (up to about 500) with dates, app versions and stars.</span></div>' +
    '<div class="divider"><i></i><span>or upload a file</span><i></i></div>' + fileBlock +
    '<input id="csv" type="file" accept=".csv,text/csv" class="sr" data-bind="file">' +
    '<div class="divider"><i></i><span>or paste reviews</span><i></i></div>' +
    '<div class="field"><label for="paste" class="label">' + ic('clipboard', 's18') + 'Paste reviews, one per line</label>' +
      '<textarea id="paste" rows="6" class="input" data-bind="pasted" placeholder="The app keeps crashing since the last update&#10;Love the new dark mode, works great&#10;Too many ads, I can&#39;t even tap the play button">' + esc(f.pasted) + '</textarea>' +
      '<div class="sep-row"><span id="paste-count">' + countLines(f.pasted) + ' reviews detected</span><span>English reviews only. A file or pasted reviews win over the app picker.</span></div></div>' +
  '</section>' +
  '<section class="card set" aria-labelledby="set-h" style="gap:24px">' +
    '<h2 id="set-h" class="with-ic">' + ic('sliders') + 'Settings</h2>' +
    '<div class="field" style="gap:10px"><span class="label" id="cat-l">' + ic('tag', 's18') + 'Complaint categories</span>' +
      '<div class="seg" role="group" aria-labelledby="cat-l">' +
        '<button type="button" data-act="catmode" data-val="auto" aria-pressed="' + (f.catMode === 'auto') + '">Auto-detect</button>' +
        '<button type="button" data-act="catmode" data-val="own" aria-pressed="' + (f.catMode === 'own') + '">My own list</button></div>' + catBlock + '</div>' +
    '<div class="field" style="gap:10px"><div class="rng-row"><label for="max" class="label" style="font-weight:500">Max reviews</label><output class="mono" id="max-o" style="font-size:15px;color:var(--accent-dark)">' + f.maxN + '</output></div>' +
      '<input id="max" type="range" min="50" max="1000" step="50" value="' + f.maxN + '" data-bind="maxN"><div class="rng-ends"><span>50</span><span>1000</span></div></div>' +
    '<fieldset style="border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:10px"><legend class="label" style="padding:0;margin-bottom:10px">Summary method</legend>' +
      '<div class="seg three">' + ['pre', 'tfidf', 'bow'].map((m) => '<button type="button" data-act="method" data-val="' + m + '" aria-pressed="' + (f.method === m) + '">' + METHOD_LABEL[m] + '</button>').join('') + '</div>' +
      '<span class="sub">' + METHOD_HELP[f.method] + '</span></fieldset>' +
    '<button type="button" class="btn primary big" data-act="analyze" style="margin-top:auto">' + ic('chart') + 'Analyze</button>' +
  '</section></div>' +
  '<section class="card empty" aria-label="Results">' + ILLUS_EMPTY + '<h2>No results yet</h2><p>Pick an app, add a CSV or paste some reviews, then press Analyze. Your charts, summary and review table will appear here.</p></section>';
}

async function doSearch() {
  const f = S.form;
  if (!f.appName.trim()) { f.searchMsg = 'Type an app name first.'; f.apps = []; return render(); }
  f.searching = true; render();
  try {
    const r = await fetch('/api/search', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: f.appName, country: f.country})});
    const d = await r.json();
    f.apps = d.apps || []; f.selected = f.apps[0] || ''; f.searchMsg = d.message || '';
  } catch (e) { f.apps = []; f.searchMsg = 'Could not reach the server. Try again.'; }
  f.searching = false; render();
  const first = $('.appopt'); if (first) first.focus();
}

async function startAnalyze() {
  const f = S.form;
  const hasFile = !!f.file, hasPaste = f.pasted.trim().length > 0, hasApp = !!f.selected;
  if (!hasFile && !hasPaste && !hasApp) {
    S.error = {title: 'Nothing to analyze', message: 'Pick an app, upload a CSV file or paste some reviews, then press Analyze.'};
    return go('error');
  }
  const fd = new FormData();
  if (hasFile) fd.append('file', f.file);
  fd.append('pasted', f.pasted); fd.append('store_app', hasFile || hasPaste ? '' : f.selected);
  fd.append('country', f.country); fd.append('cat_mode', f.catMode); fd.append('categories', f.cats.join(','));
  fd.append('max_reviews', f.maxN); fd.append('method', f.method);
  S.loadingMeta = hasFile ? f.file.name : hasPaste ? 'Pasted reviews' : f.selected.replace(/\s*\(\d+\)\s*$/, '') + ' · App Store';
  S.kind = 'analyze';
  S.prog = {step: 0, pct: 0, notes: ['Starting', '', '', ''], steps: ['Loading models', 'Reading sentiment', 'Sorting complaints', 'Writing summary']};
  go('loading');
  try {
    const r = await fetch('/api/analyze', {method: 'POST', body: fd});
    const d = await r.json();
    if (!r.ok) { S.error = d.error || {title: 'Something went wrong', message: 'The server refused this request.'}; return go('error'); }
    S.jobId = d.job; pollJob(d.job);
  } catch (e) {
    S.error = {title: 'Could not reach the server', message: 'Check your connection and try again.'}; go('error');
  }
}

function pollJob(id) {
  clearTimeout(S.poll);
  const tick = async () => {
    if (S.jobId !== id) return;
    try {
      const d = await (await fetch('/api/jobs/' + id)).json();
      if (S.jobId !== id) return;
      if (d.status === 'done' && d.result && d.result.kind === 'compare') { S.cres = d.result; return go('cresults'); }
      if (d.status === 'done') { S.result = d.result; S.tbl = {filter: 'all', q: '', page: 1}; return go('results'); }
      if (d.status === 'error') { S.error = d.error; return go('error'); }
      S.prog = {step: d.step, pct: d.pct, notes: d.notes, steps: d.steps};
      const el = $('#prog'); if (el) el.innerHTML = progInner();
    } catch (e) { /* network hiccup: try again */ }
    S.poll = setTimeout(tick, 800);
  };
  S.poll = setTimeout(tick, 400);
}

/* ---------------------------------------------------------------- loading */
function progInner() {
  const p = S.prog, names = p.steps.length ? p.steps : ['Loading models', 'Reading sentiment', 'Sorting complaints', 'Writing summary'];
  const steps = names.map((n, i) => {
    const st = i < p.step ? 'done' : i === p.step ? 'active' : 'todo';
    const ico = st === 'done' ? '<span class="step-ic done">' + ic('check', 's16') + '</span>'
      : st === 'active' ? '<span class="step-ic" style="color:var(--accent)">' + spinner('s24') + '</span>'
      : '<span class="step-ic todo">' + (i + 1) + '</span>';
    const note = st === 'todo' ? 'Waiting' : (p.notes[i] || (st === 'done' ? 'Done' : 'Working'));
    return '<li class="step ' + st + '">' + ico + '<span style="display:flex;flex-direction:column;gap:2px"><span class="step-t">' + esc(n) + '</span><span class="sub">' + esc(note) + '</span></span></li>';
  }).join('');
  return '<div class="prog-top"><h2>' + esc(names[Math.min(p.step, 3)]) + '…</h2><span class="mono" style="font-size:15px;color:var(--accent-dark)">' + p.pct + '%</span></div>' +
    '<div class="bar" role="progressbar" aria-label="Analysis progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '"><div style="width:' + p.pct + '%"></div></div>' +
    '<ol class="steps">' + steps + '</ol>' +
    '<p class="sub" style="display:flex;align-items:center;gap:8px">' + ic('info', 's16') + 'The first run takes longer while the models download. Keep this tab open.</p>';
}

function viewLoading() {
  const skel = (w) => '<div class="skel pulse" style="height:112px"><i style="width:40%"></i><i style="width:30%;height:28px"></i></div>';
  const skelBig = '<div class="skel pulse" style="flex:1 1 420px;height:320px"><i style="width:45%"></i><i style="width:90%;height:18px"></i><i style="width:72%;height:18px"></i><i style="width:60%;height:18px"></i><i style="width:44%;height:18px"></i><i style="width:30%;height:18px"></i></div>';
  return '<div class="head-row"><div class="head-col"><h1>' + (S.kind === 'compare' ? 'Comparing apps' : 'Analyzing reviews') + '</h1><div class="meta"><span>' + ic('file', 's16') + esc(S.loadingMeta) + '</span><span aria-hidden="true">·</span><span>' +
    (S.kind === 'compare' ? 'Same categories for both apps' : METHOD_LABEL[S.form.method] + ' summary') + '</span></div></div><button type="button" class="btn" data-act="cancel">Cancel</button></div>' +
    '<section class="card" id="prog" aria-live="polite" style="padding:28px;gap:24px">' + progInner() + '</section>' +
    '<div aria-hidden="true" style="display:flex;flex-direction:column;gap:24px"><div class="skel-grid">' + skel() + skel() + skel() + '</div><div class="two">' + skelBig + skelBig + '</div></div>';
}

/* ---------------------------------------------------------------- error */
function viewError() {
  const e = S.error || {title: 'Something went wrong', message: 'Please try again.'};
  if (S.kind === 'compare') return '<h1>Compare apps</h1><section class="card errbox" role="alert" aria-labelledby="err-h">' + ILLUS_ERROR + '<h2 id="err-h">' + esc(e.title) + '</h2><p>' + esc(e.message) + '</p><div class="btns" style="justify-content:center;margin-top:8px"><button type="button" class="btn primary" data-act="to-compare">' + ic('scale', 's18') + 'Back to comparison</button></div></section>';
  return '<h1>Analyze a file</h1>' +
  '<section class="card errbox" role="alert" aria-labelledby="err-h">' + ILLUS_ERROR + '<h2 id="err-h">' + esc(e.title) + '</h2><p>' + esc(e.message) + '</p>' +
    '<div class="btns" style="justify-content:center;margin-top:8px"><button type="button" class="btn primary" data-act="to-form" data-focus="csv">' + ic('upload', 's18') + 'Choose another file</button>' +
    '<button type="button" class="btn" data-act="to-form" data-focus="paste">' + ic('clipboard', 's18') + 'Paste reviews instead</button></div></section>' +
  '<section class="card" aria-labelledby="tips-h" style="gap:14px"><h2 id="tips-h" class="with-ic" style="font-size:16px;line-height:22px">' + ic('info') + 'What a good file looks like</h2>' +
    '<div class="tips"><ul><li>Saved as .csv, UTF-8</li><li>A header row with a column called review, text or content</li><li>One review per row, in English</li><li>Optional columns: date, version, rating</li></ul>' +
    '<pre class="code">review,rating,date,version\n"Crashes when I upload a photo",1,2026-10-02,9.1.0\n"Love the new dark mode",5,2026-10-03,9.1.0</pre></div></section>';
}

/* ---------------------------------------------------------------- results */
function barList(items, o) {
  if (!items.length) return '<p class="sub">Nothing to show.</p>';
  const max = Math.max.apply(null, items.map((i) => i.v)) || 1;
  return '<ul class="bars ' + (o.cls || '') + '" style="--lw:' + (o.lw || 120) + 'px">' + items.map((i) =>
    '<li><span class="bl">' + esc(i.l) + '</span><span class="tr"><i style="width:' + Math.round(100 * i.v / max) + '%"></i></span><span class="bv mono">' + esc(i.t) + '</span></li>').join('') + '</ul>';
}

const SERIES_COLORS = ['#B4532F', '#2E5E7E', '#8A6A00'];
function lineChart(t) {
  const W = 600, H = 260, L = 36, R = 14, T = 12, B = 34;
  const n = t.labels.length, max = Math.max(1, Math.max.apply(null, [].concat.apply([], t.series.map((s) => s.values))));
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (W - L - R) * i / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  let g = '';
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const v = Math.round(top * f);
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(top * f) + '" y2="' + y(top * f) + '" stroke="#F3EADF"/><text x="' + (L - 8) + '" y="' + (y(top * f) + 4) + '" text-anchor="end" font-size="11" fill="#6B5E54">' + v + '</text>';
  });
  const step = Math.max(1, Math.ceil(n / 6));
  t.labels.forEach((lb, i) => { if (i % step === 0) g += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#6B5E54">' + esc(lb) + '</text>'; });
  const lines = t.series.map((s, k) => {
    const col = SERIES_COLORS[k % 3];
    const pts = s.values.map((v, i) => x(i) + ',' + y(v)).join(' ');
    return '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>' +
      s.values.map((v, i) => '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="#FFFDF9" stroke="' + col + '" stroke-width="2"><title>' + esc(s.name) + ', ' + esc(t.labels[i]) + ': ' + v + '</title></circle>').join('');
  }).join('');
  const legend = '<div class="legend">' + t.series.map((s, k) => '<span><i style="background:' + SERIES_COLORS[k % 3] + '"></i>' + esc(s.name) + '</span>').join('') + '</div>';
  return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;min-width:420px;height:auto" role="img" aria-label="Negative reviews per ' + t.unit + ' for the top complaints">' + g + lines + '</svg></div>' + legend;
}

function trendCell(tr) {
  if (!tr) return '';
  const m = {rising: ['up', 'up', 'Rising'], falling: ['down', 'down', 'Falling'], stable: ['minus', 'flat', 'Stable']}[tr];
  return '<span class="trend ' + m[1] + '" title="Share of negative reviews, newest half vs. oldest half">' + ic(m[0], 's16') + m[2] + '</span>';
}

function viewResults() {
  const r = S.result; if (!r) return viewForm();
  const c = r.counts;
  const catSub = r.category_mode === 'auto' ? 'Groups found automatically, named by their strongest words' : 'Matched to your categories';
  const meta = '<span>' + ic('file', 's16') + esc(r.source) + '</span><span aria-hidden="true">·</span><span>' + esc(r.method.split(' ')[0] === 'Pretrained' ? 'Pretrained summary' : r.method.split(' ')[0] + ' summary') + '</span>' +
    (r.n_categories ? '<span aria-hidden="true">·</span><span>' + r.n_categories + (r.category_mode === 'auto' ? (r.n_categories === 1 ? ' group' : ' groups') : (r.n_categories === 1 ? ' category' : ' categories')) + '</span>' : '');
  const notes = (r.notes || []).map((n) => '<div class="note" role="note">' + ic('warn', 's18') + '<span>' + esc(n) + '</span></div>').join('');

  const prio = r.priority.length ? (function () {
    const max = Math.max.apply(null, r.priority.map((p) => p.score)) || 1;
    return '<section class="card" aria-labelledby="p-h"><div class="head-col" style="gap:4px"><h2 id="p-h" class="with-ic">' + ic('flag') + 'What to fix first</h2>' +
      '<span class="sub">Score = number of negative reviews in the group × how clearly negative they are. A guide, not a decision.</span></div>' +
      '<ol class="prio">' + r.priority.map((p) => '<li><span class="rank mono">' + p.priority + '</span><span class="prio-name">' + esc(p.category) + '</span>' +
        '<span class="bars-col"><span class="tr" style="display:block;height:12px;border-radius:6px;background:var(--track);overflow:hidden"><i style="display:block;height:100%;border-radius:6px;background:var(--neg);width:' + Math.round(100 * p.score / max) + '%"></i></span></span>' +
        '<span class="prio-facts"><span class="mono">' + p.negative_reviews + ' reviews · ' + p.share + '%</span>' + (p.avg_stars != null ? '<span>' + p.avg_stars + ' avg stars</span>' : '') + trendCell(p.trend) + '</span></li>').join('') + '</ol></section>';
  })() : '';

  const wordsCard = '<section class="card" aria-labelledby="w-h"><div class="head-col" style="gap:4px"><h2 id="w-h" class="with-ic">' + ic('chart') + 'Top complaint words</h2><span class="sub">Negative reviews that mention each word</span></div>' +
    barList(r.words.map((w) => ({l: w.label, v: w.value, t: String(w.value)})), {lw: 104}) + '</section>';
  const catsCard = '<section class="card" aria-labelledby="c-h"><div class="head-col" style="gap:4px"><h2 id="c-h" class="with-ic">' + ic('tag') + 'Complaint categories</h2><span class="sub">Share of the ' + fmt(c.negative) + ' negative reviews. ' + catSub + '</span></div>' +
    barList(r.categories.map((k) => ({l: k.label, v: k.pct, t: k.pct + '%'})), {cls: 'neg', lw: 150}) + '</section>';

  let extra = '';
  if (r.timeline || r.versions) {
    extra = '<div class="two">' +
      (r.timeline ? '<section class="card" aria-labelledby="t-h"><div class="head-col" style="gap:4px"><h2 id="t-h" class="with-ic">' + ic('clock') + 'Complaints over time</h2><span class="sub">Negative reviews per ' + r.timeline.unit + ', top 3 groups</span></div>' + lineChart(r.timeline) + '</section>' : '') +
      (r.versions ? '<section class="card" aria-labelledby="v-h"><div class="head-col" style="gap:4px"><h2 id="v-h" class="with-ic">' + ic('layers') + 'By app version</h2><span class="sub">Share of negative reviews, oldest version first (versions with 15+ reviews)</span></div>' +
        barList(r.versions.map((v) => ({l: 'v' + v.version, v: v.pct, t: v.pct + '%'})), {cls: 'tan', lw: 90}) + '</section>' : '') + '</div>';
  }

  let summary = '';
  if (r.summary) {
    const un = r.summary.unsupported && r.summary.unsupported.length ? ' Words not found in any negative review: ' + r.summary.unsupported.map(esc).join(', ') + '.' : '';
    summary = '<section class="card" aria-labelledby="s-h" style="gap:16px"><div class="head-row" style="align-items:center"><h2 id="s-h" class="with-ic">' + ic('filelines') + 'What unhappy users say</h2><span class="pill">' + esc(r.method) + '</span></div>' +
      '<p class="summary-p">' + esc(r.summary.text) + '</p>' +
      '<div class="note" role="note">' + ic('warn', 's18') + '<span>' + (r.method.indexOf('Pretrained') === 0 ? 'AI summaries can invent details. Check the examples and the table below before you quote this.' : 'These are real sentences picked from the reviews, so nothing is invented. They may still miss other complaints.') + un + '</span></div></section>';
  }
  const report = r.report.length ? '<section class="card" aria-labelledby="d-h" style="gap:0"><h2 id="d-h" class="with-ic" style="margin-bottom:20px">' + ic('tag') + 'Complaints in detail</h2>' +
    r.report.map((g) => '<div class="rep"><div class="rep-h"><b>' + esc(g.category) + '</b><span class="tag">' + g.count + ' reviews · ' + g.pct + '% of negative</span></div>' +
      '<p style="font-size:15px;line-height:24px">' + esc(g.summary) + '</p>' +
      (g.unsupported && g.unsupported.length ? '<p class="sub">Words not found in these reviews: ' + g.unsupported.map(esc).join(', ') + '. Check the examples.</p>' : '') +
      '<span class="label" style="color:var(--muted)">Real examples</span><ul class="quotes">' + g.examples.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>').join('') + '</section>' : '';

  const tableCard = '<section class="card flush" aria-labelledby="tb-h"><div class="tbl-head"><h2 id="tb-h">All reviews</h2><div class="tbl-tools">' +
    '<div class="seg sm" role="group" aria-label="Filter by sentiment" id="flt">' + [['all', 'All'], ['negative', 'Negative'], ['positive', 'Positive']].map((x) =>
      '<button type="button" data-act="filter" data-val="' + x[0] + '" aria-pressed="' + (S.tbl.filter === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
    '<label for="q" class="sr">Search reviews</label><div class="search">' + ic('search', 's18') + '<input id="q" type="search" placeholder="Search reviews" data-bind="q" value="' + esc(S.tbl.q) + '"></div>' +
    '<a class="btn" href="/api/jobs/' + esc(S.jobId) + '/csv" download>' + ic('download', 's18') + 'Download CSV</a></div></div>' +
    '<div class="tbl-scroll"><table><thead><tr><th scope="col">Review</th><th scope="col">Sentiment</th><th scope="col">Confidence</th><th scope="col">Category</th></tr></thead><tbody id="tbody"></tbody></table></div>' +
    '<div class="tbl-foot" id="tfoot"></div></section>';

  return '<div class="head-row"><div class="head-col"><h1>Results</h1><div class="meta">' + meta + '</div></div>' +
    '<div class="btns"><button type="button" class="btn" data-act="to-form">' + ic('sliders', 's18') + 'Change settings</button>' +
    '<a class="btn primary" href="/api/jobs/' + esc(S.jobId) + '/csv" download>' + ic('download', 's18') + 'Download CSV</a></div></div>' + notes +
    '<section class="card" aria-label="Overview"><div class="stats">' +
      '<div class="stat"><span class="stat-l">' + ic('filecount', 's18') + 'Reviews analysed</span><span class="stat-v mono">' + fmt(c.analysed) + '</span><span class="sub">of ' + fmt(c.usable) + ' usable reviews (max ' + fmt(c.max) + '). ' + fmt(c.removed) + ' removed: too short, not English or duplicates.</span></div>' +
      '<div class="stat"><span class="stat-l" style="color:var(--neg-text)">' + ic('alertc', 's18') + 'Negative</span><span class="stat-v mono" style="color:var(--neg-text)">' + c.neg_pct + '%</span><span class="sub">' + fmt(c.negative) + ' reviews</span></div>' +
      '<div class="stat"><span class="stat-l" style="color:var(--pos-text)">' + ic('checkc', 's18') + 'Positive</span><span class="stat-v mono" style="color:var(--pos-text)">' + c.pos_pct + '%</span><span class="sub">' + fmt(c.positive) + ' reviews</span></div></div>' +
      '<div class="split" role="img" aria-label="' + c.neg_pct + ' percent negative, ' + c.pos_pct + ' percent positive"><div style="width:' + c.neg_pct + '%"></div><div></div></div></section>' +
    prio + '<div class="two">' + wordsCard + catsCard + '</div>' + extra + summary + report + tableCard;
}

function filteredRows() {
  const q = S.tbl.q.trim().toLowerCase(), f = S.tbl.filter;
  return S.result.rows.filter((r) => (f === 'all' || r.sentiment === f) && (!q || r.text.toLowerCase().indexOf(q) >= 0));
}

function updateTable() {
  const body = $('#tbody'); if (!body) return;
  const rows = filteredRows(), pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  S.tbl.page = Math.min(S.tbl.page, pages);
  const start = (S.tbl.page - 1) * PAGE_SIZE, slice = rows.slice(start, start + PAGE_SIZE);
  body.innerHTML = slice.length ? slice.map((r) => {
    const neg = r.sentiment === 'negative';
    const meta = [r.rating != null ? r.rating + ' of 5 stars' : '', r.date || '', r.version ? 'v' + r.version : ''].filter(Boolean).join(' · ');
    return '<tr><td>' + esc(r.text) + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</td>' +
      '<td style="white-space:nowrap"><span class="badge ' + (neg ? 'neg' : 'pos') + '">' + ic(neg ? 'alertc' : 'checkc', 's15') + (neg ? 'Negative' : 'Positive') + '</span></td>' +
      '<td class="mono" style="font-size:13px">' + Number(r.conf).toFixed(2) + '</td>' +
      '<td>' + (neg ? (r.category ? '<span class="tag">' + ic('tag', 's14') + esc(r.category) + '</span>' : '<span class="muted">Not grouped</span>') : '<span class="muted">Not needed</span>') + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="muted" style="padding:28px 24px">No reviews match.</td></tr>';
  let nums = [];
  for (let p = Math.max(1, S.tbl.page - 2); p <= Math.min(pages, Math.max(S.tbl.page - 2, 1) + 4); p++) nums.push(p);
  $('#tfoot').innerHTML = '<span>' + (rows.length ? 'Showing ' + (start + 1) + '–' + (start + slice.length) + ' of ' + fmt(rows.length) + ' reviews' : 'Showing 0 reviews') + '</span>' +
    '<nav class="pager" aria-label="Pages"><button type="button" aria-label="Previous page" data-act="page" data-val="' + (S.tbl.page - 1) + '"' + (S.tbl.page <= 1 ? ' disabled' : '') + '>' + ic('left', 's18') + '</button>' +
    nums.map((p) => '<button type="button" data-act="page" data-val="' + p + '"' + (p === S.tbl.page ? ' aria-current="page"' : '') + '>' + p + '</button>').join('') +
    '<button type="button" aria-label="Next page" data-act="page" data-val="' + (S.tbl.page + 1) + '"' + (S.tbl.page >= pages ? ' disabled' : '') + '>' + ic('right', 's18') + '</button></nav>';
  document.querySelectorAll('#flt button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === S.tbl.filter)));
}

/* ---------------------------------------------------------------- check one review */
function viewCheck() {
  const c = S.check, r = c.result;
  let result = '<section class="card" aria-labelledby="res-h" aria-live="polite"><h2 id="res-h">Result</h2><p class="muted" style="font-size:15px">' +
    (c.busy ? 'Reading the review…' : 'Type a review and press Check review. The result appears here.') + '</p>' + (c.err ? '<div class="note" role="alert">' + ic('warn', 's18') + '<span>' + esc(c.err) + '</span></div>' : '') + '</section>';
  if (r) {
    const neg = r.neg_pct >= 50;
    result = '<section class="card" aria-labelledby="res-h" aria-live="polite" style="gap:24px"><div class="head-row" style="align-items:center"><h2 id="res-h">Result</h2>' +
      '<span class="badge lg ' + (neg ? 'neg' : 'pos') + '">' + ic(neg ? 'alertc' : 'checkc') + (neg ? 'Negative' : 'Positive') + '</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;justify-content:space-between;font-size:14px;font-weight:500"><span style="color:var(--neg-text)">Negative <span class="mono">' + r.neg_pct + '%</span></span><span style="color:var(--pos-text)">Positive <span class="mono">' + r.pos_pct + '%</span></span></div>' +
      '<div class="big-bar" role="img" aria-label="' + r.neg_pct + ' percent negative, ' + r.pos_pct + ' percent positive"><div style="width:' + r.neg_pct + '%"></div><div></div></div>' +
      '<span class="sub">Probabilities from the sentiment model. Below 70% the review is likely mixed or unclear.</span></div>' +
      (neg ? '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding-top:20px;border-top:1px solid var(--line-soft)"><span class="muted" style="font-size:14px">Complaint category</span>' +
        '<span class="tag" style="height:30px;padding:0 12px;font-size:14px;font-weight:600;color:var(--text)">' + ic('tag', 's16') + esc(r.category || 'unclear') + '</span></div>'
        : '<p class="muted" style="padding-top:20px;border-top:1px solid var(--line-soft);display:flex;align-items:center;gap:8px;font-size:14px">' + ic('info', 's18') + 'Complaint categories are only shown for negative reviews.</p>') + '</section>';
  }
  return '<div class="head-col"><h1>Check one review</h1><p class="muted">Test a single review to see how the models read it.</p></div>' +
    '<section class="card" aria-labelledby="one-h" style="gap:16px"><label id="one-h" for="one" class="label" style="font-size:15px;font-weight:600">' + ic('chat').replace('class="ic ', 'class="ic ') + 'Review text</label>' +
    '<textarea id="one" rows="4" class="input" data-bind="checkText" placeholder="Type or paste one review in English" style="font-size:16px;line-height:24px">' + esc(c.text) + '</textarea>' +
    '<div class="head-row" style="align-items:center"><div class="ex"><span class="sub">Try an example:</span>' + EXAMPLES.map((e, i) => '<button type="button" data-act="example" data-i="' + i + '">' + esc(e.label) + '</button>').join('') + '</div>' +
    '<button type="button" class="btn primary big" data-act="check" style="font-size:16px;min-height:48px;padding:0 22px"' + (c.busy ? ' disabled' : '') + '>' + (c.busy ? spinner() : ic('checkc')) + 'Check review</button></div></section>' + result;
}

async function doCheck() {
  const c = S.check; c.err = '';
  if (c.text.trim().split(/\s+/).length < 2) { c.err = 'Type a review of at least two words.'; c.result = null; return render(); }
  c.busy = true; render();
  try {
    const r = await fetch('/api/check', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: c.text, categories: S.cfg.default_categories})});
    const d = await r.json();
    if (!r.ok) { c.err = d.error || 'Something went wrong.'; c.result = null; } else { c.result = d; }
  } catch (e) { c.err = 'Could not reach the server. Try again.'; c.result = null; }
  c.busy = false; render();
}

/* ---------------------------------------------------------------- about */
function viewAbout() {
  const w = (t) => '<li>' + ic('warn') + '<span>' + t + '</span></li>';
  const how = [['01', 'Read sentiment', 'Each review is labelled positive or negative, with a confidence score.'],
    ['02', 'Group complaints', 'Negative reviews are grouped automatically, or matched to the categories you type.'],
    ['03', 'Rank and track', 'Groups are ranked by what to fix first, and tracked over time and by app version when dates exist.'],
    ['04', 'Summarize', 'The negative reviews are condensed into a short paragraph, overall and per group, with real examples.']];
  const model = (icon, name, body) => '<div class="r"><dt>' + ic(icon) + name + '</dt><dd>' + body + '</dd></div>';
  const cfg = S.cfg;
  return '<div class="head-col"><h1>About</h1><p style="line-height:26px;color:var(--text2)">App Reviews Analyzer reads hundreds of app reviews for you and shows what unhappy users complain about most. It works with reviews from any app. Built as a student project for the NLP From Zero workshop by GDG on Campus PNU.</p></div>' +
  '<section class="stack" aria-labelledby="how-h"><h2 class="sec" id="how-h">How it works</h2><ol class="how">' + how.map((h) => '<li><span class="n mono">' + h[0] + '</span><b>' + h[1] + '</b><span class="d">' + h[2] + '</span></li>').join('') + '</ol></section>' +
  '<section class="stack" aria-labelledby="mod-h"><h2 class="sec" id="mod-h">Models used</h2><div class="models"><dl style="margin:0">' +
    model('checkc', 'Sentiment', '<code>distilbert-base-uncased-finetuned-sst-2-english</code> pretrained transformer, English (learned from movie reviews)') +
    model('tag', 'Complaint groups', 'Auto-detect: TF-IDF word weights and KMeans, groups named by their strongest words. Your own list: <code>facebook/bart-large-mnli</code> matches reviews to any labels you type') +
    model('filelines', 'Summary, Pretrained', '<code>facebook/bart-large-cnn</code> writes new sentences (learned from news articles)') +
    model('chart', 'Summary, TF-IDF and BoW', 'Classic word statistics. They pick real sentences from the reviews, so they never invent text.') +
  '</dl></div></section>' +
  '<section class="stack" aria-labelledby="lim-h"><h2 class="sec" id="lim-h">Limits</h2><ul class="limits">' +
    w('<strong>English only.</strong> Reviews in other languages, including Arabic, get unreliable results.') +
    w('<strong>Pretrained models make mistakes.</strong> Sarcasm, mixed reviews and slang are often misread. Check some rows of the table by hand.') +
    w('<strong>AI summaries can invent details.</strong> Always check them against the examples and the review table.') +
    w('<strong>Automatic group names are just frequent words.</strong> Read the real examples before you trust a name.') +
    '<li class="plain">' + ic('info') + '<span>App Store gives the latest ~500 reviews per country, which for a popular app can cover only a few days. Use a CSV with dates for longer periods. Up to 1,000 reviews per run.</span></li></ul></section>' +
  '<section class="card" aria-labelledby="cr-h" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px"><div class="head-col" style="gap:4px"><h2 id="cr-h" style="font-size:16px;line-height:22px">NLP From Zero, GDG on Campus PNU</h2>' +
    (cfg.built_by ? '<span class="sub" style="font-size:14px;line-height:20px">Built by ' + esc(cfg.built_by) + '</span>' : '') + '</div>' +
    (cfg.github_url ? '<a class="btn" href="' + esc(cfg.github_url) + '" rel="noopener">' + ic('code', 's18') + 'View source code</a>' : '') + '</section>';
}

/* ---------------------------------------------------------------- compare two apps */
const cleanName = (a) => a.replace(/\s*\(\d+\)\s*$/, '');
const COLOR_A = '#B4532F', COLOR_B = '#2E5E7E';

function slotBlock(k) {
  const sl = S.cmp.slots[k], tag = k.toUpperCase();
  const list = sl.apps.length ? '<div class="applist" role="group" aria-label="Matching apps for app ' + tag + '">' + sl.apps.map((a) =>
    '<button type="button" class="appopt" data-act="cpick" data-slot="' + k + '" data-val="' + esc(a) + '" aria-pressed="' + (a === sl.selected) + '">' + ic('bag', 's18') + '<span>' + esc(cleanName(a)) + '</span></button>').join('') + '</div>' : '';
  return '<section class="card slot" aria-labelledby="slot-' + k + '"><h2 id="slot-' + k + '" class="with-ic"><span class="dot" style="background:' + (k === 'a' ? COLOR_A : COLOR_B) + '"></span>App ' + tag + '</h2>' +
    '<div class="appfind"><input id="cmp-name-' + k + '" class="input" type="text" placeholder="' + (k === 'a' ? 'e.g. Spotify' : 'e.g. Apple Music') + '" aria-label="App ' + tag + ' name" data-bind="cname" data-slot="' + k + '" value="' + esc(sl.name) + '">' +
    '<button type="button" class="btn" data-act="csearch" data-slot="' + k + '"' + (sl.busy ? ' disabled' : '') + '>' + (sl.busy ? spinner('s18') : ic('search', 's18')) + 'Find app</button></div>' +
    (sl.msg ? '<span class="sub" role="status">' + esc(sl.msg) + '</span>' : '') + list + '</section>';
}

function viewCompare() {
  const c = S.cmp;
  const chips = '<div class="chips">' + c.cats.map((x, i) => '<span class="chip">' + esc(x) + '<button type="button" data-act="crm-cat" data-i="' + i + '" aria-label="Remove ' + esc(x) + '">' + ic('x', 's14') + '</button></span>').join('') +
    '<input id="ccat-add" type="text" placeholder="Add a category" aria-label="Add a category"></div>';
  return '<div class="head-col"><h1>Compare apps</h1><p class="muted" style="max-width:680px">Pick two App Store apps. Both are read the same way and their complaints are sorted into the same categories, so you can see where one app is worse than the other.</p></div>' +
  '<div class="two">' + slotBlock('a') + slotBlock('b') + '</div>' +
  '<section class="card" aria-labelledby="cs-h" style="gap:22px"><h2 id="cs-h" class="with-ic">' + ic('sliders') + 'Settings</h2>' +
    '<div class="field"><label class="label" for="ccountry">' + ic('bag', 's18') + 'App Store country</label><select id="ccountry" class="select" data-bind="ccountry" style="max-width:260px">' +
      S.cfg.countries.map((x) => '<option' + (x === c.country ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>' +
    '<div class="field" style="gap:10px"><span class="label">' + ic('tag', 's18') + 'Complaint categories (shared by both apps)</span>' + chips + '<span class="sub">Press Enter to add. At least two. Using the same list is what makes the numbers comparable.</span></div>' +
    '<div class="field" style="gap:10px"><div class="rng-row"><label for="cmax" class="label" style="font-weight:500">Reviews per app</label><output class="mono" id="cmax-o" style="font-size:15px;color:var(--accent-dark)">' + c.maxN + '</output></div>' +
      '<input id="cmax" type="range" min="50" max="500" step="50" value="' + c.maxN + '" data-bind="cmax"><div class="rng-ends"><span>50</span><span>500</span></div></div>' +
    '<button type="button" class="btn primary big" data-act="compare" style="align-self:flex-start">' + ic('scale') + 'Compare</button></section>';
}

async function csearch(k) {
  const sl = S.cmp.slots[k];
  if (!sl.name.trim()) { sl.msg = 'Type an app name first.'; sl.apps = []; return render(); }
  sl.busy = true; render();
  try {
    const d = await (await fetch('/api/search', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: sl.name, country: S.cmp.country})})).json();
    sl.apps = d.apps || []; sl.selected = sl.apps[0] || ''; sl.msg = d.message || '';
  } catch (e) { sl.apps = []; sl.msg = 'Could not reach the server. Try again.'; }
  sl.busy = false; render();
}

async function startCompare() {
  const c = S.cmp, a = c.slots.a.selected, b = c.slots.b.selected;
  S.kind = 'compare';
  if (!a || !b) { S.error = {title: 'Pick two apps', message: 'Find app A and app B, pick one from each list, then press Compare.'}; return go('error'); }
  S.loadingMeta = cleanName(a) + ' vs ' + cleanName(b);
  S.prog = {step: 0, pct: 0, notes: ['Starting', '', '', ''], steps: ['Getting reviews', 'Reading sentiment', 'Sorting complaints', 'Comparing']};
  go('loading');
  try {
    const r = await fetch('/api/compare', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({app_a: a, app_b: b, country: c.country, categories: c.cats, max_reviews: c.maxN})});
    const d = await r.json();
    if (!r.ok) { S.error = d.error || {title: 'Something went wrong', message: 'The server refused this request.'}; return go('error'); }
    S.jobId = d.job; pollJob(d.job);
  } catch (e) { S.error = {title: 'Could not reach the server', message: 'Check your connection and try again.'}; go('error'); }
}

function viewCompareResults() {
  const r = S.cres; if (!r) return viewCompare();
  const [A, B] = r.apps;
  const card = (x, col) => {
    const per = x.period ? x.period.from + ' to ' + x.period.to + ' (' + x.period.days + ' days)' : 'No dates in these reviews';
    return '<section class="card" style="gap:16px;border-top:4px solid ' + col + '"><h2 style="font-size:20px;line-height:26px">' + esc(x.name) + '</h2>' +
      '<div class="stat"><span class="stat-l">Negative reviews</span><span class="stat-v serif" style="color:var(--neg-text)">' + x.neg_pct + '%</span></div>' +
      '<dl class="kv"><div><dt>Average stars</dt><dd class="mono">' + (x.avg_stars == null ? 'n/a' : x.avg_stars + ' of 5') + '</dd></div>' +
      '<div><dt>Reviews analysed</dt><dd class="mono">' + fmt(x.n) + '</dd></div>' +
      '<div><dt>Period covered</dt><dd>' + esc(per) + '</dd></div></dl></section>';
  };
  const max = Math.max.apply(null, r.rows.map((x) => Math.max(x.a, x.b)).concat([1]));
  const rows = r.rows.map((x) =>
    '<li class="cmp-row"><div class="cmp-top"><span class="bl">' + esc(x.label) + '</span>' + (x.clear ? '<span class="badge neg">Clear difference</span>' : '') + '</div>' +
    '<div class="cmp-bars"><span class="tr"><i style="width:' + Math.round(100 * x.a / max) + '%;background:' + COLOR_A + '"></i></span><span class="bv mono">' + x.a + '%</span>' +
    '<span class="tr"><i style="width:' + Math.round(100 * x.b / max) + '%;background:' + COLOR_B + '"></i></span><span class="bv mono">' + x.b + '%</span></div></li>').join('');
  const words = (x, col) => '<section class="card" style="gap:14px"><h3 style="font-size:16px">Top complaint words, ' + esc(x.name) + '</h3>' +
    barList(x.words.map((w) => ({l: w.label, v: w.value, t: String(w.value)})), {lw: 110}) + '</section>';
  const ex = (x) => '<section class="card" style="gap:12px"><h3 style="font-size:16px">What unhappy users of ' + esc(x.name) + ' say</h3>' +
    (x.examples.length ? '<ul class="quotes">' + x.examples.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' : '<p class="sub">No negative reviews.</p>') + '</section>';
  return '<div class="head-row"><div class="head-col"><h1>' + esc(A.name) + ' vs ' + esc(B.name) + '</h1><div class="meta"><span>' + ic('bag', 's16') + 'App Store · ' + esc(r.country) + '</span></div></div>' +
    '<button type="button" class="btn" data-act="to-compare">' + ic('scale', 's18') + 'New comparison</button></div>' +
  '<section class="card" aria-labelledby="ov-h" style="gap:10px"><h2 id="ov-h" class="with-ic">' + ic('info') + 'Overall</h2><p style="font-size:16px;line-height:24px">' + esc(r.overall.text) + '</p></section>' +
  '<div class="two">' + card(A, COLOR_A) + card(B, COLOR_B) + '</div>' +
  '<section class="card" aria-labelledby="cat-h" style="gap:18px"><h2 id="cat-h">Complaints by category</h2>' +
    '<p class="sub">Share of each app\'s negative reviews. ' + A.n_cat + ' complaints sorted for ' + esc(A.name) + ', ' + B.n_cat + ' for ' + esc(B.name) + '.</p>' +
    '<div class="legend"><span><i style="background:' + COLOR_A + '"></i>' + esc(A.name) + '</span><span><i style="background:' + COLOR_B + '"></i>' + esc(B.name) + '</span></div>' +
    '<ul class="cmp-list">' + rows + '</ul>' +
    '<div class="find"><h3 style="font-size:15px">What stands out</h3><ul>' + r.findings.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul></div></section>' +
  '<div class="two">' + words(A) + words(B) + '</div><div class="two">' + ex(A) + ex(B) + '</div>' +
  '<section class="card" aria-labelledby="fair-h" style="gap:12px"><h2 id="fair-h" class="with-ic">' + ic('warn') + 'Read this before you conclude anything</h2>' +
    '<ul class="limits">' + r.notes.map((n) => '<li class="plain">' + ic('info') + '<span>' + esc(n) + '</span></li>').join('') +
    '<li class="plain">' + ic('info') + '<span>These are the latest public reviews only, and unhappy people write more reviews than happy ones. Pretrained models also misread sarcasm. Treat the numbers as a guide, not a ranking.</span></li></ul></section>';
}

/* ---------------------------------------------------------------- events */
const main = $('#main');

main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, v = t.dataset.val, f = S.form;
  if (a === 'search') doSearch();
  else if (a === 'pick-app') { f.selected = v; render(); }
  else if (a === 'remove-file') { f.file = null; render(); }
  else if (a === 'catmode') { f.catMode = v; render(); }
  else if (a === 'rm-cat') { f.cats.splice(Number(t.dataset.i), 1); render(); }
  else if (a === 'method') { f.method = v; render(); }
  else if (a === 'analyze') startAnalyze();
  else if (a === 'cancel') { S.jobId = null; clearTimeout(S.poll); go(S.kind === 'compare' ? 'compare' : 'form'); }
  else if (a === 'to-form') { go('form'); const el = $('#' + (t.dataset.focus || 'app-name')); if (el && t.dataset.focus === 'paste') el.focus(); else if (el && t.dataset.focus === 'csv') { const dz = $('#dz'); if (dz) dz.scrollIntoView({block: 'center'}); } }
  else if (a === 'filter') { S.tbl.filter = v; S.tbl.page = 1; updateTable(); }
  else if (a === 'page') { S.tbl.page = Number(v); updateTable(); $('#tbody').closest('section').scrollIntoView({block: 'start'}); }
  else if (a === 'example') { S.check.text = EXAMPLES[Number(t.dataset.i)].text; S.check.result = null; S.check.err = ''; render(); }
  else if (a === 'check') doCheck();
  else if (a === 'csearch') csearch(t.dataset.slot);
  else if (a === 'cpick') { S.cmp.slots[t.dataset.slot].selected = v; render(); }
  else if (a === 'crm-cat') { S.cmp.cats.splice(Number(t.dataset.i), 1); render(); }
  else if (a === 'compare') startCompare();
  else if (a === 'to-compare') go('compare');
});

main.addEventListener('input', (e) => {
  const b = e.target.dataset.bind; if (!b) return;
  const f = S.form;
  if (b === 'appName') f.appName = e.target.value;
  else if (b === 'pasted') { f.pasted = e.target.value; const el = $('#paste-count'); if (el) el.textContent = countLines(f.pasted) + ' reviews detected'; }
  else if (b === 'maxN') { f.maxN = Number(e.target.value); const o = $('#max-o'); if (o) o.textContent = f.maxN; }
  else if (b === 'q') { S.tbl.q = e.target.value; S.tbl.page = 1; updateTable(); }
  else if (b === 'checkText') S.check.text = e.target.value;
  else if (b === 'cname') S.cmp.slots[e.target.dataset.slot].name = e.target.value;
  else if (b === 'cmax') { S.cmp.maxN = Number(e.target.value); const o = $('#cmax-o'); if (o) o.textContent = S.cmp.maxN; }
});

main.addEventListener('change', (e) => {
  const b = e.target.dataset.bind; if (!b) return;
  if (b === 'ccountry') { S.cmp.country = e.target.value; ['a', 'b'].forEach((k) => { Object.assign(S.cmp.slots[k], {apps: [], selected: '', msg: ''}); }); render(); }
  else if (b === 'country') { S.form.country = e.target.value; S.form.apps = []; S.form.selected = ''; S.form.searchMsg = ''; render(); }
  else if (b === 'file') { const file = e.target.files && e.target.files[0]; if (file) { S.form.file = file; render(); } }
});

main.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'app-name') { e.preventDefault(); doSearch(); }
  else if (e.target.id === 'cmp-name-a' || e.target.id === 'cmp-name-b') { e.preventDefault(); csearch(e.target.id.slice(-1)); }
  else if (e.target.id === 'ccat-add') {
    e.preventDefault();
    e.target.value.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => { if (S.cmp.cats.indexOf(s) < 0) S.cmp.cats.push(s); });
    render(); const el = $('#ccat-add'); if (el) el.focus();
  }
  else if (e.target.id === 'cat-add') {
    e.preventDefault();
    e.target.value.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => { if (S.form.cats.indexOf(s) < 0) S.form.cats.push(s); });
    render(); const el = $('#cat-add'); if (el) el.focus();
  }
});

main.addEventListener('dragover', (e) => { const z = e.target.closest('.dropzone'); if (z) { e.preventDefault(); z.classList.add('over'); } });
main.addEventListener('dragleave', (e) => { const z = e.target.closest('.dropzone'); if (z) z.classList.remove('over'); });
main.addEventListener('drop', (e) => {
  const z = e.target.closest('.dropzone'); if (!z) return;
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) { S.form.file = file; render(); }
});

$('#nav').addEventListener('click', (e) => {
  const a = e.target.closest('[data-nav]'); if (!a) return;
  e.preventDefault();
  const id = a.dataset.nav;
  go(id === 'form' && S.result && S.view === 'results' ? 'form' : id);
});
$('.brand').addEventListener('click', (e) => { e.preventDefault(); go('form'); });
window.addEventListener('popstate', () => {
  const h = location.hash;
  S.view = h === '#/check' ? 'check' : h === '#/about' ? 'about' : h === '#/compare' ? 'compare' : h === '#/comparison' && S.cres ? 'cresults' : h === '#/results' && S.result ? 'results' : 'form';
  render();
});

/* ---------------------------------------------------------------- start */
(async function init() {
  try { Object.assign(S.cfg, await (await fetch('/api/config')).json()); } catch (e) { /* keep defaults */ }
  S.form.cats = S.cfg.default_categories.slice();
  const h = location.hash;
  S.cmp.cats = S.cfg.default_categories.slice();
  S.view = h === '#/check' ? 'check' : h === '#/about' ? 'about' : h === '#/compare' ? 'compare' : 'form';
  render();
})();
})();
