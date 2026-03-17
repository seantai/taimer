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

	for (const preset of [...presets].sort((a, b) => a.seconds - b.seconds)) {
		items.push({
			type: "normal",
			label: preset.label,
			action: `start_${preset.seconds}`,
		});
	}

	items.push({ type: "divider" });
	items.push({ type: "normal", label: "New Timer...", action: "custom" });
	if (presets.length > 0) {
		items.push({ type: "normal", label: "Remove Timer...", action: "remove_preset" });
	}
	items.push({ type: "divider" });
	items.push({ type: "normal", label: "Quit", action: "quit" });

	tray.setMenu(items);
}

let removePresetWindow: BrowserWindow | null = null;

function removePreset() {
	if (removePresetWindow) {
		removePresetWindow.focus();
		return;
	}

	const display = Screen.getPrimaryDisplay();
	const winW = 280;
	const maxH = 700;
	const rowH = 44;
	const chrome = 120;
	const winH = Math.min(maxH, chrome + presets.length * rowH);
	const x = Math.round(display.workArea.x + (display.workArea.width - winW) / 2);
	const y = Math.round(display.workArea.y + (display.workArea.height - winH) / 3);

	const sorted = presets.map((p, i) => ({ ...p, i })).sort((a, b) => a.seconds - b.seconds);
	const presetItems = sorted
		.map(
			(p) =>
				`<button class="item electrobun-webkit-app-region-no-drag" onclick="remove(${p.i})"><span>${p.label}</span><span class="x">&minus;</span></button>`,
		)
		.join("");

	const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: rgba(246,246,246,0.98);
    --border: rgba(0,0,0,0.25);
    --text: #1d1d1f;
    --text2: #86868b;
    --row-bg: rgba(255,255,255,0.6);
    --row-hover: rgba(0,0,0,0.04);
    --row-active: rgba(0,0,0,0.08);
    --separator: rgba(0,0,0,0.1);
    --danger: #ff3b30;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: rgba(33,32,30,0.98);
      --border: rgba(255,255,255,0.22);
      --text: #f5f5f7;
      --text2: #98989d;
      --row-bg: rgba(255,255,255,0.06);
      --row-hover: rgba(255,255,255,0.1);
      --row-active: rgba(255,255,255,0.14);
      --separator: rgba(255,255,255,0.08);
      --danger: #ff453a;
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
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .header {
    padding: 16px 16px 12px;
    font-size: 13px; font-weight: 600; color: var(--text);
    text-align: center; flex-shrink: 0;
  }
  .list-wrapper {
    flex: 1; min-height: 0;
    padding: 0 12px 12px 12px;
    display: flex; flex-direction: column;
  }
  .list-wrapper.has-scroll {
    padding-right: 2px;
  }
  .list {
    flex: 1; min-height: 0;
    overflow-y: auto; overflow-x: hidden;
    background: var(--row-bg);
    border-radius: 10px;
  }
  .item {
    width: 100%; padding: 11px 16px;
    background: none; border: none;
    color: var(--text); font-size: 13px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: space-between;
    transition: background 0.1s;
    position: relative;
  }
  .item:not(:last-child)::after {
    content: ''; position: absolute;
    bottom: 0; left: 16px; right: 0;
    height: 0.5px; background: var(--separator);
  }
  .item:hover { background: var(--row-hover); }
  .item:active { background: var(--row-active); }
  .x {
    color: var(--danger); font-size: 16px; font-weight: 500;
    width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,59,48,0.1);
    line-height: 1; padding-bottom: 1px;
  }
  @media (prefers-color-scheme: dark) {
    .x { background: rgba(255,69,58,0.15); }
  }
  .list::-webkit-scrollbar { width: 16px; }
  .list::-webkit-scrollbar-track { background: transparent; }
  .list::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.45); border-radius: 8px; border: 3px solid transparent; background-clip: padding-box; }
  .list::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.65); border-radius: 8px; border: 3px solid transparent; background-clip: padding-box; }
  .cancel {
    padding: 8px 16px; margin: 12px 0 4px;
    background: none; border: none;
    color: var(--text2); font-size: 13px;
    cursor: pointer; flex-shrink: 0;
    transition: color 0.15s;
  }
  .cancel:hover { color: var(--text); }
</style>
</head>
<body>
<div class="panel electrobun-webkit-app-region-drag">
  <div class="header">Remove Preset</div>
  <div class="list-wrapper"><div class="list electrobun-webkit-app-region-no-drag">${presetItems}</div></div>
  <button class="cancel electrobun-webkit-app-region-no-drag" onclick="window.location.href='http://taimer/cancel'">Cancel</button>
