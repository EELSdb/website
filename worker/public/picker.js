export const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Items { value: symbol, name }: symbol, then name prefix, then anywhere in the name. */
export function rankElement(x, q) {
  const sym = x.value.toLowerCase();
  const name = x.name.toLowerCase();
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (name.includes(q)) return 3;
  return -1;
}
export const exactElement = (items) => (w) => items.find((x) => x.value.toLowerCase() === w.toLowerCase() || x.name.toLowerCase() === w.toLowerCase());

// A type-to-filter combobox with removable chips, drawn over a native field that stays the submitted value.
// items: { value, name, html, count?, chip?, selected: pick order or falsy }; rank(item, query) → sort key, or -1 for no match.
// exact(word) → the item a whole typed word names, so "Fe O " or a pasted "Fe, O" picks both without Enter.
export function picker({ id, after, label, placeholder, describedby, chipsLabel, listLabel, none, items, rank, limit, onChange, freeText, exact }) {
  const box = document.createElement("div");
  box.className = "picker";
  box.innerHTML = `<ul class="picker-chips" aria-label="${chipsLabel}"></ul>
    <input type="text" id="${id}-input" role="combobox" autocomplete="off" spellcheck="false" placeholder="${placeholder}"
      aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" aria-describedby="${describedby}">
    <ul class="picker-list" id="${id}-list" role="listbox" aria-label="${listLabel}" hidden></ul>`;
  after.after(box);
  label.htmlFor = `${id}-input`;
  const chips = box.querySelector(".picker-chips");
  const input = box.querySelector("input");
  const list = box.querySelector("[role=listbox]");
  let matches = [];
  let active = -1;
  let seq = items.length;
  // `selected` holds the pick order, so chips and Backspace follow it.
  const picked = () => items.filter((x) => x.selected).sort((a, b) => a.selected - b.selected);

  const changed = () => {
    renderChips();
    onChange(picked(), freeText ? input.value.trim() : "");
  };

  const renderChips = () => {
    chips.replaceChildren(
      ...picked().map((x) => {
        const li = document.createElement("li");
        li.innerHTML = `<button type="button" class="chip"><span class="v"></span> <span aria-hidden="true">×</span></button>`;
        li.firstChild.setAttribute("aria-label", `Remove ${x.name}`);
        li.querySelector(".v").textContent = x.chip ?? x.value;
        li.firstChild.addEventListener("click", () => {
          x.selected = false;
          changed();
          input.focus();
        });
        return li;
      }),
    );
    chips.hidden = !chips.children.length;
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const setActive = (i) => {
    active = i;
    list.querySelectorAll("[role=option]").forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    if (i < 0) return input.removeAttribute("aria-activedescendant");
    input.setAttribute("aria-activedescendant", `${id}-opt-${i}`);
    list.children[i].scrollIntoView({ block: "nearest" });
  };

  const open = () => {
    const q = input.value.trim().toLowerCase();
    const free = items.filter((x) => !x.selected);
    matches = q
      ? free.map((x) => [rank(x, q), x]).filter(([r]) => r >= 0).sort((a, b) => a[0] - b[0] || b[1].count - a[1].count).map(([, x]) => x)
      : free.toSorted((a, b) => b.count - a.count);
    matches = matches.slice(0, limit);
    list.replaceChildren(
      ...(matches.length
        ? matches.map((x, i) => {
            const li = document.createElement("li");
            li.id = `${id}-opt-${i}`;
            li.setAttribute("role", "option");
            if (x.count === 0) li.className = "empty";
            li.innerHTML = x.count === undefined ? x.html : `${x.html} <span class="n">${x.count}</span>`;
            li.addEventListener("mousedown", (e) => e.preventDefault());
            li.addEventListener("click", () => add(i));
            return li;
          })
        : [Object.assign(document.createElement("li"), { className: "none", textContent: none })]),
    );
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.scrollIntoView({ block: "nearest" });
    setActive(matches.length ? 0 : -1);
  };

  const add = (i) => {
    matches[i].selected = ++seq;
    input.value = "";
    changed();
    close();
  };

  const pickWords = () => {
    const words = input.value.split(/[\s,;]+/);
    if (words.length < 2) return;
    const last = words.pop();
    const left = [];
    for (const w of words.filter(Boolean)) {
      const x = exact(w);
      if (x && !x.selected) x.selected = ++seq;
      else if (!x) left.push(w);
    }
    input.value = [...left, last].join(" ");
    changed();
  };

  input.addEventListener("input", () => {
    if (exact) pickWords();
    if (freeText) changed();
    input.value.trim() ? open() : close();
  });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    const shown = !list.hidden;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!shown) return open();
      if (matches.length) setActive((active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === "Enter" && exact && /[\s,;]/.test(input.value.trim())) {
      e.preventDefault();
      input.value += " ";
      pickWords();
      input.value.trim() ? open() : close();
    } else if (e.key === "Enter" && shown && active >= 0) {
      e.preventDefault();
      add(active);
    } else if (e.key === "Enter" && shown && !freeText) {
      e.preventDefault();
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      close();
    } else if (e.key === "Backspace" && input.value === "") {
      const last = picked().at(-1);
      if (last) {
        last.selected = false;
        changed();
      }
    }
  });
  renderChips();
  return {
    /** Picks these values, in order. A value no item has gets an item of its own, so it still shows and can be removed. */
    set(values) {
      for (const x of items) x.selected = false;
      for (const v of values) {
        let x = items.find((i) => i.value === v);
        if (!x) items.push((x = { value: v, name: v, html: esc(v) }));
        x.selected ||= ++seq;
      }
      renderChips();
    },
  };
}
