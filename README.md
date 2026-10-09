# Wordle Showdown 👑

A family scoreboard for Wordle. Each person plays Wordle as usual, taps **Share**, and pastes the result here. The app adds up each team's guesses, crowns the team with the **lowest combined score**, and keeps a running tally.

- 📋 **Paste and post.** It reads the text Wordle's Share button copies (`Wordle 1,938 4/6` plus the emoji grid). Hard mode (`*`) and the high-contrast colors work too.
- 👑 **Daily crown.** Once everyone posts, the winning team gets the crown, confetti and some trash talk.
- 🙈 **No spoilers.** Today's grids stay blurred until you've posted your own.
- 🏆 **Standings.** All-time record, current and longest win streaks, this week and this month, a 14-day margin chart, player rankings (average, MVPs, fails) and each player's guess distribution.
- 📅 **History.** Every past day; tap one to see the scores and grids.
- ⚙️ **Your rules.** Rename the teams and players, pick emojis, add or remove players, and choose what a fail counts as (default **7**).

**Scoring rules:** a team's score is the sum of its players' guesses, and the lowest total wins. A fail (`X/6`) counts as 7. If someone hasn't posted by the end of the day, they count as a fail for that day.

## Try it on your computer

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Without any setup, the app runs in **local mode**: scores are saved in that one browser only. That's fine for trying it out, but to share one scoreboard across the whole family, follow the steps below.

## Share with the family (one-time setup, about 10 minutes)

The site is just static files. Shared scores are stored in Google **Firebase Firestore**, which is free at your family's usage level.

1. **Create a Firebase project.** Go to <https://console.firebase.google.com>, click **Add project**, give it any name, and skip Analytics.
2. **Create the database.** Go to **Build → Firestore Database → Create database** and choose **production mode** and any location.
3. **Set the security rules.** In Firestore → **Rules**, paste the contents of [`firestore.rules`](firestore.rules) and click **Publish**.
4. **Register the web app.** Go to **Project settings (⚙️) → Your apps → `</>` Web**, register an app (no hosting needed), and copy the `firebaseConfig` object it shows.
5. **Paste it into [`config.js`](config.js):**
   ```js
   window.WORDLE_SHOWDOWN = {
     FIREBASE: { apiKey: "…", authDomain: "…", projectId: "…", appId: "…" },
   };
   ```
   (Firebase web keys are meant to be public; the rules are what protect your data.)
6. **Publish the site with GitHub Pages.** In this repo on GitHub, go to **Settings → Pages → Source: GitHub Actions**. Every push to `main` then deploys to `https://<your-username>.github.io/<repo-name>/`.
   GitHub Pages on a *private* repo needs a paid GitHub plan. If the repo is private, either make it public (there's nothing secret in it) or drag the files into a free host like Netlify Drop or Cloudflare Pages.
7. **Pick a family code.** The first time each person opens the site, they enter the same code (8 or more characters, e.g. `smith-wordle-2026`). Whoever joins first sets up the team and player names. After that, each person taps their own name once on their phone.

### Put it on everyone's home screen
Open the site on your phone and choose:
- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**

It then opens full-screen like an app, with no Facebook needed. 🎉

## Daily routine
1. Play Wordle → tap **Share** (it copies your result).
2. Open Showdown → tap **📋 Paste from clipboard** (or long-press the box → Paste) → **Post score**.
3. Wait for the rest of the family… and the crown. 👑

If you posted the wrong score, paste again to replace it, or tap ✕ on the grid card. You can also post on someone else's behalf by changing **Posting as**.

## Development
- `index.html`, `styles.css`, `app.js`: the app (plain JS, no build step)
- `parse.js`: share-text parser and puzzle-number/date math
- `npm test`: runs the parser tests
