import { Page, Locator } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly raceHeader: RaceHeaderSection;
  readonly connectionStatus: ConnectionStatusSection;
  readonly liveDataTable: LiveDataTableSection;

  constructor(page: Page) {
    this.page = page;
    this.raceHeader = new RaceHeaderSection(page);
    this.connectionStatus = new ConnectionStatusSection(page);
    this.liveDataTable = new LiveDataTableSection(page);
  }

  async goto() {
    await this.page.goto('/');
    await this.waitForLoad();
  }

  async waitForLoad() {
    // Wait for the main application components to be visible
    await this.page.waitForSelector('[data-testid="app"], .App, main', { timeout: 10000 });
    
    // Wait for connection status to appear
    await this.page.waitForSelector('.connection-status, [data-testid="connection-status"]', { timeout: 5000 });
    
    // Wait for live data table to appear
    await this.page.waitForSelector('.live-data-table, [data-testid="live-data-table"]', { timeout: 5000 });
  }

  async waitForDataLoad() {
    // Wait for potential driver data to load
    await this.page.waitForTimeout(2000);
  }

  async isLoading(): Promise<boolean> {
    const loadingIndicators = this.page.locator('.loading, .spinner, [data-testid="loading"]');
    return await loadingIndicators.count() > 0;
  }
}

export class RaceHeaderSection {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('.race-header, [data-testid="race-header"], header');
    this.title = this.container.locator('h1, h2, .title, [data-testid="title"]');
  }

  async isVisible(): Promise<boolean> {
    return await this.container.isVisible();
  }

  async getTitleText(): Promise<string | null> {
    return await this.title.textContent();
  }
}

export class ConnectionStatusSection {
  readonly page: Page;
  readonly container: Locator;
  readonly statusText: Locator;
  readonly lastUpdate: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('.connection-status, [data-testid="connection-status"]').first();
    this.statusText = this.container.locator('.status-text, .connection-text');
    this.lastUpdate = this.container.locator('.last-update, .update-time');
  }

  async isVisible(): Promise<boolean> {
    return await this.container.isVisible();
  }

  async getStatus(): Promise<string | null> {
    return await this.container.textContent();
  }

  async isConnected(): Promise<boolean> {
    const statusText = await this.getStatus();
    return statusText?.includes('Connected') ?? false;
  }

  async isConnecting(): Promise<boolean> {
    const statusText = await this.getStatus();
    return statusText?.includes('Connecting') ?? false;
  }

  async isDisconnected(): Promise<boolean> {
    const statusText = await this.getStatus();
    return statusText?.includes('Disconnected') ?? false;
  }

  async hasError(): Promise<boolean> {
    const statusText = await this.getStatus();
    return statusText?.toLowerCase().includes('error') ?? false;
  }
}

export class LiveDataTableSection {
  readonly page: Page;
  readonly container: Locator;
  readonly header: Locator;
  readonly table: Locator;
  readonly tableBody: Locator;
  readonly noDataMessage: Locator;
  readonly connectionWarning: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('.live-data-table, [data-testid="live-data-table"]').first();
    this.header = this.container.locator('.table-header, h2, [data-testid="table-header"]').first();
    this.table = this.container.locator('table').first();
    this.tableBody = this.table.locator('tbody');
    this.noDataMessage = this.container.locator('.no-data, [data-testid="no-data"]');
    this.connectionWarning = this.container.locator('.connection-warning, [data-testid="connection-warning"]');
  }

  async isVisible(): Promise<boolean> {
    return await this.container.isVisible();
  }

  getHeaderByText(text: string): Locator {
    return this.table.locator('th').filter({ hasText: text });
  }

  getDriverRows(): Locator {
    return this.tableBody.locator('tr').filter({ has: this.page.locator('.driver-name, .driver-info') });
  }

  async getDriverCount(): Promise<number> {
    return await this.getDriverRows().count();
  }

  getDriverRowByPosition(position: number): Locator {
    return this.getDriverRows().filter({ 
      has: this.page.locator('.position-number').filter({ hasText: position.toString() }) 
    });
  }

  getDriverRowByName(name: string): Locator {
    return this.getDriverRows().filter({ 
      has: this.page.locator('.driver-name').filter({ hasText: name }) 
    });
  }

  async hasNoDataMessage(): Promise<boolean> {
    return await this.noDataMessage.isVisible();
  }

  async getNoDataText(): Promise<string | null> {
    if (await this.hasNoDataMessage()) {
      return await this.noDataMessage.textContent();
    }
    return null;
  }

  async hasConnectionWarning(): Promise<boolean> {
    return await this.connectionWarning.isVisible();
  }

  async getConnectionWarningText(): Promise<string | null> {
    if (await this.hasConnectionWarning()) {
      return await this.connectionWarning.textContent();
    }
    return null;
  }

  async getDriverData(position: number): Promise<DriverData | null> {
    const row = this.getDriverRowByPosition(position);
    
    if (!(await row.isVisible())) {
      return null;
    }

    const positionText = await row.locator('.position-number').textContent();
    const driverName = await row.locator('.driver-name').textContent();
    const teamName = await row.locator('.team-name').textContent();
    const gap = await row.locator('.gap-time').textContent();
    const lastLap = await row.locator('.last-lap').textContent();
    const bestLap = await row.locator('.best-lap').textContent();
    const laps = await row.locator('.laps').textContent();
    const speed = await row.locator('.speed').textContent();

    return {
      position: positionText ? parseInt(positionText, 10) : 0,
      driverName: driverName || '',
      teamName: teamName || '',
      gap: gap || '',
      lastLap: lastLap || '',
      bestLap: bestLap || '',
      laps: laps || '',
      speed: speed || ''
    };
  }

  async getAllDriverData(): Promise<DriverData[]> {
    const driverCount = await this.getDriverCount();
    const drivers: DriverData[] = [];

    for (let i = 0; i < driverCount; i++) {
      const row = this.getDriverRows().nth(i);
      
      const positionText = await row.locator('.position-number').textContent();
      const driverName = await row.locator('.driver-name').textContent();
      const teamName = await row.locator('.team-name').textContent();
      const gap = await row.locator('.gap-time').textContent();
      const lastLap = await row.locator('.last-lap').textContent();
      const bestLap = await row.locator('.best-lap').textContent();
      const laps = await row.locator('.laps').textContent();
      const speed = await row.locator('.speed').textContent();

      drivers.push({
        position: positionText ? parseInt(positionText, 10) : 0,
        driverName: driverName || '',
        teamName: teamName || '',
        gap: gap || '',
        lastLap: lastLap || '',
        bestLap: bestLap || '',
        laps: laps || '',
        speed: speed || ''
      });
    }

    return drivers;
  }

  async waitForDriverData(timeout: number = 5000): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        () => {
          const rows = document.querySelectorAll('.live-data-table tbody tr');
          return rows.length > 0 && !document.querySelector('.no-data');
        },
        { timeout }
      );
      return true;
    } catch {
      return false;
    }
  }

  async isTableSortedByPosition(): Promise<boolean> {
    const drivers = await this.getAllDriverData();
    
    if (drivers.length <= 1) {
      return true; // Trivially sorted
    }

    for (let i = 1; i < drivers.length; i++) {
      if (drivers[i].position < drivers[i - 1].position) {
        return false;
      }
    }

    return true;
  }
}

export interface DriverData {
  position: number;
  driverName: string;
  teamName: string;
  gap: string;
  lastLap: string;
  bestLap: string;
  laps: string;
  speed: string;
}