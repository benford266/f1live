import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

test.describe('Error Handling Tests', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
  });

  test('should handle backend server not available', async ({ page }) => {
    // Block all requests to the backend
    await page.route('**/api/**', route => route.abort());
    await page.route('**/socket.io/**', route => route.abort());
    
    await appPage.goto();
    
    // Should show disconnected status
    await expect(appPage.connectionStatus.container).toBeVisible();
    const statusText = await appPage.connectionStatus.getStatus();
    expect(statusText).toMatch(/(Disconnected|Error|Failed)/i);
    
    // App should still render the basic UI
    await expect(appPage.liveDataTable.container).toBeVisible();
    await expect(appPage.liveDataTable.header).toBeVisible();
  });

  test('should handle network timeouts gracefully', async ({ page }) => {
    // Simulate slow network by delaying all requests
    await page.route('**/api/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
      route.continue();
    });
    
    await appPage.goto();
    
    // App should still load and show appropriate status
    await expect(appPage.connectionStatus.container).toBeVisible();
    await expect(appPage.liveDataTable.container).toBeVisible();
    
    // Should handle the timeout gracefully without crashing
    const statusText = await appPage.connectionStatus.getStatus();
    expect(statusText).toBeDefined();
  });

  test('should handle malformed WebSocket data', async ({ page }) => {
    // Intercept WebSocket and inject malformed data
    await page.addInitScript(() => {
      const originalWebSocket = window.WebSocket;
      window.WebSocket = class extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          
          // Simulate receiving malformed data after connection
          this.addEventListener('open', () => {
            setTimeout(() => {
              // Simulate malformed JSON
              const event = new MessageEvent('message', {
                data: '{"invalid": json malformed'
              });
              this.dispatchEvent(event);
            }, 1000);
          });
        }
      };
    });
    
    await appPage.goto();
    
    // App should handle malformed data without crashing
    await expect(appPage.connectionStatus.container).toBeVisible();
    await expect(appPage.liveDataTable.container).toBeVisible();
    
    // Should not crash the page
    await page.waitForTimeout(2000);
    await expect(appPage.page.locator('body')).toBeVisible();
  });

  test('should handle empty responses from API', async ({ page }) => {
    // Mock empty responses
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    });
    
    await appPage.goto();
    
    // Should handle empty data gracefully
    await expect(appPage.liveDataTable.container).toBeVisible();
    
    // Should show no data message or handle empty state
    const hasDrivers = await appPage.liveDataTable.getDriverCount() > 0;
    const hasNoDataMessage = await appPage.liveDataTable.hasNoDataMessage();
    
    expect(hasDrivers || hasNoDataMessage).toBe(true);
  });

  test('should handle API errors (500, 404, etc.)', async ({ page }) => {
    // Mock API errors
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Internal Server Error',
          message: 'Something went wrong'
        })
      });
    });
    
    await appPage.goto();
    
    // App should handle API errors gracefully
    await expect(appPage.liveDataTable.container).toBeVisible();
    
    // Connection status should reflect the error state
    const statusText = await appPage.connectionStatus.getStatus();
    expect(statusText).toMatch(/(Error|Failed|Disconnected)/i);
  });

  test('should handle browser compatibility issues', async ({ page }) => {
    // Test with disabled JavaScript features
    await page.addInitScript(() => {
      // Simulate missing WebSocket support
      delete (window as any).WebSocket;
    });
    
    await appPage.goto();
    
    // App should still render basic UI even without WebSocket
    await expect(appPage.liveDataTable.container).toBeVisible();
    await expect(appPage.connectionStatus.container).toBeVisible();
    
    // Should show appropriate error message
    const statusText = await appPage.connectionStatus.getStatus();
    expect(statusText).toMatch(/(Error|Not supported|Disconnected)/i);
  });

  test('should handle memory leaks and resource cleanup', async ({ page }) => {
    // Test repeated connection/disconnection cycles
    for (let i = 0; i < 3; i++) {
      // Block connections
      await page.route('**/socket.io/**', route => route.abort());
      await page.reload();
      await appPage.waitForLoad();
      
      // Allow connections
      await page.unroute('**/socket.io/**');
      await page.reload();
      await appPage.waitForLoad();
    }
    
    // App should still be responsive after multiple cycles
    await expect(appPage.connectionStatus.container).toBeVisible();
    await expect(appPage.liveDataTable.container).toBeVisible();
    
    // Check that the page is still functional
    const isAppWorking = await page.evaluate(() => {
      return document.querySelector('.live-data-table') !== null &&
             document.querySelector('.connection-status') !== null;
    });
    
    expect(isAppWorking).toBe(true);
  });

  test('should handle rapid data updates without performance degradation', async ({ page }) => {
    await appPage.goto();
    
    // Monitor console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Simulate rapid updates by injecting events
    await page.evaluate(() => {
      // Simulate receiving rapid WebSocket updates
      const mockData = {
        drivers: Array.from({ length: 20 }, (_, i) => ({
          id: `driver-${i}`,
          number: `${i + 1}`,
          name: `Driver ${i + 1}`,
          team: `Team ${i + 1}`,
          position: i + 1,
          gapToLeader: i === 0 ? '0' : `+${(i * 0.5).toFixed(3)}`,
          lastLapTime: `1:${20 + i}.${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          bestLapTime: `1:${19 + i}.${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          completedLaps: 25 + i,
          speed: 300 + i * 2,
          isRetired: false,
          isPitStop: false,
          teamColor: '#FF0000'
        }))
      };
      
      // Trigger rapid updates
      for (let j = 0; j < 50; j++) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('mock-driver-update', { detail: mockData }));
        }, j * 10);
      }
    });
    
    // Wait for updates to process
    await page.waitForTimeout(2000);
    
    // Check that no JavaScript errors occurred
    expect(consoleErrors.length).toBe(0);
    
    // App should still be responsive
    await expect(appPage.liveDataTable.container).toBeVisible();
    await expect(appPage.connectionStatus.container).toBeVisible();
  });

  test('should handle page visibility changes gracefully', async ({ page }) => {
    await appPage.goto();
    
    // Simulate page becoming hidden (user switches tabs)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    await page.waitForTimeout(1000);
    
    // Simulate page becoming visible again
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    // App should still be functional
    await expect(appPage.connectionStatus.container).toBeVisible();
    await expect(appPage.liveDataTable.container).toBeVisible();
  });

  test('should handle CORS errors gracefully', async ({ page }) => {
    // Mock CORS error response
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 0, // CORS error typically results in status 0
        body: ''
      });
    });
    
    await appPage.goto();
    
    // App should handle CORS errors without crashing
    await expect(appPage.connectionStatus.container).toBeVisible();
    await expect(appPage.liveDataTable.container).toBeVisible();
    
    // Should show appropriate error state
    const statusText = await appPage.connectionStatus.getStatus();
    expect(statusText).toMatch(/(Error|Failed|Disconnected)/i);
  });
});