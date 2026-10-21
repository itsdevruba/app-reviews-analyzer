"""App Reviews Analyzer: a small web tool.

Upload a CSV of app reviews (or paste reviews) and get:
  1. how many reviews are positive / negative,
  2. what the unhappy users complain about (top words and phrases + complaint categories),
  3. a short summary of the negative reviews,
  4. a table you can download.

Only pretrained models are used (inference only, no training):
  sentiment  distilbert-base-uncased-finetuned-sst-2-english
  summary    facebook/bart-large-cnn
  categories facebook/bart-large-mnli (zero-shot)
Run:  python app.py
"""
import json
import os
import re
import tempfile
import urllib.parse
import urllib.request
from collections import Counter

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.ticker import MaxNLocator
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

import gradio as gr

# ----------------------------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------------------------
DEFAULT_CATEGORIES = ["ads", "price and subscription", "bugs and crashes", "playlists and library",
                      "sound quality and features", "account and login"]
ZS_MIN = 0.40            # below this confidence a review is shown as "unclear"
MAX_CATEGORY_REVIEWS = 100   # zero-shot is the slowest step, so only the first N negative reviews get a category
TEXT_NAMES = ["review", "content", "text", "review_text", "body", "comment", "comments", "feedback"]
GENERIC = {"app", "apps", "use", "get", "go", "make", "even", "also", "really", "just", "like", "one",
           "would", "say", "still", "every", "much", "way", "thing", "please", "fix", "time", "want"}

# ----------------------------------------------------------------------------------------
# Text helpers (Day 1: clean -> tokenize -> stopwords -> lemmatize)
# ----------------------------------------------------------------------------------------
try:
    import nltk
    for _pkg in ("stopwords", "wordnet", "omw-1.4"):
        nltk.download(_pkg, quiet=True)
    from nltk.corpus import stopwords as _sw
    from nltk.stem import WordNetLemmatizer
    EN_STOP = set(_sw.words("english"))
    _lem = WordNetLemmatizer()
    _lem.lemmatize("tests")                       # fails here if the wordnet data is missing

    def lemma(w):
        return _lem.lemmatize(_lem.lemmatize(_lem.lemmatize(w, "v"), "n"), "a")
except Exception:                                  # no internet for NLTK data: simple fallback
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
    EN_STOP = set(ENGLISH_STOP_WORDS)

    def lemma(w):
        for suf in ("ing", "ed", "s"):
            if w.endswith(suf) and len(w) - len(suf) >= 3:
                return w[: -len(suf)]
        return w

NEGATIONS = {"no", "not", "nor", "never", "neither"}
STOP_KEEP_NEG = EN_STOP - NEGATIONS      # slide 4: removing "not" flips the meaning, so we keep it

OTHER_LANG = set("""que de la el es en un una los las por con para pero muy se ya como mas esta este gusta nada
solo todo bien tiene hay não nao uma muito está com mais je le les des est pas pour très mais und der die das
nicht ist ich ein yang dan tidak ini itu dengan untuk saya bir çok ve bu için che di il non per
nie na można jest się jak ale tak dlaczego poprzez jedno jej moich het een niet ook voor""".split())


def looks_english(text):
    """Rough language guess without extra libraries (common words of other languages vs English stopwords)."""
    words = re.findall(r"[^\W\d_]+", text.lower())
    if len(words) < 4:
        return True
    foreign = sum(w in OTHER_LANG for w in words)
    english = sum(w in EN_STOP for w in words)
    return not (foreign >= 2 and foreign > english)