</div>
<script>
  function remove(i) {
    window.location.href = 'http://taimer/remove?i=' + i;
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.location.href = 'http://taimer/cancel';
  });
  const list = document.querySelector('.list');
  const wrapper = document.querySelector('.list-wrapper');
  if (list.scrollHeight > list.clientHeight) wrapper.classList.add('has-scroll');
</script>
</body>
</html>`;

	const win = new BrowserWindow({
		title: "Remove Preset",
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

	removePresetWindow = win;

	win.webview.on("dom-ready", () => {
		win.show();
	});

	win.webview.on("will-navigate", (event: any) => {
		let url = "";
		try {
			const detail = JSON.parse(event?.data?.detail || "{}");
			url = detail.url || "";
		} catch {
			url = event?.data?.detail || "";
		}
		if (!url.startsWith("http://taimer/")) return;

		if (url.startsWith("http://taimer/remove")) {
			const params = new URL(url).searchParams;
			const idx = parseInt(params.get("i") || "", 10);
			if (!isNaN(idx) && idx >= 0 && idx < presets.length) {
				presets.splice(idx, 1);
				savePresets();
				updateMenu();
			}
		}
		win.close();
		removePresetWindow = null;
	});
}

let quickTimerWindow: BrowserWindow | null = null;

function openCustomInput() {
	if (quickTimerWindow) {
		quickTimerWindow.focus();
		return;
	}

	const display = Screen.getPrimaryDisplay();
	const winW = 280;
	const winH = 340;
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
    gap: 12px; padding: 24px 0 20px;
  }
  .label { font-size: 12px; color: var(--text2); letter-spacing: 0.3px; text-transform: uppercase; font-weight: 500; }
  .picker {
    display: flex; align-items: center; gap: 14px;
  }
  .arrow {
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--btn-bg); border: 0.5px solid var(--btn-border);
    color: var(--text2); font-size: 22px; cursor: pointer;
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
  .unit { font-size: 14px; color: var(--text2); margin-top: -4px; margin-bottom: 16px; }
  .save-row {
    display: flex; align-items: center; gap: 6px;
    margin-top: 16px;
  }
  .start {
    margin-top: 12px; padding: 12px 48px;
    background: var(--accent); color: #fff;
    border: none; border-radius: 8px;
    font-size: 15px; font-weight: 500;
    cursor: pointer; transition: background 0.15s;
  }
  .start:hover { filter: brightness(1.1); }
  .start:active { filter: brightness(0.9); }
  .save-row input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  .save-row label { font-size: 13px; color: var(--text2); cursor: pointer; }
</style>
</head>
<body>
<div class="panel electrobun-webkit-app-region-drag">
  <div class="label">New Timer</div>
  <div class="picker">
    <button class="arrow electrobun-webkit-app-region-no-drag" id="down"><svg width="18" height="18" viewBox="0 0 18 18"><line x1="4" y1="9" x2="14" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
    <div class="number" id="val">5</div>
    <button class="arrow electrobun-webkit-app-region-no-drag" id="up"><svg width="18" height="18" viewBox="0 0 18 18"><line x1="4" y1="9" x2="14" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="4" x2="9" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
  </div>
  <div class="unit">minutes</div>
  <div class="save-row">
    <input class="electrobun-webkit-app-region-no-drag" type="checkbox" id="save"><label class="electrobun-webkit-app-region-no-drag" for="save">Save as preset</label>
  </div>
  <button class="start electrobun-webkit-app-region-no-drag" id="go">Start</button>
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
    else if (e.key === 'Escape') window.location.href = 'http://taimer/cancel';
  });

  document.getElementById('go').onclick = () => {
    const save = document.getElementById('save').checked;
    window.location.href = 'http://taimer/start?m=' + v + (save ? '&save=1' : '');
  };
</script>
</body>
</html>`;

	const win = new BrowserWindow({
		title: "New Timer",
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
		let url = "";
		try {
			const detail = JSON.parse(event?.data?.detail || "{}");
			url = detail.url || "";
		} catch {
			url = event?.data?.detail || "";
		}
		if (!url.startsWith("http://taimer/")) return;

		if (url.startsWith("http://taimer/start")) {
			const params = new URL(url).searchParams;
			const mins = parseInt(params.get("m") || "", 10);
			if (!isNaN(mins) && mins > 0) {
				if (params.get("save") === "1" && !presets.some((p) => p.seconds === mins * 60)) {
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
