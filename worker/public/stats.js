// Statistics pages: draw each chart on the page from the data in its data-chart attribute, when this module first loads.

// The table of contents marks the section at the top of the window, or the last one at the bottom of the page.
const toc = [...document.querySelectorAll(".stats-toc a")];
const heads = toc.map((a) => document.getElementById(a.hash.slice(1)));
const spy = () => {
  const end = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
  const current = end ? heads.length - 1 : Math.max(0, heads.findLastIndex((h) => h.getBoundingClientRect().top < innerHeight / 4));
  toc.forEach((a, i) => (i === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
};
if (toc.length) {
  addEventListener("scroll", spy, { passive: true });
  spy();
}

const probe = document.createElement("span");
probe.hidden = true;
document.body.append(probe);
/** A colour resolved for canvas drawing (tokens use light-dark(), which only the cascade resolves). */
const css = (value) => {
  probe.style.color = value;
  return getComputedStyle(probe).color;
};
await document.fonts.ready;
const family = getComputedStyle(document.body).fontFamily;
const count = new Intl.NumberFormat("en");
const day = uPlot.fmtDate("{YYYY}-{MM}-{DD}");
const month = uPlot.fmtDate("{YYYY}-{MM}");
// "5 Sep" rather than uPlot's default "9/5".
const dates = [
  [86400 * 365, "{YYYY}", null, null, null, null, null, null, 1],
  [86400 * 28, "{MMM}", "\n{YYYY}", null, null, null, null, null, 1],
  [86400, "{D} {MMM}", "\n{YYYY}", null, null, null, null, null, 1],
];

const draws = [...document.querySelectorAll("[data-chart]")].map((el) => {
  const chart = JSON.parse(el.dataset.chart);
  // Series marked "extra" (bot traffic) are dashed, and show only while the checkbox above the chart is ticked, which also swaps its title.
  const box = el.previousElementSibling?.querySelector("input[data-extra]");
  const title = el.previousElementSibling?.querySelector("[data-extra-title]");
  const titles = title && [title.textContent, title.dataset.extraTitle];
  const date = (x) => uPlot.tzDate(new Date(x * 1e3), "Etc/UTC");
  const last = chart.x.at(-1) + (chart.week ? 6 * 86400 : 0);
  const when = (x) => (chart.step ? month(date(x)) : `${chart.week ? "Week of " : ""}${day(date(x))}`);
  // The legend stays on the whole range: each series' total, or the latest value of a running total. The tooltip has the day.
  const range = chart.step ? month(date(last)) : `${day(date(chart.x[0]))} – ${day(date(last))}`;
  const value = (v) => () => count.format(chart.step ? v.at(-1) : v.reduce((a, b) => a + b, 0));
  const height = () => Math.max(200, Math.min(280, el.clientWidth * 0.45));
  const axis = () => ({
    stroke: css("var(--muted)"),
    font: `12px ${family}`,
    grid: { stroke: css("var(--rule)"), width: 1 },
    ticks: { stroke: css("var(--line)"), width: 1, size: 5 },
  });
  let plot;
  const draw = () => {
    const shown = chart.series.filter((s) => !s.extra || box?.checked);
    if (box && title) title.textContent = titles[box.checked ? 1 : 0];
    const single = shown.length === 1;
    const values = shown.map((s) => s.values);
    // A stacked chart draws running totals, and each band fills down to the series below it.
    let sum = chart.x.map(() => 0);
    const ys = chart.stack ? values.map((v) => (sum = sum.map((t, i) => t + v[i]))) : values;
    // A stacked chart also shows the total in the legend; its line (the top of the stack) is not drawn twice.
    const total = chart.stack && !single ? [{ label: "Total", width: 0, points: { show: false }, value: value(sum) }] : [];
    const colours = shown.map((s) => [css(`var(${s.colour})`), css(`color-mix(in oklab, var(${s.colour}) 35%, transparent)`)]);
    const row = (label, n, k) => {
      const name = document.createElement("span");
      name.textContent = label;
      if (k !== undefined) {
        const mark = document.createElement("i");
        Object.assign(mark.style, { borderColor: colours[k][0], background: colours[k][1], borderStyle: shown[k].extra ? "dashed" : "solid" });
        name.prepend(mark);
      }
      const v = document.createElement("span");
      v.textContent = count.format(n);
      return [name, v];
    };
    // Every series' value at the cursor, in the order the bands are stacked (top first).
    const tooltip = {
      hooks: {
        init: (u) => u.over.append(Object.assign(document.createElement("div"), { className: "plot-tip", hidden: true })),
        setCursor: (u) => {
          const tip = u.over.querySelector(".plot-tip");
          const i = u.cursor.idx;
          tip.hidden = i == null;
          if (i == null) return;
          const order = shown.map((_, k) => k);
          if (chart.stack) order.reverse();
          const head = document.createElement("b");
          head.textContent = when(chart.x[i]);
          tip.replaceChildren(head, ...(total.length ? row("Total", sum[i]) : []), ...order.flatMap((k) => row(shown[k].label, values[k][i], k)));
          const gap = 14;
          const [w, h] = [tip.offsetWidth, tip.offsetHeight];
          const left = u.cursor.left + gap + w > u.over.clientWidth ? u.cursor.left - gap - w : u.cursor.left + gap;
          tip.style.left = `${Math.max(0, left)}px`;
          tip.style.top = `${Math.min(Math.max(0, u.cursor.top - h / 2), u.over.clientHeight - h)}px`;
        },
      },
    };
    const opts = {
      width: el.clientWidth,
      height: height(),
      tzDate: date,
      axes: [{ ...axis(), values: dates }, { ...axis(), size: 56, values: (u, splits) => splits.map((v) => (Number.isInteger(v) ? count.format(v) : "")) }],
      scales: { y: { range: (u, lo, hi) => [0, Math.max(1, hi * 1.05)] } },
      series: [
        { label: "", value: () => range },
        ...total,
        ...shown.map((s, k) => ({
          label: s.label,
          stroke: css(`var(${s.colour})`),
          width: 1.5,
          points: { show: false },
          value: value(values[k]),
          ...(single && { fill: css(`color-mix(in oklab, var(${s.colour}) 9%, transparent)`) }),
          ...(chart.stack && { fill: css(`color-mix(in oklab, var(${s.colour}) 35%, transparent)`) }),
          ...(chart.step && { paths: uPlot.paths.stepped({ align: 1 }) }),
          ...(s.extra && { dash: [5, 3] }),
        })),
      ],
      bands: chart.stack ? values.slice(1).map((_, k) => ({ series: [k + 2 + total.length, k + 1 + total.length] })) : [],
      legend: { markers: { show: !single } },
      cursor: { y: false, drag: { x: false, y: false }, points: { show: false } },
      plugins: [tooltip],
    };
    plot?.destroy();
    el.innerHTML = "";
    plot = new uPlot(opts, [chart.x, ...total.map(() => sum), ...ys], el);
  };
  draw();
  box?.addEventListener("change", draw);
  new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: height() })).observe(el);
  return draw;
});

// Canvas colours are resolved once, so redraw when the scheme changes.
const redraw = () => draws.forEach((draw) => draw());
new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
