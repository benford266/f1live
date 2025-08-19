import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

test.describe('F1 Live Data Visualization App', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    await appPage.goto();
  });

  test('should load the application successfully', async () => {
    await expect(appPage.page).toHaveTitle(/F1 Live Data Visualization/);
  });

  test('should display the main header', async () => {
    await expect(appPage.raceHeader.title).toBeVisible();
    await expect(appPage.raceHeader.title).toContainText(/F1 Live Data/);
  });

  test('should show connection status component', async () => {
    await expect(appPage.connectionStatus.container).toBeVisible();
  });

  test('should display the live data table', async () => {
    await expect(appPage.liveDataTable.container).toBeVisible();
    await expect(appPage.liveDataTable.header).toContainText('Driver Standings');
  });

  test('should have proper table structure', async () => {
    await expect(appPage.liveDataTable.table).toBeVisible();
    
    // Check table headers
    const expectedHeaders = ['Pos', 'Driver', 'Team', 'Gap', 'Last Lap', 'Best Lap', 'Laps', 'Speed'];
    for (const header of expectedHeaders) {
      await expect(appPage.liveDataTable.getHeaderByText(header)).toBeVisible();
    }
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
    
    await expect(appPage.liveDataTable.container).toBeVisible();
    await expect(appPage.connectionStatus.container).toBeVisible();
    
    // Table should still be readable on mobile
    await expect(appPage.liveDataTable.table).toBeVisible();
  });

  test('should handle no data state gracefully', async () => {
    // On initial load, there might be no data
    const noDataMessage = appPage.page.locator('.no-data');
    
    // Either data is loaded or no-data message is shown
    await expect(
      appPage.liveDataTable.getDriverRows().first().or(noDataMessage)
    ).toBeVisible();
  });

  test('should display loading state appropriately', async () => {
    // Check if there's any loading indication during initial load
    const connectionStatus = appPage.connectionStatus.container;
    await expect(connectionStatus).toBeVisible();
    
    // Connection status should show some state (connected, connecting, or disconnected)
    const statusText = await connectionStatus.textContent();
    expect(statusText).toMatch(/(Connected|Connecting|Disconnected)/);
  });
});