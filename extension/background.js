// Background service worker
// Handles installation and potential OAuth flows

chrome.runtime.onInstalled.addListener(() => {
  console.log("QuickAI Shorts Extension Installed");
});

// Listen for messages from content script if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_AUTH_TOKEN") {
    // Placeholder for future OAuth integration if needed directly in extension
    sendResponse({ token: null });
  }
});
