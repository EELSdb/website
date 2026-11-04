// Statistics pages: draw each chart on the page from the data in its data-chart attribute, when this module first loads.
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
// "5 Sep" rather than uPlot's default "9/5".
const dates = [
  [86400 * 365, "{YYYY}", null, null, null, null, null, null, 1],
  [86400 * 28, "{MMM}", "\n{YYYY}", null, null, null, null, null, 1],
  [86400, "{D} {MMM}", "\n{YYYY}", null, null, null, null, null, 1],
];

const draws = [...document.querySelectorAll("[data-chart]")].map((el) => {
  const chart = JSON.parse(el.dataset.chart);
  const single = chart.series.length === 1;
  const values = chart.series.map((s) => s.values);
  // A stacked chart draws running totals, and each band fills down to the series below it.
  let sum = chart.x.map(() => 0);
  const ys = chart.stack ? values.map((v) => (sum = sum.map((t, i) => t + v[i]))) : values;
  const height = () => Math.max(200, Math.min(280, el.clientWidth * 0.45));
  const axis = () => ({
    stroke: css("var(--muted)"),
    font: `12px ${family}`,
    grid: { stroke: css("var(--rule)"), width: 1 },
    ticks: { stroke: css("var(--line)"), width: 1, size: 5 },
  });
  const opts = () => ({
    width: el.clientWidth,
    height: height(),
    tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), "Etc/UTC"),
    axes: [{ ...axis(), values: dates }, { ...axis(), size: 56, values: (u, splits) => splits.map((v) => (Number.isInteger(v) ? count.format(v) : "")) }],
    scales: { y: { range: (u, lo, hi) => [0, Math.max(1, hi * 1.05)] } },
    series: [
      chart.step ? { label: "Month", value: "{YYYY}-{MM}" } : { label: chart.week ? "Week of" : "Day", value: "{YYYY}-{MM}-{DD}" },
      ...chart.series.map((s, k) => ({
        label: s.label,
        stroke: css(`var(${s.colour})`),
        width: 1.5,
        points: { show: false },
        value: (u, v, si, i) => (v == null ? "–" : count.format(values[k][i])),
        ...(single && { fill: css(`color-mix(in oklab, var(${s.colour}) 9%, transparent)`) }),
        ...(chart.stack && { fill: css(`color-mix(in oklab, var(${s.colour}) 35%, transparent)`) }),
        ...(chart.step && { paths: uPlot.paths.stepped({ align: 1 }) }),
      })),
    ],
    bands: chart.stack ? values.slice(1).map((_, k) => ({ series: [k + 2, k + 1] })) : [],
    legend: { markers: { show: !single } },
    cursor: { drag: { x: false, y: false }, points: { show: false } },
  });
  let plot;
  const draw = () => {
    plot?.destroy();
    el.innerHTML = "";
    plot = new uPlot(opts(), [chart.x, ...ys], el);
  };
  draw();
  new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: height() })).observe(el);
  return draw;
});

// Canvas colours are resolved once, so redraw when the scheme changes.
const redraw = () => draws.forEach((draw) => draw());
new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
