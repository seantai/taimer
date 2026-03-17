import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "taimer",
		identifier: "timerapp.electrobun.dev",
		version: "0.0.1",
	},
	runtime: {
		exitOnLastWindowClosed: false,
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		views: {},
		copy: {
			"src/tray-icon.png": "views/tray-icon.png",
			"src/tray-icon@2x.png": "views/tray-icon@2x.png",
		},
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
