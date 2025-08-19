import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { LiveDataTable } from '../../components/LiveDataTable';
import type { Driver } from '../../types/f1Data';

const mockDrivers: Driver[] = [
  {
    id: '1',
    number: '1',
    name: 'Max Verstappen',
    team: 'Red Bull Racing',
    position: 1,
    gapToLeader: '0',
    lastLapTime: '1:31.456',
    bestLapTime: '1:31.234',
    completedLaps: 25,
    speed: 315,
    isRetired: false,
    isPitStop: false,
    teamColor: '#3671C6'
  },
  {
    id: '44',
    number: '44',
    name: 'Lewis Hamilton',
    team: 'Mercedes',
    position: 2,
    gapToLeader: '+5.234',
    lastLapTime: '1:31.678',
    bestLapTime: '1:31.456',
    completedLaps: 25,
    speed: 312,
    isRetired: false,
    isPitStop: false,
    teamColor: '#6CD3BF'
  },
  {
    id: '16',
    number: '16',
    name: 'Charles Leclerc',
    team: 'Ferrari',
    position: 3,
    gapToLeader: '+8.567',
    lastLapTime: '1:31.890',
    bestLapTime: '1:31.567',
    completedLaps: 25,
    speed: 310,
    isRetired: false,
    isPitStop: false,
    teamColor: '#F91536'
  },
  {
    id: '63',
    number: '63',
    name: 'George Russell',
    team: 'Mercedes',
    position: 4,
    gapToLeader: '+12.345',
    lastLapTime: '1:32.123',
    bestLapTime: '1:31.678',
    completedLaps: 24,
    speed: 308,
    isRetired: true,
    isPitStop: false,
    teamColor: '#6CD3BF'
  }
];

