/**
 * Run Mode Interface
 * Handles movement controls, servo, LED, mode selection, and E-stop
 */

class RunModeInterface {
  constructor(robotClient) {
    this.client = robotClient;
    this.currentMode = 1; // MANUAL
    this.initializeElements();
    this.attachEventListeners();
    this.updateConnectionStatus();
    
    // Listen for connection state changes
    this.client.onConnectionState((state) => {
      this.updateConnectionStatus();
    });
  }

  initializeElements() {
    // Mode selection
    this.modeSelect = document.getElementById('modeSelect');
    
    // Tank drive
    this.tankLeft = document.getElementById('tankLeft');
    this.tankRight = document.getElementById('tankRight');
    this.tankLeftValue = document.getElementById('tankLeftValue');
    this.tankRightValue = document.getElementById('tankRightValue');
    this.tankDriveBtn = document.getElementById('tankDriveBtn');
    
    // Twist drive
    this.twistV = document.getElementById('twistV');
    this.twistOmega = document.getElementById('twistOmega');
    this.twistVValue = document.getElementById('twistVValue');
    this.twistOmegaValue = document.getElementById('twistOmegaValue');
    this.twistDriveBtn = document.getElementById('twistDriveBtn');
    
    // Preset movements
    this.presetForward = document.getElementById('presetForward');
    this.presetBackward = document.getElementById('presetBackward');
    this.presetLeft = document.getElementById('presetLeft');
    this.presetRight = document.getElementById('presetRight');
    this.presetStop = document.getElementById('presetStop');
    
    // Servo
    this.servoAngle = document.getElementById('servoAngle');
    this.servoAngleValue = document.getElementById('servoAngleValue');
    this.servoLeft = document.getElementById('servoLeft');
    this.servoCenter = document.getElementById('servoCenter');
    this.servoRight = document.getElementById('servoRight');
    this.servoSendBtn = document.getElementById('servoSendBtn');
    
    // LED
    this.ledR = document.getElementById('ledR');
    this.ledG = document.getElementById('ledG');
    this.ledB = document.getElementById('ledB');
    this.ledBrightness = document.getElementById('ledBrightness');
    this.ledRValue = document.getElementById('ledRValue');
    this.ledGValue = document.getElementById('ledGValue');
    this.ledBValue = document.getElementById('ledBValue');
    this.ledBrightnessValue = document.getElementById('ledBrightnessValue');
    this.ledRed = document.getElementById('ledRed');
    this.ledGreen = document.getElementById('ledGreen');
    this.ledBlue = document.getElementById('ledBlue');
    this.ledCyan = document.getElementById('ledCyan');
    this.ledOff = document.getElementById('ledOff');
    this.ledSendBtn = document.getElementById('ledSendBtn');
    
    // E-Stop
    this.eStopBtn = document.getElementById('eStopBtn');
  }

