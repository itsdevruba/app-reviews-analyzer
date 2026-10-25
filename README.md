---
title: App Reviews Analyzer
sdk: docker
app_port: 7860
---

# App Reviews Analyzer

A web site that shows what unhappy users complain about. Pick an app from the App Store, upload a CSV or
paste reviews. You get: share of negative reviews, what to fix first, complaint groups, complaints over time
and by app version, summaries with real examples, and a table you can download. Pretrained models only.

Files
- `server.py` the web server (FastAPI). `static/` the pages (HTML, CSS, JS).
- `app.py` the analysis code (also a simpler Gradio version: `python app.py`).

## Run on your laptop
    pip install -r requirements.txt
    python server.py          # open http://localhost:8000

## Run in Colab (T4 GPU) with a public link
Runtime > Change runtime type > T4 GPU. Upload and unzip this folder, then:

    !pip -q install fastapi uvicorn python-multipart gradio transformers scikit-learn nltk
    %cd /content/webapp
    !wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared && chmod +x cloudflared

    import subprocess, time, re
    server = subprocess.Popen(["python", "server.py"])
    tunnel = subprocess.Popen(["./cloudflared", "tunnel", "--url", "http://localhost:8000"], stderr=open("cf.log", "w"))
    for _ in range(40):
        time.sleep(1)
        m = re.search(r"https://[-a-z0-9]+\.trycloudflare\.com", open("cf.log").read())
        if m:
            print("Open this link:", m.group(0)); break

The link works while the notebook runs. The first start downloads about 3.5 GB of models.

## Permanent site (Hugging Face Spaces, free)
1. huggingface.co > New Space > SDK: Docker (blank). Name it `app-reviews-analyzer`.
2. Upload all files of this folder (keep `static/`). The URL becomes
   `https://huggingface.co/spaces/<your-user>/app-reviews-analyzer`.
3. Free Spaces use CPU, so the pretrained summary is slow. In Settings > Variables add
   `SUMMARY_MODEL` = `sshleifer/distilbart-cnn-12-6`, and keep Max reviews at 100-200.

Optional variables: `BUILT_BY` (your name in About), `GITHUB_URL` (source link in About),
`PRELOAD=0` (do not load models at start).

## Compare two apps

Open **Compare apps** in the menu. Find app A and app B, choose one result in each list, keep or edit the shared
category list, then press Compare. Both apps are sorted into the same categories so the numbers line up. The page
shows negative share, average stars, the period each app's reviews cover, a per-category comparison, top complaint
words, example reviews, and fairness notes. Small differences are labelled "not clear" on purpose.
API: `POST /api/compare` then poll `GET /api/jobs/{id}` like a normal analysis.
