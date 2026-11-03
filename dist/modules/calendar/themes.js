/* Calendar seasonal themes — one per month (1–12). Pure CSS variables + inline SVG
   motifs; no external assets. Readability first: chips are light tints with dark
   text and a saturated edge; decoration lives in the header band only. */
(function (global) {
  // ---- SVG motifs (drawn around 0,0, roughly 24px box) ----
  const M = {
    leaf: (c) => `<path d="M0,-11 C7,-7 9,3 0,11 C-9,3 -7,-7 0,-11Z" fill="${c}"/><path d="M0,-8 L0,13" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/>`,
    maple: (c) => `<path d="M0,-12 L3,-5 L9,-7 L6,-1 L11,2 L4,3 L5,9 L0,5 L-5,9 L-4,3 L-11,2 L-6,-1 L-9,-7 L-3,-5Z" fill="${c}"/><path d="M0,4 L0,13" stroke="${c}" stroke-width="1.5"/>`,
    acorn: (c) => `<ellipse cx="0" cy="3" rx="6" ry="7.5" fill="${c}"/><path d="M-8,-1 Q0,-10 8,-1 Z" fill="#6b3f1d"/><rect x="-1" y="-10" width="2" height="4" fill="#6b3f1d"/>`,
    pumpkin: (c) => `<ellipse cx="-5" cy="2" rx="6" ry="8" fill="${c}"/><ellipse cx="5" cy="2" rx="6" ry="8" fill="${c}"/><ellipse cx="0" cy="2" rx="6" ry="9" fill="${c}" stroke="rgba(0,0,0,.18)"/><path d="M0,-6 Q1,-11 4,-12" stroke="#3f6212" stroke-width="2.4" fill="none"/>`,
    bat: (c) => `<path d="M0,-2 C2,-6 6,-6 8,-4 C10,-8 14,-6 15,-3 C12,-3 11,0 12,3 C9,1 6,2 4,4 C2,3 1,4 0,6 C-1,4 -2,3 -4,4 C-6,2 -9,1 -12,3 C-11,0 -12,-3 -15,-3 C-14,-6 -10,-8 -8,-4 C-6,-6 -2,-6 0,-2Z" fill="${c}"/>`,
    snowflake: (c) => [0, 60, 120].map((r) => `<g transform="rotate(${r})"><path d="M0,-11 L0,11 M-3,-8 L0,-5 L3,-8 M-3,8 L0,5 L3,8" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"/></g>`).join(""),
    star: (c) => `<polygon points="0,-10 2.6,-3.2 9.5,-3.1 4,1.2 6,8 0,4 -6,8 -4,1.2 -9.5,-3.1 -2.6,-3.2" fill="${c}"/>`,
    sparkle: (c) => `<path d="M0,-9 Q1,-1 9,0 Q1,1 0,9 Q-1,1 -9,0 Q-1,-1 0,-9Z" fill="${c}"/>`,
    dot: (c) => `<circle r="3.5" fill="${c}"/>`,
    ornament: (c) => `<circle cy="2" r="8" fill="${c}"/><rect x="-3" y="-9" width="6" height="4" rx="1" fill="#d4af37"/><path d="M-7,1 Q0,5 7,1" stroke="rgba(255,255,255,.6)" stroke-width="1.5" fill="none"/>`,
    tree: (c) => `<polygon points="0,-12 7,-3 4,-3 10,5 -10,5 -4,-3 -7,-3" fill="${c}"/><rect x="-2" y="5" width="4" height="5" fill="#7c4a1e"/>`,
    heart: (c) => `<path d="M0,9 C-13,-1 -7,-13 0,-5 C7,-13 13,-1 0,9Z" fill="${c}"/>`,
    shamrock: (c) => [0, 120, 240].map((r) => `<g transform="rotate(${r}) translate(0,-6) scale(.62)"><path d="M0,9 C-13,-1 -7,-13 0,-5 C7,-13 13,-1 0,9Z" fill="${c}" transform="rotate(180)"/></g>`).join("") + `<path d="M0,2 Q2,9 5,12" stroke="${c}" stroke-width="2" fill="none"/>`,
    blossom: (c) => [0, 72, 144, 216, 288].map((r) => `<g transform="rotate(${r})"><ellipse cy="-6" rx="4" ry="5.5" fill="${c}"/></g>`).join("") + `<circle r="2.6" fill="#fde047"/>`,
    flower: (c) => [0, 60, 120, 180, 240, 300].map((r) => `<g transform="rotate(${r})"><ellipse cy="-7" rx="3.4" ry="6" fill="${c}"/></g>`).join("") + `<circle r="3.6" fill="#facc15"/>`,
    sun: (c) => `<circle r="6.5" fill="${c}"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<g transform="rotate(${r})"><path d="M0,-9 L0,-13" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></g>`).join(""),
    wave: (c) => `<path d="M-14,2 Q-7,-6 0,2 T14,2" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    firework: (c) => Array.from({ length: 12 }, (_, i) => `<g transform="rotate(${i * 30})"><path d="M0,-4 L0,-11" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><circle cy="-13" r="1.3" fill="${c}"/></g>`).join(""),
    cactus: (c) => `<rect x="-3" y="-12" width="6" height="24" rx="3" fill="${c}"/><path d="M-3,0 H-7 V-7" stroke="${c}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M3,3 H7 V-4" stroke="${c}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    mesa: (c) => `<path d="M-15,8 L-9,-2 L-4,-2 L-2,-6 L6,-6 L9,0 L15,8Z" fill="${c}"/>`,
    apple: (c) => `<path d="M0,-5 C-9,-11 -13,2 -6,9 C-3,12 -1,10 0,10 C1,10 3,12 6,9 C13,2 9,-11 0,-5Z" fill="${c}"/><path d="M0,-5 Q1,-10 3,-11" stroke="#6b3f1d" stroke-width="1.6" fill="none"/><path d="M1,-8 Q6,-12 8,-8 Q4,-6 1,-8Z" fill="#4d7c0f"/>`,
    raindrop: (c) => `<path d="M0,-8 C4,-2 6,2 6,4 A6,6 0 0 1 -6,4 C-6,2 -4,-2 0,-8Z" fill="${c}"/>`,
  };

  const T = (o) => o;
  const THEMES = {
    1: T({ name: "Fresh Snow", tagline: "New year, clean slate", head: ["#1e3a8a", "#3b82f6"], accent: "#1d4ed8", bg: "#f4f8fd", today: "#1d4ed8",
      chips: [["#e0ecff", "#2563eb"], ["#e3f6fb", "#0e7490"], ["#f1edff", "#6d28d9"], ["#fff5d6", "#b7891a"]],
      motifs: [["snowflake", "#ffffff"], ["snowflake", "#dbeafe"], ["sparkle", "#fde68a"], ["dot", "#bfdbfe"]] }),
    2: T({ name: "Be Mine", tagline: "Hearts all month", head: ["#9f1239", "#e11d48"], accent: "#be123c", bg: "#fff6f8", today: "#be123c",
      chips: [["#ffe4ea", "#e11d48"], ["#fbe7f8", "#c026d3"], ["#fff0e4", "#ea580c"], ["#f1e8ff", "#7e22ce"]],
      motifs: [["heart", "#fecdd3"], ["heart", "#ffffff"], ["heart", "#fda4af"], ["sparkle", "#fff1f2"]] }),
    3: T({ name: "Lucky Spring", tagline: "Shamrocks & first green", head: ["#14532d", "#16a34a"], accent: "#15803d", bg: "#f4fbf5", today: "#15803d",
      chips: [["#dcfce7", "#16a34a"], ["#ecfccb", "#65a30d"], ["#fef6c3", "#ca8a04"], ["#e0f2fe", "#0284c7"]],
      motifs: [["shamrock", "#bbf7d0"], ["shamrock", "#86efac"], ["raindrop", "#e0f2fe"], ["sparkle", "#fde68a"]] }),
    4: T({ name: "Blossom Season", tagline: "Cherry trees in bloom", head: ["#9d174d", "#db2777"], accent: "#be185d", bg: "#fdf7fa", today: "#be185d",
      chips: [["#fce7f3", "#db2777"], ["#ede9fe", "#7c3aed"], ["#dcfce7", "#16a34a"], ["#e0f2fe", "#0369a1"]],
      motifs: [["blossom", "#fbcfe8"], ["blossom", "#ffffff"], ["blossom", "#f9a8d4"], ["raindrop", "#fce7f3"]] }),
    5: T({ name: "In Full Bloom", tagline: "Flowers everywhere", head: ["#5b21b6", "#9333ea"], accent: "#7c3aed", bg: "#faf7fd", today: "#7c3aed",
      chips: [["#ede9fe", "#7c3aed"], ["#fce7f3", "#db2777"], ["#fef3c7", "#d97706"], ["#dcfce7", "#15803d"]],
      motifs: [["flower", "#f9a8d4"], ["flower", "#fde68a"], ["flower", "#ddd6fe"], ["leaf", "#86efac"]] }),
    6: T({ name: "Summer Sun", tagline: "Long days, blue skies", head: ["#075985", "#0ea5e9"], accent: "#0369a1", bg: "#f3fafd", today: "#0369a1",
      chips: [["#e0f2fe", "#0284c7"], ["#fef6c3", "#ca8a04"], ["#ccfbf1", "#0d9488"], ["#ffedd5", "#ea580c"]],
      motifs: [["sun", "#fde047"], ["sun", "#facc15"], ["wave", "#e0f2fe"], ["wave", "#bae6fd"]] }),
    7: T({ name: "Fireworks", tagline: "Red, white & boom", head: ["#0f172a", "#1e3a8a"], accent: "#b91c1c", bg: "#f6f8fc", today: "#b91c1c",
      chips: [["#fee2e2", "#dc2626"], ["#dbeafe", "#2563eb"], ["#eef2f7", "#475569"], ["#fef3c7", "#d97706"]],
      motifs: [["firework", "#f87171"], ["firework", "#ffffff"], ["firework", "#60a5fa"], ["star", "#fde68a"]] }),
    8: T({ name: "Desert Summer", tagline: "Hot days, warm nights", head: ["#9a3412", "#ea580c"], accent: "#c2410c", bg: "#fdf8f3", today: "#c2410c",
      chips: [["#ffedd5", "#ea580c"], ["#fef3c7", "#b45309"], ["#dcfce7", "#15803d"], ["#fde2e4", "#be123c"]],
      motifs: [["cactus", "#4d7c0f"], ["sun", "#fde047"], ["mesa", "#7c2d12"], ["cactus", "#65a30d"]] }),
    9: T({ name: "Early Fall", tagline: "First crisp mornings", head: ["#713f12", "#a16207"], accent: "#a16207", bg: "#fbf9f3", today: "#a16207",
      chips: [["#fef3c7", "#ca8a04"], ["#ecfccb", "#4d7c0f"], ["#ffedd5", "#c2410c"], ["#e0e7ff", "#4338ca"]],
      motifs: [["leaf", "#a3e635"], ["leaf", "#facc15"], ["apple", "#ef4444"], ["acorn", "#d6a35c"]] }),
    10: T({ name: "Spooky Season", tagline: "Pumpkins & bats", head: ["#1c1917", "#7c2d12"], accent: "#ea580c", bg: "#fdf8f4", today: "#ea580c",
      chips: [["#ffedd5", "#ea580c"], ["#ede9fe", "#7c3aed"], ["#ecfccb", "#4d7c0f"], ["#f2f1f0", "#44403c"]],
      motifs: [["pumpkin", "#f97316"], ["bat", "#0c0a09"], ["star", "#fde68a"], ["pumpkin", "#fb923c"]] }),
    11: T({ name: "Harvest Season", tagline: "Leaves, acorns & gratitude", head: ["#7c2d12", "#c2410c"], accent: "#b45309", bg: "#fcf8f2", today: "#c2410c",
      chips: [["#ffedd5", "#c2410c"], ["#fef3c7", "#b45309"], ["#fde2e4", "#9f1239"], ["#ecfccb", "#4d7c0f"]],
      motifs: [["maple", "#fb923c"], ["maple", "#facc15"], ["acorn", "#d6a35c"], ["leaf", "#ef4444"], ["pumpkin", "#f59e0b"]] }),
    12: T({ name: "Winter Holidays", tagline: "Lights, snow & good cheer", head: ["#14532d", "#166534"], accent: "#b91c1c", bg: "#f6faf7", today: "#b91c1c",
      chips: [["#fee2e2", "#b91c1c"], ["#dcfce7", "#15803d"], ["#e0f2fe", "#0369a1"], ["#fef3c7", "#b7791f"]],
      motifs: [["snowflake", "#ffffff"], ["ornament", "#ef4444"], ["tree", "#4ade80"], ["star", "#fde68a"], ["ornament", "#facc15"]] }),
  };

  // Deterministic scatter so a month always looks the same.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function decorSvg(month, opts) {
    const th = THEMES[month];
    const w = (opts && opts.width) || 900;
    const h = (opts && opts.height) || 120;
    const n = (opts && opts.count) || 22;
    const r = rng(month * 7919 + w);
    let out = "";
    for (let i = 0; i < n; i++) {
      const [kind, color] = th.motifs[i % th.motifs.length];
      // keep the left third calmer so the month title stays readable
      const x = w * (0.4 + 0.6 * r()); // right side only; title sits on the left
      const y = h * (0.1 + 0.85 * r());
      const sc = 0.7 + r() * 1.1;
      const rot = Math.round(r() * 360) - 180;
      const op = (0.55 + r() * 0.4).toFixed(2);
      out += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot}) scale(${sc.toFixed(2)})" opacity="${op}">${M[kind](color)}</g>`;
    }
    return `<svg class="cal-decor" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">${out}</svg>`;
  }

  function cssVars(month) {
    const t = THEMES[month];
    const v = [
      `--cal-head-a:${t.head[0]}`, `--cal-head-b:${t.head[1]}`, `--cal-accent:${t.accent}`,
      `--cal-bg:${t.bg}`, `--cal-today:${t.today}`,
    ];
    t.chips.forEach(([bg, bd], i) => v.push(`--chip${i}-bg:${bg}`, `--chip${i}-bd:${bd}`));
    return v.join(";");
  }

  global.CalendarThemes = { THEMES, MOTIFS: M, decorSvg, cssVars };
})(typeof window !== "undefined" ? window : globalThis);
