// Background service worker
console.log("PDF Editor Extension Installed");

chrome.runtime.onInstalled.addListener(() => {
  console.log("PDF Editor Extension initialized.");
});
