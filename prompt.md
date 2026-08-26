# Prompts

Every prompt used across both AI-assisted sessions on this branch, verbatim
(typos included) in the order they were sent. Session 1 built the Hackathon
Scorer backend; Session 2 built the Review Requests app. Session 1's full
transcript (including assistant responses) is also captured in
[`ai-chat-export.json`](ai-chat-export.json) — this file is just the prompts.

## Session 1 — 2026-08-11 · Hackathon Scorer backend

1. "Build a hackathon scoring backend for Experience.com's AI Hackathon on
   August 26, 2026. What it does: Reads all branches from a GitHub repo,
   fetches README.md + prompt.md + ai-chat-export.json from each branch,
   scores each submission using the Anthropic API, and serves a live
   leaderboard at localhost:3000. The frontend HTML file already exists
   (hackathon_scorer.html) — build the backend only. [Full spec: FastAPI +
   Anthropic SDK + HTTPX + Uvicorn + python-dotenv; .env template with
   GITHUB_TOKEN, ANTHROPIC_API_KEY, GITHUB_OWNER, GITHUB_REPO,
   EXCLUDE_BRANCHES, PORT; endpoints GET /, GET /api/branches, GET
   /api/score/{branch_name}, GET /api/scores; scoring criteria
   llm_craft(30, capped at 5 without ai-chat-export.json), roi_impact(25),
   product_knowledge(20), working_demo(15), complexity(10); in-memory
   caching; graceful handling of missing files; open CORS; per-branch
   console logging.]"
2. "Option 1. Modify the HTML to call the backend API. Replace all
   client-side ghGet(), getFile(), and scoreAI() calls with
   fetch('/api/branches'), fetch('/api/score/...'), and poll /api/scores
   for the live leaderboard. The token and API key should never appear in
   the browser — they stay in .env on the server side only."
3. "how do i get the github api token"
4. "[screenshot of GitHub 'New fine-grained personal access token' form:
   name=hackathon-scorer, resource owner=Experience-org, expiration=30
   days, repository access=Only select repositories ->
   Experience-org/hackathon-aug26, permissions=Contents:Read-only +
   Metadata:Read-only] does this look good"
5. "[screenshot of the 'Select resource owner' dropdown showing geetha-ui,
   Voce-BuyersRoad, Experience-org] should i change it to geetha-ui"
6. "ok i copied both github and anthropic into .env.template please copy to
   .env file"
7. "yes"
8. "ok now run the application with the actual keys"
9. "Do the following in one shot. No questions. 1) Create README.md and
   prompt.md with specified submission-card content. 2) Create demo/ and
   screenshot the running scorer UI as demo/scorer-ui.png. 3) Create src/
   and copy main.py, hackathon_scorer.html, requirements.txt into it. 4)
   Run /export in the terminal, save the output as ai-chat-export.json. 5)
   git init / remote add origin Experience-org/hackathon-aug26 / checkout
   -b geetha-chandrasekar/hackathon-scorer / add . / commit / push origin
   geetha-chandrasekar/hackathon-scorer. Tell me when each step is done and
   show the final git push output."

## Session 2 — 2026-08-26 · Review Requests app

1. "check that rating add some prcission i need point wise also"
2. "run local"
3. Clarifying question answered: keep per-criterion scores as integers;
   only the KPI average needed decimal precision. And for "point wise":
   show exact point values on the leaderboard rows.
4. "u can do i dont have anything"
5. "wrong ui is showing pls check table is not showing"
6. "rating and review requested table is not showing instead the ui shows
   different"
7. "next to send all 10 rmeiander add a toggle Auto send request named"
8. Clarifying question answered: when the toggle is ON, auto-send eligible
   reminders without asking (skip the confirm dialog).
9. "but api wise dont take time pls use stati data"
10. "api wise use static and make it fast"
11. "if i toggle on a drawer should be opened and in that remainder 1
    remainder 2 remainder 3 all 3 should have different slider having 1-
    10 days"
12. "now each user will 500 limit on a month if user exceed 400 or 400+
    remaind them only 100 left or 70 left , but i dont know where to show
    that if u find a way to show that pls let me know but it should show
    only remaming is 100 or less than that"
13. Clarifying question answered: "its not remainder its totally how much
    request sent"; placement — "top left in request we can show with
    number of days left from month"
14. "yes" (confirmed temporarily lowering the monthly limit to eyeball the
    warning)
15. "instead of this showing here move the 7 metrics little left and add a
    progress adn show there how much left and how much time left"
16. "make that little big than other card"
17. "montly send quota put in next line dont be awkard"
18. "give some space in between table and quta card"
19. "average rating is less than 4 , add a short description and navigatee
    to diff feature as of now just make it lcickable"
20. "and mail bounced there also show why its bounced when its navigated eg
    validation issue"
21. "send all 6 remainder is there but if user want multi select that also
    do that table wise"
22. "he can select particalr and send those only remainder"
23. "i have a doubt as of now you have done all the changes only swide
    review-requests file right?"
24. "if there is no related thing to table of review requests pls remove
    hackathon-aug26/frontend"
25. "1. Send remainder in notification 2. Top dashboard show 3. Mail and
    remainders can also be in filters 4. Common click for (send all 7
    remainders) or else there should be a multi to choose the user list 5.
    For pro user 500 is limit for 1 month for far now we are not showing
    any remaining request left and time left 6. There should be toggle
    auto send review request since its taking 1 day to reset if user want
    he can turn on toggle , user can set how much time interval they can
    send automatically — these things i have done extra from request a
    review and add these features in readme.md file"
26. "Added a dashboard for all things eg total request those card also new
    with that why it is bounced and avergae rating with tap to review
    short desc with montly send quato" / "add these inof in read.md"
27. "all the prompt export it as prompt.md all before this convo i made one
    more take those also but all i did today" / "if not there create that
    file"