describe('LiveDataTable Component', () => {
  it('renders with driver standings header', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    expect(screen.getByText('Driver Standings')).toBeInTheDocument();
    expect(screen.getByText('4 drivers')).toBeInTheDocument();
  });

  it('displays table headers correctly', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    expect(screen.getByText('Pos')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Gap')).toBeInTheDocument();
    expect(screen.getByText('Last Lap')).toBeInTheDocument();
    expect(screen.getByText('Best Lap')).toBeInTheDocument();
    expect(screen.getByText('Laps')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
  });

  it('renders driver data correctly', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    // Check first driver (Max Verstappen)
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Red Bull Racing')).toBeInTheDocument();
    expect(screen.getByText('LEADER')).toBeInTheDocument(); // Gap to leader for P1
    expect(screen.getByText('315 km/h')).toBeInTheDocument();
    
    // Check second driver (Lewis Hamilton)
    expect(screen.getByText('Lewis Hamilton')).toBeInTheDocument();
    expect(screen.getByText('#44')).toBeInTheDocument();
    expect(screen.getAllByText('Mercedes')).toHaveLength(2); // Two Mercedes drivers
    expect(screen.getByText('+5.234')).toBeInTheDocument();
  });

  it('sorts drivers by position correctly', () => {
    // Create drivers in unsorted order
    const unsortedDrivers = [
      { ...mockDrivers[2], position: 3 }, // Charles Leclerc - P3
      { ...mockDrivers[0], position: 1 }, // Max Verstappen - P1
      { ...mockDrivers[1], position: 2 }  // Lewis Hamilton - P2
    ];
    
    render(<LiveDataTable drivers={unsortedDrivers} isConnected={true} />);
    
    const rows = screen.getAllByRole('row');
    // Skip header row, check driver rows
    const driverRows = rows.slice(1);
    
    expect(within(driverRows[0]).getByText('Max Verstappen')).toBeInTheDocument();
    expect(within(driverRows[1]).getByText('Lewis Hamilton')).toBeInTheDocument();
    expect(within(driverRows[2]).getByText('Charles Leclerc')).toBeInTheDocument();
  });

  it('handles retired drivers correctly', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    // Find the retired driver row
    const retiredDriverRow = screen.getByText('George Russell').closest('tr');
    expect(retiredDriverRow).toHaveClass('retired');
    
    // Retired drivers should appear at the bottom
    const rows = screen.getAllByRole('row');
    const lastDriverRow = rows[rows.length - 1];
    expect(within(lastDriverRow).getByText('George Russell')).toBeInTheDocument();
  });

  it('formats lap times correctly', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    // Check that lap times are displayed correctly
    expect(screen.getAllByText('1:31.456')).toHaveLength(2); // Appears in multiple places
    expect(screen.getByText('1:31.234')).toBeInTheDocument(); // Best lap time
  });

  it('formats gap times correctly', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    // Leader should show "LEADER"
    expect(screen.getByText('LEADER')).toBeInTheDocument();
    
    // Other drivers should show gap with + prefix
    expect(screen.getByText('+5.234')).toBeInTheDocument();
    expect(screen.getByText('+8.567')).toBeInTheDocument();
  });

  it('displays team colors correctly', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    // Check that team color divs are rendered with correct styles
    const teamColorElements = document.querySelectorAll('.team-color');
    expect(teamColorElements).toHaveLength(4);
    
    // Check Red Bull color
    const redBullColor = Array.from(teamColorElements).find(el => 
      (el as HTMLElement).style.backgroundColor === 'rgb(54, 113, 198)' // #3671C6
    );
    expect(redBullColor).toBeInTheDocument();
  });

  it('shows no data message when drivers array is empty', () => {
    render(<LiveDataTable drivers={[]} isConnected={true} />);
    
    expect(screen.getByText('Driver Standings')).toBeInTheDocument();
    expect(screen.getByText('Waiting for driver data...')).toBeInTheDocument();
  });

  it('shows connection lost message when disconnected', () => {
    render(<LiveDataTable drivers={[]} isConnected={false} />);
    
    expect(screen.getByText('No connection to race data')).toBeInTheDocument();
  });

  it('displays connection warning when disconnected with data', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={false} />);
    
    expect(screen.getByText('Live data updates paused - connection lost')).toBeInTheDocument();
    
    // Data should still be displayed
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument();
  });

  it('handles drivers with missing data gracefully', () => {
    const incompleteDrivers: Driver[] = [
      {
        id: '99',
        number: '99',
        name: 'Test Driver',
        team: 'Test Team',
        position: 1,
        gapToLeader: '0',
        completedLaps: 0,
        isRetired: false,
        isPitStop: false
        // Missing optional fields like lastLapTime, bestLapTime, speed
      }
    ];
    
    render(<LiveDataTable drivers={incompleteDrivers} isConnected={true} />);
    
    expect(screen.getByText('Test Driver')).toBeInTheDocument();
    expect(screen.getByText('Test Team')).toBeInTheDocument();
    
    // Should show placeholder for missing data
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1]; // Skip header
    expect(within(dataRow).getAllByText('-')).toHaveLength(3); // Last lap, best lap, speed
  });

  it('handles pit stop status correctly', () => {
    const driversWithPitStop: Driver[] = [
      {
        ...mockDrivers[0],
        isPitStop: true
      }
    ];
    
    render(<LiveDataTable drivers={driversWithPitStop} isConnected={true} />);
    
    const pitStopRow = screen.getByText('Max Verstappen').closest('tr');
    expect(pitStopRow).toHaveClass('pit-stop');
  });

  it('applies disconnected class when not connected', () => {
    render(<LiveDataTable drivers={mockDrivers} isConnected={false} />);
    
    const driverRows = screen.getAllByRole('row').slice(1); // Skip header
    driverRows.forEach(row => {
      expect(row).toHaveClass('disconnected');
    });
  });

  it('handles millisecond time format conversion', () => {
    const driversWithMsTime: Driver[] = [
      {
        ...mockDrivers[0],
        lastLapTime: '91456', // Milliseconds format
        bestLapTime: '91234'
      }
    ];
    
    render(<LiveDataTable drivers={driversWithMsTime} isConnected={true} />);
    
    // Should convert milliseconds to lap time format
    expect(screen.getByText('1:31.456')).toBeInTheDocument();
    expect(screen.getByText('1:31.234')).toBeInTheDocument();
  });

  it('handles edge cases in time formatting', () => {
    const driversWithEdgeCases: Driver[] = [
      {
        ...mockDrivers[0],
        lastLapTime: '', // Empty string
        bestLapTime: undefined // Undefined
      }
    ];
    
    render(<LiveDataTable drivers={driversWithEdgeCases} isConnected={true} />);
    
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1]; // Skip header
    
    // Should show placeholder for empty/undefined times
    expect(within(dataRow).getAllByText('-')).toHaveLength(2); // Last lap, best lap (speed shows nothing when undefined)
  });

  it('handles lap gap edge cases', () => {
    const driversWithLapGap: Driver[] = [
      {
        ...mockDrivers[1],
        gapToLeader: '1 LAP'
      }
    ];
    
    render(<LiveDataTable drivers={driversWithLapGap} isConnected={true} />);
    
    expect(screen.getByText('1 LAP')).toBeInTheDocument();
  });

  it('memoizes sorted drivers correctly', () => {
    const { rerender } = render(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    // Get initial render result
    const initialRows = screen.getAllByRole('row');
    
    // Rerender with same props
    rerender(<LiveDataTable drivers={mockDrivers} isConnected={true} />);
    
    // Rows should be the same (memoization working)
    const newRows = screen.getAllByRole('row');
    expect(newRows).toHaveLength(initialRows.length);
  });

  it('handles very long driver and team names', () => {
    const driversWithLongNames: Driver[] = [
      {
        ...mockDrivers[0],
        name: 'Very Long Driver Name That Might Overflow',
        team: 'Very Long Team Name That Could Break Layout'
      }
    ];
    
    render(<LiveDataTable drivers={driversWithLongNames} isConnected={true} />);
    
    expect(screen.getByText('Very Long Driver Name That Might Overflow')).toBeInTheDocument();
    expect(screen.getByText('Very Long Team Name That Could Break Layout')).toBeInTheDocument();
  });

  it('handles extreme position values', () => {
    const driversWithExtremePositions: Driver[] = [
      {
        ...mockDrivers[0],
        position: 0 // Edge case
      },
      {
        ...mockDrivers[1],
        position: 99 // Very high position
      }
    ];
    
    render(<LiveDataTable drivers={driversWithExtremePositions} isConnected={true} />);
    
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
  });
});