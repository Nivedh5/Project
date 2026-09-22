"""
Hackathon Scoring Backend — Experience.com AI Hackathon (Aug 26, 2026)

Reads every branch from a GitHub repo, fetches README.md + prompt.md +
ai-chat-export.json (plus the last 10 commits) from each branch, scores each
submission with the Anthropic API, caches results in memory, and serves the
live leaderboard frontend at http://localhost:<PORT>.

Run:  python main.py
"""

import os
import json
import base64

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from anthropic import Anthropic

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
GITHUB_OWNER = os.getenv("GITHUB_OWNER", "Experience-org").strip()
GITHUB_REPO = os.getenv("GITHUB_REPO", "hackathon-aug26").strip()
EXCLUDE_BRANCHES = {
    b.strip()
    for b in os.getenv("EXCLUDE_BRANCHES", "main,develop,staging,master").split(",")
    if b.strip()
}
PORT = int(os.getenv("PORT") or "3000")

# The scoring model, per the hackathon spec.
SCORING_MODEL = "claude-sonnet-4-6"

GITHUB_API = "https://api.github.com"

# Max points per criterion — used to validate/clamp model output.
MAX_POINTS = {
    "llm_craft": 30,
    "roi_impact": 25,
    "product_knowledge": 20,
    "working_demo": 15,
    "complexity": 10,
}

# ---------------------------------------------------------------------------
# In-memory score cache (branch_name -> scored result)
# ---------------------------------------------------------------------------
SCORE_CACHE: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Hackathon Scorer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


# ---------------------------------------------------------------------------
# GitHub helpers
# ---------------------------------------------------------------------------
def _github_headers() -> dict:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    return headers


async def gh_get(client: httpx.AsyncClient, path: str):
    """GET a GitHub API path relative to the configured repo. Raises on HTTP error."""
    url = f"{GITHUB_API}/repos/{GITHUB_OWNER}/{GITHUB_REPO}{path}"
    resp = await client.get(url, headers=_github_headers())
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub {resp.status_code} for {path}: {resp.text}",
        )
    return resp.json()


async def get_file(client: httpx.AsyncClient, path: str, branch: str):
    """Fetch and decode a file from a branch. Returns None if it does not exist."""
    url = f"{GITHUB_API}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}?ref={branch}"
    resp = await client.get(url, headers=_github_headers())
    if resp.status_code == 404:
        return None
    if resp.status_code >= 400:
        # Treat any other fetch failure as a missing file rather than aborting the score.
        print(f"  ! {path}@{branch}: GitHub {resp.status_code} — treating as missing")
        return None
    data = resp.json()
    content = data.get("content")
    if not content:
        return None
    try:
        return base64.b64decode(content).decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        print(f"  ! failed to decode {path}@{branch}: {exc}")
        return None


IMAGE_EXTENSIONS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif"}


async def get_demo_screenshot(client: httpx.AsyncClient, branch: str):
    """Return a data: URI for the first image in demo/, or None if absent."""
    url = f"{GITHUB_API}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/demo?ref={branch}"
    resp = await client.get(url, headers=_github_headers())
    if resp.status_code != 200:
        return None
    entries = resp.json()
    if not isinstance(entries, list):
        return None

    image_entry = None
    for entry in entries:
        name = entry.get("name", "").lower()
        if entry.get("type") == "file" and any(name.endswith(ext) for ext in IMAGE_EXTENSIONS):
            image_entry = entry
            break
    if image_entry is None:
        return None

    ext = "." + image_entry["name"].lower().rsplit(".", 1)[-1]
    mime = IMAGE_EXTENSIONS.get(ext, "image/png")

    file_resp = await client.get(image_entry["url"], headers=_github_headers())
    if file_resp.status_code != 200:
        return None
    content = file_resp.json().get("content")
    if not content:
        return None
    return f"data:{mime};base64,{content.replace(chr(10), '')}"


