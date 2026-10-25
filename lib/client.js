window.__ModuleLoader__.load({
	id: "dsh-win11-material",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const react = require("react");

		//#region styles
		/**
		* Page translucency, scoped so nothing changes while the window surface is
		* still opaque or the material is off.
		*/
		const css = [
			/* shell translucency */
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) body,',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) #root{background:transparent!important}',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) body{',
			'--dsw-specific-sidebar-fill:transparent;',
			'}',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [class*="_frame"]:has([class*="_centerCol"]){',
			'background:color-mix(in srgb,var(--dsh-win11-base,#1b1b1c) calc(var(--dsh-win11-tint,.42) * 100%),transparent)!important;',
			'--dsw-alias-bg-base:transparent;',
			'}',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [class*="_frame"]:has([class*="_centerCol"])::before{background:transparent!important}',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [class*="_centerCol"],',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [class*="_bottomRow"],',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [class*="_rightbarCol"]{background:transparent!important}',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [class*="_sidebarCol"]{background:transparent!important;border-right-color:transparent!important}',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [data-composer-dock]{align-self:center;box-sizing:border-box;width:auto;max-width:100%;margin:8px 0 1px;padding:4px 12px;border-radius:999px;background:color-mix(in srgb,var(--dsw-specific-input-major,#2c2c2e) 76%,transparent);border:0;box-shadow:var(--dsw-elevation-soft),inset 0 1px 0 rgba(255,255,255,.06)}',
			'html[data-dsh-win11-material]:not([data-dsh-win11-material="none"]) [data-composer-card]{background:color-mix(in srgb,var(--dsw-specific-input-major,#2c2c2e) 76%,transparent)!important;box-shadow:var(--dsw-elevation-soft),inset 0 1px 0 rgba(255,255,255,.06)!important}',
			/* settings surface */
			'.dswm-section{display:flex;flex-direction:column;gap:14px;padding:4px 0 8px;color:var(--dsw-alias-label-primary)}',
			'.dswm-title{font-size:16px;font-weight:600;line-height:24px;margin:0}',
			'.dswm-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
			'.dswm-group{display:flex;flex-direction:column;gap:8px}',
			'.dswm-label{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
			'.dswm-value{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
			'.dswm-materials{display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:8px}',
			'.dswm-material{appearance:none;display:flex;flex-direction:column;align-items:center;gap:7px;padding:9px 6px 8px;border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}',
			'.dswm-material:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.dswm-material[aria-pressed="true"]{border-color:var(--dsw-alias-state-business-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary)}',
			'.dswm-material:disabled{opacity:.55;cursor:not-allowed}',
			'.dswm-swatch{width:100%;height:30px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-base)}',
			'.dswm-swatch[data-material="mica"]{background:linear-gradient(135deg,#9fb4d81f,#c9b7e01f),var(--dsw-alias-bg-layer-2)}',
			'.dswm-swatch[data-material="acrylic"]{background:linear-gradient(135deg,#9fb4d83d,#c9b7e03d),repeating-linear-gradient(45deg,#0000 0 6px,#ffffff0d 6px 12px),var(--dsw-alias-bg-layer-2)}',
			'.dswm-swatch[data-material="tabbed"]{background:linear-gradient(180deg,#8fb0e02e,#8fb0e00a),var(--dsw-alias-bg-layer-2)}',
			'.dswm-swatch[data-material="none"]{background:var(--dsw-alias-bg-base)}',
			'.dswm-range{width:100%;accent-color:var(--dsw-alias-state-business-primary)}',
			'.dswm-toggle{display:flex;align-items:center;justify-content:space-between;gap:16px}',
			'.dswm-toggle-text{display:flex;flex-direction:column;gap:2px}',
			'.dswm-toggle-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
			'.dswm-switch{appearance:none;position:relative;width:42px;height:24px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);cursor:pointer;flex:none;transition:background-color .15s ease,border-color .15s ease}',
			'.dswm-switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .18s cubic-bezier(.2,.9,.25,1.2),background-color .15s ease}',
			'.dswm-switch[aria-pressed="true"]{background:var(--dsw-alias-state-business-primary);border-color:transparent}',
			'.dswm-switch[aria-pressed="true"]::after{transform:translateX(18px);background:#fff}',
			'.dswm-status{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
			'.dswm-status[data-state="warn"]{border-color:var(--dsw-alias-state-warn-secondary);background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}',
			'.dswm-status[data-state="error"]{border-color:var(--dsw-alias-state-error-secondary)}',
			'.dswm-code{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:11px;line-height:17px;padding:6px 8px;border-radius:6px;background:var(--dsw-alias-markdown-inline-code);color:var(--dsw-alias-label-primary);overflow-x:auto;white-space:pre}',
			'.dswm-row{display:flex;align-items:center;justify-content:space-between;gap:16px}',
		].join("");

		const tagId = "dsh-win11-material/styles.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-win11-material";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region plugin body
		/** Dictionary namespace owned by this plugin. */
		const NS = "ui-win11-material";
		/** Required client services: the settings surface and its dictionaries. */
		const inject = ["slots", "locale"];

		const zh = {
			nav: "窗口材质",
			title: "窗口材质",
			description: "让桌面窗口使用 Windows 11 的系统材质，并让页面透出桌面壁纸。",
			material: "材质",
			materials: { none: "关闭", mica: "Mica", acrylic: "Acrylic", tabbed: "Tabbed" },
			tint: "页面不透明度",
			keepTransparent: "失焦时保持透明",
			keepTransparentHint: "窗口失去焦点时改用系统模糊层，避免被系统刷成实色",
			status: "状态",
			windowFound: "窗口",
			windowMissing: "未找到桌面窗口",
			bridgeInstalled: "窗口桥接已安装",
			bridgeMissing: "窗口桥接未安装，窗口仍是不透明的，暂时看不到材质。",
			bridgeHint: "在插件目录运行下面这条命令后重启 DSH：",
			unsupported: "当前环境不是 Windows 11 22H2 及以上版本的桌面版，材质不可用。",
			saved: "已保存",
			saving: "保存中",
			failed: "保存失败",
			refresh: "重新检测",
		};

		const en = {
			nav: "Window material",
			title: "Window material",
			description: "Give the desktop window a Windows 11 system material and let the desktop wallpaper show through.",
			material: "Material",
			materials: { none: "Off", mica: "Mica", acrylic: "Acrylic", tabbed: "Tabbed" },
			tint: "Page opacity",
			keepTransparent: "Stay translucent when unfocused",
			keepTransparentHint: "Falls back to the system blur layer while the window is inactive",
			status: "Status",
			windowFound: "Window",
			windowMissing: "desktop window not found",
			bridgeInstalled: "Window bridge installed",
			bridgeMissing: "Window bridge is not installed, so the window is still opaque.",
			bridgeHint: "Run this in the plugin directory and restart DSH:",
			unsupported: "Windows 11 22H2 or newer on Desktop is required.",
			saved: "Saved",
			saving: "Saving",
			failed: "Save failed",
			refresh: "Re-check",
		};

		const ORDER = ["none", "mica", "acrylic", "tabbed"];
		const ATTRIBUTE = "dshWin11Material";
		const root = () => document.documentElement;

		/**
		* Read one `--dsw-*` token the theme defines on `body`.
		* @param {string} token - Custom property name.
		* @returns {string} Trimmed value, or an empty string.
		*/
		function token(token) {
			if (typeof document === "undefined" || document.body === null) return "";
			const value = getComputedStyle(document.body).getPropertyValue(token);
			return typeof value === "string" ? value.trim() : "";
		}

		/**
		* Remember the palette the theme currently resolves, so translucent surfaces
		* keep the original hue on any built-in or third-party theme. The sidebar and
		* the shell frame both derive from the theme's base color, so the whole
		* window keeps one theme color.
		*/
		function capturePalette() {
			const html = root();
			if (html === null) return;
			const base = token("--dsw-alias-bg-base");
			if (base !== "" && base !== "transparent") html.style.setProperty("--dsh-win11-base", base);
		}

		/**
		* Publish one state to the document: the material attribute plus the tint.
		* @param {object} state - Material, tint, and bridge availability.
		*/
		function reflect(state) {
			const html = root();
			if (html === null) return;
			const active = state.bridge !== undefined && state.bridge.installed === true && state.material !== "none";
			html.dataset[ATTRIBUTE] = active ? state.material : "none";
			html.dataset.dshWin11Bridge = state.bridge !== undefined && state.bridge.installed === true ? "installed" : "missing";
			html.style.setProperty("--dsh-win11-tint", String(state.tint));
		}

		/**
		* Ask the Host for the current state.
		* @returns {Promise<object>} Parsed state.
		*/
		async function readState() {
			const response = await fetch("/win11-material/state", { credentials: "same-origin", cache: "no-store" });
			if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
			return await response.json();
		}

		/**
		* Write one partial state to the Host.
		* @param {object} patch - Fields to change.
		* @returns {Promise<object>} The applied state.
		*/
		async function writeState(patch) {
			const response = await fetch("/win11-material/state", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(patch),
			});
			if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
			return await response.json();
		}

		/**
		* Render the material picker, the opacity slider, and window status.
		* @param {{ t: (key: string) => string }} props - Localized copy.
		* @returns {object} Section element tree.
		*/
		function MaterialSection({ t }) {
			const tr = typeof t === "function" ? t : (key) => key;
			const [state, setState] = react.useState(null);
			const [tone, setTone] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const timer = react.useRef(0);

			react.useEffect(() => {
				let alive = true;
				readState()
					.then((next) => {
						if (alive) setState(next);
					})
					.catch(() => {
						if (alive) setTone("error");
					});
				return () => {
					alive = false;
				};
			}, []);

			react.useEffect(() => () => window.clearTimeout(timer.current), []);

			const commit = (patch) => {
				setBusy(true);
				writeState(patch)
					.then((next) => {
						setState(next);
						setTone("saved");
					})
					.catch(() => setTone("error"))
					.finally(() => setBusy(false));
			};

			const preview = (patch) => {
				setState((current) => {
					if (current === null) return current;
					const next = { ...current, ...patch };
					reflect(next);
					return next;
				});
				window.clearTimeout(timer.current);
				timer.current = window.setTimeout(() => commit(patch), 220);
			};

			const supported = state !== null && state.platform === "win32" && state.native !== undefined && state.native.supported === true;
			const bridge = state !== null && state.bridge !== undefined && state.bridge.installed === true;
			const material = state === null ? "acrylic" : state.material;

			return react.createElement("div", { className: "dswm-section", "data-dsh-win11-settings": "" },
				react.createElement("h2", { className: "dswm-title" }, tr("title")),
				react.createElement("p", { className: "dswm-desc" }, tr("description")),
				react.createElement("div", { className: "dswm-group" },
					react.createElement("div", { className: "dswm-label" },
						react.createElement("span", null, tr("material")),
						react.createElement("span", { className: "dswm-value" }, tr("materials." + material)),
					),
					react.createElement("div", { className: "dswm-materials" }, ORDER.map((name) =>
						react.createElement("button", {
							key: name,
							type: "button",
							className: "dswm-material",
							"aria-pressed": material === name ? "true" : "false",
							disabled: !supported || busy,
							onClick: () => {
								preview({ material: name });
							},
							title: tr("materials." + name),
						},
							react.createElement("span", { className: "dswm-swatch", "data-material": name }),
							react.createElement("span", null, tr("materials." + name)),
						),
					)),
				),
				react.createElement("div", { className: "dswm-group" },
					react.createElement("div", { className: "dswm-label" },
						react.createElement("span", null, tr("tint")),
						react.createElement("span", { className: "dswm-value" }, String(Math.round((state?.tint ?? 0.42) * 100)) + "%"),
					),
					react.createElement("input", {
						className: "dswm-range",
						type: "range",
						min: 10,
						max: 95,
						step: 1,
						value: Math.round((state?.tint ?? 0.42) * 100),
						disabled: !supported,
						onChange: (event) => {
							preview({ tint: Number(event.target.value) / 100 });
						},
					}),
				),
				react.createElement("div", { className: "dswm-group" },
					react.createElement("div", { className: "dswm-toggle" },
						react.createElement("div", { className: "dswm-toggle-text" },
							react.createElement("span", null, tr("keepTransparent")),
							react.createElement("span", { className: "dswm-toggle-hint" }, tr("keepTransparentHint")),
						),
						react.createElement("button", {
							type: "button",
							className: "dswm-switch",
							role: "switch",
							"aria-checked": state?.keepTransparent === false ? "false" : "true",
							"aria-pressed": state?.keepTransparent === false ? "false" : "true",
							"aria-label": tr("keepTransparent"),
							disabled: !supported,
							onClick: () => {
								preview({ keepTransparent: state?.keepTransparent === false });
							},
						}),
					),
				),
				react.createElement("div", {
					className: "dswm-status",
					"data-state": supported === false && state !== null ? "warn" : bridge ? "ok" : "warn",
				},
					state === null
						? react.createElement("span", null, tr("status") + " · …")
						: react.createElement("span", null,
							tr("status") + " · ",
							tr("windowFound") + ": ",
							state.window === null ? tr("windowMissing") : (state.window.title || String(state.window.hwnd)),
						),
					state === null ? null : react.createElement("span", null, supported ? (bridge ? tr("bridgeInstalled") : tr("bridgeMissing")) : tr("unsupported")),
					supported && !bridge
						? react.createElement("div", null,
							react.createElement("div", null, tr("bridgeHint")),
							react.createElement("div", { className: "dswm-code" }, "node tools/window-bridge.mjs apply"),
						)
						: null,
					tone === null ? null : react.createElement("span", { "data-tone": tone }, tr(tone === "saved" ? "saved" : tone === "saving" ? "saving" : "failed")),
				),
			);
		}

		/**
		* Client plugin body.
		* @param {object} ctx - Client plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-win11-material: dictionaries");
			const t = ctx.locale.bind(NS);
			capturePalette();
			readState()
				.then((state) => reflect(state))
				.catch(() => {
					// Outside Desktop, or with the Host half disabled, stay fully opaque.
					const html = root();
					if (html !== null) {
						html.dataset[ATTRIBUTE] = "none";
						html.dataset.dshWin11Bridge = "missing";
					}
				});
			// Re-read the palette whenever the theme swaps or a stylesheet arrives.
			ctx.effect(() => {
				if (typeof MutationObserver !== "function") return;
				const observer = new MutationObserver(() => capturePalette());
				observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "style", "class"] });
				observer.observe(document.head, { childList: true, subtree: true });
				return () => observer.disconnect();
			}, "ui-win11-material: palette sync");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "win11-material",
				order: 35,
				label: () => t("nav"),
				locale: NS,
			}, MaterialSection));
			// Tell the Host the browser half mounted, so its status reflects both sides.
			fetch("/win11-material/state", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ client: true }),
			}).catch(() => {});
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});