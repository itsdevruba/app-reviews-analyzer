"""App Reviews Analyzer: standalone web server (FastAPI) with its own front end in static/.

Run:   uvicorn server:app --host 0.0.0.0 --port 8000
The analysis code is shared with the Gradio version (app.py). Only pretrained models are used.
Optional environment variables: BUILT_BY (name shown in About), GITHUB_URL, PRELOAD=0 (do not load models at start).
"""
import math
import os
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import app as core            # analysis helpers shared with the Gradio version

STATIC = Path(__file__).parent / "static"
UI_CATEGORIES = ["Bugs & crashes", "Login & account", "Ads", "Performance", "Pricing", "UI & design"]
METHODS = {"pre": "Pretrained (abstractive)", "tfidf": "TF-IDF (extractive)", "bow": "BoW (extractive)"}
STEP_NAMES = ["Loading models", "Reading sentiment", "Sorting complaints", "Writing summary"]
COMPARE_STEPS = ["Getting reviews", "Reading sentiment", "Sorting complaints", "Comparing"]
MODEL_LOCK = threading.Lock()
EXECUTOR = ThreadPoolExecutor(max_workers=1)      # one analysis at a time (models are heavy)
JOBS = {}


class UserError(Exception):
    def __init__(self, title, message):
        super().__init__(message)
        self.title, self.message = title, message


class Job:
    def __init__(self):
        self.id = uuid.uuid4().hex[:12]
        self.steps = STEP_NAMES
        self.status = "queued"          # queued | running | done | error
        self.step = 0
        self.pct = 0
        self.notes = [""] * 4
        self.result = None
        self.error = None
        self.csv_path = None
        self.created = time.time()

    def progress(self, step, pct, note=None):
        self.step, self.pct = step, int(pct)
        if note is not None:
            self.notes[step] = note
        self.status = "running"

    def public(self):
        out = {"id": self.id, "status": self.status, "step": self.step, "pct": self.pct,
               "notes": self.notes, "steps": self.steps}
        if self.status == "done":
            out["result"] = self.result
        if self.status == "error":
            out["error"] = self.error
        return out