async def fetch_all_branches(client: httpx.AsyncClient) -> list[str]:
    """Return all branch names in the repo (paginated), before exclusion."""
    names: list[str] = []
    page = 1
    while True:
        batch = await gh_get(client, f"/branches?per_page=100&page={page}")
        names.extend(b["name"] for b in batch)
        if len(batch) < 100:
            break
        page += 1
    return names


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def build_scoring_prompt(
    readme, prompt_md, chat_export, commits, branch
) -> str:
    chat_line = (
        f"[chat export present — {len(chat_export)} chars]"
        if chat_export
        else "(MISSING — llm_craft max score capped at 5/30)"
    )
    return f"""Score this hackathon submission. Return ONLY valid JSON, no markdown fences.

BRANCH: {branch}

README.md (output card):
{readme or '(no README found — scores zero for most criteria)'}

prompt.md (prompts they used):
{prompt_md or '(no prompt.md — product knowledge and ROI may be penalised)'}

ai-chat-export.json (agentic work evidence — evaluates LLM craft 30pts):
{chat_line}

RECENT COMMITS:
{commits or '(none)'}

Score using these WEIGHTED criteria. Be strict — missing files score 0.

CRITERIA AND MAX POINTS:
- llm_craft (max 30): How well they directed the agent — context setting, task framing, prompt structure, recovery from errors. Evaluated from ai-chat-export.json. If missing, max score is 5.
- roi_impact (max 25): Is the saving real, quantified, and defensible? "Saves 45 min per sprint" beats "saves time". Must be specific.
- product_knowledge (max 20): Does this reflect real understanding of experience.com, our data, and customers? Generic apps score low.
- working_demo (max 15): Does it actually run end to end? Evidence from screenshots or demo folder. Slide decks score 0.
- complexity (max 10): Did they take on a genuinely difficult problem? A hard problem half-done scores less than an easy problem done well.

Set champion_signal to true only for standout submissions that are a clear proof point, with a one-sentence champion_reason. Otherwise champion_signal is false and champion_reason is null.

Return this exact JSON (no markdown):
{{
  "name": "participant name from README or branch",
  "role": "Dev|QA|ETL|DevOps|PM|Unknown",
  "problem": "one sentence summary of problem solved",
  "solution": "one sentence summary of what they built",
  "time_before": "time estimate before AI",
  "time_after": "time with AI today",
  "will_use": "YES|NO|MAYBE",
  "scores": {{
    "llm_craft": {{"score": 0, "reason": "one sentence"}},
    "roi_impact": {{"score": 0, "reason": "one sentence"}},
    "product_knowledge": {{"score": 0, "reason": "one sentence"}},
    "working_demo": {{"score": 0, "reason": "one sentence"}},
    "complexity": {{"score": 0, "reason": "one sentence"}}
  }},
  "total": 0,
  "champion_signal": false,
  "champion_reason": null
}}"""


def _empty_scores(reason: str) -> dict:
    return {k: {"score": 0, "reason": reason} for k in MAX_POINTS}


def score_with_claude(
    readme, prompt_md, chat_export, commits, branch
) -> dict:
    """Call Claude, parse and validate the JSON, return a fully-shaped result dict."""
    has_prompt_md = prompt_md is not None
    has_chat_export = chat_export is not None

    if anthropic_client is None:
        result = {
            "name": branch,
            "role": "Unknown",
            "problem": "ANTHROPIC_API_KEY not configured",
            "solution": "—",
            "time_before": "—",
            "time_after": "—",
            "will_use": "MAYBE",
            "scores": _empty_scores("No API key"),
            "total": 0,
            "champion_signal": False,
            "champion_reason": None,
        }
    else:
        try:
            message = anthropic_client.messages.create(
                model=SCORING_MODEL,
                max_tokens=1000,
                messages=[
                    {
                        "role": "user",
                        "content": build_scoring_prompt(
                            readme, prompt_md, chat_export, commits, branch
                        ),
                    }
                ],
            )
            text = "".join(
                block.text for block in message.content if block.type == "text"
            )
            text = text.replace("```json", "").replace("```", "").strip()
            result = json.loads(text)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! scoring failed for {branch}: {exc}")
            result = {
                "name": branch,
                "role": "Unknown",
                "problem": f"Scoring failed: {exc}",
                "solution": "—",
                "time_before": "—",
                "time_after": "—",
                "will_use": "MAYBE",
                "scores": _empty_scores(str(exc)),
                "total": 0,
                "champion_signal": False,
                "champion_reason": None,
            }

    # --- Normalise / validate the shape the frontend expects ---------------
    scores = result.get("scores") or {}
    for key, max_pts in MAX_POINTS.items():
        entry = scores.get(key) or {}
        try:
            val = int(entry.get("score", 0) or 0)
        except (TypeError, ValueError):
            val = 0
        val = max(0, min(val, max_pts))
        scores[key] = {"score": val, "reason": entry.get("reason", "—")}

    # Enforce the llm_craft cap when the chat export is missing.
    if not has_chat_export and scores["llm_craft"]["score"] > 5:
        scores["llm_craft"]["score"] = 5
        scores["llm_craft"]["reason"] = (
            "ai-chat-export.json missing — LLM craft capped at 5/30. "
            + scores["llm_craft"]["reason"]
        )

    result["scores"] = scores
    result["total"] = sum(scores[k]["score"] for k in MAX_POINTS)
    result["has_prompt_md"] = has_prompt_md
    result["has_chat_export"] = has_chat_export
    result["branch"] = branch
    result["status"] = "scored"
    result.setdefault("name", branch)
    result.setdefault("role", "Unknown")
    result.setdefault("champion_signal", False)
    result.setdefault("champion_reason", None)
    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/branches")
