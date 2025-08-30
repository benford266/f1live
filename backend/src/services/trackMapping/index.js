/**
 * F1 Track Mapping Service
 * Generates track maps and driver positions from F1 live timing data
 */

const logger = require('../../utils/logger');

class TrackMappingService {
  constructor() {
    this.trackCoordinates = new Map(); // Store track coordinate data
    this.driverPositions = new Map(); // Store current driver positions
    this.trackBounds = null; // Track boundary information
    this.sectorBoundaries = new Map(); // Sector boundary definitions
    this.speedTrapLocations = new Map(); // Speed trap positions
  }

  /**
   * Process position data from F1 Position.z feed
   * @param {Object} positionData - Raw position data from F1
   */
  processPositionData(positionData) {
    try {
      if (!positionData || !positionData.Position) {
        return;
      }

      const positions = {};
      
      // Process each driver's position
      Object.entries(positionData.Position).forEach(([driverNumber, coords]) => {
        if (coords.X !== undefined && coords.Y !== undefined) {
          positions[driverNumber] = {
            x: parseFloat(coords.X),
            y: parseFloat(coords.Y),
            z: parseFloat(coords.Z) || 0,
            timestamp: new Date().toISOString(),
            status: coords.Status || 'ACTIVE'
          };

          // Update driver position cache
          this.driverPositions.set(driverNumber, positions[driverNumber]);
          
          // Update track boundaries
          this.updateTrackBounds(positions[driverNumber]);
          
          // Store coordinate for track generation
          this.addTrackCoordinate(positions[driverNumber]);
        }
      });

      return positions;
    } catch (error) {
      logger.error('Error processing position data:', error);
      return null;
    }
  }

  /**
   * Generate track map from collected coordinate data
   * @param {string} trackName - Name of the track
   * @returns {Object} Track map data
   */
  generateTrackMap(trackName = 'Unknown Track') {
    try {
      const coordinates = Array.from(this.trackCoordinates.values())
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      if (coordinates.length < 10) {
        logger.warn('Insufficient coordinate data for track map generation');
        return null;
      }

      // Generate racing line from coordinates
      const racingLine = this.generateRacingLine(coordinates);
      
      // Create track sections
      const sections = this.createTrackSections(racingLine);
      
      // Identify corners and straights
      const trackFeatures = this.identifyTrackFeatures(racingLine);

      return {
        trackName,
        bounds: this.trackBounds,
        racingLine,
        sections,
        features: trackFeatures,
        sectors: this.generateSectorData(),
        speedTraps: Array.from(this.speedTrapLocations.values()),
        metadata: {
          coordinateCount: coordinates.length,
          generatedAt: new Date().toISOString(),
          trackLength: this.calculateTrackLength(racingLine)
        }
      };
    } catch (error) {
      logger.error('Error generating track map:', error);
      return null;
    }
  }

  /**
   * Get current driver positions for live visualization
   * @returns {Object} Current driver positions
   */
  getCurrentDriverPositions() {
    const positions = {};
    
    for (const [driverNumber, position] of this.driverPositions.entries()) {
      // Only include recent positions (within last 10 seconds)
      const age = Date.now() - new Date(position.timestamp).getTime();
      if (age < 10000) {
        positions[driverNumber] = {
          ...position,
          ageMs: age
        };
      }
    }

    return positions;
  }

  /**
   * Process timing data to enhance position information
   * @param {Object} timingData - F1 timing data
   */
  processTimingData(timingData) {
    try {
      if (!timingData.drivers) return;

      Object.entries(timingData.drivers).forEach(([driverNumber, data]) => {
        // Enhance position data with timing info
        const currentPosition = this.driverPositions.get(driverNumber);
        if (currentPosition) {
          currentPosition.sector = this.getCurrentSector(data);
          currentPosition.speed = data.speed || null;
          currentPosition.lapNumber = data.lapNumber || null;
          currentPosition.position = data.position || null;
        }

        // Update sector boundaries based on timing
        this.updateSectorBoundaries(driverNumber, data);
      });
    } catch (error) {
      logger.error('Error processing timing data for track mapping:', error);
    }
  }

  /**
   * Generate racing line from coordinate data
   * @param {Array} coordinates - Array of coordinate points
   * @returns {Array} Smoothed racing line coordinates
   */
  generateRacingLine(coordinates) {
    // Simple line smoothing - can be enhanced with proper spline interpolation
    const smoothed = [];
    const windowSize = 5;

    for (let i = 0; i < coordinates.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(coordinates.length - 1, i + Math.floor(windowSize / 2));
      
      let avgX = 0, avgY = 0, count = 0;
      
      for (let j = start; j <= end; j++) {
        avgX += coordinates[j].x;
        avgY += coordinates[j].y;
        count++;
      }

      smoothed.push({
        x: avgX / count,
        y: avgY / count,
        index: i,
        distance: i > 0 ? this.calculateDistance(smoothed[i-1], {x: avgX / count, y: avgY / count}) : 0
      });
    }

    return smoothed;
  }

  /**
   * Create track sections for visualization
   * @param {Array} racingLine - Racing line coordinates
   * @returns {Array} Track sections
   */
  createTrackSections(racingLine) {
    const sections = [];
    const sectionLength = Math.max(1, Math.floor(racingLine.length / 20)); // ~20 sections

    for (let i = 0; i < racingLine.length; i += sectionLength) {
      const end = Math.min(i + sectionLength, racingLine.length - 1);
      sections.push({
        id: sections.length,
        startIndex: i,
        endIndex: end,
        coordinates: racingLine.slice(i, end + 1),
        type: this.classifySection(racingLine.slice(i, end + 1))
      });
    }

    return sections;
  }