# ----------------------------------------------------------------------------------------
# The analysis, as one function that reports progress and returns plain JSON
# ----------------------------------------------------------------------------------------
def analyze(job, p):
    method = METHODS.get(p["method"], METHODS["tfidf"])
    own = p["cat_mode"] == "own"
    cats = [c.strip() for c in p["categories"].split(",") if c.strip()]
    if own and len(cats) < 2:
        raise UserError("Add at least two categories", "Type two or more complaint categories, or switch to auto-detect.")

    # 1. input
    job.progress(0, 2, "Reading your reviews")
    source_label = None
    try:
        df = core.read_reviews(None, p["pasted"])
    except Exception as e:
        raise UserError("We couldn't read these reviews", f"{str(e)[:160]}. Paste one review per line, in English.")
    if p["pasted"].strip():
        source_label = "Pasted reviews"
    elif p.get("store_app"):
        try:
            df = core.fetch_store_reviews(p["store_app"], p["country"])
        except Exception as e:
            raise UserError("We couldn't get reviews from the App Store", str(e)[:300])
        source_label = f"{p['store_app'].rsplit(' (', 1)[0]} · App Store ({p['country']})"
    if df.empty or source_label is None:
        raise UserError("Nothing to analyze", "Choose an app or paste some reviews, then press Analyze.")

    n_raw = len(df)
    df, removed = core.filter_reviews(df, p["max_reviews"])
    n_usable = n_raw - removed
    if len(df) < 5:
        raise UserError("Too few reviews",
                        "I need at least 5 English reviews with 3 or more words to say something useful. "
                        f"{removed} of {n_raw} were removed (too short, not English, or duplicates).")

    # 2. models
    job.progress(0, 6, "Downloading and loading the models (first time only)")
    with MODEL_LOCK:
        try:
            sentiment, summarize, zero_shot = core.get_models()
        except Exception as e:
            raise UserError("The models could not be loaded", repr(e)[:300])
        job.notes[0] = "Ready"

        # 3. sentiment
        job.progress(1, 20, f"0 of {len(df)} reviews")
        texts = df["review"].tolist()
        sent = []
        for i in range(0, len(texts), 64):
            sent += sentiment(texts[i:i + 64])
            job.progress(1, 20 + 25 * min(i + 64, len(texts)) / len(texts), f"{min(i + 64, len(texts))} of {len(texts)} reviews")
        table = df.copy()
        table["sentiment"] = [x[0] for x in sent]
        table["confidence"] = [round(x[1], 2) for x in sent]
        table["complaint_category"] = ""
        neg_idx = table.index[table["sentiment"] == "negative"].tolist()
        neg_texts = table.loc[neg_idx, "review"].tolist()
        job.notes[1] = f"{len(texts)} of {len(texts)} reviews"

        notes = []
        # 4. complaint categories
        job.progress(2, 50, f"{len(neg_idx)} negative reviews to sort")
        category_mode_used = "none"
        if neg_idx:
            if not own:
                labels = core.auto_categories(neg_texts)
                if labels is None:
                    notes.append("Too few negative reviews to group them automatically (about 16 are needed).")
                else:
                    table.loc[neg_idx, "complaint_category"] = labels
                    category_mode_used = "auto"
            else:
                chosen = neg_idx[:core.MAX_CATEGORY_REVIEWS]
                for i in range(0, len(chosen), 10):
                    part = chosen[i:i + 10]
                    out = zero_shot([table.at[j, "review"][:1000] for j in part], cats)
                    for j, (labs, scs) in zip(part, out):
                        table.at[j, "complaint_category"] = labs[0] if scs[0] >= core.ZS_MIN else "unclear"
                    job.progress(2, 50 + 20 * (i + len(part)) / len(chosen), f"{i + len(part)} of {len(chosen)} negative reviews sorted")
                category_mode_used = "own"
                if len(neg_idx) > len(chosen):
                    notes.append(f"Categories were assigned to the first {len(chosen)} negative reviews only, to keep it fast.")
        job.notes[2] = f"{len(neg_idx)} negative reviews sorted"

        # 5. summaries
        job.progress(3, 74, "Picking the most representative sentences")
        overall = None
        report = []
        if neg_idx:
            text, extra = core.summary_parts(neg_texts, summarize, method, 3, 90)
            overall = {"text": text, "unsupported": extra}
            labelled = table[(table["sentiment"] == "negative") & ~table["complaint_category"].isin(["", "unclear"])]
            groups = [(c, g["review"].tolist()) for c, g in labelled.groupby("complaint_category") if len(g) >= 3]
            groups.sort(key=lambda x: -len(x[1]))
            for n, (cat, ctexts) in enumerate(groups[:5]):
                job.progress(3, 76 + 22 * n / max(1, len(groups[:5])), f"Summarizing: {cat}")
                s, extra = core.summary_parts(ctexts, summarize, method, 2, 60)
                report.append({"category": cat, "count": len(ctexts),
                               "pct": round(100 * len(ctexts) / len(neg_idx)),
                               "summary": s, "unsupported": extra,
                               "examples": [" ".join(t.split())[:260] for t in core.representative_reviews(ctexts, 3)]})
        job.notes[3] = "Done"

    # 6. everything the page shows
    neg_n, total = len(neg_idx), len(table)
    words = core.count_terms(neg_texts, "words").most_common(8) if neg_idx else []
    cat_counts = table.loc[neg_idx, "complaint_category"]
    cat_counts = cat_counts[cat_counts != ""].value_counts()
    categories = [{"label": c, "count": int(n), "pct": round(100 * n / neg_n, 1)} for c, n in cat_counts.items()]
    prio = core.priority_table(table) if neg_idx else None
    priority = [] if prio is None else [
        {k.replace("share_of_negative_%", "share"): (None if pd.isna(v) else v) for k, v in row.items()}
        for row in prio.to_dict("records")]

    timeline = versions = None
    if table["date"].notna().any():
        td = core.time_data(table)
        if td is None:
            notes.append("Not enough dated negative reviews for a timeline (15 or more, spread over 2 or more days).")
        else:
            piv, unit = td
            timeline = {"unit": unit, "labels": [d.strftime("%b %d") for d in piv.index],
                        "series": [{"name": c, "values": [int(v) for v in piv[c]]} for c in piv.columns]}
    vd = core.version_data(table)
    if vd is not None:
        versions = [{"version": r.version, "pct": round(float(r.pct_negative), 1), "reviews": int(r.reviews)}
                    for r in vd.itertuples()]

    shown = core._display(table)
    csv_path = os.path.join(tempfile.mkdtemp(), "analysed_reviews.csv")
    shown.to_csv(csv_path, index=False)
    job.csv_path = csv_path
    rows = []
    for rec, d in zip(table.to_dict("records"), shown.to_dict("records")):
        rows.append({"text": rec["review"], "sentiment": rec["sentiment"], "conf": rec["confidence"],
                     "category": rec["complaint_category"],
                     "rating": None if pd.isna(rec["rating"]) else int(rec["rating"]),
                     "date": d.get("date") if isinstance(d.get("date"), str) else None,
                     "version": rec["version"] if rec["version"] not in (None, "None", "nan") else None})

    job.result = {
        "source": source_label, "method": method, "category_mode": category_mode_used,
        "n_categories": len(categories),
        "counts": {"analysed": total, "usable": n_usable, "removed": removed, "max": p["max_reviews"],
                   "negative": neg_n, "positive": total - neg_n,
                   "neg_pct": round(100 * neg_n / total), "pos_pct": 100 - round(100 * neg_n / total)},
        "words": [{"label": w, "value": v} for w, v in words],
        "categories": categories, "priority": priority,
        "timeline": timeline, "versions": versions,
        "summary": overall, "report": report, "rows": rows, "notes": notes,
    }
    job.progress(3, 100)


