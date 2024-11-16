// popup.js
document.addEventListener('DOMContentLoaded', function() {
  const button = document.getElementById('getData');
  const status = document.getElementById('status');
  const yearSelect = document.getElementById('yearSelect');
  const monthSelect = document.getElementById('monthSelect');

  // 現在の年月を初期値に設定
  const now = new Date();
  yearSelect.value = now.getFullYear().toString();
  monthSelect.value = (now.getMonth() + 1).toString();

  // メッセージリスナーを設定
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Received message in popup:', message);  // デバッグログ

      if (message.type === 'SCRAPING_COMPLETE') {
          try {
              const summary = message.summary;
              status.innerHTML = `
                  ${yearSelect.value}年${monthSelect.value}月の取得完了:<br>
                  - 商品数: ${summary.totalItems}件<br>
                  - 総売上: ¥${summary.totalSales.toLocaleString()}<br>
                  - 総利益: ¥${summary.totalProfit.toLocaleString()}
              `;

              // CSVデータの作成とダウンロード
              if (message.csvData) {
                  console.log('Preparing CSV download...');  // デバッグログ
                  
                  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);  // UTF-8 BOM
                  const csvContent = message.csvData;
                  const blob = new Blob([bom, csvContent], { 
                      type: 'text/csv;charset=utf-8'
                  });
                  
                  // ファイル名の生成
                  const year = yearSelect.value;
                  const month = monthSelect.value.padStart(2, '0');
                  const timestamp = new Date().toISOString().split('T')[0];
                  const filename = `mercari_sales_${year}_${month}_${timestamp}.csv`;

                  console.log('Initiating download:', filename);  // デバッグログ

                  // ダウンロードの実行
                  chrome.downloads.download({
                      url: URL.createObjectURL(blob),
                      filename: filename,
                      saveAs: true
                  }, (downloadId) => {
                      if (chrome.runtime.lastError) {
                          console.error('Download error:', chrome.runtime.lastError);
                          status.innerHTML += '<br>CSVダウンロードエラー';
                      } else {
                          console.log('Download started:', downloadId);
                          status.innerHTML += '<br>CSVファイルをダウンロードしました';
                      }
                  });
              } else {
                  console.error('No CSV data available');
                  status.innerHTML += '<br>CSVデータがありません';
              }

              button.disabled = false;

          } catch (error) {
              console.error('Error processing scraping results:', error);
              status.textContent = `処理エラー: ${error.message}`;
              button.disabled = false;
          }

      } else if (message.type === 'SCRAPING_ERROR') {
          console.error('Scraping error:', message.error);
          status.textContent = `エラー: ${message.error}`;
          button.disabled = false;
      }
  });

  button.addEventListener('click', async () => {
      try {
          button.disabled = true;
          status.textContent = 'データ取得中...';

          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) {
              throw new Error('アクティブなタブが見つかりません');
          }

          // Content Scriptの注入
          console.log('Injecting content script...');
          await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['src/content/scraper.js']
          });

          console.log('Content script injected, sending message...');
          // スクレイピング開始メッセージを送信
          chrome.tabs.sendMessage(tab.id, { 
              type: 'SCRAPE_DATA',
              period: {
                  targetYear: parseInt(yearSelect.value),
                  targetMonth: parseInt(monthSelect.value)
              }
          }, (response) => {
              if (chrome.runtime.lastError) {
                  console.error('Message error:', chrome.runtime.lastError);
                  status.textContent = 'エラー: スクリプトの実行に失敗しました';
                  button.disabled = false;
                  return;
              }

              if (response && response.status === 'starting') {
                  status.textContent = 'データ取得中...（複数ページを処理中）';
              } else {
                  status.textContent = 'エラー: 処理を開始できませんでした';
                  button.disabled = false;
              }
          });

      } catch (error) {
          console.error('Error initiating scraping:', error);
          status.textContent = `エラー: ${error.message}`;
          button.disabled = false;
      }
  });
});