import { BrowserWindow, Screen, Tray, Utils } from "electrobun/bun";
import { spawn } from "bun";
import { homedir } from "os";
import { join } from "path";

function playSound() {
	spawn(["afplay", "/System/Library/Sounds/Glass.aiff"]);
}

// Presets persistence
const presetsPath = join(homedir(), ".taimer-presets.json");

type Preset = { label: string; seconds: number };

function loadPresets(): Preset[] {
	try {
		const data = JSON.parse(require("fs").readFileSync(presetsPath, "utf-8"));
		if (Array.isArray(data) && data.length > 0) return data;
	} catch {}
	return [
		{ label: "4 sec", seconds: 4 },
		{ label: "11 min", seconds: 660 },
		{ label: "22 min", seconds: 1320 },
		{ label: "33 min", seconds: 1980 },
	];
}

function savePresets() {
	require("fs").writeFileSync(presetsPath, JSON.stringify(presets, null, 2));
}

let presets = loadPresets();

// Timer state
let remainingSeconds = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;

const tray = new Tray({
	image: "views://tray-icon.png",
	template: true,
});

function updateMenu() {
	const items: Parameters<typeof tray.setMenu>[0] = [];

	if (timerInterval) {
		items.push({
			type: "normal",
			label: "Stop Timer",
			action: "stop",
		});
		items.push({ type: "divider" });
	}

	for (const preset of presets) {
		items.push({
			type: "normal",
			label: preset.label,
			action: `start_${preset.seconds}`,
		});
	}

	items.push({ type: "divider" });
	items.push({ type: "normal", label: "Quick Timer...", action: "custom" });
	items.push({ type: "divider" });

	if (presets.length > 0) {
		items.push({ type: "normal", label: "Remove Preset...", action: "remove_preset" });
	}
	items.push({ type: "normal", label: "Quit", action: "quit" });

	tray.setMenu(items);
}

async function removePreset() {
	const listItems = presets.map((p) => `"${p.label}"`).join(", ");
	const script = `
set picked to choose from list {${listItems}} with title "Remove Preset" with prompt "Choose a preset to remove:"
if picked is false then return ""
return item 1 of picked`;
	const proc = spawn(["osascript", "-e", script]);
	const output = (await new Response(proc.stdout).text()).trim();
	if (output) {
		presets = presets.filter((p) => p.label !== output);
		savePresets();
		updateMenu();
	}
}

let quickTimerWindow: BrowserWindow | null = null;