  attachEventListeners() {
    // Mode selection
    this.modeSelect.addEventListener('change', (e) => {
      this.setMode(parseInt(e.target.value));
    });
    
    // Tank drive sliders
    this.tankLeft.addEventListener('input', (e) => {
      this.tankLeftValue.textContent = e.target.value;
    });
    this.tankRight.addEventListener('input', (e) => {
      this.tankRightValue.textContent = e.target.value;
    });
    this.tankDriveBtn.addEventListener('click', () => {
      this.sendTankDrive();
    });
    
    // Twist drive sliders
    this.twistV.addEventListener('input', (e) => {
      this.twistVValue.textContent = e.target.value;
    });
    this.twistOmega.addEventListener('input', (e) => {
      this.twistOmegaValue.textContent = e.target.value;
    });
    this.twistDriveBtn.addEventListener('click', () => {
      this.sendTwistDrive();
    });
    
    // Preset movements
    this.presetForward.addEventListener('click', () => {
      this.setTankValues(255, 255);
      this.sendTankDrive();
    });
    this.presetBackward.addEventListener('click', () => {
      this.setTankValues(-255, -255);
      this.sendTankDrive();
    });
    this.presetLeft.addEventListener('click', () => {
      this.setTankValues(-255, 255);
      this.sendTankDrive();
    });
    this.presetRight.addEventListener('click', () => {
      this.setTankValues(255, -255);
      this.sendTankDrive();
    });
    this.presetStop.addEventListener('click', () => {
      this.setTankValues(0, 0);
      this.sendTankDrive();
    });
    
    // Servo slider
    this.servoAngle.addEventListener('input', (e) => {
      this.servoAngleValue.textContent = e.target.value;
    });
    this.servoLeft.addEventListener('click', () => {
      this.servoAngle.value = 0;
      this.servoAngleValue.textContent = '0';
    });
    this.servoCenter.addEventListener('click', () => {
      this.servoAngle.value = 90;
      this.servoAngleValue.textContent = '90';
    });
    this.servoRight.addEventListener('click', () => {
      this.servoAngle.value = 180;
      this.servoAngleValue.textContent = '180';
    });
    this.servoSendBtn.addEventListener('click', () => {
      this.sendServo();
    });
    
    // LED sliders
    this.ledR.addEventListener('input', (e) => {
      this.ledRValue.textContent = e.target.value;
    });
    this.ledG.addEventListener('input', (e) => {
      this.ledGValue.textContent = e.target.value;
    });
    this.ledB.addEventListener('input', (e) => {
      this.ledBValue.textContent = e.target.value;
    });
    this.ledBrightness.addEventListener('input', (e) => {
      this.ledBrightnessValue.textContent = e.target.value;
    });
    
    // LED presets
    this.ledRed.addEventListener('click', () => {
      this.setLEDValues(255, 0, 0, 255);
    });
    this.ledGreen.addEventListener('click', () => {
      this.setLEDValues(0, 255, 0, 255);
    });
    this.ledBlue.addEventListener('click', () => {
      this.setLEDValues(0, 0, 255, 255);
    });
    this.ledCyan.addEventListener('click', () => {
      this.setLEDValues(0, 255, 255, 255);
    });
    this.ledOff.addEventListener('click', () => {
      this.setLEDValues(0, 0, 0, 0);
    });
    this.ledSendBtn.addEventListener('click', () => {
      this.sendLED();
    });
    
    // E-Stop
    this.eStopBtn.addEventListener('click', () => {
      this.sendEStop();
    });
  }

  setTankValues(left, right) {
    this.tankLeft.value = left;
    this.tankRight.value = right;
    this.tankLeftValue.textContent = left;
    this.tankRightValue.textContent = right;
  }

  setLEDValues(r, g, b, brightness) {
    this.ledR.value = r;
    this.ledG.value = g;
    this.ledB.value = b;
    this.ledBrightness.value = brightness;
    this.ledRValue.textContent = r;
    this.ledGValue.textContent = g;
    this.ledBValue.textContent = b;
    this.ledBrightnessValue.textContent = brightness;
  }

  async setMode(mode) {
    try {
      await this.client.sendCommand('SET_MODE', { mode });
      this.currentMode = mode;
      this.showToast(`Mode set to ${this.getModeName(mode)}`, 'success');
    } catch (error) {
      this.handleCommandError(error, 'Set Mode');
    }
  }

  getModeName(mode) {
    const modes = {
      0: 'STANDBY',
      1: 'MANUAL',
      2: 'LINE_FOLLOW',
      3: 'OBSTACLE_AVOID',
      4: 'FOLLOW',
    };
    return modes[mode] || 'UNKNOWN';
  }

  async sendTankDrive() {
    try {
      const left = parseInt(this.tankLeft.value);
      const right = parseInt(this.tankRight.value);
      
      // Validate values
      if (isNaN(left) || isNaN(right)) {
        throw new Error('Invalid tank drive values');
      }
      
      await this.client.sendCommand('DRIVE_TANK', { left, right });
    } catch (error) {
      this.handleCommandError(error, 'Tank Drive');
    }
  }

