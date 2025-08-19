import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

test.describe('Live Data Table Tests', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    await appPage.goto();
  });

  test('should display table with correct headers', async () => {
    await expect(appPage.liveDataTable.container).toBeVisible();
    await expect(appPage.liveDataTable.header).toContainText('Driver Standings');
    
    const expectedHeaders = ['Pos', 'Driver', 'Team', 'Gap', 'Last Lap', 'Best Lap', 'Laps', 'Speed'];
    
    for (const headerText of expectedHeaders) {
      const header = appPage.liveDataTable.getHeaderByText(headerText);
      await expect(header).toBeVisible();
    }
  });

  test('should show driver count in header', async () => {
    const driverCount = await appPage.liveDataTable.getDriverCount();
    const headerText = await appPage.liveDataTable.header.textContent();
    
    if (driverCount > 0) {
      expect(headerText).toContain(`${driverCount} drivers`);
    } else {
      // Should show appropriate message for no drivers
      expect(headerText).toContain('Driver Standings');
    }
  });

  test('should display driver data when available', async ({ page }) => {
    // Wait for potential data to load
    await page.waitForTimeout(3000);
    
    const driverRows = appPage.liveDataTable.getDriverRows();
    const rowCount = await driverRows.count();
    
    if (rowCount > 0) {
      // Test first driver row structure
      const firstRow = driverRows.first();
      
      await expect(firstRow.locator('.position-number')).toBeVisible();
      await expect(firstRow.locator('.driver-name')).toBeVisible();
      await expect(firstRow.locator('.team-name')).toBeVisible();
      
      // Check that position is a number
      const positionText = await firstRow.locator('.position-number').textContent();
      expect(positionText).toMatch(/^\d+$/);
      
      // Check that driver has a name
      const driverName = await firstRow.locator('.driver-name').textContent();
      expect(driverName).toBeDefined();
      expect(driverName?.length).toBeGreaterThan(0);
      
      // Check that team is displayed
      const teamName = await firstRow.locator('.team-name').textContent();
      expect(teamName).toBeDefined();
      expect(teamName?.length).toBeGreaterThan(0);
    } else {
      // Should show no data message
      const noDataMessage = page.locator('.no-data');
      await expect(noDataMessage).toBeVisible();
    }
  });

  test('should show no data message when no drivers', async ({ page }) => {
    // If no drivers are loaded (which is likely in test environment)
    const driverRows = appPage.liveDataTable.getDriverRows();
    const rowCount = await driverRows.count();
    
    if (rowCount === 0) {
      const noDataElement = page.locator('.no-data');
      await expect(noDataElement).toBeVisible();
      
      const noDataText = await noDataElement.textContent();
      expect(noDataText).toMatch(/(Waiting for driver data|No connection to race data)/);
    }
  });

  test('should display team colors when drivers present', async ({ page }) => {
    const driverRows = appPage.liveDataTable.getDriverRows();
    const rowCount = await driverRows.count();
    
    if (rowCount > 0) {
      const firstRow = driverRows.first();
      const teamColorElement = firstRow.locator('.team-color');
      
      await expect(teamColorElement).toBeVisible();
      
      // Check that it has a background color
      const backgroundColor = await teamColorElement.evaluate(
        el => window.getComputedStyle(el).backgroundColor
      );
      expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)'); // Not transparent
      expect(backgroundColor).not.toBe(''); // Not empty
    }
  });

  test('should format lap times correctly', async ({ page }) => {
    const driverRows = appPage.liveDataTable.getDriverRows();
    const rowCount = await driverRows.count();
    
    if (rowCount > 0) {
      const firstRow = driverRows.first();
      
      // Check last lap time format
      const lastLapCell = firstRow.locator('.last-lap');
      const lastLapText = await lastLapCell.textContent();
      
      if (lastLapText && lastLapText !== '-') {
        // Should be in format like "1:23.456" or just "-"
        expect(lastLapText).toMatch(/^(\d:\d{2}\.\d{3}|-)$/);
      }
      
      // Check best lap time format
      const bestLapCell = firstRow.locator('.best-lap');
      const bestLapText = await bestLapCell.textContent();
      
      if (bestLapText && bestLapText !== '-') {
        expect(bestLapText).toMatch(/^(\d:\d{2}\.\d{3}|-)$/);
      }
    }
  });

  test('should format gap times correctly', async ({ page }) => {
    const driverRows = appPage.liveDataTable.getDriverRows();
    const rowCount = await driverRows.count();
    
    if (rowCount > 0) {
      const firstRow = driverRows.first();
      const gapCell = firstRow.locator('.gap-time');
      const gapText = await gapCell.textContent();
      
      // Gap should be "LEADER" for P1 or "+X.XXX" format for others
      if (gapText) {
        expect(gapText).toMatch(/^(LEADER|\+\d+\.\d+|\d+ LAP)$/);
      }
    }
  });

  test('should display speed in correct format', async ({ page }) => {
    const driverRows = appPage.liveDataTable.getDriverRows();
    const rowCount = await driverRows.count();
    
    if (rowCount > 0) {
      const firstRow = driverRows.first();
      const speedCell = firstRow.locator('.speed');
      const speedText = await speedCell.textContent();
      
      if (speedText && speedText !== '-') {
        // Should be in format like "320 km/h"
        expect(speedText).toMatch(/^\d+ km\/h$/);
      }
    }
  });

  test('should handle connection warning display', async ({ page }) => {
    // Check if connection warning is shown when disconnected
    const connectionWarning = page.locator('.connection-warning');
    const isWarningVisible = await connectionWarning.isVisible();
    
    if (isWarningVisible) {
      const warningText = await connectionWarning.textContent();
      expect(warningText).toContain('Live data updates paused');
    }
  });

  test('should be accessible', async ({ page }) => {
    // Check that the table has proper ARIA attributes
    const table = appPage.liveDataTable.table;
    await expect(table).toBeVisible();
    
    // Table should have a role
    const tableRole = await table.getAttribute('role');
    expect(tableRole).toBe('table');
    
    // Headers should be properly marked
    const headers = page.locator('th');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);
  });

  test('should maintain table structure on window resize', async ({ page }) => {
    // Test responsiveness
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(appPage.liveDataTable.table).toBeVisible();
    
    await page.setViewportSize({ width: 768, height: 600 });
    await expect(appPage.liveDataTable.table).toBeVisible();
    
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(appPage.liveDataTable.table).toBeVisible();
    
    // Table should remain functional at mobile size
    const headers = page.locator('th');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);
  });

  test('should sort drivers by position', async ({ page }) => {
    const driverRows = appPage.liveDataTable.getDriverRows();
    const rowCount = await driverRows.count();
    
    if (rowCount > 1) {
      // Check that positions are in ascending order
      const positions: number[] = [];
      
      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = driverRows.nth(i);
        const positionText = await row.locator('.position-number').textContent();
        if (positionText) {
          positions.push(parseInt(positionText, 10));
        }
      }
      
      // Positions should be in ascending order
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
      }
    }
  });

  test('should handle scroll behavior with many drivers', async ({ page }) => {
    // If there are many drivers, table should be scrollable
    const tableContainer = appPage.liveDataTable.container;
    await expect(tableContainer).toBeVisible();
    
    // Check if table is scrollable when content overflows
    const containerHeight = await tableContainer.evaluate(el => el.scrollHeight);
    const viewportHeight = await tableContainer.evaluate(el => el.clientHeight);
    
    if (containerHeight > viewportHeight) {
      // Should be able to scroll
      await tableContainer.hover();
      await page.mouse.wheel(0, 100);
      
      // Table should still be visible after scrolling
      await expect(appPage.liveDataTable.table).toBeVisible();
    }
  });
});