const logger = require('../../utils/logger');
const DataCache = require('./cache');

class DataProcessor {
  constructor() {
    this.cache = new DataCache();
    this.lastProcessedTimestamp = {};
  }

  processFeed(feedName, rawData, timestamp) {
    try {
      // Skip duplicate data based on timestamp
      if (this.isDuplicateData(feedName, timestamp)) {
        return null;
      }

      this.lastProcessedTimestamp[feedName] = timestamp;

      let processedData;
      
      switch (feedName) {
        case 'TimingData':
          processedData = this.processTimingData(rawData, timestamp);
          break;
        case 'CarData.z':
          processedData = this.processCarData(rawData, timestamp);
          break;
        case 'Position.z':
          processedData = this.processPositionData(rawData, timestamp);
          break;
        case 'SessionInfo':
          processedData = this.processSessionInfo(rawData, timestamp);
          break;
        case 'DriverList':
          processedData = this.processDriverList(rawData, timestamp);
          break;
        case 'WeatherData':
          processedData = this.processWeatherData(rawData, timestamp);
          break;
        case 'TrackStatus':
          processedData = this.processTrackStatus(rawData, timestamp);
          break;
        case 'SessionData':
          processedData = this.processSessionData(rawData, timestamp);
          break;
        case 'RaceControlMessages':
          processedData = this.processRaceControlMessages(rawData, timestamp);
          break;
        default:
          processedData = this.processGenericData(feedName, rawData, timestamp);
      }

      // Cache the processed data
      if (processedData) {
        this.cache.set(feedName, processedData);
      }

      return processedData;

    } catch (error) {
      logger.error(`Error processing feed ${feedName}:`, error);
      return null;
    }
  }

  processTimingData(rawData, timestamp) {
    if (!rawData || typeof rawData !== 'object') {
      return null;
    }

    const processed = {
      timestamp,
      type: 'timing',
      session: rawData.SessionPart || null,
      drivers: {},
      fastest: {
        overall: null,
        sector1: null,
        sector2: null,
        sector3: null
      }
    };

    // Process driver timing data
    if (rawData.Lines) {
      Object.entries(rawData.Lines).forEach(([driverNumber, driverData]) => {
        processed.drivers[driverNumber] = this.processDriverTiming(driverData);
        
        // Track fastest times
        this.updateFastestTimes(processed.fastest, driverNumber, processed.drivers[driverNumber]);
      });
    }

    return processed;
  }

  processDriverTiming(driverData) {
    const timing = {
      position: driverData.Position || null,
      driverNumber: driverData.RacingNumber || null,
      lapTime: driverData.LastLapTime?.Value || null,
      lapNumber: driverData.NumberOfLaps || null,
      sector1: driverData.Sectors?.[0]?.Value || null,
      sector2: driverData.Sectors?.[1]?.Value || null,
      sector3: driverData.Sectors?.[2]?.Value || null,
      gap: driverData.TimeDiffToFastest || null,
      interval: driverData.TimeDiffToPositionAhead || null,
      status: driverData.Stopped ? 'STOPPED' : 'RUNNING',
      inPit: driverData.InPit || false,
      retired: driverData.Retired || false
    };

    // Only include bestLapTime if it actually exists and has a value
    if (driverData.BestLapTime?.Value) {
      timing.bestLapTime = driverData.BestLapTime.Value;
    }

    return timing;
  }

  updateFastestTimes(fastest, driverNumber, driverTiming) {
    if (driverTiming.lapTime && (!fastest.overall || driverTiming.lapTime < fastest.overall.time)) {
      fastest.overall = { driverNumber, time: driverTiming.lapTime };
    }
    
    if (driverTiming.sector1 && (!fastest.sector1 || driverTiming.sector1 < fastest.sector1.time)) {
      fastest.sector1 = { driverNumber, time: driverTiming.sector1 };
    }
    
    if (driverTiming.sector2 && (!fastest.sector2 || driverTiming.sector2 < fastest.sector2.time)) {
      fastest.sector2 = { driverNumber, time: driverTiming.sector2 };
    }
    
    if (driverTiming.sector3 && (!fastest.sector3 || driverTiming.sector3 < fastest.sector3.time)) {
      fastest.sector3 = { driverNumber, time: driverTiming.sector3 };
    }
  }

  processCarData(rawData, timestamp) {
    if (!rawData || !rawData.Entries) {
      return null;
    }

    const processed = {
      timestamp,
      type: 'carData',
      drivers: {}
    };

    Object.entries(rawData.Entries).forEach(([driverNumber, carData]) => {
      processed.drivers[driverNumber] = {
        speed: carData.Channels?.['0'] || null,  // Speed
        rpm: carData.Channels?.['2'] || null,    // RPM
        gear: carData.Channels?.['3'] || null,   // Gear
        throttle: carData.Channels?.['4'] || null, // Throttle
        brake: carData.Channels?.['5'] || null,   // Brake
        drs: carData.Channels?.['45'] || null    // DRS
      };
    });

    return processed;
  }

