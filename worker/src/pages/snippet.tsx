import { raw } from "hono/html";
// @ts-expect-error plain browser module, no types
import { highlightPython, hyperspyCode } from "../../public/snippet.js";

// Wires the copy button of the code block just before this script.
const COPY_SCRIPT = `;(function(){var b=document.currentScript.previousElementSibling,t=b.querySelector(".code-copied"),h;b.querySelector(".code-copy button").addEventListener("click",function(){navigator.clipboard.writeText(b.querySelector("pre").textContent).then(function(){t.textContent="Copied!";t.classList.add("show");clearTimeout(h);h=setTimeout(function(){t.classList.remove("show")},1500)},function(){getSelection().selectAllChildren(b.querySelector("code"))})})})()`;

/** Load one spectrum file in HyperSpy, highlighted like the docs. With `live`, the spectrum page rebuilds it from its data attributes. */
export function HyperSpySnippet(props: { url: string; file: string; signalType?: string; live?: boolean }) {
  const live = props.live ? { id: "snippet-code", "data-url": props.url, "data-file": props.file, "data-signal-type": props.signalType } : {};
  return (
    <>
      <div class="code-block">
        <pre><code {...live}>{raw(highlightPython(hyperspyCode([{ url: props.url, file: props.file, signalType: props.signalType }])))}</code></pre>
        <div class="code-copy">
          <span class="code-copied" role="status"></span>
          <button type="button" aria-label="Copy to clipboard"></button>
        </div>
      </div>
      <script>{raw(COPY_SCRIPT)}</script>
    </>
  );
}
