/**
 * Audio Telemetry Utility
 * 
 * Provides audio level analysis (RMS) for lip-sync and animation purposes.
 * Supports HTMLAudioElement, MediaStream, and AudioBuffer sources.
 */

export interface AudioTelemetryOptions {
  onLevel: (level: number) => void;
  smoothingAlpha?: number; // Exponential moving average alpha (0-1), default 0.3
  throttleMs?: number; // Throttle emissions to max FPS, default 33ms (30 FPS)
}

const DEFAULT_SMOOTHING_ALPHA = 0.3;
const DEFAULT_THROTTLE_MS = 33; // ~30 FPS

/**
 * Analyze audio from an HTMLAudioElement
 * Creates WebAudio pipeline: audioEl → MediaElementSourceNode → AnalyserNode
 */
export function analyzeAudioElement(
  audioEl: HTMLAudioElement,
  options: AudioTelemetryOptions
): () => void {
  const { onLevel, smoothingAlpha = DEFAULT_SMOOTHING_ALPHA, throttleMs = DEFAULT_THROTTLE_MS } = options;

  // Create audio context
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Create source from audio element
  const source = audioContext.createMediaElementSource(audioEl);
  
  // Create analyser node
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  
  // Connect: source → analyser → destination
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  
  // Analysis state
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let smoothedLevel = 0;
  let lastEmitTime = 0;
  let rafId: number | null = null;
  
  // Analysis loop
  const analyze = () => {
    analyser.getByteTimeDomainData(dataArray);
    
    // Compute RMS
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128; // Normalize to -1..1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Smooth with exponential moving average
    smoothedLevel = smoothingAlpha * rms + (1 - smoothingAlpha) * smoothedLevel;
    
    // Throttle emissions
    const now = performance.now();
    if (now - lastEmitTime >= throttleMs) {
      onLevel(Math.min(smoothedLevel, 1)); // Clamp to 0..1
      lastEmitTime = now;
    }
    
    // Continue if audio is still playing
    if (!audioEl.paused && !audioEl.ended) {
      rafId = requestAnimationFrame(analyze);
    }
  };
  
  // Start analysis when audio starts playing
  const onPlay = () => {
    if (rafId === null) {
      rafId = requestAnimationFrame(analyze);
    }
  };
  
  audioEl.addEventListener("play", onPlay);
  
  // Cleanup function
  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    audioEl.removeEventListener("play", onPlay);
    source.disconnect();
    analyser.disconnect();
    // Note: Don't close audioContext as it may be used elsewhere
  };
}

/**
 * Analyze audio from a MediaStream
 * Creates WebAudio pipeline: stream → MediaStreamSourceNode → AnalyserNode
 */
export function analyzeMediaStream(
  stream: MediaStream,
  options: AudioTelemetryOptions
): () => void {
  const { onLevel, smoothingAlpha = DEFAULT_SMOOTHING_ALPHA, throttleMs = DEFAULT_THROTTLE_MS } = options;

  // Create audio context
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Create source from media stream
  const source = audioContext.createMediaStreamSource(stream);
  
  // Create analyser node
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  
  // Connect: source → analyser
  source.connect(analyser);
  
  // Analysis state
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let smoothedLevel = 0;
  let lastEmitTime = 0;
  let rafId: number | null = null;
  let isActive = true;
  
  // Analysis loop
  const analyze = () => {
    if (!isActive) return;
    
    analyser.getByteTimeDomainData(dataArray);
    
    // Compute RMS
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128; // Normalize to -1..1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Smooth with exponential moving average
    smoothedLevel = smoothingAlpha * rms + (1 - smoothingAlpha) * smoothedLevel;
    
    // Throttle emissions
    const now = performance.now();
    if (now - lastEmitTime >= throttleMs) {
      onLevel(Math.min(smoothedLevel, 1)); // Clamp to 0..1
      lastEmitTime = now;
    }
    
    rafId = requestAnimationFrame(analyze);
  };
  
  // Start analysis
  rafId = requestAnimationFrame(analyze);
  
  // Cleanup function
  return () => {
    isActive = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    source.disconnect();
    analyser.disconnect();
    // Note: Don't close audioContext as it may be used elsewhere
  };
}

/**
 * Analyze audio from an AudioBuffer (for WebAudio playback)
 * Creates: audioBuffer → BufferSource → GainNode → AnalyserNode → destination
 */
export function analyzeAudioBuffer(
  audioBuffer: AudioBuffer,
  audioContext: AudioContext,
  options: AudioTelemetryOptions
): () => void {
  const { onLevel, smoothingAlpha = DEFAULT_SMOOTHING_ALPHA, throttleMs = DEFAULT_THROTTLE_MS } = options;

  // Create buffer source
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  
  // Create gain node (for volume control if needed)
  const gainNode = audioContext.createGain();
  
  // Create analyser node
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  
  // Connect: source → gain → analyser → destination
  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(audioContext.destination);
  
  // Analysis state
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let smoothedLevel = 0;
  let lastEmitTime = 0;
  let rafId: number | null = null;
  let isActive = true;
  
  // Analysis loop
  const analyze = () => {
    if (!isActive) return;
    
    analyser.getByteTimeDomainData(dataArray);
    
    // Compute RMS
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128; // Normalize to -1..1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Smooth with exponential moving average
    smoothedLevel = smoothingAlpha * rms + (1 - smoothingAlpha) * smoothedLevel;
    
    // Throttle emissions
    const now = performance.now();
    if (now - lastEmitTime >= throttleMs) {
      onLevel(Math.min(smoothedLevel, 1)); // Clamp to 0..1
      lastEmitTime = now;
    }
    
    rafId = requestAnimationFrame(analyze);
  };
  
  // Start playback and analysis
  source.start(0);
  rafId = requestAnimationFrame(analyze);
  
  // Stop analysis when playback ends
  source.onended = () => {
    isActive = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
  
  // Cleanup function
  return () => {
    isActive = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    try {
      source.stop();
    } catch (e) {
      // Source may already be stopped
    }
    source.disconnect();
    gainNode.disconnect();
    analyser.disconnect();
  };
}

