// A video in a news article is a thumbnail linking to YouTube. Pressing it loads the player in its place, so the reader's
// browser contacts YouTube only then.
document.addEventListener("click", (e) => {
  const link = e.target.closest("a.yt-link");
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const frame = document.createElement("iframe");
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(link.dataset.youtube)}?autoplay=1`;
  frame.title = "YouTube video";
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;
  link.replaceWith(frame);
});
