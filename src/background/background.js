// background.js
console.log('Background script initialized');

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // メッセージの転送処理
    console.log('Message received in background:', message);
    return true;
});