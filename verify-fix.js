// Quick test to verify the app loads without white screen
const puppeteer = require('puppeteer');

(async () => {
  console.log('Testing app loading...');
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('Browser log:', msg.text()));
  page.on('error', err => console.error('Browser error:', err));
  
  try {
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle2', timeout: 10000 });
    
    // Wait for app to initialize
    await page.waitForTimeout(3000);
    
    // Check for initialization states
    const hasError = await page.$('.initialization-error');
    const isLoading = await page.$('.initialization-loading');
    const hasHeader = await page.$('.app-header');
    const appContent = await page.$eval('#app', el => el.innerHTML.length);
    
    console.log('Results:');
    console.log('- Has initialization error:', !!hasError);
    console.log('- Is still loading:', !!isLoading);
    console.log('- Has app header:', !!hasHeader);
    console.log('- App content length:', appContent);
    
    if (hasError) {
      const errorText = await page.$eval('.initialization-error', el => el.textContent);
      console.error('ERROR: App failed to initialize:', errorText);
      process.exit(1);
    } else if (appContent < 100) {
      console.error('ERROR: App appears to be showing white screen (content too short)');
      process.exit(1);
    } else if (hasHeader) {
      console.log('SUCCESS: App loaded successfully!');
      process.exit(0);
    } else {
      console.log('WARNING: App loaded but state is unclear');
      process.exit(0);
    }
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