  /**
   * Identify track features (corners, straights, chicanes)
   * @param {Array} racingLine - Racing line coordinates
   * @returns {Array} Track features
   */
  identifyTrackFeatures(racingLine) {
    const features = [];
    
    // Calculate curvature for each point
    for (let i = 2; i < racingLine.length - 2; i++) {
      const curvature = this.calculateCurvature(
        racingLine[i-2], racingLine[i], racingLine[i+2]
      );
      
      // Identify corners based on curvature threshold
      if (Math.abs(curvature) > 0.1) {
        features.push({
          type: curvature > 0 ? 'right_corner' : 'left_corner',
          position: racingLine[i],
          curvature: curvature,
          index: i
        });
      }
    }

    return this.groupNearbyFeatures(features);
  }

  /**
   * Calculate distance between two points
   * @param {Object} p1 - Point 1 {x, y}
   * @param {Object} p2 - Point 2 {x, y}
   * @returns {number} Distance
   */
  calculateDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * Calculate curvature at a point
   * @param {Object} p1 - Previous point
   * @param {Object} p2 - Current point  
   * @param {Object} p3 - Next point
   * @returns {number} Curvature value
   */
  calculateCurvature(p1, p2, p3) {
    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;
    
    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;
    
    return Math.atan2(cross, dot);
  }

  /**
   * Update track bounds with new coordinate
   * @param {Object} position - Position data {x, y, z}
   */
  updateTrackBounds(position) {
    if (!this.trackBounds) {
      this.trackBounds = {
        minX: position.x, maxX: position.x,
        minY: position.y, maxY: position.y,
        minZ: position.z, maxZ: position.z
      };
    } else {
      this.trackBounds.minX = Math.min(this.trackBounds.minX, position.x);
      this.trackBounds.maxX = Math.max(this.trackBounds.maxX, position.x);
      this.trackBounds.minY = Math.min(this.trackBounds.minY, position.y);
      this.trackBounds.maxY = Math.max(this.trackBounds.maxY, position.y);
      this.trackBounds.minZ = Math.min(this.trackBounds.minZ, position.z);
      this.trackBounds.maxZ = Math.max(this.trackBounds.maxZ, position.z);
    }
  }

  /**
   * Add coordinate to track data collection
   * @param {Object} position - Position coordinate
   */
  addTrackCoordinate(position) {
    const key = `${Math.round(position.x)},${Math.round(position.y)}`;
    if (!this.trackCoordinates.has(key)) {
      this.trackCoordinates.set(key, {
        ...position,
        visits: 1
      });
    } else {
      const existing = this.trackCoordinates.get(key);
      existing.visits++;
      existing.timestamp = position.timestamp; // Update to latest
    }
  }

  /**
   * Helper methods for track analysis
   */
  getCurrentSector(driverData) {
    // Determine current sector from timing data
    if (driverData.sectors && driverData.sectors.length > 0) {
      return driverData.sectors.findIndex(s => s.current) + 1 || 1;
    }
    return 1;
  }

  updateSectorBoundaries(driverNumber, timingData) {
    // Update sector boundary definitions based on driver timing
    // This would be enhanced with actual sector timing analysis
  }

  generateSectorData() {
    // Generate sector information for the track
    return Array.from(this.sectorBoundaries.entries()).map(([sector, boundaries]) => ({
      sector: parseInt(sector),
      boundaries
    }));
  }

  calculateTrackLength(racingLine) {
    let totalLength = 0;
    for (let i = 1; i < racingLine.length; i++) {
      totalLength += this.calculateDistance(racingLine[i-1], racingLine[i]);
    }
    return Math.round(totalLength);
  }

  classifySection(coordinates) {
    // Classify section as straight, corner, chicane based on curvature
    const avgCurvature = coordinates.reduce((sum, coord, i) => {
      if (i < 2 || i >= coordinates.length - 2) return sum;
      return sum + Math.abs(this.calculateCurvature(
        coordinates[i-2], coordinates[i], coordinates[i+2]
      ));
    }, 0) / Math.max(1, coordinates.length - 4);

    if (avgCurvature < 0.05) return 'straight';
    if (avgCurvature < 0.2) return 'slight_corner';
    return 'sharp_corner';
  }

  groupNearbyFeatures(features) {
    // Group features that are close together
    const grouped = [];
    let currentGroup = null;

    features.forEach(feature => {
      if (!currentGroup || 
          this.calculateDistance(currentGroup.position, feature.position) > 50) {
        currentGroup = { ...feature, count: 1 };
        grouped.push(currentGroup);
      } else {
        currentGroup.count++;
      }
    });

    return grouped;
  }

  /**
   * Clear all mapping data (for new session)
   */
  clear() {
    this.trackCoordinates.clear();
    this.driverPositions.clear();
    this.trackBounds = null;
    this.sectorBoundaries.clear();
    this.speedTrapLocations.clear();
    logger.debug('Track mapping data cleared');
  }

  /**
   * Export track map data for frontend
   * @returns {Object} Complete track map data
   */
  exportTrackMap() {
    const trackMap = this.generateTrackMap();
    const driverPositions = this.getCurrentDriverPositions();

    return {
      trackMap,
      driverPositions,
      metadata: {
        hasPositionData: this.driverPositions.size > 0,
        hasTrackData: this.trackCoordinates.size > 0,
        lastUpdate: new Date().toISOString()
      }
    };
  }
}

module.exports = TrackMappingService;