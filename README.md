# Lingan Pad

A personal page for capturing ideas. No database or dependencies to install: all ideas are stored in `ideas.md`, which Claude and Codex can read directly.

## Getting started

Install Node.js 16 or later. Run `node -v` in your terminal to check the installed version.

```bash
cd lingan-pad
npm start
```

The server automatically opens http://localhost:4321 in Chrome when it starts, falling back to your default browser if Chrome is unavailable.

- Keep the terminal window open while using the app. Press `Ctrl+C` in that window to stop the server.
- Running `npm start` while the server is already running opens the page without starting another server.
- You can also run it without npm: `node server.js`.

### Optional arguments

| Argument | Purpose |
| --- | --- |
| `--file ~/Notes/ideas.md` | Store ideas elsewhere, such as in your notes folder |
| `--port 5000` | Use a different port (default: 4321) |
| `--no-open` | Skip opening the browser on startup |

When using npm, place arguments after `--`:

```bash
npm start -- --file ~/Notes/ideas.md
```

### Open from any directory with one command (optional)

Add the following line to `~/.zshrc`, adjusting the path to your project location (skip this step on Windows):

```bash
alias ideas='node ~/lingan-pad/server.js'
```

Then run `source ~/.zshrc`. From then on, enter `ideas` in your terminal to open the app.

## Usage

| Action | How |
| --- | --- |
| Add an idea | Enter |
| Add a line break within an idea | Shift + Enter |
| Lower the priority | Append `#` at the end; more markers mean lower priority and smaller text. No `#` means highest priority |
| Cross out / restore | Double-click, or Ctrl/⌘ + Enter |
| Reorder | Drag the dot on the left, or press Alt + ↑ / ↓ |
| Browse previous days | Open the calendar at the top left; dots mark days with ideas |
| Delete | Hover over an idea and click × on the right; undo is available for 5 seconds |

Priority markers (`#`) appear only while editing an idea; otherwise, font size indicates priority. A `#` immediately following an ASCII letter or digit, as in `C#`, does not count as a priority marker. Add a space before priority markers when the idea ends with an ASCII letter or digit.

## ideas.md format

```markdown
## 2026-10-29 Thursday

- Highest-priority idea
- [x] An idea that has been crossed out #
- A lower-priority idea ##
- A multiline idea
  Indent the second line by two spaces
```

- Use one `## YYYY-MM-DD` heading per day, newest first. The app appends a weekday label when saving.
- `- [x]` marks a crossed-out idea.
- More trailing `#` characters mean lower priority.

## Analysis with Claude / Codex

Open Claude Code or Codex in this folder and ask something like, "Read ideas.md and identify recurring themes in my recent ideas." A comment at the top of the file explains its format to the agent.

- The agent can edit `ideas.md` directly, for example to cross out an idea or adjust its `#` markers. Changes sync automatically within a few seconds while the page is open.
- Ask the agent to write analysis results to a separate file, such as `ideas-review.md`, rather than to `ideas.md`.

## Troubleshooting

- **The status at the top right says the server is offline and ideas are being saved in the browser:** Run `npm start` again in your terminal. Ideas entered while offline are stored in the browser and automatically added to `ideas.md` when it reconnects.
- **The port is already in use:** Choose another port, for example `npm start -- --port 5000`.
- **Moving to another computer or making a backup:** Copy `ideas.md`; it contains all your data.
