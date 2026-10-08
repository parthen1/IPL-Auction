# IPL Fantasy Backend — API Docs

> **Base URL:** `https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com`
> Just add the endpoint after the base URL. Example:
> `https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com/points?match_id=2417`

---

## 1. Is the server alive?

### `GET /`

Just check if the server is running.

```
https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com/
```

**Returns:**
```json
{ "status": "API running" }
```

---

## 2. Which match is happening right now?

### `GET /match`

Tells you the current match name, teams, venue, and whether it's live right now.

```
https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com/match
```

**Returns:**
```json
{
  "match_id": 2418,
  "match_name": "Mumbai Indians vs Kolkata Knight Riders",
  "teams": {
    "home": "Mumbai Indians",
    "away": "Kolkata Knight Riders"
  },
  "venue": "Wankhede Stadium",
  "start_time": "2026-03-29T19:30:00+05:30",
  "is_active": true
}
```

> 🕐 Poll every **60 seconds** max. No live data here, just schedule info.

---

## 3. Fantasy Points for a Match

### `GET /points?match_id={id}`

Get the fantasy points leaderboard for any match.
Each player shows: batting points, bowling points, fielding points, playing bonus, and total.

```
https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com/points?match_id=2417
```

**Returns:**
```json
{
  "match_id": 2417,
  "updated_at": "2026-03-28T23:15:42+05:30",
  "data": [
    {
      "rank": 1,
      "player": "Ishan Kishan (c)(wk)",
      "team": "Sunrisers Hyderabad",
      "bat": 160,
      "bowl": 0,
      "field": 0,
      "play": 4,
      "total": 164,
      "catches": 0,
      "stumpings": 0,
      "run_out_direct": 0,
      "run_out_indirect": 0
    },
    {
      "rank": 2,
      "player": "Devdutt Padikkal (IP)",
      "team": "Royal Challengers Bengaluru",
      "bat": 127,
      "bowl": 0,
      "field": 28,
      "play": 4,
      "total": 159,
      "catches": 3,
      "stumpings": 0,
      "run_out_direct": 0,
      "run_out_indirect": 0
    }
  ]
}
```

> ✅ **During a live match** — call this every **5–10 seconds** to get live updates.
> ✅ **After match** — call anytime, data stays in DB forever.
> ✅ **Does NOT hit IPL servers** — reads only from our own database.

---

## 4. Manually Fetch a Match (on-demand)

### `GET /fetch/{match_id}`

Force the server to go fetch a match's data from IPL right now, calculate points, and save to DB.
**Use this only when needed** — not for regular polling.

```
https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com/fetch/2417
```

> ⚠️ This hits IPL's servers directly. Use once per match, not repeatedly.

---

## 5. IPL Official Points Table (Season Standings)

### `GET /standings`

Get the official IPL league table — all 10 teams, their wins/losses/points/NRR.
This updates **automatically after every match ends** — no manual action needed.

```
https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com/standings
```

**Returns:**
```json
{
  "updated_at": "2026-03-28T23:45:00+05:30",
  "teams": [
    {
      "TeamCode": "RCB",
      "TeamName": "Royal Challengers Bengaluru",
      "TeamLogo": "https://...",
      "Matches": "1",
      "Wins": "1",
      "Loss": "0",
      "Points": "2",
      "NetRunRate": "2.907",
      "Performance": "W",
      "OrderNo": "1"
    }
  ]
}
```

> ✅ Call every **5 minutes** — reads from our database, never hits IPL servers.

---

### Force Refresh Standings (manual)

### `GET /standings/refresh`

Makes the server go fetch fresh standings from IPL right now and save it.

```
https://a-bhavy-bot-bbheroku-5f1b58e25c41.herokuapp.com/standings/refresh
```

> ⚠️ Only use this for manual/emergency refresh. The worker does this automatically.

---

## Summary — What to Use & When

| What you want | URL | How often |
|---|---|---|
| Check server is up | `/` | Anytime |
| Current match info | `/match` | Every 60s |
| **Live fantasy points** | `/points?match_id=2418` | **Every 5–10s** during match |
| Past match points | `/points?match_id=2417` | Anytime |
| **IPL season standings** | `/standings` | Every 5 min |
| Manually trigger fetch | `/fetch/2418` | Once if needed |
| Force refresh standings | `/standings/refresh` | Emergency only |

---

## Important Notes for Developer

- **`match_id`** — You get this from `/match` → `match_id` field. Or just hardcode the match number.
- **All times** are in **IST (Indian Standard Time)** — `+05:30`
- **Points update live** — every ~2 seconds our backend fetches from IPL and updates DB.
  Your app just needs to call `/points` every 5–10s to always show fresh data.
- **Standings update automatically** — after every match finishes, no need to do anything.
- **None of these endpoints require any token, API key, or login.**