async def api_branches():
    async with httpx.AsyncClient(timeout=30.0) as client:
        all_names = await fetch_all_branches(client)
    branches = [n for n in all_names if n not in EXCLUDE_BRANCHES]
    print(f"[branches] {len(branches)} branches (excluded {len(all_names) - len(branches)})")
    return {"branches": branches}


@app.get("/api/rescan")
async def api_rescan():
    """Clear the entire in-memory cache and re-fetch the branch list from GitHub.

    Does not itself re-score anything — the caller (the frontend) is expected
    to follow this with /api/score/{branch} calls, which will now be cache
    misses and compute fresh results. This is what lets the server pick up
    new commits without a restart.
    """
    cleared = len(SCORE_CACHE)
    SCORE_CACHE.clear()
    async with httpx.AsyncClient(timeout=30.0) as client:
        all_names = await fetch_all_branches(client)
    branches = [n for n in all_names if n not in EXCLUDE_BRANCHES]
    print(f"[rescan] cleared {cleared} cached score(s) — {len(branches)} branches to rescore")
    return {"status": "rescanning", "branch_count": len(branches)}


@app.get("/api/score/{branch_name:path}")
async def api_score(branch_name: str):
    branch = branch_name.strip()
    if not branch:
        raise HTTPException(status_code=400, detail="Empty branch name")

    # Serve from cache — never re-score a branch in the same session.
    if branch in SCORE_CACHE:
        print(f"[score] cache hit: {branch}")
        return SCORE_CACHE[branch]

    print(f"[score] scoring branch: {branch}")
    async with httpx.AsyncClient(timeout=60.0) as client:
        readme = await get_file(client, "README.md", branch)
        prompt_md = await get_file(client, "prompt.md", branch)
        chat_export = await get_file(client, "ai-chat-export.json", branch)
        demo_screenshot = await get_demo_screenshot(client, branch)
        try:
            commit_data = await gh_get(client, f"/commits?sha={branch}&per_page=10")
            commits = "\n".join(c["commit"]["message"] for c in commit_data)
        except HTTPException as exc:
            print(f"  ! commits fetch failed for {branch}: {exc.detail}")
            commits = ""

    print(
        f"  files — README:{'y' if readme else 'n'} "
        f"prompt.md:{'y' if prompt_md else 'n'} "
        f"chat_export:{'y' if chat_export else 'n'}"
    )

    result = score_with_claude(readme, prompt_md, chat_export, commits, branch)
    result["demo_screenshot"] = demo_screenshot
    SCORE_CACHE[branch] = result
    print(f"  ✓ {branch}: {result['total']}/100")
    return result


@app.get("/api/scores")
async def api_scores():
    return {"scores": list(SCORE_CACHE.values())}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def _print_startup_banner():
    print("=" * 60)
    print("  Hackathon Scorer — Experience.com AI Hackathon")
    print("=" * 60)
    print(f"  Repo:          {GITHUB_OWNER}/{GITHUB_REPO}")
    print(f"  Excluding:     {', '.join(sorted(EXCLUDE_BRANCHES)) or '(none)'}")
    print(f"  Scoring model: {SCORING_MODEL}")
    print(f"  GitHub token:  {'set' if GITHUB_TOKEN else 'MISSING'}")
    print(f"  Anthropic key: {'set' if ANTHROPIC_API_KEY else 'MISSING'}")
    print(f"  Serving on:    http://localhost:{PORT}")
    print("=" * 60)


if __name__ == "__main__":
    _print_startup_banner()
    uvicorn.run(app, host="0.0.0.0", port=PORT)
