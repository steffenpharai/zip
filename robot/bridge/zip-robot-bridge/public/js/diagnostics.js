/**
 * Diagnostics Dashboard
 * Handles telemetry visualization, statistics, and robot information
 */

class DiagnosticsDashboard {
  constructor(robotClient) {
    this.client = robotClient;
    this.telemetryHistory = [];
    this.maxHistorySize = 100;
    this.charts = {};
    this.statsUpdateInterval = null;
    this.serialConnected = false;
    this.serialPort = null;
    this.initializeCharts();
    this.attachEventListeners();
    this.startStatsUpdates();
    
    // Listen for telemetry
    this.client.onTelemetry((telemetry) => {
      this.updateTelemetry(telemetry);
    });
    
    // Listen for robot info
    this.client.onInfo((info) => {
      this.updateRobotInfo(info);
    });
    
    // Listen for connection state
    this.client.onConnectionState((state) => {
      this.updateConnectionStatus(state);
    });
    
    // Also listen for connection_state messages to update serial status
    // This is handled in robot-client.js and will trigger updateConnectionStatus
  }

  initializeCharts() {
    // IMU Accelerometer Chart
    const imuAccelCtx = document.getElementById('imuAccelChart');
    if (imuAccelCtx) {
      this.charts.imuAccel = new Chart(imuAccelCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'ax', data: [], borderColor: '#FF4444', backgroundColor: 'rgba(255, 68, 68, 0.1)', tension: 0.4 },
            { label: 'ay', data: [], borderColor: '#44FF44', backgroundColor: 'rgba(68, 255, 68, 0.1)', tension: 0.4 },
            { label: 'az', data: [], borderColor: '#4444FF', backgroundColor: 'rgba(68, 68, 255, 0.1)', tension: 0.4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#A7C6D3' } },
          },
          scales: {
            x: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
            y: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
          },
        },
      });
    }
    
    // IMU Gyroscope Chart
    const imuGyroCtx = document.getElementById('imuGyroChart');
    if (imuGyroCtx) {
      this.charts.imuGyro = new Chart(imuGyroCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'gx', data: [], borderColor: '#FF8844', backgroundColor: 'rgba(255, 136, 68, 0.1)', tension: 0.4 },
            { label: 'gy', data: [], borderColor: '#88FF44', backgroundColor: 'rgba(136, 255, 68, 0.1)', tension: 0.4 },
            { label: 'gz', data: [], borderColor: '#4488FF', backgroundColor: 'rgba(68, 136, 255, 0.1)', tension: 0.4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#A7C6D3' } },
          },
          scales: {
            x: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
            y: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
          },
        },
      });
    }
    
    // IMU Yaw Chart
    const imuYawCtx = document.getElementById('imuYawChart');
    if (imuYawCtx) {
      this.charts.imuYaw = new Chart(imuYawCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'yaw', data: [], borderColor: '#27B4CD', backgroundColor: 'rgba(39, 180, 205, 0.1)', tension: 0.4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#A7C6D3' } },
          },
          scales: {
            x: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
            y: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
          },
        },
      });
    }
    
    // Ultrasonic Chart
    const ultrasonicCtx = document.getElementById('ultrasonicChart');
    if (ultrasonicCtx) {
      this.charts.ultrasonic = new Chart(ultrasonicCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Distance (mm)', data: [], borderColor: '#2EE59D', backgroundColor: 'rgba(46, 229, 157, 0.1)', tension: 0.4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#A7C6D3' } },
          },
          scales: {
            x: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
            y: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' }, title: { display: true, text: 'mm', color: '#6F8E9B' } },
          },
        },
      });
    }
    
    // Line Sensors Chart
    const lineSensorsCtx = document.getElementById('lineSensorsChart');
    if (lineSensorsCtx) {
      this.charts.lineSensors = new Chart(lineSensorsCtx, {
        type: 'bar',
        data: {
          labels: ['Left', 'Middle', 'Right'],
          datasets: [
            { label: 'ADC Value', data: [0, 0, 0], backgroundColor: ['#27B4CD', '#24B2E0', '#2EE59D'] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
            y: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' }, max: 1024 },
          },
        },
      });
    }
    
    // Battery Chart
    const batteryCtx = document.getElementById('batteryChart');
    if (batteryCtx) {
      this.charts.battery = new Chart(batteryCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Voltage (mV)', data: [], borderColor: '#FFAA44', backgroundColor: 'rgba(255, 170, 68, 0.1)', tension: 0.4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#A7C6D3' } },
          },
          scales: {
            x: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
            y: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' }, title: { display: true, text: 'mV', color: '#6F8E9B' } },
          },
        },
      });
    }
    
    // Motor Chart
    const motorCtx = document.getElementById('motorChart');
    if (motorCtx) {
      this.charts.motor = new Chart(motorCtx, {
        type: 'bar',
        data: {
          labels: ['Left', 'Right'],
          datasets: [
            { label: 'PWM', data: [0, 0], backgroundColor: ['#27B4CD', '#24B2E0'] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' } },
            y: { ticks: { color: '#6F8E9B' }, grid: { color: 'rgba(60, 180, 220, 0.1)' }, min: -255, max: 255 },
          },
        },
      });
    }
  }

  attachEventListeners() {
    // Connection status indicator
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (statusIndicator && statusText) {
      this.updateConnectionStatus(this.client.getConnectionState());
    }
  }

  updateTelemetry(telemetry) {
    // Add to history
    this.telemetryHistory.push({
      timestamp: telemetry.ts_ms,
      data: telemetry,
    });
    
    // Limit history size
    if (this.telemetryHistory.length > this.maxHistorySize) {
      this.telemetryHistory.shift();
    }
    
    // Update charts
    this.updateCharts(telemetry);
  }

  updateCharts(telemetry) {
    const timeLabel = new Date(telemetry.ts_ms).toLocaleTimeString();
    
    // IMU Accelerometer
    if (this.charts.imuAccel) {
      this.addDataPoint(this.charts.imuAccel, timeLabel, [
        telemetry.imu.ax,
        telemetry.imu.ay,
        telemetry.imu.az,
      ]);
    }
    
    // IMU Gyroscope
    if (this.charts.imuGyro) {
      this.addDataPoint(this.charts.imuGyro, timeLabel, [
        telemetry.imu.gx,
        telemetry.imu.gy,
        telemetry.imu.gz,
      ]);
    }
    
    // IMU Yaw
    if (this.charts.imuYaw) {
      this.addDataPoint(this.charts.imuYaw, timeLabel, [telemetry.imu.yaw]);
    }
    
    // Ultrasonic
    if (this.charts.ultrasonic) {
      this.addDataPoint(this.charts.ultrasonic, timeLabel, [telemetry.ultrasonic_mm]);
    }
    
    // Line Sensors (bar chart - update directly)
    if (this.charts.lineSensors && telemetry.line_adc && telemetry.line_adc.length >= 3) {
      this.charts.lineSensors.data.datasets[0].data = [
        telemetry.line_adc[0],
        telemetry.line_adc[1],
        telemetry.line_adc[2],
      ];
      this.charts.lineSensors.update('none');
    }
    
    // Battery
    if (this.charts.battery) {
      this.addDataPoint(this.charts.battery, timeLabel, [telemetry.batt_mv]);
    }
    
    // Motors (bar chart - update directly)
    if (this.charts.motor) {
      this.charts.motor.data.datasets[0].data = [
        telemetry.motor_state.left,
        telemetry.motor_state.right,
      ];
      this.charts.motor.update('none');
    }
  }

  addDataPoint(chart, label, values) {
    // Add label
    chart.data.labels.push(label);
    
    // Add data points to each dataset
    values.forEach((value, index) => {
      if (chart.data.datasets[index]) {
        chart.data.datasets[index].data.push(value);
      }
    });
    
    // Limit data points
    if (chart.data.labels.length > 50) {
      chart.data.labels.shift();
      chart.data.datasets.forEach(dataset => {
        dataset.data.shift();
      });
    }
    
    // Update chart (no animation for performance)
    chart.update('none');
  }

  updateRobotInfo(info) {
    if (!info) return;
    
    const firmwareEl = document.getElementById('infoFirmware');
    const capabilitiesEl = document.getElementById('infoCapabilities');
    
    if (firmwareEl) {
      firmwareEl.textContent = info.fw_version || '-';
    }
    
    if (capabilitiesEl && info.caps !== undefined) {
      capabilitiesEl.textContent = this.decodeCapabilities(info.caps);
    }
  }

  decodeCapabilities(caps) {
    const capabilities = [];
    if (caps & 0x01) capabilities.push('TB6612');
    if (caps & 0x02) capabilities.push('DRV8835');
    if (caps & 0x04) capabilities.push('MPU6050');
    if (caps & 0x08) capabilities.push('QMI8658C');
    if (caps & 0x10) capabilities.push('Ultrasonic');
    if (caps & 0x20) capabilities.push('Line Tracking');
    if (caps & 0x40) capabilities.push('Servo');
    if (caps & 0x80) capabilities.push('RGB LED');
    return capabilities.length > 0 ? capabilities.join(', ') : 'None';
  }

  updateConnectionStatus(state) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (statusIndicator && statusText) {
      statusIndicator.className = 'status-indicator';
      
      switch (state) {
        case 'connected':
          statusIndicator.classList.add('connected');
          statusText.textContent = 'Connected';
          break;
        case 'connecting':
          statusIndicator.classList.add('connecting');
          statusText.textContent = 'Connecting...';
          break;
        case 'disconnected':
          statusIndicator.classList.add('disconnected');
          statusText.textContent = 'Disconnected';
          break;
        case 'error':
          statusIndicator.classList.add('disconnected');
          statusText.textContent = 'Error';
          break;
        default:
          statusIndicator.classList.add('disconnected');
          statusText.textContent = 'Unknown';
      }
    }
    
    // Update robot info text based on serial connection
    const robotInfoText = document.getElementById('robotInfoText');
    if (robotInfoText) {
      const serialInfo = this.client.getSerialConnectionInfo();
      const info = this.client.getLatestInfo();
      
      if (serialInfo && serialInfo.connected) {
        // Serial is connected
        if (info && info.fw_version) {
          robotInfoText.textContent = `FW ${info.fw_version}`;
        } else {
          // Serial connected but no info received yet
          robotInfoText.textContent = `Connected (${serialInfo.serialPort || '?'})`;
        }
      } else if (state === 'connected') {
        // WebSocket connected but serial not connected
        robotInfoText.textContent = 'Bridge connected';
      } else {
        robotInfoText.textContent = 'Not connected';
      }
    }
  }

  startStatsUpdates() {
    // Update statistics every second
    this.statsUpdateInterval = setInterval(() => {
      this.updateStatistics();
    }, 1000);
    
    // Initial update
    this.updateStatistics();
  }

  async updateStatistics() {
    try {
      const response = await fetch('/api/robot/status');
      if (!response.ok) {
        console.warn('[Diagnostics] Failed to fetch statistics:', response.status);
        return;
      }
      
      const data = await response.json();
      
      // Update stat elements
      const uptimeEl = document.getElementById('statUptime');
      const messagesSentEl = document.getElementById('statMessagesSent');
      const messagesReceivedEl = document.getElementById('statMessagesReceived');
      const successRateEl = document.getElementById('statSuccessRate');
      const responseTimeEl = document.getElementById('statResponseTime');
      const errorsEl = document.getElementById('statErrors');
      
      if (uptimeEl && data.websocket) {
        const uptime = Math.floor(data.websocket.uptime / 1000);
        uptimeEl.textContent = `${uptime}s`;
      }
      
      if (messagesSentEl && data.websocket) {
        messagesSentEl.textContent = data.websocket.messagesSent || 0;
      }
      
      if (messagesReceivedEl && data.websocket) {
        messagesReceivedEl.textContent = data.websocket.messagesReceived || 0;
      }
      
      if (successRateEl && data.websocket) {
        successRateEl.textContent = `${data.websocket.commandSuccessRate || 0}%`;
      }
      
      if (responseTimeEl && data.websocket) {
        responseTimeEl.textContent = `${data.websocket.averageResponseTime || 0}ms`;
      }
      
      if (errorsEl && data.websocket) {
        errorsEl.textContent = data.websocket.errors || 0;
      }
      
      // Update serial port info
      const serialPortEl = document.getElementById('infoSerialPort');
      const baudRateEl = document.getElementById('infoBaudRate');
      
      if (serialPortEl && data.serial) {
        serialPortEl.textContent = data.serial.port || '-';
      }
      
      if (baudRateEl && data.serial) {
        baudRateEl.textContent = data.serial.baudRate || '-';
      }
    } catch (error) {
      console.error('[Diagnostics] Failed to update statistics:', error);
    }
  }

  destroy() {
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
    }
    
    Object.values(this.charts).forEach(chart => {
      if (chart) {
        chart.destroy();
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.robotClient) {
    window.diagnosticsDashboard = new DiagnosticsDashboard(window.robotClient);
  }
});

