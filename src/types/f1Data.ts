export interface Driver {
  id: string;
  name: string;
  number: number;
  position: number;
  team: string;
  currentLapTime?: string;
  bestLapTime?: string;
  gapToLeader?: string;
  lastLapTime?: string;
  sector1Time?: string;
  sector2Time?: string;
  sector3Time?: string;
  speed?: number;
  completedLaps: number;
  teamColor?: string;
  isRetired?: boolean;
  isPitStop?: boolean;
}

export interface RaceStatus {
  sessionType: 'practice1' | 'practice2' | 'practice3' | 'qualifying' | 'race';
  sessionStatus: 'inactive' | 'active' | 'finished' | 'suspended';
  currentLap?: number;
  totalLaps?: number;
  timeRemaining?: string;
  flagStatus?: 'green' | 'yellow' | 'red' | 'checkered' | 'safety_car' | 'virtual_safety_car';
}

export interface WebSocketEvents {
  'driver:update': Driver;
  'race:status': RaceStatus;
  'lap:completed': {
    driverId: string;
    lapTime: string;
    lapNumber: number;
  };
  'drivers:all': Driver[];
}

export interface ConnectionStatus {
  isConnected: boolean;
  isConnecting: boolean;
  error?: string;
  lastUpdate?: Date;
}