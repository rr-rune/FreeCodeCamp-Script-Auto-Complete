# freeCodeCamp Auto-Solver (HTML/CSS)

A Tampermonkey userscript that works through freeCodeCamp's step-by-step HTML/CSS workshops on its own. It fills in each step, submits it, moves on to the next one, and keeps going until the module ends or a step needs a manual fix.

**Version:** 1.35 (Siren Edition)

---

## How it works

On freeCodeCamp, the starting code for step *N + 1* is the finished code for step *N*. The script uses that:

1. It reads the step number from the page address (`…/step-12`).
2. It fetches the data for the next step (`/page-data/…/step-13/page-data.json`).
3. It takes the `index.html` and `styles.css` code from that data and strips out freeCodeCamp's `--fcc-editable-region--` markers.
4. It pastes the code into the matching editors and presses **Ctrl + Enter** to check and submit.
5. When the page moves to the next step, it waits for the page to load and starts again.

When the next step doesn't exist (a 404), you've reached the last step of the module and the script stops.

---

## Features

- **Start/Stop button.** Pinned to the top right of every freeCodeCamp lesson page. If the page redraws and the button disappears, it comes back on its own.
- **Handles the donation pop-up.** When the "Become a supporter" pop-up (with the bear animation) appears, the script waits for its countdown to finish. It then clicks **Ask me later**, checks that the pop-up is gone, and picks up where it left off. It waits up to 90 seconds, and the button shows how long it's been waiting.
- **Retries.** Each step gets up to 3 attempts. If pasting doesn't put the right code in the editor, the script writes it straight into the editor (Monaco) instead. It stops retrying once the editor holds the correct code and the step still fails, because repeating it won't help.
- **Shows why a step is stuck.** If a step still won't pass, the script opens the Tests panel and reads which checks failed. It shows them in a small box on the page and plays an alarm so you know to come back.
- **Keeps running in a background tab.** You can switch to another tab while it runs. To stop the browser slowing it down, the script:
  - makes the page think it's always visible
  - runs its timers in a Web Worker, so they aren't held back in a hidden tab
  - plays a tone too quiet to hear (browsers slow down tabs less while they play audio)
  - holds a Web Lock, which stops the browser freezing the page
- **Alarm when it finishes.** A siren plays when it reaches the final step.

---

## Requirements

- Chrome, Edge, Brave or Firefox
- [Tampermonkey](https://www.tampermonkey.net/) (Violentmonkey should also work)

The script asks for these permissions:

| Permission | Why it's needed |
|---|---|
| `GM_xmlhttpRequest` + `@connect www.freecodecamp.org` | Fetch the next step's data |
| `unsafeWindow` | Read and write the page's code editor (Monaco) and change how the page reports its visibility |
| `@run-at document-start` | Get the background-tab fixes in place before freeCodeCamp's own code loads |

It only runs on `https://www.freecodecamp.org/learn/*`.

---

## Installation

1. Install the Tampermonkey extension.
2. Click the Tampermonkey icon and choose **Create a new script**.
3. Delete the template, paste in the whole script, and save with **Ctrl + S**.
4. Make sure the script is switched on in the Tampermonkey dashboard.
5. **Chrome/Edge only:** if the button doesn't appear, open `chrome://extensions`, open Tampermonkey's **Details** and turn on **Allow User Scripts**. On some versions this is the **Developer mode** toggle instead.

---

## Usage

1. Open any step of an HTML/CSS workshop, e.g. `https://www.freecodecamp.org/learn/…/step-1`.
2. Click **▶ Start Auto-Solve** at the top right.
3. Leave it running. You can switch tabs, but don't close this one.
4. Click **⏸ Stop Auto-Solve** at any time to stop.

### Button states

| Button shows | What it means |
|---|---|
| ▶ Start Auto-Solve | Not running |
| ⏸ Stop Auto-Solve | Running |
| ⏳ Waiting out ad... *N*s | Waiting for the donation pop-up's countdown to finish |
| ⚠️ Stuck - see hint | A step failed after retrying. See the box below the button for which tests failed |
| 🏁 Final Step Reached! | There's no next step, so the module is finished |
| ⚠️ Stopped / ⚠️ Error / Stopped | The page address isn't a step page, or something went wrong. Check the console |

After fixing a stuck step yourself, submit it, then click **Start** again on the next step.

---

## Limitations

- **HTML and CSS only.** The script only fills `index.html` and `styles.css`. Steps with JavaScript files won't be solved.
- **Step pages only.** The page address has to end in `/step-<number>`. Labs, certification projects, quizzes and exams aren't supported.
- **You do the last step.** The final step has no "next step" to copy from, so the script stops there and you finish it yourself.
- **It can break if freeCodeCamp changes its page.** The script looks for specific parts of the page by name (such as `.monaco-editor-tabs`, `li.test-result` and `.donation-modal`). If freeCodeCamp renames them, the script will need updating.
- **The alarm is loud.** Turn your volume down if you're wearing headphones.

---

## Troubleshooting

Open the browser console (**F12 → Console**). The script's messages all start with `[FCC Auto-Solver]`.

| Problem | Try this |
|---|---|
| No button appears | Check that the script is switched on, the page address matches `freecodecamp.org/learn/…`, and (on Chrome) that **Allow User Scripts** is on |
| Stops straight away with "⚠️ Stopped" | You're not on a `/step-N` page |
| Code is pasted but nothing happens | Click inside the editor once, then click Start again |
| Stuck on the donation pop-up for 90s | Close it yourself, then click Start again |
| Slows down in a background tab | Click Start again so the browser allows audio, which is needed for the keep-alive tone |

---

## Disclaimer

This is an unofficial, personal script. It isn't affiliated with or endorsed by freeCodeCamp.

freeCodeCamp's [Academic Honesty Policy](https://www.freecodecamp.org/news/academic-honesty-policy/) expects you to do the curriculum work yourself. Using a tool like this on work you submit for a certification or a class may breach that policy or your school's rules. Use it at your own risk.
