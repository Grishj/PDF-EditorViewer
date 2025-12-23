document.getElementById('openEditorBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'editor.html' });
});