  processPositionData(rawData, timestamp) {
    if (!rawData || !rawData.Position) {
      return null;
    }

    const processed = {
      timestamp,
      type: 'position',
      drivers: {}
    };

    Object.entries(rawData.Position).forEach(([driverNumber, posData]) => {
      processed.drivers[driverNumber] = {
        x: posData.X || null,
        y: posData.Y || null,
        z: posData.Z || null,
        status: posData.Status || 'OnTrack'
      };
    });

    return processed;
  }

  processSessionInfo(rawData, timestamp) {
    return {
      timestamp,
      type: 'sessionInfo',
      sessionName: rawData.Name || null,
      sessionType: rawData.Type || null,
      sessionState: rawData.Status || null,
      timeRemaining: rawData.TimeRemaining || null,
      totalLaps: rawData.TotalLaps || null,
      currentLap: rawData.CurrentLap || null,
      started: rawData.StartDate || null,
      ended: rawData.EndDate || null
    };
  }

  processDriverList(rawData, timestamp) {
    if (!rawData) {
      return null;
    }

    const processed = {
      timestamp,
      type: 'drivers',
      drivers: {}
    };

    Object.entries(rawData).forEach(([driverNumber, driverInfo]) => {
      processed.drivers[driverNumber] = {
        driverNumber,
        broadcastName: driverInfo.BroadcastName || null,
        fullName: driverInfo.FullName || null,
        tla: driverInfo.Tla || null, // Three Letter Abbreviation
        team: driverInfo.TeamName || null,
        teamColor: driverInfo.TeamColour || null,
        firstName: driverInfo.FirstName || null,
        lastName: driverInfo.LastName || null,
        reference: driverInfo.Reference || null,
        headShotUrl: driverInfo.HeadshotUrl || null
      };
    });

    return processed;
  }

  processWeatherData(rawData, timestamp) {
    return {
      timestamp,
      type: 'weather',
      airTemp: rawData.AirTemp || null,
      humidity: rawData.Humidity || null,
      pressure: rawData.Pressure || null,
      rainfall: rawData.Rainfall || null,
      trackTemp: rawData.TrackTemp || null,
      windDirection: rawData.WindDirection || null,
      windSpeed: rawData.WindSpeed || null
    };
  }

  processTrackStatus(rawData, timestamp) {
    return {
      timestamp,
      type: 'trackStatus',
      status: rawData.Status || null,
      message: rawData.Message || null,
      flagState: this.mapTrackStatusToFlag(rawData.Status)
    };
  }

  processSessionData(rawData, timestamp) {
    return {
      timestamp,
      type: 'sessionData',
      series: rawData.Series || null,
      sessionName: rawData.SessionName || null,
      meetingName: rawData.MeetingName || null,
      location: rawData.MeetingLocation || null,
      countryCode: rawData.MeetingCountryCode || null,
      countryName: rawData.MeetingCountryName || null,
      circuitName: rawData.MeetingCircuitName || null,
      year: rawData.ArchiveStatus?.Status === 'Complete' ? rawData.Year : new Date().getFullYear()
    };
  }

  processRaceControlMessages(rawData, timestamp) {
    if (!rawData || !rawData.Messages) {
      return null;
    }

    return {
      timestamp,
      type: 'raceControl',
      messages: rawData.Messages.map(msg => ({
        timestamp: msg.Utc || timestamp,
        category: msg.Category || null,
        message: msg.Message || null,
        flag: msg.Flag || null,
        scope: msg.Scope || null,
        sector: msg.Sector || null,
        mode: msg.Mode || null
      }))
    };
  }

  processGenericData(feedName, rawData, timestamp) {
    logger.debug(`Processing generic data for feed: ${feedName}`);
    
    return {
      timestamp,
      type: 'generic',
      feedName,
      data: rawData
    };
  }

  mapTrackStatusToFlag(status) {
    const flagMap = {
      '1': 'Green',
      '2': 'Yellow',
      '3': 'Safety Car',
      '4': 'Red',
      '5': 'Virtual Safety Car',
      '6': 'Safety Car Ending',
      '7': 'Virtual Safety Car Ending'
    };

    return flagMap[status] || 'Unknown';
  }

  isDuplicateData(feedName, timestamp) {
    const lastTimestamp = this.lastProcessedTimestamp[feedName];
    return lastTimestamp && lastTimestamp === timestamp;
  }

  // Public methods for accessing cached data
  getCurrentData(feedType) {
    return this.cache.get(feedType);
  }

  getAllCachedData() {
    return this.cache.getAll();
  }

  clearCache(feedType) {
    if (feedType) {
      this.cache.delete(feedType);
    } else {
      this.cache.clear();
    }
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}

module.exports = DataProcessor;