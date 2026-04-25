// QuickAI Shorts Content Script
// Injects a button into the YouTube UI to launch the editor

function injectButton() {
  const existingButton = document.getElementById("quickai-shorts-btn");
  if (existingButton) return;

  // Find the target container (secondary actions row usually contains Share, Download, etc.)
  // This selector might need adjustment based on YouTube's layout updates
  const targetContainer =
    document.querySelector("#top-row.ytd-watch-metadata") ||
    document.querySelector("#actions-inner #top-level-buttons-computed");

  if (targetContainer) {
    const btn = document.createElement("button");
    btn.id = "quickai-shorts-btn";
    btn.className =
      "yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m";
    btn.style.marginLeft = "8px";
    btn.style.backgroundColor = "#FF0050"; // Brand color
    btn.style.color = "#fff";
    btn.style.borderRadius = "18px";
    btn.style.padding = "0 16px";
    btn.style.height = "36px";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "500";
    btn.style.fontSize = "14px";
    btn.innerText = "⚡ QuickAI Short";

    btn.onclick = () => {
      const videoId = new URLSearchParams(window.location.search).get("v");
      if (videoId) {
        window.open(
          `https://quickaishort.online/editor?v=${videoId}`,
          "_blank"
        );
      }
    };

    targetContainer.appendChild(btn);
  }
}

// Observe DOM changes to re-inject button if navigation happens (SPA)
const observer = new MutationObserver(() => {
  injectButton();
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial injection
setTimeout(injectButton, 2000);