  async sendTwistDrive() {
    try {
      const v = parseInt(this.twistV.value);
      const omega = parseInt(this.twistOmega.value);
      
      // Validate values
      if (isNaN(v) || isNaN(omega)) {
        throw new Error('Invalid twist drive values');
      }
      
      await this.client.sendCommand('DRIVE_TWIST', { v, omega });
    } catch (error) {
      this.handleCommandError(error, 'Twist Drive');
    }
  }

  async sendServo() {
    try {
      const angle = parseInt(this.servoAngle.value);
      
      // Validate angle
      if (isNaN(angle) || angle < 0 || angle > 180) {
        throw new Error('Servo angle must be between 0 and 180 degrees');
      }
      
      await this.client.sendCommand('SERVO', { angle });
      this.showToast(`Servo set to ${angle}°`, 'success');
    } catch (error) {
      this.handleCommandError(error, 'Servo');
    }
  }

  async sendLED() {
    try {
      const r = parseInt(this.ledR.value);
      const g = parseInt(this.ledG.value);
      const b = parseInt(this.ledB.value);
      const brightness = parseInt(this.ledBrightness.value);
      
      // Validate values
      if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(brightness)) {
        throw new Error('Invalid LED values');
      }
      
      if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || brightness < 0 || brightness > 255) {
        throw new Error('LED values must be between 0 and 255');
      }
      
      await this.client.sendCommand('LED', { r, g, b, brightness });
    } catch (error) {
      this.handleCommandError(error, 'LED');
    }
  }

  async sendEStop() {
    try {
      await this.client.sendCommand('E_STOP', {});
      this.showToast('Emergency stop activated!', 'error');
      // Reset movement controls
      this.setTankValues(0, 0);
    } catch (error) {
      // E-Stop errors are critical - show even if connection fails
      this.showToast(`E-Stop command failed: ${error.message}. Robot may still be moving!`, 'error');
    }
  }

  updateConnectionStatus() {
    const state = this.client.getConnectionState();
    const connected = state === 'connected';
    
    // Enable/disable controls
    const controls = [
      this.modeSelect,
      this.tankDriveBtn,
      this.twistDriveBtn,
      this.servoSendBtn,
      this.ledSendBtn,
      this.presetForward,
      this.presetBackward,
      this.presetLeft,
      this.presetRight,
      this.presetStop,
    ];
    
    controls.forEach(control => {
      if (control) {
        control.disabled = !connected;
      }
    });
    
    // E-Stop should always be enabled
    if (this.eStopBtn) {
      this.eStopBtn.disabled = false;
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('errorToast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (toast && toastMessage) {
      toastMessage.textContent = message;
      
      // Update toast styling based on type
      toast.className = 'toast';
      if (type === 'error') {
        toast.style.borderColor = 'var(--error-red)';
      } else if (type === 'success') {
        toast.style.borderColor = 'var(--online-green)';
      } else {
        toast.style.borderColor = 'var(--accent-cyan)';
      }
      
      toast.classList.add('show');
      
      // Auto-hide after appropriate time
      const hideDelay = type === 'error' ? 5000 : 3000;
      setTimeout(() => {
        toast.classList.remove('show');
      }, hideDelay);
    }
  }
  
  handleCommandError(error, commandName) {
    console.error(`[RunMode] ${commandName} error:`, error);
    
    let errorMessage = error.message || 'Unknown error';
    
    // Provide user-friendly error messages
    if (errorMessage.includes('Not connected')) {
      errorMessage = 'Robot is not connected. Please wait for connection.';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = `Command timed out. The robot may not be responding.`;
    } else if (errorMessage.includes('Command failed')) {
      errorMessage = `Robot rejected the command: ${errorMessage}`;
    }
    
    this.showToast(`${commandName}: ${errorMessage}`, 'error');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.robotClient) {
    window.runModeInterface = new RunModeInterface(window.robotClient);
  }
});

// Close toast on click
document.addEventListener('DOMContentLoaded', () => {
  const toastClose = document.getElementById('toastClose');
  const toast = document.getElementById('errorToast');
  
  if (toastClose && toast) {
    toastClose.addEventListener('click', () => {
      toast.classList.remove('show');
    });
  }
});

