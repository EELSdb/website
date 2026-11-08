import { esc, exactElement, picker, rankElement } from "./picker.js";

// Filters apply as they change: the results section is fetched and swapped in, and the URL follows.
// Without JavaScript the form submits with its Apply button instead.
const form = document.getElementById("filters");
let timer;
let pending;

// Short shareable URLs: no empty fields, and a toggle group that is all on (or all off) means "any".
function filterUrl() {
  const data = new FormData(form);
  for (const group of form.querySelectorAll(".toggles")) {
    const boxes = [...group.querySelectorAll("input")];
    if (boxes.every((b) => b.checked) || boxes.every((b) => !b.checked)) data.delete(boxes[0].name);
  }
  const q = new URLSearchParams([...data].filter(([, v]) => v !== ""));
  return `/spectra/${q.size ? `?${q}` : ""}`;
}

async function load() {
  const url = filterUrl();
  if (url === location.pathname + location.search) return;
  pending?.abort();
  pending = new AbortController();
  const section = document.querySelector(".browse > section");
  section.setAttribute("aria-busy", "true");
  try {
    const res = await fetch(url, { signal: pending.signal });
    const fresh = new DOMParser().parseFromString(await res.text(), "text/html").querySelector(".browse > section");
    // Reuse the live region so screen readers announce the new count.
    const status = section.querySelector(".result-bar [role=status]");
    const next = fresh.querySelector(".result-bar [role=status]");
    status.innerHTML = next.innerHTML;
    next.replaceWith(status);
    section.replaceWith(fresh);
    history.pushState(null, "", url);
  } catch (err) {
    if (err.name !== "AbortError") location.href = url;
  }
}

const refresh = (delay = 0) => {
  clearTimeout(timer);
  timer = setTimeout(load, delay);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  refresh();
});
form.addEventListener("change", () => refresh());
form.addEventListener("input", (event) => {
  if (event.target.matches('input[type="text"], input[type="search"]')) refresh(400);
});
// The form keeps the state it had when the page loaded, so stepping back reloads instead of swapping.
addEventListener("popstate", () => location.reload());

// Space-led and punctuation-free, so a query matches from the start of any word: "mar" finds "(Dr) Marie Cheynet".
const words = (s) => " " + s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Elements: picks set the hidden multi-select's options; spectra must contain all of them.
{
  const select = document.getElementById("f-element");
  const items = [...select.options].map((o) => ({ o, value: o.value, name: o.dataset.name, count: Number(o.dataset.count), selected: o.selected }));
  for (const x of items) x.html = `<b>${x.value}</b> ${x.name}`;
  select.hidden = true;
  picker({
    id: "f-element",
    after: select,
    label: document.querySelector('label[for="f-element"]'),
    placeholder: "Type symbols or names, for example Fe O",
    describedby: "f-element-hint",
    chipsLabel: "Selected elements",
    listLabel: "Elements",
    none: "No matching elements",
    items,
    limit: 8,
    rank: rankElement,
    exact: exactElement(items),
    onChange: () => {
      items.forEach((x) => (x.o.selected = !!x.selected));
      refresh();
    },
  });
}

// Keywords: like elements, a spectrum must have every picked keyword.
{
  const select = document.getElementById("f-keyword");
  if (select) {
    const items = [...select.options].map((o) => ({ o, value: o.value, name: o.value, count: Number(o.dataset.count), selected: o.selected }));
    for (const x of items) x.html = esc(x.value);
    select.hidden = true;
    picker({
      id: "f-keyword",
      after: select,
      label: document.querySelector('label[for="f-keyword"]'),
      placeholder: "Type a keyword",
      describedby: "f-keyword-hint",
      chipsLabel: "Selected keywords",
      listLabel: "Keywords",
      none: "No matching keywords",
      items,
      limit: 8,
      rank: (x, q) => {
        const k = x.value.toLowerCase();
        if (k === q) return 0;
        if (k.startsWith(q)) return 1;
        if (words(k).includes(" " + q)) return 2;
        return k.includes(q) ? 3 : -1;
      },
      onChange: () => {
        items.forEach((x) => (x.o.selected = !!x.selected));
        refresh();
      },
    });
  }
}

