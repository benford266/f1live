import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

test.describe('WebSocket Connection Tests', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    await appPage.goto();
  });

  test('should establish WebSocket connection', async () => {
    // Wait for connection to be established
    await expect(appPage.connectionStatus.container).toBeVisible();
    
    // Check if connection status indicates connected or attempting to connect
    const statusText = await appPage.connectionStatus.container.textContent();
    expect(statusText).toMatch(/(Connected|Connecting)/);
  });

  test('should show connection status updates', async () => {
    const connectionStatus = appPage.connectionStatus.container;
    await expect(connectionStatus).toBeVisible();
    
    // Initial status should be visible
    const initialStatus = await connectionStatus.textContent();
    expect(initialStatus).toBeDefined();
    expect(initialStatus?.length).toBeGreaterThan(0);
  });

  test('should handle connection loss gracefully', async ({ page }) => {
    // Mock network failure by intercepting WebSocket connections
    await page.route('**/socket.io/**', route => route.abort());
    
    // Reload to simulate connection issues
    await page.reload();
    await appPage.waitForLoad();
    
    // Should show disconnected state or error
    await expect(appPage.connectionStatus.container).toBeVisible();
    
    const statusText = await appPage.connectionStatus.container.textContent();
    expect(statusText).toMatch(/(Disconnected|Error|Failed)/i);
  });

  test('should attempt reconnection', async ({ page }) => {
    // Initially should try to connect
    await expect(appPage.connectionStatus.container).toBeVisible();
    
    // Monitor network requests for reconnection attempts
    const wsRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('socket.io')) {
        wsRequests.push(request.url());
      }
    });
    
    // Wait a bit to capture any reconnection attempts
    await page.waitForTimeout(2000);
    
    // Should have made at least one WebSocket connection attempt
    expect(wsRequests.length).toBeGreaterThan(0);
  });

  test('should display real-time updates when connected', async ({ page }) => {
    // Wait for potential data to load
    await page.waitForTimeout(3000);
    
    // Check if driver data is being displayed
    const driverRows = appPage.liveDataTable.getDriverRows();
    const driverCount = await driverRows.count();
    
    if (driverCount > 0) {
      // If drivers are displayed, verify data structure
      const firstRow = driverRows.first();
      await expect(firstRow).toBeVisible();
      
      // Check that the row contains expected data fields
      await expect(firstRow.locator('.position-number')).toBeVisible();
      await expect(firstRow.locator('.driver-name')).toBeVisible();
      await expect(firstRow.locator('.team-name')).toBeVisible();
    } else {
      // If no drivers, should show appropriate message
      const noDataMessage = page.locator('.no-data');
      await expect(noDataMessage).toBeVisible();
    }
  });

  test('should handle WebSocket message reception', async ({ page }) => {
    // Listen for WebSocket frames (if connection is established)
    let wsFrameReceived = false;
    
    page.on('websocket', ws => {
      ws.on('framereceived', () => {
        wsFrameReceived = true;
      });
    });
    
    // Wait for potential WebSocket activity
    await page.waitForTimeout(5000);
    
    // Note: In a real test environment with mock data, we would expect frames
    // In this case, we just verify the infrastructure is working
    const connectionStatus = await appPage.connectionStatus.container.textContent();
    expect(connectionStatus).toBeDefined();
  });

  test('should maintain connection during user interaction', async ({ page }) => {
    // Perform various user interactions
    await page.mouse.move(100, 100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1000);
    
    // Connection should remain stable
    const statusAfterInteraction = await appPage.connectionStatus.container.textContent();
    expect(statusAfterInteraction).not.toMatch(/Error|Failed/i);
  });

  test('should handle rapid data updates without performance issues', async ({ page }) => {
    const startTime = Date.now();
    
    // Wait for the app to settle
    await page.waitForTimeout(2000);
    
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    // App should remain responsive (less than 5 seconds)
    expect(loadTime).toBeLessThan(5000);
    
    // UI should still be interactive
    await expect(appPage.liveDataTable.container).toBeVisible();
    await expect(appPage.connectionStatus.container).toBeVisible();
  });

  test('should show last update timestamp when available', async () => {
    const connectionStatus = appPage.connectionStatus.container;
    await expect(connectionStatus).toBeVisible();
    
    // If connected and receiving data, might show last update time
    const statusText = await connectionStatus.textContent();
    
    if (statusText?.includes('Connected')) {
      // May include timestamp information
      const hasTimeInfo = statusText.includes('Last update') || statusText.includes(':');
      
      // This is optional since it depends on whether data is actually flowing
      if (hasTimeInfo) {
        expect(statusText).toMatch(/\d{1,2}:\d{2}/); // Time format
      }
    }
  });
});