# ----------------------------------------------------------------------------------------
# Compare two apps: same categories for both, honest about small differences
# ----------------------------------------------------------------------------------------
def _app_label(choice):
    return choice.rsplit(" (", 1)[0]


def _z_two_proportions(x1, n1, x2, n2):
    p = (x1 + x2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    return 0.0 if se == 0 else (x1 / n1 - x2 / n2) / se


def compare(job, p):
    job.steps = COMPARE_STEPS
    a_choice, b_choice = p["app_a"], p["app_b"]
    if not a_choice or not b_choice:
        raise UserError("Pick two apps", "Find app A and app B, pick one from each list, then press Compare.")
    if a_choice == b_choice:
        raise UserError("Pick two different apps", "App A and app B are the same app. Choose a different one.")
    cats = [c.strip() for c in p["categories"] if c.strip()]
    if len(cats) < 2:
        raise UserError("Add at least two categories", "Both apps are sorted into the same categories, so type two or more.")

    # 1. reviews
    entries = []
    for i, choice in enumerate((a_choice, b_choice)):
        job.progress(0, 3 + 10 * i, f"Getting reviews of {_app_label(choice)}")
        try:
            df = core.fetch_store_reviews(choice, p["country"])
        except Exception as e:
            raise UserError(f"We couldn't get reviews of {_app_label(choice)}", str(e)[:300])
        raw = len(df)
        df, removed = core.filter_reviews(df, p["max_reviews"])
        if len(df) < 20:
            raise UserError("Too few reviews",
                            f"Only {len(df)} usable English reviews for {_app_label(choice)} ({removed} of {raw} removed). "
                            "Comparing needs at least 20 per app. Try another country.")
        entries.append({"choice": choice, "df": df, "usable": raw - removed, "removed": removed})
    job.notes[0] = "Reviews ready"

    with MODEL_LOCK:
        job.progress(0, 22, "Loading the models (first time only)")
        try:
            sentiment, _, zero_shot = core.get_models()
        except Exception as e:
            raise UserError("The models could not be loaded", repr(e)[:300])

        out = []
        for i, e in enumerate(entries):
            name = _app_label(e["choice"])
            df = e["df"]
            texts = df["review"].tolist()
            sent = []
            for k in range(0, len(texts), 64):
                sent += sentiment(texts[k:k + 64])
                job.progress(1, 25 + 20 * (i + min(k + 64, len(texts)) / len(texts)) / 2, f"{name}: {min(k + 64, len(texts))} of {len(texts)} reviews")
            table = df.copy()
            table["neg"] = [x[0] == "negative" for x in sent]
            neg_texts = table.loc[table["neg"], "review"].tolist()
            chosen = neg_texts[:core.MAX_CATEGORY_REVIEWS]
            labels = []
            for k in range(0, len(chosen), 10):
                res = zero_shot([t[:1000] for t in chosen[k:k + 10]], cats)
                labels += [labs[0] if scs[0] >= core.ZS_MIN else "unclear" for labs, scs in res]
                job.progress(2, 48 + 40 * (i + (k + 10) / max(1, len(chosen))) / 2, f"{name}: {min(k + 10, len(chosen))} of {len(chosen)} complaints sorted")
            counts = pd.Series(labels).value_counts()
            n_cat = int(counts.sum())
            valid_dates = table["date"].dropna()
            out.append({
                "name": name, "n": len(table), "usable": e["usable"], "removed": e["removed"],
                "neg_n": int(table["neg"].sum()), "neg_pct": round(100 * table["neg"].mean(), 1),
                "avg_stars": None if table["rating"].isna().all() else round(float(table["rating"].mean()), 2),
                "period": None if valid_dates.empty else {"from": valid_dates.min().strftime("%b %d, %Y"), "to": valid_dates.max().strftime("%b %d, %Y"),
                                                           "days": int((valid_dates.max() - valid_dates.min()).days) + 1},
                "n_cat": n_cat,
                "categories": {c: round(100 * int(n) / n_cat, 1) for c, n in counts.items()} if n_cat else {},
                "words": [{"label": w, "value": v} for w, v in core.count_terms(neg_texts, "words").most_common(8)] if neg_texts else [],
                "examples": [" ".join(t.split())[:240] for t in core.representative_reviews(neg_texts, 2)] if neg_texts else [],
                "negatives": int(table["neg"].sum()),
            })
        job.notes[1], job.notes[2] = "Done", "Done"

    # 3. what differs, and how sure are we
    job.progress(3, 92, "Comparing the two apps")
    A, B = out
    z = _z_two_proportions(round(A["neg_pct"] * A["n"] / 100), A["n"], round(B["neg_pct"] * B["n"] / 100), B["n"])
    diff = round(A["neg_pct"] - B["neg_pct"], 1)
    clear = abs(z) >= 1.96
    hi, lo = (A, B) if diff > 0 else (B, A)
    overall = {"diff": diff, "clear": clear,
               "text": (f"{hi['name']} has more negative reviews ({hi['neg_pct']}% vs {lo['neg_pct']}%). "
                        + ("The gap is large enough that chance is an unlikely explanation." if clear else
                           "The gap is small for this many reviews, so it may be chance."))
               if diff != 0 else "Both apps have the same share of negative reviews."}
    cat_names = sorted({c for a in out for c in a["categories"]}, key=lambda c: -max(A["categories"].get(c, 0), B["categories"].get(c, 0)))
    big_enough = A["n_cat"] >= 50 and B["n_cat"] >= 50
    rows, findings = [], []
    for c in cat_names:
        pa, pb = A["categories"].get(c, 0.0), B["categories"].get(c, 0.0)
        d = round(pa - pb, 1)
        is_clear = c != "unclear" and abs(d) >= 10 and big_enough
        rows.append({"label": c, "a": pa, "b": pb, "diff": d, "clear": is_clear})
        if is_clear:
            who = A if d > 0 else B
            findings.append(f"{c}: {who['name']} has more complaints about this ({max(pa, pb)}% vs {min(pa, pb)}% of its negative reviews).")
    if not findings:
        findings.append("No complaint category differs by 10 points or more, so no clear difference between the two apps.")
    notes = ["Both apps are sorted into the same categories so the numbers can be compared. Each app uses its latest public reviews, not the same dates."]
    for a in out:
        if a["period"] is None:
            continue
    if all(a["period"] for a in out):
        da, db = A["period"]["days"], B["period"]["days"]
        if max(da, db) > 2 * min(da, db):
            notes.append(f"The reviews cover different periods ({A['name']}: {da} days, {B['name']}: {db} days). Compare with care.")
    if not big_enough:
        notes.append("One of the apps has fewer than 50 sorted complaints, so category differences are shown as not clear.")
    for a in out:
        a["categories"] = [{"label": c, "pct": v} for c, v in a["categories"].items()]
    job.notes[3] = "Done"
    job.result = {"kind": "compare", "apps": out, "country": p["country"], "categories_used": cats,
                  "overall": overall, "rows": rows, "findings": findings, "notes": notes}
    job.progress(3, 100)


def run_job(job, params):
    job.status = "running"
    try:
        (compare if params.get("kind") == "compare" else analyze)(job, params)
        job.status, job.pct = "done", 100
    except UserError as e:
        job.status, job.error = "error", {"title": e.title, "message": e.message}
    except Exception as e:                         # unexpected: show something readable
        job.status = "error"
        job.error = {"title": "Something went wrong", "message": f"{type(e).__name__}: {str(e)[:260]}"}
    finally:
        if params.get("file_path"):
            try:
                os.remove(params["file_path"])
            except OSError:
                pass


# ----------------------------------------------------------------------------------------
# HTTP API
# ----------------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_):
    if os.environ.get("PRELOAD", "1") != "0":     # start loading the models while the user types
        def warm():
            try:
                with MODEL_LOCK:
                    core.get_models()
            except Exception as e:
                print("Model preload failed (it will be retried on the first analysis):", repr(e)[:200])
        threading.Thread(target=warm, daemon=True).start()
    yield


app = FastAPI(title="App Reviews Analyzer", lifespan=lifespan)


class SearchIn(BaseModel):
    name: str = ""
    country: str = "United States"


class CompareIn(BaseModel):
    app_a: str = ""
    app_b: str = ""
    country: str = "United States"
    categories: list[str] = UI_CATEGORIES
    max_reviews: int = 300


class CheckIn(BaseModel):
    text: str = ""
    categories: list[str] = UI_CATEGORIES


@app.get("/api/config")
def config():
    return {"countries": list(core.COUNTRIES), "default_categories": UI_CATEGORIES,
            "built_by": os.environ.get("BUILT_BY", ""), "github_url": os.environ.get("GITHUB_URL", "")}


@app.post("/api/search")
def search(body: SearchIn):
    found, msg = core.lookup_apps(body.name, body.country)
    return {"apps": found, "message": msg}


@app.post("/api/analyze")
async def start_analyze(pasted: str = Form(""), store_app: str = Form(""),
                        country: str = Form("United States"), cat_mode: str = Form("auto"),
                        categories: str = Form(""), max_reviews: int = Form(300), method: str = Form("tfidf")):
    params = {"pasted": pasted or "", "store_app": store_app, "country": country, "cat_mode": cat_mode,
              "categories": categories, "max_reviews": max(50, min(int(max_reviews), 1000)), "method": method}
    job = Job()
    for old in [k for k, j in JOBS.items() if time.time() - j.created > 3600]:
        JOBS.pop(old, None)
    JOBS[job.id] = job
    EXECUTOR.submit(run_job, job, params)
    return {"job": job.id}


@app.post("/api/compare")
def start_compare(body: CompareIn):
    params = {"kind": "compare", "app_a": body.app_a, "app_b": body.app_b, "country": body.country,
              "categories": body.categories, "max_reviews": max(50, min(int(body.max_reviews), 1000))}
    job = Job()
    JOBS[job.id] = job
    EXECUTOR.submit(run_job, job, params)
    return {"job": job.id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        return JSONResponse({"status": "error", "error": {"title": "Session expired",
                             "message": "This analysis is no longer available. Run it again."}}, status_code=404)
    return job.public()


@app.get("/api/jobs/{job_id}/csv")
def job_csv(job_id: str):
    job = JOBS.get(job_id)
    if job is None or not job.csv_path:
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(job.csv_path, media_type="text/csv", filename="analysed_reviews.csv")


@app.post("/api/check")
def check(body: CheckIn):
    text = body.text.strip()
    if len(text.split()) < 2:
        return JSONResponse({"error": "Type a review of at least two words."}, status_code=400)
    cats = [c.strip() for c in body.categories if c.strip()]
    with MODEL_LOCK:
        try:
            sentiment, _, zero_shot = core.get_models()
        except Exception as e:
            return JSONResponse({"error": f"The models could not be loaded: {repr(e)[:200]}"}, status_code=500)
        label, score = sentiment([text])[0]
        neg = score if label == "negative" else 1 - score
        category = None
        if label == "negative" and len(cats) >= 2:
            labs, scs = zero_shot([text[:1000]], cats)[0]
            category = labs[0] if scs[0] >= core.ZS_MIN else "unclear"
    return {"neg_pct": round(100 * neg), "pos_pct": 100 - round(100 * neg), "category": category}


app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