// Authors: the text field stays the submitted value, a comma-separated list the query matches with OR.
// Typed text that is not picked still counts, as a partial name.
{
  const field = document.getElementById("f-author");
  const known = [...document.querySelectorAll("#f-author-list option")].map((o) => ({ value: o.value, name: o.value, count: Number(o.dataset.count) }));
  const items = known.map((x) => ({ ...x, html: esc(x.name) }));
  field.value.split(",").map((t) => t.trim()).filter(Boolean).forEach((term, i) => {
    const hit = items.find((x) => x.value.toLowerCase() === term.toLowerCase());
    if (hit) hit.selected = i + 1;
    else items.push({ value: term, name: term, count: 0, selected: i + 1 });
  });
  field.hidden = true;
  field.removeAttribute("list");
  document.getElementById("f-author-hint").textContent = "Spectra by any of the selected authors.";
  picker({
    id: "f-author",
    after: field,
    label: document.querySelector('label[for="f-author"]'),
    placeholder: "Type a name",
    describedby: "f-author-hint",
    chipsLabel: "Selected authors",
    listLabel: "Authors",
    none: "No matching authors",
    items,
    limit: 50,
    freeText: true,
    rank: (x, q) => (words(x.name).includes(words(q)) ? 0 : -1),
    onChange: (chosen, typed) => {
      field.value = [...chosen.map((x) => x.value), typed].filter(Boolean).join(", ");
      refresh(400);
    },
  });
}

const eV = (v) => (v >= 1000 ? `${Number((v / 1000).toPrecision(3))} keV` : `${Number(Number(v).toPrecision(3))} eV`);

// Histogram sliders write the number fields (shown only without JavaScript); a thumb at its open end leaves its field empty, so it does not filter.
for (const hist of document.querySelectorAll(".hist")) {
  const lo = Number(hist.dataset.lo);
  const hi = Number(hist.dataset.hi);
  const max = Number(hist.dataset.max);
  const track = hist.querySelector(".hist-range");
  const ranges = [...track.querySelectorAll("input")];
  const fields = ranges.map((r) => document.getElementById(r.dataset.for));
  const bars = [...hist.querySelectorAll("rect")];
  const readout = hist.closest("fieldset").querySelector("output");
  const openEnd = (i) => (ranges.length === 2 && i === 0 ? 0 : max);
  const toEv = (pos) => Number((10 ** (lo + ((hi - lo) * pos) / max)).toPrecision(2));

  const paint = () => {
    const [a, b] = ranges.length === 2 ? ranges.map((r) => Number(r.value)) : [0, Number(ranges[0].value)];
    track.style.setProperty("--a", a / max);
    track.style.setProperty("--b", b / max);
    const [from, to] = ranges.length === 2 ? fields.map((f) => f.value) : ["", fields[0].value];
    readout.textContent = from && to ? `${eV(from)} – ${eV(to)}` : from ? `≥ ${eV(from)}` : to ? `≤ ${eV(to)}` : "Any";
    bars.forEach((bar, i) => {
      const mid = ((i + 0.5) / bars.length) * max;
      bar.classList.toggle("in", mid >= a && mid <= b);
    });
  };

  paint();
  ranges.forEach((range, i) => {
    range.addEventListener("input", () => {
      if (ranges.length === 2) {
        const [a, b] = ranges.map((r) => Number(r.value));
        if (a > b) range.value = i === 0 ? b : a;
      }
      const pos = Number(range.value);
      fields[i].value = pos === openEnd(i) ? "" : toEv(pos);
      paint();
    });
  });
}