def clean(text):
    text = str(text).replace("’", "'").lower()
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)
    text = text.replace("can't", "can not").replace("cannot", "can not").replace("won't", "will not")
    text = re.sub(r"n't\b", " not", text)
    text = re.sub(r"'(s|ve|re|ll|d|m)\b", "", text)
    text = re.sub(r"[^a-z\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def preprocess(text, stop_mode="keep_neg", lemmatize=True):
    toks = [t for t in clean(text).split() if len(t) > 1]
    if stop_mode == "all":
        toks = [t for t in toks if t not in EN_STOP]
    elif stop_mode == "keep_neg":
        toks = [t for t in toks if t not in STOP_KEEP_NEG]
    return [lemma(t) for t in toks] if lemmatize else toks


# ----------------------------------------------------------------------------------------
# Day 2: extractive summaries (BoW and TF-IDF sentence scores, as in the slides)
# ----------------------------------------------------------------------------------------
def split_sentences(texts, min_words=5, max_words=30):
    sentences = []
    for t in texts:
        for s in re.split(r"(?<=[.!?])\s+|\n+", str(t).strip()):
            s = s.strip()
            if (min_words <= len(s.split()) <= max_words and looks_english(s)
                    and len(set(preprocess(s, "all", False))) >= 4):
                sentences.append(s)
    return list(dict.fromkeys(sentences))


def bow_scores(sentences):
    toks = [preprocess(s, "all") for s in sentences]
    article = Counter(t for ts in toks for t in ts)
    return [sum(c * article[w] for w, c in Counter(ts).items()) for ts in toks]


def tfidf_scores(sentences):
    toks = [preprocess(s, "all") for s in sentences]
    M = TfidfVectorizer(analyzer=lambda ts: ts, norm=None, smooth_idf=True).fit_transform(toks)
    sums = np.asarray(M.sum(axis=1)).ravel()
    nonzero = np.diff(M.indptr)
    return list(np.divide(sums, nonzero, out=np.zeros_like(sums), where=nonzero > 0))


def extractive_summary(sentences, scorer, k=3):
    if not sentences:
        return []
    scores = scorer(sentences)
    best = sorted(range(len(sentences)), key=lambda i: -scores[i])[:k]
    return [sentences[i] for i in sorted(best)]


def representative_sentences(sentences, k=12):
    """Sentences closest to the average complaint; they are the input of the abstractive model."""
    if len(sentences) <= k:
        return sentences
    try:
        M = TfidfVectorizer(stop_words="english", min_df=2).fit_transform(sentences)
        centroid = np.asarray(M.mean(axis=0)).ravel()
        sims = np.asarray(M @ centroid).ravel()
        return [sentences[i] for i in sorted(np.argsort(-sims)[:k])]
    except ValueError:                              # vocabulary too small for min_df=2
        return sentences[:k]


def unsupported_words(summary, source_texts):
    """Words in the summary that never appear in the source reviews (possible invention)."""
    source = {w for t in source_texts for w in preprocess(t, "all")}
    return sorted({w for w in preprocess(summary, "all") if w not in source})


# ----------------------------------------------------------------------------------------
# Day 3: pretrained models (loaded once, on first use)
# ----------------------------------------------------------------------------------------
_MODELS = None


def load_models():
    import torch
    from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM

    device = 0 if torch.cuda.is_available() else -1
    print("Running on", "GPU" if device == 0 else "CPU (slower)")
    sent_pipe = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english", device=device)

    def sentiment(texts):
        out = sent_pipe(list(texts), truncation=True, max_length=256, batch_size=32)
        return [(r["label"].lower(), float(r["score"])) for r in out]

    sum_name = os.environ.get("SUMMARY_MODEL", "facebook/bart-large-cnn")   # lighter: sshleifer/distilbart-cnn-12-6
    sum_tok = AutoTokenizer.from_pretrained(sum_name)
    sum_model = AutoModelForSeq2SeqLM.from_pretrained(sum_name).to("cuda" if device == 0 else "cpu")

    def summarize(text, max_new_tokens=90, min_new_tokens=30):
        enc = sum_tok(text, truncation=True, max_length=1024, return_tensors="pt").to(sum_model.device)
        ids = sum_model.generate(**enc, num_beams=4, max_new_tokens=max_new_tokens,
                                 min_new_tokens=min_new_tokens, no_repeat_ngram_size=3)
        return sum_tok.decode(ids[0], skip_special_tokens=True)

    zs_pipe = pipeline("zero-shot-classification", model="facebook/bart-large-mnli", device=device)

    def zero_shot(texts, labels, template="This review is about {}."):
        res = zs_pipe(list(texts), candidate_labels=list(labels), hypothesis_template=template, batch_size=8)
        if isinstance(res, dict):
            res = [res]
        return [(r["labels"], r["scores"]) for r in res]

    return sentiment, summarize, zero_shot


def get_models():
    global _MODELS
    if _MODELS is None:
        _MODELS = load_models()
    return _MODELS


# ----------------------------------------------------------------------------------------
# Reading the user's input
# ----------------------------------------------------------------------------------------
DATE_NAMES = ["date", "updated", "time_submitted", "at", "created", "created_at", "review_date", "timestamp"]
VERSION_NAMES = ["version", "app_version", "appversion", "review_created_version"]
RATING_NAMES = ["rating", "score", "stars", "star_rating"]
COLUMNS = ["review", "date", "version", "rating"]
COUNTRIES = {"United States": "us", "Saudi Arabia": "sa", "United Kingdom": "gb", "United Arab Emirates": "ae",
             "Canada": "ca", "Australia": "au"}
CAT_AUTO = "Auto-detect from the reviews"
CAT_OWN = "Use my own list"


def _find(columns, names):
    lowered = {str(c).lower().strip(): c for c in columns}
    return next((lowered[n] for n in names if n in lowered), None)


def _frame(review, date=None, version=None, rating=None):
    n = len(review)
    return pd.DataFrame({
        "review": list(review),
        "date": pd.to_datetime(date if date is not None else [pd.NaT] * n, utc=True, errors="coerce")
                  .tz_convert(None) if n else pd.to_datetime([]),
        "version": list(version) if version is not None else [None] * n,
        "rating": pd.to_numeric(rating if rating is not None else [np.nan] * n, errors="coerce"),
    })


def read_reviews(file, pasted):
    """A DataFrame with review, date, version, rating (the last three can be empty).
    Comes from an uploaded CSV and/or pasted text (one review per line)."""
    parts = []
    if file is not None:
        path = file if isinstance(file, str) else getattr(file, "name", str(file))
        try:
            raw = pd.read_csv(path)
        except UnicodeDecodeError:
            raw = pd.read_csv(path, encoding="latin-1")
        col = _find(raw.columns, TEXT_NAMES)
        if col is None:                              # fall back: the text column with the longest values
            obj = [c for c in raw.columns if raw[c].dtype == object]
            if not obj:
                raise ValueError("I could not find a column with review text in this file.")
            col = max(obj, key=lambda c: raw[c].dropna().astype(str).str.len().mean())
        raw = raw[raw[col].notna()].reset_index(drop=True)
        d, v, r = (_find(raw.columns, n) for n in (DATE_NAMES, VERSION_NAMES, RATING_NAMES))
        parts.append(_frame(raw[col].astype(str), raw[d] if d else None,
                            raw[v].astype(str) if v else None, raw[r] if r else None))
    if pasted and pasted.strip():
        parts.append(_frame([line.strip() for line in pasted.splitlines() if line.strip()]))
    return pd.concat(parts, ignore_index=True) if parts else _frame([])


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (App Reviews Analyzer)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def search_apps(name, country_name):
    """Look an app up in the App Store by name. Returns up to 5 'Name (id)' choices."""
    if not name or not name.strip():
        return gr.update(choices=[], value=None), "Type an app name first."
    cc = COUNTRIES.get(country_name, "us")
    try:
        data = _get_json("https://itunes.apple.com/search?" + urllib.parse.urlencode(
            {"term": name.strip(), "entity": "software", "country": cc, "limit": 5}))
    except Exception as e:
        return gr.update(choices=[], value=None), f"Could not reach the App Store: {repr(e)[:150]}"
    found = [f"{r['trackName']} ({r['trackId']})" for r in data.get("results", [])]
    if not found:
        return gr.update(choices=[], value=None), "No app found with that name in this country's App Store."
    return gr.update(choices=found, value=found[0]), f"Found {len(found)} app(s). Pick the right one, then press Analyze."


def fetch_store_reviews(choice, country_name, pages=10):
    """Latest public App Store reviews of one app, with date, app version and stars
    (50 per page, Apple allows 10 pages per country)."""
    m = re.search(r"\((\d+)\)\s*$", choice or "")
    if not m:
        raise ValueError("Pick an app from the list first (type its name and press Find app).")
    cc = COUNTRIES.get(country_name, "us")
    rows = []
    for page in range(1, pages + 1):
        url = f"https://itunes.apple.com/{cc}/rss/customerreviews/page={page}/id={m.group(1)}/sortby=mostrecent/json"
        try:
            entries = _get_json(url).get("feed", {}).get("entry", [])
        except Exception:
            break                                      # no more pages
        if isinstance(entries, dict):
            entries = [entries]
        got = [e for e in entries if "im:rating" in e and "content" in e]
        if not got:
            break
        for e in got:
            rows.append((e["content"]["label"], e.get("updated", {}).get("label"),
                         e.get("im:version", {}).get("label"), e["im:rating"]["label"]))
    if not rows:
        raise ValueError("The App Store returned no reviews for this app in this country. Try another country or upload a file.")
    r, d, v, st = zip(*rows)
    return _frame(r, d, v, st)


def filter_reviews(df, max_reviews):
    s = df["review"].astype(str).str.strip()
    non_ascii = s.str.count(r"[^\x00-\x7F]") / s.str.len().clip(lower=1)
    keep = (s.str.split().str.len() >= 3) & (non_ascii < 0.2) & s.apply(looks_english)
    out = df[keep].assign(review=s[keep]).drop_duplicates(subset="review")
    removed = len(df) - len(out)
    if len(out) > max_reviews:
        out = out.sample(int(max_reviews), random_state=42)
    return out.reset_index(drop=True), removed


# ----------------------------------------------------------------------------------------
# Grouping complaints
# ----------------------------------------------------------------------------------------
def auto_categories(neg_texts, k_max=6):
    """Group negative reviews that use similar words (TF-IDF + KMeans, Day 2) and name each group by
    its three strongest words. Returns one label per review, or None if there are too few reviews."""
    docs = [[w for w in preprocess(t, "all") if w not in GENERIC] for t in neg_texts]
    k = min(k_max, len(docs) // 8)
    if k < 2:
        return None
    try:
        vec = TfidfVectorizer(analyzer=lambda ts: ts, min_df=2, max_df=0.5)
        M = vec.fit_transform(docs)
    except ValueError:
        return None
    if M.shape[1] < 4:
        return None
    km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(M)
    terms = np.array(vec.get_feature_names_out())
    names, seen = [], set()
    for c in range(k):
        name = ", ".join(terms[np.argsort(-km.cluster_centers_[c])[:3]])
        while name in seen:
            name += "+"
        seen.add(name)
        names.append(name)
    return [names[i] for i in km.labels_]


def representative_reviews(texts, k=3):
    """The k reviews closest to the average review of the group (real examples for the reader)."""
    texts = list(texts)
    if len(texts) <= k:
        return texts
    try:
        M = TfidfVectorizer(stop_words="english").fit_transform(texts)
        sims = np.asarray(M @ np.asarray(M.mean(axis=0)).ravel()).ravel()
        return [texts[i] for i in np.argsort(-sims)[:k]]
    except ValueError:
        return texts[:k]


# ----------------------------------------------------------------------------------------
# Charts and tables
# ----------------------------------------------------------------------------------------
def count_terms(neg_texts, kind):
    counter = Counter()
    for t in neg_texts:
        toks = [w for w in preprocess(t, "keep_neg") if w not in GENERIC]
        if kind == "words":
            terms = {w for w in toks if w not in NEGATIONS}
        else:
            terms = {f"{a} {b}" for a, b in zip(toks, toks[1:])}
        counter.update(terms)
    return counter


def _style(ax):
    ax.spines[["top", "right"]].set_visible(False)


def complaints_fig(neg_texts, kind="words", n=10):
    top = count_terms(neg_texts, kind).most_common(n)
    fig, ax = plt.subplots(figsize=(7, 4.2))
    if top:
        labels, values = zip(*top)
        ax.barh(labels[::-1], values[::-1], color="#4285F4")
    ax.set(title=f"Most common complaints ({'phrases' if kind == 'bigrams' else 'words'})",
           xlabel="Negative reviews mentioning it")
    ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    _style(ax)
    plt.tight_layout()
    return fig


def categories_fig(share):
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.barh(share.index[::-1], share.values[::-1], color="#34A853")
    ax.set(title="What the negative reviews are about", xlabel="% of the negative reviews")
    _style(ax)
    plt.tight_layout()
    return fig


def priority_table(table):
    """Which complaint to fix first: number of reviews x how sure the model is that they are negative.
    Trend compares the newest half of the negative reviews with the oldest half (only if dates exist)."""
    neg = table[(table["sentiment"] == "negative") & ~table["complaint_category"].isin(["", "unclear"])]
    if neg.empty:
        return None
    dated = neg[neg["date"].notna()].sort_values("date")
    older = recent = None
    if len(dated) >= 20:
        mid = len(dated) // 2
        older, recent = dated.iloc[:mid], dated.iloc[mid:]
    total_neg = (table["sentiment"] == "negative").sum()
    rows = []
    for cat, g in neg.groupby("complaint_category"):
        row = {"category": cat, "negative_reviews": len(g),
               "share_of_negative_%": round(100 * len(g) / total_neg, 1),
               "score": round(len(g) * g["confidence"].mean(), 1)}
        if g["rating"].notna().any():
            row["avg_stars"] = round(g["rating"].mean(), 2)
        if older is not None:
            delta = (100 * (recent["complaint_category"] == cat).mean()
                     - 100 * (older["complaint_category"] == cat).mean())
            row["trend"] = "rising" if delta >= 5 else "falling" if delta <= -5 else "stable"
        rows.append(row)
    out = pd.DataFrame(rows).sort_values("score", ascending=False).reset_index(drop=True)
    out.insert(0, "priority", range(1, len(out) + 1))
    return out


def time_data(table):
    """Negative reviews per day/week for the 3 biggest complaint categories, or None if too little data.
    Returns (pivot table with one column per category, 'week' or 'day')."""
    d = table[(table["sentiment"] == "negative") & table["date"].notna()
              & ~table["complaint_category"].isin(["", "unclear"])]
    if len(d) < 15 or (d["date"].max() - d["date"].min()).days < 2:
        return None
    weekly = (d["date"].max() - d["date"].min()).days >= 28
    freq = "W" if weekly else "D"
    top = d["complaint_category"].value_counts().index[:3]
    d = d[d["complaint_category"].isin(top)].copy()
    d["period"] = d["date"].dt.to_period(freq).dt.start_time
    piv = d.groupby(["period", "complaint_category"]).size().unstack(fill_value=0)
    full = pd.date_range(piv.index.min(), piv.index.max(), freq="W-MON" if weekly else "D")
    piv = piv.reindex(full.union(piv.index), fill_value=0).sort_index()
    return piv, ("week" if weekly else "day")


def time_fig(table):
    """Negative reviews over time, for the 3 biggest complaint categories."""
    data = time_data(table)
    if data is None:
        return None
    piv, unit = data
    weekly = unit == "week"
    fig, ax = plt.subplots(figsize=(7, 4.2))
    for c in piv.columns:
        ax.plot(piv.index, piv[c], marker="o", label=c)
    ax.set(title=f"Negative reviews per {'week' if weekly else 'day'} (top 3 complaints)", ylabel="Reviews")
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    ax.legend(frameon=False, fontsize=8)
    fig.autofmt_xdate()
    _style(ax)
    plt.tight_layout()
    return fig


def _version_key(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)) or (0,)


def version_data(table, min_reviews=15):
    """% negative per app version (versions with enough reviews, oldest first), or None.
    Returns a DataFrame with columns version, pct_negative, reviews."""
    v = table[table["version"].notna() & ~table["version"].isin(["", "None", "nan"])]
    counts = v["version"].value_counts()
    keep = [x for x in counts.index if counts[x] >= min_reviews]
    if len(keep) < 2:
        return None
    share = v[v["version"].isin(keep)].groupby("version")["sentiment"].apply(lambda s: 100 * (s == "negative").mean())
    share = share.reindex(sorted(keep, key=_version_key))
    return pd.DataFrame({"version": share.index, "pct_negative": share.values,
                         "reviews": [int(counts[x]) for x in share.index]})


def version_fig(table, min_reviews=15):
    """Share of negative reviews per app version: did a new version make users unhappier?"""
    data = version_data(table, min_reviews)
    if data is None:
        return None
    share = pd.Series(data["pct_negative"].values, index=data["version"])
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.bar(share.index, share.values, color="#EA4335")
    ax.set(title=f"Share of negative reviews per app version (versions with {min_reviews}+ reviews)",
           ylabel="% negative")
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right")
    _style(ax)
    plt.tight_layout()
    return fig


# ----------------------------------------------------------------------------------------
# The written report: one summary per complaint + real examples
# ----------------------------------------------------------------------------------------
def summary_parts(texts, summarize, method, k_sentences, abstractive_tokens):
    """(summary text, words of the summary that appear in none of the reviews)."""
    sents = split_sentences(texts)
    if method == "Pretrained (abstractive)":
        source = " ".join(representative_sentences(sents, 12 if k_sentences == 3 else 8)) if sents else ""
        if len(source.split()) >= 30:
            summary = summarize(source, max_new_tokens=abstractive_tokens, min_new_tokens=15)
            return summary, unsupported_words(summary, texts)
    scorer = bow_scores if method == "BoW (extractive)" else tfidf_scores
    picked = extractive_summary(sents, scorer, k_sentences)
    return (" ".join(picked) if picked else "Not enough full sentences to summarize."), []


def _summary_of(texts, summarize, method, k_sentences, abstractive_tokens):
    summary, extra = summary_parts(texts, summarize, method, k_sentences, abstractive_tokens)
    if extra:
        summary += f"  \n*(words not found in these reviews: {', '.join(extra)}; check the examples)*"
    return summary


def build_report(table, neg_texts, summarize, method, progress):
    parts = ["### Overall summary of the negative reviews\n" + _summary_of(neg_texts, summarize, method, 3, 90)]
    labelled = table[(table["sentiment"] == "negative") & ~table["complaint_category"].isin(["", "unclear"])]
    groups = [(c, g["review"].tolist()) for c, g in labelled.groupby("complaint_category") if len(g) >= 3]
    groups.sort(key=lambda x: -len(x[1]))
    total_neg = len(neg_texts)
    for n, (cat, texts) in enumerate(groups[:5]):
        progress(0.8 + 0.15 * n / max(1, len(groups[:5])), desc=f"Summarizing: {cat}")
        quotes = "\n".join("> " + " ".join(t.split())[:240] for t in representative_reviews(texts, 3))
        parts.append(f"### {cat}  ({len(texts)} reviews, {100 * len(texts) / total_neg:.0f}% of the negative ones)\n"
                     f"{_summary_of(texts, summarize, method, 2, 60)}\n\n**Real examples:**\n\n{quotes}")
    return "\n\n".join(parts)


# ----------------------------------------------------------------------------------------
# The two actions of the interface
# ----------------------------------------------------------------------------------------
def analyze_file(file, pasted, store_app, country, cat_mode, cats_text, max_reviews, method,
                 progress=gr.Progress()):
    def fail(msg):
        return (msg,) + (None,) * 8

    cats = [c.strip() for c in (cats_text or "").split(",") if c.strip()]
    if cat_mode == CAT_OWN and len(cats) < 2:
        return fail("Write at least two complaint categories, separated by commas (or choose auto-detect).")
    try:
        df = read_reviews(file, pasted)
        source_note = ""
        if store_app and file is None and not (pasted and pasted.strip()):
            progress(0.02, desc="Downloading reviews from the App Store...")
            df = fetch_store_reviews(store_app, country)
            source_note = f"Source: App Store reviews of **{store_app.rsplit(' (', 1)[0]}** ({country}), latest {len(df)}.  \n"
    except Exception as e:
        return fail(f"Could not read your input: {e}")
    if df.empty:
        return fail("Choose an app, upload a CSV file or paste some reviews first.")

    df, removed = filter_reviews(df, max_reviews)
    if len(df) < 5:
        return fail("I need at least 5 English reviews with 3+ words to say something useful.")

    progress(0.05, desc="Loading models (first time only)...")
    try:
        sentiment, summarize, zero_shot = get_models()
    except Exception as e:
        return fail(f"Could not load the models: {repr(e)[:300]}")

    progress(0.25, desc="Reading sentiment...")
    sent = sentiment(df["review"].tolist())
    table = df.copy()
    table["sentiment"] = [x[0] for x in sent]
    table["confidence"] = [round(x[1], 2) for x in sent]
    table["complaint_category"] = ""
    neg_idx = table.index[table["sentiment"] == "negative"].tolist()
    share_neg = 100 * len(neg_idx) / len(table)
    overview = (source_note + f"**{len(table)} reviews analysed** ({removed} removed: too short, not English or duplicates).  \n"
                f"**{share_neg:.0f}% negative · {100 - share_neg:.0f}% positive** (pretrained model, so it can make mistakes: "
                f"check a few rows of the table).")
    if not neg_idx:
        return (overview + "  \nNo negative reviews were found.", None, None, None, None, None, None,
                _display(table), None)

    neg_texts = table.loc[neg_idx, "review"].tolist()

    progress(0.45, desc="Grouping the complaints...")
    if cat_mode == CAT_AUTO:
        labels = auto_categories(neg_texts)
        if labels is None:
            overview += "  \nToo few negative reviews to group them automatically (about 16 are needed)."
        else:
            table.loc[neg_idx, "complaint_category"] = labels
    else:
        chosen = neg_idx[:MAX_CATEGORY_REVIEWS]
        out = zero_shot([table.at[i, "review"][:1000] for i in chosen], cats)
        for i, (labs, scs) in zip(chosen, out):
            table.at[i, "complaint_category"] = labs[0] if scs[0] >= ZS_MIN else "unclear"
        if len(neg_idx) > len(chosen):
            overview += f"  \nCategories were assigned to the first {len(chosen)} negative reviews only (to keep it fast)."

    labelled = table.loc[neg_idx, "complaint_category"]
    labelled = labelled[labelled != ""]
    cat_chart = categories_fig(labelled.value_counts(normalize=True).mul(100).round(1)) if len(labelled) else None
    prio = priority_table(table)
    if prio is not None:
        overview += f"  \n**Fix first:** {prio.loc[0, 'category']}."
    if table["date"].notna().any():
        t_fig = time_fig(table)
        if t_fig is None:
            overview += "  \nNot enough dated negative reviews for a timeline (need 15+, spread over 2+ days)."
    else:
        t_fig = None
    v_fig = version_fig(table)

    progress(0.8, desc="Writing the summaries...")
    report = build_report(table, neg_texts, summarize, method, progress)

    display = _display(table)
    tmp = os.path.join(tempfile.mkdtemp(), "analysed_reviews.csv")
    display.to_csv(tmp, index=False)
    progress(1.0)
    return overview, complaints_fig(neg_texts, "words"), cat_chart, report, prio, t_fig, v_fig, display, tmp


def _display(table):
    out = table.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    keep = ["review", "sentiment", "confidence", "complaint_category"]
    for c in ("rating", "date", "version"):
        if out[c].notna().any():
            keep.append(c)
    return out[keep]


def analyze_one(text, cats_text):
    if not text or not text.strip():
        return {}, "Type a review first."
    try:
        sentiment, _, zero_shot = get_models()
    except Exception as e:
        return {}, f"Could not load the models: {repr(e)[:300]}"
    lab, score = sentiment([text])[0]
    probs = {lab: score, ("negative" if lab == "positive" else "positive"): 1 - score}
    note = ""
    cats = [c.strip() for c in (cats_text or "").split(",") if c.strip()]
    if lab == "negative" and len(cats) >= 2:
        labs, scs = zero_shot([text[:1000]], cats)[0]
        note = (f"Main complaint: {labs[0]} ({scs[0]:.0%})" if scs[0] >= ZS_MIN
                else "The model is not sure which category this belongs to.")
    return probs, note


# ----------------------------------------------------------------------------------------
# Interface
# ----------------------------------------------------------------------------------------
def build_ui():
    with gr.Blocks(title="App Reviews Analyzer") as demo:
        gr.Markdown("# App Reviews Analyzer\n"
                    "Find out what unhappy users say about **any app**: what to fix first, how the complaints "
                    "change over time, and real examples.")

        with gr.Tab("Analyze an app"):
            gr.Markdown("Pick any app from the App Store, or use your own CSV (one column of review text; "
                        "columns like `review`, `date`, `version`, `rating` are found automatically). English "
                        "reviews only. A file or pasted reviews take priority over the app picker.")
            with gr.Row():
                with gr.Column():
                    gr.Markdown("**Option 1: pick an app (App Store)**")
                    with gr.Row():
                        app_name = gr.Textbox(label="App name", placeholder="e.g. Spotify", scale=3)
                        country = gr.Dropdown(list(COUNTRIES), value="United States", label="Country", scale=2)
                    find = gr.Button("Find app")
                    found_msg = gr.Markdown()
                    store_app = gr.Dropdown([], label="Matching apps", interactive=True)
                    find.click(search_apps, [app_name, country], [store_app, found_msg])
                    gr.Markdown("**Option 2: your own file**")
                    file = gr.File(label="Reviews CSV", file_types=[".csv"])
                    pasted = gr.Textbox(label="...or paste reviews (one per line)", lines=4)
                with gr.Column():
                    cat_mode = gr.Radio([CAT_AUTO, CAT_OWN], value=CAT_AUTO, label="Complaint categories")
                    cats = gr.Textbox(label="Your categories (comma separated, used only with 'Use my own list')",
                                      value=", ".join(DEFAULT_CATEGORIES), lines=3)
                    max_n = gr.Slider(50, 1000, value=300, step=50, label="Max reviews to analyse (more = slower)")
                    method = gr.Radio(["Pretrained (abstractive)", "TF-IDF (extractive)", "BoW (extractive)"],
                                      value="Pretrained (abstractive)", label="Summary method")
                    go = gr.Button("Analyze", variant="primary")
            overview = gr.Markdown()
            prio = gr.Dataframe(label="What to fix first (score = number of reviews x how clearly negative they are)",
                                wrap=True)
            with gr.Row():
                fig1 = gr.Plot(label="Top complaint words")
                fig2 = gr.Plot(label="Complaint categories")
            with gr.Row():
                fig_t = gr.Plot(label="Over time")
                fig_v = gr.Plot(label="By app version")
            report = gr.Markdown(label="Summaries and real examples")
            table = gr.Dataframe(label="Every analysed review", wrap=True)
            download = gr.File(label="Download the table (CSV)")
            go.click(analyze_file, [file, pasted, store_app, country, cat_mode, cats, max_n, method],
                     [overview, fig1, fig2, report, prio, fig_t, fig_v, table, download])

        with gr.Tab("Check one review"):
            box = gr.Textbox(label="Paste one review (English)", lines=3)
            one_cats = gr.Textbox(label="Categories", value=", ".join(DEFAULT_CATEGORIES))
            res = gr.Label(label="Sentiment")
            note = gr.Textbox(label="Complaint category (negative reviews only)")
            gr.Button("Check", variant="primary").click(analyze_one, [box, one_cats], [res, note])
            gr.Examples(["The app keeps crashing and I can't skip songs",
                         "Love the playlists, sound quality is amazing!",
                         "It doesn't work. Not worth the money."], inputs=box)

        with gr.Tab("About"):
            gr.Markdown(
                "Built for the *NLP From Zero* workshop (GDG on Campus PNU).\n\n"
                "- Sentiment: `distilbert-base-uncased-finetuned-sst-2-english` (learned from movie reviews).\n"
                "- Auto-detected categories: reviews with similar words are grouped (TF-IDF + KMeans, Day 2) and "
                "named by their strongest words. Your own list: `facebook/bart-large-mnli`, zero-shot.\n"
                "- Summaries: `facebook/bart-large-cnn` (learned from news, may invent details) or the "
                "BoW / TF-IDF sentence scoring from Day 2.\n"
                "- Fix first: number of reviews in a category x how clearly negative they are. It is a "
                "guide, not a decision.\n"
                "- Over time / by version: the App Store gives only the latest ~500 reviews per country, which for "
                "a popular app can cover just a few days. Use a CSV with dates for longer periods.\n\n"
                "**Limits:** English only; pretrained models make mistakes and carry their training data; "
                "automatic category names are just frequent words, so read the real examples before trusting a label.")
    return demo


if __name__ == "__main__":
    build_ui().queue().launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
