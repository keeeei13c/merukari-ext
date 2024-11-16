// メインのデータ抽出関数
function extractSalesData(period) {
  const rows = document.querySelectorAll('.merTableRowGroup:nth-child(2) .merTableRow');
  console.log(`現在のページで見つかった商品行数: ${rows.length}`);
  console.log('検索対象期間:', period);

  let matchCount = 0;
  const salesData = Array.from(rows)
      .map(row => {
          try {
              const cells = row.querySelectorAll('.merTableCell');
              if (cells.length === 0) {
                  console.log('セルが見つかりません');
                  return null;
              }

              const completionDate = cells[8].textContent.trim();
              if (!isDateInRange(completionDate, period)) {
                  console.log(`期間外のデータをスキップ: ${completionDate}`);
                  return null;
              }

              const extractPrice = (cell) => {
                  const priceElement = cell.querySelector('.number__6b270ca7');
                  if (!priceElement) return 0;
                  return parseInt(priceElement.textContent.replace(/,/g, '') || '0');
              };

              matchCount++;

              const data = {
                  title: cells[0].querySelector('[data-testid="sold-item-link"]')?.textContent?.trim() || '',
                  imageUrl: cells[0].querySelector('img')?.src || '',
                  price: extractPrice(cells[1]),
                  commission: extractPrice(cells[2]),
                  shippingFee: extractPrice(cells[3]),
                  otherFee: cells[4].textContent.trim(),
                  taxRate: cells[5].textContent.trim(),
                  profit: extractPrice(cells[6]),
                  completionDate: completionDate
              };

              const linkElement = cells[0].querySelector('[data-testid="sold-item-link"]');
              if (linkElement) {
                  data.itemUrl = 'https://jp.mercari.com' + linkElement.getAttribute('href');
              }

              console.log('抽出したデータ:', data);
              return data;

          } catch (error) {
              console.error('データ抽出エラー:', error);
              return null;
          }
      })
      .filter(item => item !== null);

  console.log(`期間内の有効なデータ数: ${salesData.length}`);
  return salesData;
}

// 日付チェック関数
function isDateInRange(dateStr, period) {
  try {
      const [year, month] = dateStr.split('/').map(num => parseInt(num));
      
      console.log('日付チェック:', {
          dateStr,
          extractedYear: year,
          extractedMonth: month,
          targetYear: period.targetYear,
          targetMonth: period.targetMonth
      });

      return year === period.targetYear && month === period.targetMonth;

  } catch (error) {
      console.error('日付解析エラー:', {dateStr, error});
      return false;
  }
}

// ページ遷移後の待機関数
async function waitForNewContent(currentPage, timeout = 5000) {
  return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 10;
      
      const checkContent = () => {
          attempts++;
          const rows = document.querySelectorAll('.merTableRowGroup:nth-child(2) .merTableRow');
          
          if (rows.length > 0) {
              console.log(`ページ ${currentPage + 1} のコンテンツを確認`);
              resolve();
          } else if (attempts >= maxAttempts) {
              reject(new Error('ページ読み込みタイムアウト'));
          } else {
              setTimeout(checkContent, 500);
          }
      };

      checkContent();
      setTimeout(() => reject(new Error('ページ読み込みタイムアウト')), timeout);
  });
}

// 複数ページの取得関数
async function scrapeAllPages(period, maxPages = 5) {
  let allData = [];
  let currentPage = 1;

  while (currentPage <= maxPages) {
      console.log(`ページ ${currentPage} の処理を開始`);
      
      const pageData = extractSalesData(period);
      if (pageData.length > 0) {
          allData = [...allData, ...pageData];
      }

      const nextButton = document.querySelector('[data-testid="pagination-next-button"]');
      if (!nextButton || nextButton.disabled) {
          console.log('次のページがないため終了');
          break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      nextButton.click();
      await waitForNewContent(currentPage);
      currentPage++;
  }

  return allData;
}

// CSV生成関数
function generateCSV(data) {
  const headers = [
      '商品名', '販売価格', '販売手数料', '送料', 
      'その他費用', '税率', '販売利益', '購入完了日'
  ];
  
  const rows = data.map(item => [
      item.title,
      item.price,
      item.commission,
      item.shippingFee,
      item.otherFee,
      item.taxRate,
      item.profit,
      item.completionDate
  ].map(cell => `"${cell}"`).join(','));

  return [headers.join(','), ...rows].join('\n');
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in content script:', message);
  
  if (message.type === 'SCRAPE_DATA') {
      (async () => {
          try {
              console.log('複数ページのスクレイピング開始');
              
              sendResponse({
                  success: true,
                  status: 'starting',
                  message: 'データ取得を開始しました'
              });

              const allData = await scrapeAllPages(message.period);
              console.log(`全${allData.length}件のデータを取得`);

              const csvData = generateCSV(allData);
              
              const summary = {
                  totalItems: allData.length,
                  totalSales: allData.reduce((sum, item) => sum + (item.price || 0), 0),
                  totalProfit: allData.reduce((sum, item) => sum + (item.profit || 0), 0)
              };

              chrome.runtime.sendMessage({
                  type: 'SCRAPING_COMPLETE',
                  success: true,
                  data: allData,
                  csvData: csvData,
                  summary: summary,
                  timestamp: new Date().toISOString()
              });

          } catch (error) {
              console.error('スクレイピングエラー:', error);
              chrome.runtime.sendMessage({
                  type: 'SCRAPING_ERROR',
                  error: error.message
              });
          }
      })();

      return true;
  }
});

console.log('Content script loaded');