function openCustomInput() {
	if (quickTimerWindow) {
		quickTimerWindow.focus();
		return;
	}

	const display = Screen.getPrimaryDisplay();
	const winW = 280;
	const winH = 320;
	const x = Math.round(display.workArea.x + (display.workArea.width - winW) / 2);
	const y = Math.round(display.workArea.y + (display.workArea.height - winH) / 3);

	const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: rgba(246,246,246,0.98);
    --border: rgba(0,0,0,0.25);
    --shadow: none;
    --text: #1d1d1f;
    --text2: #86868b;
    --btn-bg: rgba(0,0,0,0.05);
    --btn-border: rgba(0,0,0,0.1);
    --btn-hover: rgba(0,0,0,0.1);
    --btn-active: rgba(0,0,0,0.15);
    --accent: #007aff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: rgba(33,32,30,0.98);
      --border: rgba(255,255,255,0.22);
      --shadow: none;
      --text: #f5f5f7;
      --text2: #98989d;
      --btn-bg: rgba(255,255,255,0.08);
      --btn-border: rgba(255,255,255,0.1);
      --btn-hover: rgba(255,255,255,0.14);
      --btn-active: rgba(255,255,255,0.2);
      --accent: #0a84ff;
    }
  }
  html, body {
    height: 100%; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    background: transparent; color: var(--text);
    user-select: none; -webkit-user-select: none;
  }
  body {
    display: flex; align-items: center; justify-content: center;
    padding: 10px;
  }
  .panel {
    width: 100%; height: 100%;
    background: var(--bg);
    -webkit-backdrop-filter: blur(40px); backdrop-filter: blur(40px);
    border: 0.5px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 8px; padding: 24px 0 20px;
  }
  .label { font-size: 11px; color: var(--text2); letter-spacing: 0.3px; text-transform: uppercase; font-weight: 500; }
  .picker {
    display: flex; align-items: center; gap: 14px;
  }
  .arrow {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--btn-bg); border: 0.5px solid var(--btn-border);
    color: var(--text2); font-size: 18px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 0; line-height: 1;
    transition: background 0.15s;
  }
  .arrow:hover { background: var(--btn-hover); color: var(--text); }
  .arrow:active { background: var(--btn-active); }
  .number {
    font-size: 96px; font-weight: 200; line-height: 1;
    width: 2ch; text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .unit { font-size: 13px; color: var(--text2); margin-top: -4px; }
  .start {
    margin-top: 16px; padding: 8px 40px;
    background: var(--accent); color: #fff;
    border: none; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    cursor: pointer; transition: background 0.15s;
  }
  .start:hover { filter: brightness(1.1); }
  .start:active { filter: brightness(0.9); }
  .save-row {
    display: flex; align-items: center; gap: 6px;
    margin-top: 4px;
  }
  .save-row input[type="checkbox"] { accent-color: var(--accent); }
  .save-row label { font-size: 11px; color: var(--text2); cursor: pointer; }
</style>
</head>
<body>
<div class="panel electrobun-webkit-app-region-drag">
  <div class="label">Quick Timer</div>
  <div class="picker">
    <button class="arrow electrobun-webkit-app-region-no-drag" id="down">&minus;</button>
    <div class="number" id="val">5</div>
    <button class="arrow electrobun-webkit-app-region-no-drag" id="up">+</button>
  </div>
  <div class="unit">minutes</div>
  <button class="start electrobun-webkit-app-region-no-drag" id="go">Start</button>
  <div class="save-row">
    <input class="electrobun-webkit-app-region-no-drag" type="checkbox" id="save"><label class="electrobun-webkit-app-region-no-drag" for="save">Save as preset</label>
  </div>
</div>
<script>
  let v = 5;
  const el = document.getElementById('val');
  const set = n => { v = Math.max(1, Math.min(90, n)); el.textContent = v; };
  document.getElementById('up').onclick = () => set(v + 1);
  document.getElementById('down').onclick = () => set(v - 1);

  // Hold to repeat
  for (const [id, delta] of [['up', 1], ['down', -1]]) {
    const btn = document.getElementById(id);
    let interval;
    btn.addEventListener('mousedown', () => {
      interval = setTimeout(() => {
        interval = setInterval(() => set(v + delta), 80);
      }, 400);
    });
    const stop = () => { clearTimeout(interval); clearInterval(interval); };
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
  }

  // Scroll wheel
  document.addEventListener('wheel', e => {
    e.preventDefault();
    set(v + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') set(v + 1);
    else if (e.key === 'ArrowDown') set(v - 1);
    else if (e.key === 'Enter') document.getElementById('go').click();
    else if (e.key === 'Escape') window.location.href = 'taimer://cancel';
  });

  document.getElementById('go').onclick = () => {
    const save = document.getElementById('save').checked;
    window.location.href = 'taimer://start?m=' + v + (save ? '&save=1' : '');
  };
</script>
</body>
</html>`;

	const win = new BrowserWindow({
		title: "Quick Timer",
		frame: { x, y, width: winW, height: winH },
		html,
		url: null,
		renderer: "native",
		titleBarStyle: "hidden",
		transparent: true,
		passthrough: false,
		sandbox: false,
		navigationRules: null,
		hidden: true,
	});

	quickTimerWindow = win;

	win.webview.on("dom-ready", () => {
		win.show();
	});

	win.webview.on("will-navigate", (event: any) => {
		const url: string = event?.data?.url || "";
		if (!url.startsWith("taimer://")) return;

		if (url.startsWith("taimer://start")) {
			const params = new URL(url).searchParams;
			const mins = parseInt(params.get("m") || "", 10);
			if (!isNaN(mins) && mins > 0) {
				if (params.get("save") === "1") {
					const label = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
					presets.push({ label, seconds: mins * 60 });
					savePresets();
				}
				startTimer(mins * 60);
			}
		}
		win.close();
		quickTimerWindow = null;
	});
}

function startTimer(seconds: number) {
	stopTimer();
	remainingSeconds = seconds;
	tray.setImage("");
	tray.setTitle(`${Math.ceil(remainingSeconds / 60)}m`);

	timerInterval = setInterval(() => {
		remainingSeconds--;

		if (remainingSeconds <= 0) {
			stopTimer();
			updateMenu();
			playSound();
			Utils.showNotification({
				title: "Taimer",
				body: "Time's up!",
				silent: true,
			});
		} else {
			const mins = Math.ceil(remainingSeconds / 60);
			const prevMins = Math.ceil((remainingSeconds + 1) / 60);
			if (mins !== prevMins) {
				tray.setTitle(`${mins}m`);
				updateMenu();
			}
		}
	}, 1000);

	updateMenu();
}

function stopTimer() {
	if (timerInterval) {
		clearInterval(timerInterval);
		timerInterval = null;
	}
	remainingSeconds = 0;
	tray.setImage("views://tray-icon.png");
	tray.setTitle("");
}

// Set initial menu
updateMenu();

// Handle menu clicks
tray.on("tray-clicked", (event: any) => {
	const action = event.data?.action;
	if (!action) return;

	if (action === "quit") {
		tray.remove();
		process.exit(0);
	}

	if (action === "stop") {
		stopTimer();
		updateMenu();
		return;
	}

	if (action === "custom") {
		openCustomInput();
		return;
	}

	if (action === "remove_preset") {
		removePreset();
		return;
	}

	if (action.startsWith("start_")) {
		const seconds = parseInt(action.replace("start_", ""), 10);
		if (!isNaN(seconds)) {
			startTimer(seconds);
		}
	}
});

console.log("Taimer started! Look for it in your menu bar.");
