// QuickAI Shorts Chrome Extension Content Script
// Injects a premium quick-action button into the YouTube UI to launch the QuickAI Shorts Editor.

(function () {
  console.log("[QuickAI Shorts] Content script loaded.");

  function injectButton() {
    const existingButton = document.getElementById("quickai-shorts-btn");
    if (existingButton) return;

    // We search for a variety of containers in order of preference to ensure layout changes don't break the extension.
    const selectors = [
      "#top-row.ytd-watch-metadata",                                            // Modern YouTube watch layout top row
      "#actions-inner #top-level-buttons-computed",                             // Watch actions row buttons container
      "ytd-watch-metadata #actions-inner",                                      // Actions inner fallback
      "ytd-menu-renderer.ytd-watch-metadata",                                   // Watch metadata menu renderer
      "#owner",                                                                 // Channel info container (placed right beside subscribe button)
    ];

    let targetContainer = null;
    let injectionMethod = "append"; // How to inject (append or insertAfter)

    for (const selector of selectors) {
      targetContainer = document.querySelector(selector);
      if (targetContainer) {
        if (selector === "#owner") {
          // If we attach to the owner container, let's insert it right after the container for clean alignment
          injectionMethod = "after";
        }
        console.log(`[QuickAI Shorts] Target container found using selector: "${selector}" (Method: ${injectionMethod})`);
        break;
      }
    }

    if (!targetContainer) {
      return;
    }

    const btn = document.createElement("button");
    btn.id = "quickai-shorts-btn";
    btn.className = "yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m";
    btn.style.marginLeft = "10px";
    btn.style.marginRight = "4px";
    btn.style.backgroundColor = "#a855f7"; // Premium Accent Color (Purple) matching the app design system
    btn.style.color = "#ffffff";
    btn.style.borderRadius = "18px";
    btn.style.padding = "0 16px";
    btn.style.height = "36px";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "600";
    btn.style.fontSize = "13px";
    btn.style.border = "none";
    btn.style.boxShadow = "0 0 10px rgba(168,85,247,0.4)";
    btn.style.transition = "transform 0.1s ease, filter 0.2s ease";
    btn.innerText = "✦ QuickAI Short";

    // Adding hover and active micro-animations
    btn.onmouseenter = () => {
      btn.style.filter = "brightness(1.1)";
    };
    btn.onmouseleave = () => {
      btn.style.filter = "brightness(1)";
    };
    btn.onmousedown = () => {
      btn.style.transform = "scale(0.96)";
    };
    btn.onmouseup = () => {
      btn.style.transform = "scale(1)";
    };

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const videoId = new URLSearchParams(window.location.search).get("v");
      if (videoId) {
        console.log(`[QuickAI Shorts] Launching editor for video ID: ${videoId}`);
        window.open(
          `https://www.quickaishort.online/editor?v=${videoId}`,
          "_blank"
        );
      } else {
        console.warn("[QuickAI Shorts] No video ID found in current URL query parameters.");
      }
    };

    try {
      if (injectionMethod === "after") {
        targetContainer.parentNode.insertBefore(btn, targetContainer.nextSibling);
      } else {
        targetContainer.appendChild(btn);
      }
      console.log("[QuickAI Shorts] Button successfully injected into YouTube page.");
    } catch (err) {
      console.error("[QuickAI Shorts] Failed to inject button:", err);
    }
  }

  // Observe DOM changes to re-inject button if navigation happens (YouTube uses a Single Page Application router)
  const observer = new MutationObserver(() => {
    // Only run injection logic on watch pages
    if (window.location.pathname === "/watch") {
      injectButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial page-load run
  if (window.location.pathname === "/watch") {
    setTimeout(injectButton, 1000);
    setTimeout(injectButton, 3000); // Fail-safe fallback delay
  }
})();
