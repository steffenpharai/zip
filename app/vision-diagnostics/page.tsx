"use client";

/**
 * YOLO Diagnostic Page
 * 
 * Comprehensive testing and diagnostics for YOLOE model.
 * Migrated to YOLOE for potential open-vocabulary detection (zero overhead in closed mode).
 * Features:
 * - Live camera feed with detection overlays
 * - Adjustable confidence and NMS thresholds
 * - Model configuration display
 * - Performance metrics (FPS, inference time)
 * - Image upload for testing
 * - Detection statistics and visualization
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface Detection {
  classId: string;
  className: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

interface YOLOConfig {
  modelPath: string;
  inputWidth: number;
  inputHeight: number;
  confidenceThreshold: number;
  nmsThreshold: number;
  maxDetections: number;
  useInt8: boolean;
  useFp16: boolean;
  device: string;
  initialized: boolean;
  numClasses: number;
}

interface InferenceStats {
  inferenceTimeMs: number;
  numDetections: number;
  imageWidth: number;
  imageHeight: number;
}

export default function YOLODiagnosticsPage() {
  // State
  const [config, setConfig] = useState<YOLOConfig | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [stats, setStats] = useState<InferenceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  // Configuration controls
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.75);
  const [nmsThreshold, setNmsThreshold] = useState(0.4);
  const [maxDetections, setMaxDetections] = useState(100);
  
  // Performance tracking
  const [fps, setFps] = useState<number | null>(null); // Detection FPS from ROS
  const [inferenceTimes, setInferenceTimes] = useState<number[]>([]);
  const [totalInferences, setTotalInferences] = useState(0);
  const [overlayFps, setOverlayFps] = useState<number | null>(null);
  const overlayFpsRef = useRef<number[]>([]);
  const lastOverlayFpsTimeRef = useRef<number>(0);
  
  // Streaming metrics (MJPEG)
  const [streamFps, setStreamFps] = useState<number | null>(null); // Estimated stream FPS
  const [detectionUpdateRate, setDetectionUpdateRate] = useState<number | null>(null); // Detection polling rate
  const [streamLatency, setStreamLatency] = useState<number | null>(null); // Stream latency in ms
  const [streamHealth, setStreamHealth] = useState<'excellent' | 'good' | 'fair' | 'poor' | null>(null);
  const detectionUpdateTimesRef = useRef<number[]>([]);
  const lastDetectionUpdateTimeRef = useRef<number>(0);
  const streamStartTimeRef = useRef<number>(0);
  const reconnectionAttemptsRef = useRef<number>(0);
  
  // Bridge connection status
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [topicStatus, setTopicStatus] = useState<any>(null);
  
  // Use visualization stream: YOLO overlays from C++ node (GPU). No frontend canvas overlay.
  // Set to false to use raw camera stream + frontend canvas overlays.
  const USE_VISUALIZATION_STREAM = true;
  const displayMode = 'camera';
  
  // Visualization settings
  const [vizSettings, setVizSettings] = useState({
    showLabels: true,
    showConfidence: true,
    showBoxes: true,
    fontSize: 14,
    colorScheme: 'class' as 'class' | 'confidence',
    cornerMarkers: true,
    adaptiveSizing: true,
    // Visual filtering (show all, highlight focus)
    focusClass: null as string | null,
    focusConfidenceMin: 0.0,
    dimUnfocused: false,
    // Enhanced visualization features
    showDetectionIds: false,
    showBboxArea: false,
    showCenterLines: false,
    showClassCounts: false,
  });

  // Max detections to render (null = unlimited, show all by default)
  const [maxDetectionsToRender, setMaxDetectionsToRender] = useState<number | null>(null);
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const streamImageRef = useRef<HTMLImageElement>(null);
  const streamCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamAnimationFrameRef = useRef<number | null>(null);
  const isStreamingActiveRef = useRef<boolean>(false);
  const lastOverlayRenderTimeRef = useRef<number>(0);
  const pendingOverlayUpdateRef = useRef<boolean>(false);
  
  // Stream detections state (not used for overlays, but kept for stats)
  const [streamDetections, setStreamDetections] = useState<Detection[]>([]);
  const streamDetectionsRef = useRef<Detection[]>([]);
  const [streamImageSrc, setStreamImageSrc] = useState<string>("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
  const isStreamingRef = useRef<boolean>(false); // Ref to avoid stale closures in onLoad
  
  // Image metadata (dimensions from backend)
  const [imageMetadata, setImageMetadata] = useState<{ width: number | null; height: number | null }>({ width: null, height: null });
  const imageMetadataRef = useRef<{ width: number | null; height: number | null }>({ width: null, height: null });

  // Analytics state for diagnostics
  const [classDistribution, setClassDistribution] = useState<Map<string, number>>(new Map());
  const [confidenceDistribution, setConfidenceDistribution] = useState<number[]>([]);
  const [detectionCountHistory, setDetectionCountHistory] = useState<number[]>([]);
  
  // Detection ID tracking (for unique IDs per detection)
  const detectionIdCounterRef = useRef<number>(0);
  const detectionIdMapRef = useRef<Map<string, number>>(new Map());

  // Load configuration on mount
  useEffect(() => {
    loadConfig();
    // loadStatus will be called after it's defined (see useEffect below)
  }, []);

  // Handle window resize for canvas overlay (Jetson-optimized)
  // Note: This useEffect is moved after drawStreamOverlays definition to avoid dependency issues

  // Cleanup streaming on unmount and clear canvas
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
      if (streamAnimationFrameRef.current) {
        cancelAnimationFrame(streamAnimationFrameRef.current);
      }
      isStreamingActiveRef.current = false;
      
      // Clear canvas on unmount
      const canvas = streamCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };
  }, []);

  // Load stream detections periodically (optimized for Jetson with synchronization)
  const loadStreamDetections = useCallback(async () => {
    try {
      const fetchStartTime = performance.now();
      
      // Add cache-busting to ensure fresh detections
      const timestamp = Date.now();
      const response = await fetch(`/api/vision/detections?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      const fetchEndTime = performance.now();
      const fetchLatency = fetchEndTime - fetchStartTime;
      
        if (response.ok) {
        const data = await response.json();
        const newDetections = data.detections || [];
        
        // Debug: Log first detection's className to verify API response
        if (newDetections.length > 0 && process.env.NODE_ENV === 'development') {
          console.log('[Vision Diagnostics] First detection:', {
            className: newDetections[0].className,
            classId: newDetections[0].classId,
            confidence: newDetections[0].confidence
          });
        }
        
        // Extract image dimensions from API metadata
        if (data.image_width && data.image_height) {
          const metadata = { width: data.image_width, height: data.image_height };
          setImageMetadata(metadata);
          imageMetadataRef.current = metadata;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:195',message:'loadStreamDetections: received detections',data:{count:newDetections.length,firstBbox:newDetections[0]?.bbox||null,allBboxes:newDetections.slice(0,3).map((d:Detection)=>({x:d.bbox.x,y:d.bbox.y,w:d.bbox.width,h:d.bbox.height,centerX:d.bbox.centerX,centerY:d.bbox.centerY}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        // #region agent log
        (()=>{const f=newDetections.slice(0,5);const k=f.map((d:Detection)=>`${d.bbox.x},${d.bbox.y},${d.bbox.width},${d.bbox.height}`);const allSame=f.length>=2&&k.every((q:string)=>q===k[0]);const anyNorm=newDetections.some((d:Detection)=>[d.bbox.x,d.bbox.y,d.bbox.width,d.bbox.height].some((v:number)=>v>0&&v<=1));fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:199b',message:'loadStreamDetections: H1/H2 bbox sanity',data:{count:newDetections.length,first5BboxesIdentical:allSame,anyValueInZeroOne:anyNorm,sample: f.slice(0,3).map((d:Detection)=>({x:d.bbox.x,y:d.bbox.y,w:d.bbox.width,h:d.bbox.height}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});if(anyNorm)fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:199c',message:'loadStreamDetections: H2 normalized-like bbox',data:{sample:newDetections.slice(0,2).map((d:Detection)=>d.bbox)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});})();
        // #endregion

        // Only update state if detections actually changed to prevent infinite loops
        const currentDetections = streamDetectionsRef.current;
        const currentHash = JSON.stringify(currentDetections.map((d: Detection) => ({
          classId: d.classId,
          className: d.className,
          confidence: d.confidence,
          bbox: d.bbox
        })));
        const newHash = JSON.stringify(newDetections.map((d: Detection) => ({
          classId: d.classId,
          className: d.className,
          confidence: d.confidence,
          bbox: d.bbox
        })));
        
        if (currentHash !== newHash) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:214',message:'loadStreamDetections: detections changed, updating state',data:{count:newDetections.length,canvasExists:!!streamCanvasRef.current,isStreaming:isStreamingRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          // Update with timestamp for synchronization tracking
          setStreamDetections([...newDetections]);
          streamDetectionsRef.current = [...newDetections]; // Keep ref in sync
          // Mark that we have pending overlay update
          pendingOverlayUpdateRef.current = true;
        }
        
        // Track detection update rate (for streaming metrics)
        const now = performance.now();
        if (lastDetectionUpdateTimeRef.current > 0) {
          const delta = now - lastDetectionUpdateTimeRef.current;
          if (delta > 0) {
            const updateRate = 1000 / delta; // Updates per second
            detectionUpdateTimesRef.current.push(updateRate);
            // Keep last 30 measurements
            if (detectionUpdateTimesRef.current.length > 30) {
              detectionUpdateTimesRef.current.shift();
            }
            // Calculate average update rate
            const avgRate = detectionUpdateTimesRef.current.reduce((a, b) => a + b, 0) / detectionUpdateTimesRef.current.length;
            setDetectionUpdateRate(avgRate);
          }
        }
        lastDetectionUpdateTimeRef.current = now;
        
        // Track stream latency (fetch time + processing)
        setStreamLatency(fetchLatency);
        
        // Calculate stream health based on update rate and latency
        if (detectionUpdateTimesRef.current.length > 5) {
          const avgRate = detectionUpdateTimesRef.current.reduce((a, b) => a + b, 0) / detectionUpdateTimesRef.current.length;
          let health: 'excellent' | 'good' | 'fair' | 'poor';
          if (avgRate >= 18 && fetchLatency < 50) {
            health = 'excellent';
          } else if (avgRate >= 15 && fetchLatency < 100) {
            health = 'good';
          } else if (avgRate >= 10 && fetchLatency < 200) {
            health = 'fair';
          } else {
            health = 'poor';
          }
          setStreamHealth(health);
        }
      }
    } catch (error) {
      // Silently fail - detections may not be available
      console.debug("Detection fetch failed (expected during startup):", error);
      // Mark stream health as poor on errors
      setStreamHealth('poor');
    }
  }, []);


  /**
   * Load YOLO configuration
   */
  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/vision/diagnostics");
      const data = await response.json();
      
      if (data.success && data.config) {
        setConfig(data.config);
        setConfidenceThreshold(data.config.confidenceThreshold);
        setNmsThreshold(data.config.nmsThreshold);
        setMaxDetections(data.config.maxDetections);
        setBridgeConnected(data.status?.bridgeConnected !== false);
      }
    } catch (err) {
      console.error("Failed to load config:", err);
      setError("Failed to load YOLO configuration");
    }
  }, []);

  /**
   * Load status from bridge server with improved error handling and retry logic
   */
  const loadStatus = useCallback(async (retryCount = 0) => {
    try {
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      const response = await fetch("/api/vision/status", {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setTopicStatus(data);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:316',message:'loadStatus: setting bridgeConnected=true',data:{isStreaming,streamComplete:streamImageRef.current?.complete},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        setBridgeConnected(true);
        
        // Update FPS from status (bridge reports accurate FPS from ROS topic)
        if (data.detections?.fps && data.detections.fps > 0) {
          setFps(data.detections.fps);
        } else if (data.detections?.fps === null || data.detections?.fps === undefined) {
          // FPS not available yet (not enough history), keep current value or set to null
          // Don't overwrite with null if we have a valid value
        }
        
        // Calculate stream FPS from actual camera update rate (real data, not placeholder)
        if (data.camera?.last_update_seconds_ago !== null && data.camera.last_update_seconds_ago > 0) {
          // Calculate FPS from time since last update (real measurement)
          const estimatedFps = Math.min(30, 1.0 / Math.max(data.camera.last_update_seconds_ago, 0.033));
          setStreamFps(estimatedFps);
        } else if (data.camera?.last_update_seconds_ago === null) {
          // Camera not updating, set to null (not a placeholder)
          setStreamFps(null);
        }
      } else {
        // HTTP error - be more conservative: only mark disconnected if we're sure
        // Don't disconnect immediately after stopping stream - give it a moment
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:337',message:'loadStatus: HTTP error, checking if should disconnect',data:{isStreaming,streamComplete:streamImageRef.current?.complete,status:response.status,shouldDisconnect:(!isStreaming && !streamImageRef.current?.complete)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        // Only disconnect if we're not streaming AND stream never loaded
        // If we just stopped streaming, the stream might still be completing, so don't disconnect yet
        if (!isStreaming && !streamImageRef.current?.complete) {
          // Only disconnect if stream image was never successfully loaded
          setBridgeConnected(false);
        }
        // If streaming but status check failed, don't disconnect - might be temporary
      }
    } catch (err: any) {
      // Network error or timeout
      // Only mark as disconnected if:
      // 1. Not currently streaming, OR
      // 2. Stream image hasn't loaded yet, OR  
      // 3. Error is not a timeout/abort (which might be temporary)
      if (err.name === 'AbortError') {
        // Timeout - don't immediately mark as disconnected
        // Timeouts can happen even when bridge is connected, especially during transitions
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:347',message:'loadStatus: AbortError timeout',data:{isStreaming,streamComplete:streamImageRef.current?.complete},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        // Don't disconnect on timeout - might be temporary network issue
        // Only disconnect if we're sure the bridge is down (not just a timeout)
      } else {
        // Other network errors - be more lenient, especially right after stopping stream
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:353',message:'loadStatus: network error',data:{isStreaming,streamComplete:streamImageRef.current?.complete,errorName:err.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
        // #endregion
        // Only disconnect if we're not streaming AND stream never loaded
        // This prevents disconnecting immediately after stopping stream
        if (!isStreaming && !streamImageRef.current?.complete) {
          setBridgeConnected(false);
        }
      }
    }
  }, [isStreaming]);

  // Poll status periodically (more frequent when streaming)
  // Placed after loadStatus definition to avoid dependency issues
  useEffect(() => {
    // Initial status load
    loadStatus();
    
    const interval = isStreaming ? 500 : 1000; // Update more frequently when streaming
    const statusInterval = setInterval(() => {
      loadStatus();
    }, interval);
    
    return () => clearInterval(statusInterval);
  }, [isStreaming, loadStatus]);

  // Compute analytics from detections (debounced for performance)
  useEffect(() => {
    if (streamDetections.length === 0) {
      setClassDistribution(new Map());
      setConfidenceDistribution([]);
      return;
    }

    // Update class distribution
    const classMap = new Map<string, number>();
    streamDetections.forEach(det => {
      const count = classMap.get(det.className) || 0;
      classMap.set(det.className, count + 1);
    });
    setClassDistribution(classMap);
    
    // Update confidence distribution
    const confidences = streamDetections.map(d => d.confidence);
    setConfidenceDistribution(confidences);
    
    // Update detection count history (keep last 100)
    setDetectionCountHistory(prev => [...prev.slice(-99), streamDetections.length]);
  }, [streamDetections]);

  /**
   * Load latest detections from bridge server
   */
  const loadDetections = useCallback(async () => {
    try {
      const response = await fetch("/api/vision/detections");
      if (response.ok) {
        const data = await response.json();
        if (data.detections) {
          setDetections(data.detections);
        }
      }
    } catch (err) {
      console.error("Failed to load detections:", err);
    }
  }, []);

  /**
   * Run inference on current image
   */
  const runInference = useCallback(async (imageData?: string) => {
    if (!imageData && !selectedImage) {
      setError("No image available for inference");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const imageToUse = imageData || selectedImage;
      if (!imageToUse) return;

      const response = await fetch("/api/vision/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageToUse.startsWith("data:") 
            ? imageToUse.split(",")[1] 
            : imageToUse,
          confidenceThreshold,
          nmsThreshold,
          maxDetections,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setDetections(data.detections || []);
        setStats(data.stats || null);
        
        if (data.stats?.inferenceTimeMs) {
          const time = data.stats.inferenceTimeMs;
          setInferenceTimes(prev => [...prev.slice(-29), time]); // Keep last 30
          setTotalInferences(prev => prev + 1);
          
          // Calculate FPS
          const now = performance.now();
          if (lastFrameTimeRef.current > 0) {
            const delta = now - lastFrameTimeRef.current;
            const currentFps = 1000 / delta;
            setFps(currentFps);
          }
          lastFrameTimeRef.current = now;
        }
      } else {
        setError(data.error || "Inference failed");
      }
    } catch (err) {
      console.error("Inference error:", err);
      setError("Failed to run inference");
    } finally {
      setLoading(false);
    }
  }, [selectedImage, confidenceThreshold, nmsThreshold, maxDetections]);

  // Cache for computed colors (performance optimization)
  const colorCacheRef = useRef<Map<string, string>>(new Map());
  
  // Generate class color (80 distinct colors) with caching
  const getClassColor = useCallback((classId: string, confidence: number) => {
    const cacheKey = `${classId}-${confidence.toFixed(2)}`;
    if (colorCacheRef.current.has(cacheKey)) {
      return colorCacheRef.current.get(cacheKey)!;
    }
    
    const id = parseInt(classId) || 0;
    // Use golden angle for color distribution
    const hue = (id * 137) % 360;
    const saturation = 70 + confidence * 20; // 70-90%
    const lightness = 50 + confidence * 10; // 50-60%
    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    
    // Cache result (limit cache size to prevent memory issues)
    if (colorCacheRef.current.size > 1000) {
      const firstKey = colorCacheRef.current.keys().next().value;
      if (firstKey !== undefined) {
        colorCacheRef.current.delete(firstKey);
      }
    }
    colorCacheRef.current.set(cacheKey, color);
    
    return color;
  }, []);

  // Calculate label positions to avoid overlaps
  // Works for both static images and stream (uses natural dimensions)
  const calculateLabelPositions = useCallback((detections: Detection[], useStreamImage = false) => {
    const positions: Array<{ x: number; y: number }> = [];
    const image = useStreamImage ? streamImageRef.current : imageRef.current;
    // Use metadata dimensions if available, fallback to image natural dimensions
    const imageWidth = imageMetadataRef.current.width || image?.naturalWidth || image?.width || 640;
    const imageHeight = imageMetadataRef.current.height || image?.naturalHeight || image?.height || 480;
    
    detections.forEach((det) => {
      let labelX = det.bbox.x;
      let labelY = det.bbox.y - 35; // Increased spacing from bbox
      
      // Check for overlaps with previous labels (increased sizes for combined text)
      const labelWidth = 150; // Increased to account for combined className + confidence
      const labelHeight = 50; // Increased for better spacing
      const minSpacing = 10; // Minimum spacing between labels
      
      for (const pos of positions) {
        // Check if labels would overlap (with buffer for spacing)
        if (
          labelX < pos.x + labelWidth + minSpacing &&
          labelX + labelWidth + minSpacing > pos.x &&
          labelY < pos.y + labelHeight + minSpacing &&
          labelY + labelHeight + minSpacing > pos.y
        ) {
          // Try placing below bbox first
          labelY = det.bbox.y + det.bbox.height + 10;
          // If still overlaps, try right side
          if (
            labelX < pos.x + labelWidth + minSpacing &&
            labelX + labelWidth + minSpacing > pos.x &&
            labelY < pos.y + labelHeight + minSpacing &&
            labelY + labelHeight + minSpacing > pos.y
          ) {
            labelX = det.bbox.x + det.bbox.width + 10;
            labelY = det.bbox.y;
          }
          break;
        }
      }
      
      // Ensure label doesn't go off screen
      if (labelY < 0) labelY = det.bbox.y + det.bbox.height + 10;
      if (labelY + labelHeight > imageHeight) labelY = det.bbox.y - 35;
      if (labelX + labelWidth > imageWidth) labelX = imageWidth - labelWidth - 10;
      if (labelX < 0) labelX = 10;
      
      positions.push({ x: labelX, y: labelY });
    });
    
    return positions;
  }, []);

  /**
   * Draw detection bounding boxes on canvas with enhanced styling
   */
  const drawDetections = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    
    if (!canvas || !image || detections.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match image
    canvas.width = image.width;
    canvas.height = image.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sort by confidence (draw high-confidence on top)
    const sortedDetections = [...detections].sort((a, b) => b.confidence - a.confidence);
    
    // Calculate label positions to avoid overlaps
    const labelPositions = calculateLabelPositions(sortedDetections);

    // Draw each detection
    sortedDetections.forEach((det, index) => {
      const { bbox, className, confidence, classId } = det;
      
      // Calculate size-adaptive line width (if enabled)
      const bboxArea = bbox.width * bbox.height;
      const lineWidth = vizSettings.adaptiveSizing 
        ? Math.max(2, Math.min(bboxArea / 5000, 6))
        : 2;
      
      // Get class color with confidence-based opacity
      const baseColor = vizSettings.colorScheme === 'class' 
        ? getClassColor(classId, confidence)
        : `hsl(${confidence * 120}, 70%, 50%)`;
      const opacity = confidence * 0.8 + 0.2;
      
      // Parse HSL color
      const hslMatch = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (!hslMatch) return;
      
      const [, h, s, l] = hslMatch.map(Number);
      const rgbaColor = `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
      const solidColor = `hsl(${h}, ${s}%, ${l}%)`;
      
      // Draw rounded rectangle bounding box (if enabled)
      if (vizSettings.showBoxes) {
        const cornerRadius = Math.min(8, Math.min(bbox.width, bbox.height) / 4);
        ctx.strokeStyle = rgbaColor;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        
        // Draw rounded rectangle
        ctx.beginPath();
        ctx.moveTo(bbox.x + cornerRadius, bbox.y);
        ctx.lineTo(bbox.x + bbox.width - cornerRadius, bbox.y);
        ctx.quadraticCurveTo(bbox.x + bbox.width, bbox.y, bbox.x + bbox.width, bbox.y + cornerRadius);
        ctx.lineTo(bbox.x + bbox.width, bbox.y + bbox.height - cornerRadius);
        ctx.quadraticCurveTo(bbox.x + bbox.width, bbox.y + bbox.height, bbox.x + bbox.width - cornerRadius, bbox.y + bbox.height);
        ctx.lineTo(bbox.x + cornerRadius, bbox.y + bbox.height);
        ctx.quadraticCurveTo(bbox.x, bbox.y + bbox.height, bbox.x, bbox.y + bbox.height - cornerRadius);
        ctx.lineTo(bbox.x, bbox.y + cornerRadius);
        ctx.quadraticCurveTo(bbox.x, bbox.y, bbox.x + cornerRadius, bbox.y);
        ctx.closePath();
        ctx.stroke();
      }
      
      // Draw corner markers (if enabled)
      if (vizSettings.cornerMarkers && vizSettings.showBoxes) {
        const markerSize = Math.max(8, Math.min(bbox.width, bbox.height) / 8);
        ctx.strokeStyle = solidColor;
        ctx.lineWidth = 2;
        
        // Top-left
        ctx.beginPath();
        ctx.moveTo(bbox.x, bbox.y);
        ctx.lineTo(bbox.x + markerSize, bbox.y);
        ctx.moveTo(bbox.x, bbox.y);
        ctx.lineTo(bbox.x, bbox.y + markerSize);
        ctx.stroke();
        
        // Top-right
        ctx.beginPath();
        ctx.moveTo(bbox.x + bbox.width, bbox.y);
        ctx.lineTo(bbox.x + bbox.width - markerSize, bbox.y);
        ctx.moveTo(bbox.x + bbox.width, bbox.y);
        ctx.lineTo(bbox.x + bbox.width, bbox.y + markerSize);
        ctx.stroke();
        
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(bbox.x + bbox.width, bbox.y + bbox.height);
        ctx.lineTo(bbox.x + bbox.width - markerSize, bbox.y + bbox.height);
        ctx.moveTo(bbox.x + bbox.width, bbox.y + bbox.height);
        ctx.lineTo(bbox.x + bbox.width, bbox.y + bbox.height - markerSize);
        ctx.stroke();
        
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(bbox.x, bbox.y + bbox.height);
        ctx.lineTo(bbox.x + markerSize, bbox.y + bbox.height);
        ctx.moveTo(bbox.x, bbox.y + bbox.height);
        ctx.lineTo(bbox.x, bbox.y + bbox.height - markerSize);
        ctx.stroke();
      }
      
      // Draw label with background (if enabled)
      if (vizSettings.showLabels) {
        const labelPos = labelPositions[index] || { x: bbox.x, y: bbox.y - 25 };
        const fontSize = vizSettings.fontSize;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        
        // Format label: combine className and confidence on one line for better readability
        const lines: string[] = [];
        let labelText = className;
        if (vizSettings.showConfidence) {
          labelText = `${className} ${(confidence * 100).toFixed(1)}%`;
        }
        lines.push(labelText);
        
        if (lines.length === 0) return; // Skip if no label content
      
        // Calculate label dimensions with proper spacing
        const lineHeight = fontSize + 6; // Increased spacing between lines
        const labelWidth = Math.max(
          ...lines.map(line => ctx.measureText(line).width)
        ) + 16; // Increased padding
        const labelHeight = lines.length * lineHeight + 10; // Increased padding
        
        // Draw label background with rounded corners
        const labelX = labelPos.x;
        const labelY = labelPos.y;
        const bgRadius = 4;
        
        ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * opacity})`;
        ctx.beginPath();
        ctx.moveTo(labelX + bgRadius, labelY);
        ctx.lineTo(labelX + labelWidth - bgRadius, labelY);
        ctx.quadraticCurveTo(labelX + labelWidth, labelY, labelX + labelWidth, labelY + bgRadius);
        ctx.lineTo(labelX + labelWidth, labelY + labelHeight - bgRadius);
        ctx.quadraticCurveTo(labelX + labelWidth, labelY + labelHeight, labelX + labelWidth - bgRadius, labelY + labelHeight);
        ctx.lineTo(labelX + bgRadius, labelY + labelHeight);
        ctx.quadraticCurveTo(labelX, labelY + labelHeight, labelX, labelY + labelHeight - bgRadius);
        ctx.lineTo(labelX, labelY + bgRadius);
        ctx.quadraticCurveTo(labelX, labelY, labelX + bgRadius, labelY);
        ctx.closePath();
        ctx.fill();
        
        // Draw label text with better spacing
        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
          // Add proper vertical spacing between lines
          const textY = labelY + 6 + i * lineHeight;
          ctx.fillText(line, labelX + 8, textY);
        });
      }
      
      // Draw center point
      ctx.fillStyle = solidColor;
      ctx.beginPath();
      ctx.arc(bbox.centerX, bbox.centerY, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, [detections, getClassColor, calculateLabelPositions, vizSettings]);

  // Draw overlays on stream canvas (defined after getClassColor and calculateLabelPositions)
  // Optimized for Jetson Orin Nano with proper error handling and performance monitoring
  const drawStreamOverlays = useCallback(() => {
    const renderStartTime = performance.now();
    const canvas = streamCanvasRef.current;
    const image = streamImageRef.current;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:716',message:'drawStreamOverlays: entry',data:{canvasExists:!!canvas,imageExists:!!image,canvasSize:canvas?`${canvas.width}x${canvas.height}`:'null',imageSize:image?`${image.clientWidth}x${image.clientHeight}`:'null'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (!canvas || !image) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:722',message:'drawStreamOverlays: early return - missing canvas or image',data:{canvasExists:!!canvas,imageExists:!!image},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return;
    }

    // Get canvas context with error handling
    const ctx = canvas.getContext("2d", { 
      alpha: true,
      desynchronized: true // Optimize for Jetson performance
    });
    if (!ctx) {
      console.warn("Failed to get canvas context for stream overlays");
      return;
    }

    // When using visualization stream, overlays are already in the frame from the C++ node.
    // Skip all canvas operations - canvas should not even exist in DOM when USE_VISUALIZATION_STREAM is true.
    if (USE_VISUALIZATION_STREAM) {
      return;
    }
    
    // Use ref to get latest detections (avoids stale closure issues)
    const currentDetections = streamDetectionsRef.current;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:736',message:'drawStreamOverlays: got detections',data:{count:currentDetections.length,firstBbox:currentDetections[0]?.bbox||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Early return if no detections (clear canvas with fallback handling)
    if (currentDetections.length === 0) {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch (error) {
        // Graceful fallback if canvas is in invalid state
        console.debug("Canvas clear failed (expected during transitions):", error);
      }
      return;
    }

    // Get displayed image size (not natural size) - account for CSS object-contain scaling
    const displayedWidth = image.clientWidth;
    const displayedHeight = image.clientHeight;
    
    // CRITICAL FIX: Use actual camera image dimensions from metadata for bbox coordinate space
    // The backend processes images and sends bbox coordinates in that space
    // We must use these dimensions for scaling, not the image element's natural size
    // which may be different due to browser resizing or encoding artifacts
    const sourceImageWidth = imageMetadataRef.current.width || image.naturalWidth || 640;
    const sourceImageHeight = imageMetadataRef.current.height || image.naturalHeight || 480;
    
    // Guard against invalid dimensions (with fallback for Jetson edge cases)
    if (displayedWidth === 0 || displayedHeight === 0 || sourceImageWidth === 0 || sourceImageHeight === 0) {
      // Image not loaded yet, but don't return - try to draw anyway if we have detections
      if (currentDetections.length === 0) {
        return;
      }
      // If we have detections but image not ready, wait a bit
      if (displayedWidth === 0 || displayedHeight === 0) {
        return;
      }
    }
    
    // Additional validation for Jetson edge cases
    if (!Number.isFinite(displayedWidth) || !Number.isFinite(displayedHeight) ||
        !Number.isFinite(sourceImageWidth) || !Number.isFinite(sourceImageHeight)) {
      console.warn("Invalid image dimensions detected, skipping overlay render");
      return;
    }
    
    // Calculate scaling factors using source image dimensions (640x480)
    // This ensures bbox coordinates (which are in 640x480 space) scale correctly
    const scaleX = displayedWidth / sourceImageWidth;
    const scaleY = displayedHeight / sourceImageHeight;
    const scale = Math.min(scaleX, scaleY); // object-contain uses min scale
    
    // Calculate actual displayed size (may have letterboxing)
    const actualDisplayedWidth = sourceImageWidth * scale;
    const actualDisplayedHeight = sourceImageHeight * scale;
    const offsetX = (displayedWidth - actualDisplayedWidth) / 2;
    const offsetY = (displayedHeight - actualDisplayedHeight) / 2;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:807',message:'drawStreamOverlays: scaling calculation',data:{displayedWidth,displayedHeight,sourceImageWidth,sourceImageHeight,scaleX,scaleY,scale,actualDisplayedWidth,actualDisplayedHeight,offsetX,offsetY,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,mismatch640x480:image.naturalWidth!==640||image.naturalHeight!==480},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    // Set canvas size to match ACTUAL displayed image size (after object-contain scaling)
    // The canvas must match the image's actual rendered size, not the container size
    // This ensures bbox coordinates align perfectly with the visible image
    const canvasWidth = actualDisplayedWidth;
    const canvasHeight = actualDisplayedHeight;
    
    // Update offset to be relative to canvas (which will be positioned at offsetX, offsetY)
    // Since canvas is positioned at (offsetX, offsetY), bbox coordinates should NOT add offset again
    const canvasOffsetX = 0;  // Canvas is already positioned at offsetX
    const canvasOffsetY = 0;  // Canvas is already positioned at offsetY
    
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      // Canvas CSS size must match the actual displayed image size
      canvas.style.width = `${actualDisplayedWidth}px`;
      canvas.style.height = `${actualDisplayedHeight}px`;
      // Position canvas to match image position (centered with letterboxing)
      canvas.style.position = "absolute";
      canvas.style.top = `${offsetY}px`;
      canvas.style.left = `${offsetX}px`;
      canvas.style.zIndex = "10";
    }

    // Update last render time for FPS tracking (but don't skip frames)
    // Removed frame skipping to ensure overlays update in real-time
    lastOverlayRenderTimeRef.current = performance.now();
    
    // Clear canvas efficiently (after frame skip check)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Filter by confidence threshold first, then sort by confidence
    // Only show detections that meet the confidence threshold
    const filteredDetections = currentDetections.filter(det => det.confidence >= confidenceThreshold);
    const sortedDetections = maxDetectionsToRender && maxDetectionsToRender > 0
      ? [...filteredDetections].sort((a, b) => b.confidence - a.confidence).slice(0, maxDetectionsToRender)
      : [...filteredDetections].sort((a, b) => b.confidence - a.confidence);
    const labelPositions = calculateLabelPositions(sortedDetections, true); // Use stream image
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:830',message:'drawStreamOverlays: about to draw',data:{detectionCount:sortedDetections.length,canvasSize:`${canvas.width}x${canvas.height}`,imageSize:`${displayedWidth}x${displayedHeight}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    // Debug: Log if we're about to draw (only in dev)
    if (process.env.NODE_ENV === 'development' && sortedDetections.length > 0) {
      console.debug(`Drawing ${sortedDetections.length} detections on canvas ${canvas.width}x${canvas.height}`);
    }
    
    // Draw detections (optimized for Jetson memory)
    sortedDetections.forEach((det, index) => {
      const { bbox, className, confidence, classId } = det;
      
      // Determine if this detection is focused (for visual filtering)
      const isFocused = 
        (!vizSettings.focusClass || det.className === vizSettings.focusClass) &&
        (det.confidence >= vizSettings.focusConfidenceMin);
      
      // Calculate opacity based on focus and dimming settings
      let visualOpacity = confidence * 0.8 + 0.2; // Base opacity from confidence
      if (vizSettings.dimUnfocused && !isFocused) {
        visualOpacity *= 0.3; // Dim unfocused items to 30% opacity
      }
      
      // Get or assign detection ID
      const detKey = `${classId}-${bbox.x}-${bbox.y}-${bbox.width}-${bbox.height}`;
      let detectionId = detectionIdMapRef.current.get(detKey);
      if (!detectionId) {
        detectionId = detectionIdCounterRef.current++;
        detectionIdMapRef.current.set(detKey, detectionId);
        // Limit map size to prevent memory issues (keep last 1000)
        if (detectionIdMapRef.current.size > 1000) {
          const firstKey = detectionIdMapRef.current.keys().next().value;
          if (firstKey) detectionIdMapRef.current.delete(firstKey);
        }
      }
      
      // Scale bbox coordinates to match displayed image size
      // Canvas is now positioned at (offsetX, offsetY) and sized to actualDisplayedWidth x actualDisplayedHeight
      // So bbox coordinates should be scaled but NOT offset (canvas handles positioning)
      const scaledBbox = {
        x: bbox.x * scale + canvasOffsetX,
        y: bbox.y * scale + canvasOffsetY,
        width: bbox.width * scale,
        height: bbox.height * scale,
        centerX: bbox.centerX * scale + canvasOffsetX,
        centerY: bbox.centerY * scale + canvasOffsetY,
      };
      
      // #region agent log
      if (index < 3) {
        fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:886',message:`drawStreamOverlays: detection ${index} coordinates`,data:{index,className,original:bbox,scaled:scaledBbox,scale,offsetX,offsetY,canvasSize:`${canvas.width}x${canvas.height}`,imageSize:`${displayedWidth}x${displayedHeight}`,sourceSize:`${sourceImageWidth}x${sourceImageHeight}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      }
      // #endregion
      
      // Debug: Log first detection's coordinates
      if (index === 0) {
        console.log(`[drawStreamOverlays] First detection:`, {
          original: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
          scaled: scaledBbox,
          scale,
          offsetX,
          offsetY,
          canvasSize: `${canvas.width}x${canvas.height}`,
          imageSize: `${displayedWidth}x${displayedHeight}`,
          sourceSize: `${sourceImageWidth}x${sourceImageHeight}`
        });
      }
      
      // Ensure we have valid coordinates before drawing
      if (!Number.isFinite(scaledBbox.x) || !Number.isFinite(scaledBbox.y) || 
          !Number.isFinite(scaledBbox.width) || !Number.isFinite(scaledBbox.height) ||
          scaledBbox.width <= 0 || scaledBbox.height <= 0) {
        console.warn(`[drawStreamOverlays] Skipping invalid bbox:`, { original: bbox, scaled: scaledBbox });
        return; // Skip this detection
      }
      
      // Calculate dynamic line width based on scaled bbox size
      const bboxArea = scaledBbox.width * scaledBbox.height;
      const lineWidth = vizSettings.adaptiveSizing 
        ? Math.max(2, Math.min(bboxArea / 5000, 6))
        : 2;
      const baseColor = vizSettings.colorScheme === 'class' 
        ? getClassColor(classId, confidence)
        : `hsl(${confidence * 120}, 70%, 50%)`;
      
      const hslMatch = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (!hslMatch) {
        console.warn(`[drawStreamOverlays] Invalid color format:`, baseColor, 'for detection:', det);
        // Use fallback color instead of returning
        const fallbackH = (parseInt(classId) || 0) * 137 % 360;
        const h = fallbackH;
        const s = 70;
        const l = 50;
        const rgbaColor = `hsla(${h}, ${s}%, ${l}%, ${visualOpacity})`;
        const solidColor = `hsl(${h}, ${s}%, ${l}%)`;
        
        // Continue with fallback color
        if (vizSettings.showBoxes) {
          const cornerRadius = Math.min(8, Math.min(scaledBbox.width, scaledBbox.height) / 4);
          ctx.strokeStyle = rgbaColor;
          ctx.lineWidth = lineWidth;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(scaledBbox.x + cornerRadius, scaledBbox.y);
          ctx.lineTo(scaledBbox.x + scaledBbox.width - cornerRadius, scaledBbox.y);
          ctx.quadraticCurveTo(scaledBbox.x + scaledBbox.width, scaledBbox.y, scaledBbox.x + scaledBbox.width, scaledBbox.y + cornerRadius);
          ctx.lineTo(scaledBbox.x + scaledBbox.width, scaledBbox.y + scaledBbox.height - cornerRadius);
          ctx.quadraticCurveTo(scaledBbox.x + scaledBbox.width, scaledBbox.y + scaledBbox.height, scaledBbox.x + scaledBbox.width - cornerRadius, scaledBbox.y + scaledBbox.height);
          ctx.lineTo(scaledBbox.x + cornerRadius, scaledBbox.y + scaledBbox.height);
          ctx.quadraticCurveTo(scaledBbox.x, scaledBbox.y + scaledBbox.height, scaledBbox.x, scaledBbox.y + scaledBbox.height - cornerRadius);
          ctx.lineTo(scaledBbox.x, scaledBbox.y + cornerRadius);
          ctx.quadraticCurveTo(scaledBbox.x, scaledBbox.y, scaledBbox.x + cornerRadius, scaledBbox.y);
          ctx.closePath();
          ctx.stroke();
        }
        return; // Skip rest of drawing for this detection
      }
      
      const [, h, s, l] = hslMatch.map(Number);
      const rgbaColor = `hsla(${h}, ${s}%, ${l}%, ${visualOpacity})`;
      const solidColor = `hsl(${h}, ${s}%, ${l}%)`;
      
      // Draw rounded rectangle (if enabled) - ALWAYS draw if showBoxes is true
      if (vizSettings.showBoxes) {
        // Ensure coordinates are within canvas bounds
        const clampedX = Math.max(0, Math.min(scaledBbox.x, canvas.width));
        const clampedY = Math.max(0, Math.min(scaledBbox.y, canvas.height));
        const clampedWidth = Math.min(scaledBbox.width, canvas.width - clampedX);
        const clampedHeight = Math.min(scaledBbox.height, canvas.height - clampedY);
        
        if (clampedWidth <= 0 || clampedHeight <= 0) {
          console.warn(`[drawStreamOverlays] Box outside canvas bounds:`, { scaled: scaledBbox, clamped: { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight } });
          return;
        }
        
        const cornerRadius = Math.min(8, Math.min(clampedWidth, clampedHeight) / 4);
        
        ctx.strokeStyle = rgbaColor;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        
        ctx.beginPath();
        ctx.moveTo(clampedX + cornerRadius, clampedY);
        ctx.lineTo(clampedX + clampedWidth - cornerRadius, clampedY);
        ctx.quadraticCurveTo(clampedX + clampedWidth, clampedY, clampedX + clampedWidth, clampedY + cornerRadius);
        ctx.lineTo(clampedX + clampedWidth, clampedY + clampedHeight - cornerRadius);
        ctx.quadraticCurveTo(clampedX + clampedWidth, clampedY + clampedHeight, clampedX + clampedWidth - cornerRadius, clampedY + clampedHeight);
        ctx.lineTo(clampedX + cornerRadius, clampedY + clampedHeight);
        ctx.quadraticCurveTo(clampedX, clampedY + clampedHeight, clampedX, clampedY + clampedHeight - cornerRadius);
        ctx.lineTo(clampedX, clampedY + cornerRadius);
        ctx.quadraticCurveTo(clampedX, clampedY, clampedX + cornerRadius, clampedY);
        ctx.closePath();
        ctx.stroke();
      }
      
      // Draw corner markers (if enabled)
      if (vizSettings.cornerMarkers && vizSettings.showBoxes) {
        const markerSize = Math.max(8, Math.min(scaledBbox.width, scaledBbox.height) / 8);
        ctx.strokeStyle = solidColor;
        ctx.lineWidth = 2;
        
        // Top-left
        ctx.beginPath();
        ctx.moveTo(scaledBbox.x, scaledBbox.y);
        ctx.lineTo(scaledBbox.x + markerSize, scaledBbox.y);
        ctx.moveTo(scaledBbox.x, scaledBbox.y);
        ctx.lineTo(scaledBbox.x, scaledBbox.y + markerSize);
        ctx.stroke();
        
        // Top-right
        ctx.beginPath();
        ctx.moveTo(scaledBbox.x + scaledBbox.width, scaledBbox.y);
        ctx.lineTo(scaledBbox.x + scaledBbox.width - markerSize, scaledBbox.y);
        ctx.moveTo(scaledBbox.x + scaledBbox.width, scaledBbox.y);
        ctx.lineTo(scaledBbox.x + scaledBbox.width, scaledBbox.y + markerSize);
        ctx.stroke();
        
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(scaledBbox.x + scaledBbox.width, scaledBbox.y + scaledBbox.height);
        ctx.lineTo(scaledBbox.x + scaledBbox.width - markerSize, scaledBbox.y + scaledBbox.height);
        ctx.moveTo(scaledBbox.x + scaledBbox.width, scaledBbox.y + scaledBbox.height);
        ctx.lineTo(scaledBbox.x + scaledBbox.width, scaledBbox.y + scaledBbox.height - markerSize);
        ctx.stroke();
        
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(scaledBbox.x, scaledBbox.y + scaledBbox.height);
        ctx.lineTo(scaledBbox.x + markerSize, scaledBbox.y + scaledBbox.height);
        ctx.moveTo(scaledBbox.x, scaledBbox.y + scaledBbox.height);
        ctx.lineTo(scaledBbox.x, scaledBbox.y + scaledBbox.height - markerSize);
        ctx.stroke();
      }
      
      // Draw label with background (if enabled)
      if (vizSettings.showLabels) {
        // Scale label position to match displayed coordinates
        const baseLabelPos = labelPositions[index] || { x: bbox.x, y: bbox.y - 25 };
        const labelPos = {
          x: baseLabelPos.x * scale + offsetX,
          y: baseLabelPos.y * scale + offsetY,
        };
        const fontSize = vizSettings.fontSize;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        
        // Format label: combine className and confidence on one line for better readability
        // Use format: "className confidence%" instead of separate lines
        let labelText = className;
        if (vizSettings.showConfidence) {
          labelText = `${className} ${(confidence * 100).toFixed(1)}%`;
        }
        
        // Optional: Add ID or area on second line if enabled (but keep it minimal)
        const lines: string[] = [labelText];
        if (vizSettings.showDetectionIds && vizSettings.showBboxArea) {
          const area = Math.round(scaledBbox.width * scaledBbox.height);
          lines.push(`ID:${detectionId} ${area}px²`);
        } else if (vizSettings.showDetectionIds) {
          lines.push(`ID: ${detectionId}`);
        } else if (vizSettings.showBboxArea) {
          const area = Math.round(scaledBbox.width * scaledBbox.height);
          lines.push(`${area} px²`);
        }
        
        if (lines.length === 0) return; // Skip if no label content
      
        // Calculate label dimensions with proper spacing
        const lineHeight = fontSize + 6; // Increased spacing between lines
        const labelWidth = Math.max(
          ...lines.map(line => ctx.measureText(line).width)
        ) + 16; // Increased padding
        const labelHeight = lines.length * lineHeight + 10; // Increased padding
        
        // Draw label background with rounded corners
        const labelX = labelPos.x;
        const labelY = labelPos.y;
        const bgRadius = 4;
        
        ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * visualOpacity})`;
        ctx.beginPath();
        ctx.moveTo(labelX + bgRadius, labelY);
        ctx.lineTo(labelX + labelWidth - bgRadius, labelY);
        ctx.quadraticCurveTo(labelX + labelWidth, labelY, labelX + labelWidth, labelY + bgRadius);
        ctx.lineTo(labelX + labelWidth, labelY + labelHeight - bgRadius);
        ctx.quadraticCurveTo(labelX + labelWidth, labelY + labelHeight, labelX + labelWidth - bgRadius, labelY + labelHeight);
        ctx.lineTo(labelX + bgRadius, labelY + labelHeight);
        ctx.quadraticCurveTo(labelX, labelY + labelHeight, labelX, labelY + labelHeight - bgRadius);
        ctx.lineTo(labelX, labelY + bgRadius);
        ctx.quadraticCurveTo(labelX, labelY, labelX + bgRadius, labelY);
        ctx.closePath();
        ctx.fill();
        
        // Draw label text with better spacing
        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
          // Add proper vertical spacing between lines
          const textY = labelY + 6 + i * lineHeight;
          ctx.fillText(line, labelX + 8, textY);
        });
      }
      
      // Draw center point (use clamped coordinates)
      const clampedCenterX = Math.max(0, Math.min(scaledBbox.centerX, canvas.width));
      const clampedCenterY = Math.max(0, Math.min(scaledBbox.centerY, canvas.height));
      ctx.fillStyle = solidColor;
      ctx.beginPath();
      ctx.arc(clampedCenterX, clampedCenterY, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw center lines (if enabled)
      if (vizSettings.showCenterLines) {
        ctx.strokeStyle = `hsla(${h}, ${s}%, ${l}%, ${visualOpacity * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(scaledBbox.centerX, scaledBbox.y);
        ctx.lineTo(scaledBbox.centerX, scaledBbox.y + scaledBbox.height);
        ctx.moveTo(scaledBbox.x, scaledBbox.centerY);
        ctx.lineTo(scaledBbox.x + scaledBbox.width, scaledBbox.centerY);
        ctx.stroke();
      }
      
      // Draw class count badge (if enabled and multiple of same class)
      if (vizSettings.showClassCounts && classDistribution.get(className) && classDistribution.get(className)! > 1) {
        const count = classDistribution.get(className)!;
        ctx.fillStyle = `rgba(255, 255, 255, ${visualOpacity})`;
        ctx.font = `${Math.max(10, vizSettings.fontSize - 2)}px Inter, sans-serif`;
        const countText = count.toString();
        const countWidth = ctx.measureText(countText).width + 8;
        const countHeight = vizSettings.fontSize;
        const countX = scaledBbox.x + scaledBbox.width - countWidth;
        const countY = scaledBbox.y;
        
        // Draw badge background
        ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * visualOpacity})`;
        ctx.fillRect(countX, countY, countWidth, countHeight);
        
        // Draw count text
        ctx.fillStyle = `rgba(255, 255, 255, ${visualOpacity})`;
        ctx.fillText(countText, countX + 4, countY + countHeight - 4);
      }
    });
    
    // Performance monitoring (Jetson optimization tracking) - REAL metrics, not placeholders
    const renderEndTime = performance.now();
    const renderTime = renderEndTime - renderStartTime;
    
    // Track overlay FPS (real measurement from actual render times)
    const overlayNow = performance.now();
    if (lastOverlayFpsTimeRef.current > 0) {
      const overlayDelta = overlayNow - lastOverlayFpsTimeRef.current;
      if (overlayDelta > 0 && overlayDelta < 1000) { // Only track if reasonable (not paused)
        const currentFps = 1000 / overlayDelta;
        overlayFpsRef.current.push(currentFps);
        // Keep last 30 FPS measurements
        if (overlayFpsRef.current.length > 30) {
          overlayFpsRef.current.shift();
        }
        // Update average FPS (real calculation from actual measurements)
        if (overlayFpsRef.current.length > 0) {
          const avgFps = overlayFpsRef.current.reduce((a, b) => a + b, 0) / overlayFpsRef.current.length;
          setOverlayFps(avgFps);
        }
      }
    }
    lastOverlayFpsTimeRef.current = overlayNow;
    
    if (renderTime > 33) { // Log if rendering takes longer than one frame (33ms for 30fps)
      console.debug(`Overlay render time: ${renderTime.toFixed(2)}ms (${sortedDetections.length} detections)`);
    }
  }, [getClassColor, calculateLabelPositions, vizSettings, maxDetectionsToRender, classDistribution]);

  // Handle window resize for canvas overlay (Jetson-optimized)
  // Placed after drawStreamOverlays definition to avoid dependency issues
  // NOTE: Completely skip when using visualization stream (no canvas overlay needed)
  useEffect(() => {
    if (!isStreaming || USE_VISUALIZATION_STREAM) return; // Skip if using visualization stream (overlays in MJPEG)
    
    let resizeTimeout: NodeJS.Timeout | null = null;
    const handleResize = () => {
      // Debounce resize events for performance
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        if (!USE_VISUALIZATION_STREAM && streamDetectionsRef.current.length > 0 && streamImageRef.current?.complete) {
          requestAnimationFrame(() => drawStreamOverlays());
        }
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [isStreaming, streamDetections.length, drawStreamOverlays]);

  // Update canvas when detections change (with requestAnimationFrame for smooth rendering)
  useEffect(() => {
    if (!isStreaming && detections.length > 0 && imageRef.current) {
      let animationFrameId: number;
      const render = () => {
        drawDetections();
        animationFrameId = requestAnimationFrame(render);
      };
      animationFrameId = requestAnimationFrame(render);
      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    } else if (!isStreaming && detections.length === 0) {
      // Clear canvas when no detections
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [detections, isStreaming, drawDetections]);

  // Update stream canvas overlays when detections change during streaming
  // This triggers a redraw when detections update
  // NOTE: When USE_VISUALIZATION_STREAM is true, overlays are baked into the MJPEG stream from C++,
  // so we skip canvas drawing entirely to avoid double overlays or stale overlays
  useEffect(() => {
    // Skip all canvas operations when using visualization stream (overlays are in the MJPEG frames)
    if (USE_VISUALIZATION_STREAM) {
      return;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:1231',message:'useEffect: streamDetections changed',data:{isStreaming,detectionCount:streamDetections.length,imageComplete:streamImageRef.current?.complete,firstBbox:streamDetections[0]?.bbox||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    if (isStreaming && streamImageRef.current?.complete) {
      requestAnimationFrame(() => drawStreamOverlays());
    } else if (!isStreaming) {
      // Clear canvas when not streaming
      const canvas = streamCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [streamDetections, isStreaming, drawStreamOverlays]);

  /**
   * Handle image file upload
   */
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setSelectedImage(result);
      setDetections([]); // Clear previous detections
    };
    reader.readAsDataURL(file);
  }, []);

  /**
   * Capture frame from camera and run inference
   */
  const captureFrame = useCallback(async () => {
    // When streaming, just refresh detections (they're already being processed)
    if (isStreaming) {
      await loadDetections();
      return;
    }
    
    // For uploaded images, run inference
    if (selectedImage) {
      await runInference(selectedImage);
    } else {
      setError("Please upload an image first or start streaming");
    }
  }, [isStreaming, selectedImage, loadDetections, runInference]);


  /**
   * Toggle streaming mode
   */
  const toggleStreaming = useCallback(() => {
    if (isStreaming) {
      // Stop streaming - gracefully disconnect
      isStreamingActiveRef.current = false;
      isStreamingRef.current = false;
      
      // Stop polling detections
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      if (streamAnimationFrameRef.current) {
        cancelAnimationFrame(streamAnimationFrameRef.current);
        streamAnimationFrameRef.current = null;
      }
      
      // Clear canvas when stopping stream
      const canvas = streamCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      
      // Gracefully stop the image stream
      // For MJPEG streams, setting src to empty will cause the browser to close the connection
      // The server will handle the disconnection gracefully
      const img = streamImageRef.current;
      if (img && img.src && img.src.startsWith('http')) {
        // Only if it's an actual HTTP stream (not already placeholder)
        try {
          // Set src to empty to stop the stream
          // This will trigger the browser to close the HTTP connection
          // The server's AbortController will handle this gracefully
          img.src = '';
        } catch (e) {
          // Ignore errors when stopping stream - browser may have already closed
          console.debug('Error stopping stream (expected):', e);
        }
      }
      
      // Set placeholder immediately - browser will handle connection close
      setStreamImageSrc("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
      
      setIsStreaming(false);
      // Don't set bridgeConnected to false here - let status polling handle it
      // But also don't let status polling immediately disconnect when stopping
      // The bridge might still be connected, just the stream is stopped
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:1347',message:'toggleStreaming: stopping stream',data:{bridgeConnected,imageSrc:streamImageRef.current?.src?.substring(0,50)||'none'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
      // #endregion
      setError(null); // Clear any stream errors
    } else {
      // Start streaming from live camera
      isStreamingActiveRef.current = true;
      isStreamingRef.current = true;
      setIsStreaming(true);
      lastFrameTimeRef.current = performance.now(); // Initialize for FPS tracking
      streamStartTimeRef.current = performance.now();
      lastDetectionUpdateTimeRef.current = 0;
      detectionUpdateTimesRef.current = [];
      reconnectionAttemptsRef.current = 0;
      
      // Reset streaming metrics
      setStreamFps(null);
      setDetectionUpdateRate(null);
      setStreamLatency(null);
      setStreamHealth(null);
      
      // Load detections immediately
      loadStreamDetections();
      
      // Use visualization stream (YOLO overlays from C++ node) or raw camera + canvas
      // MJPEG stream headers already prevent caching (Cache-Control: no-cache, no-store)
      setStreamImageSrc(USE_VISUALIZATION_STREAM 
        ? '/api/vision/visualization/stream' 
        : '/api/vision/camera/stream');
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:1353',message:'toggleStreaming: starting stream',data:{bridgeConnected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      
      // Check bridge connection immediately when starting stream
      // Don't wait for response - let onLoad handler also check status
      loadStatus();
      
      // Set up periodic detection updates (optimized for Jetson Orin Nano)
      // Reduced frequency to prevent lag: 100ms = 10 Hz (still smooth but less CPU intensive)
      // Use a ref-based check to avoid dependency on loadStreamDetections
      const loadDetections = () => {
        if (isStreamingActiveRef.current) {
          loadStreamDetections();
        }
      };
      streamIntervalRef.current = setInterval(loadDetections, 100); // Update detections every 100ms (10 Hz) to reduce lag
      
      // Canvas overlay RAF only when using raw camera stream; C++ visualization stream has overlays baked in
      if (!USE_VISUALIZATION_STREAM) {
        const renderOverlays = () => {
          if (isStreamingActiveRef.current && streamImageRef.current?.complete) {
            requestAnimationFrame(() => {
              drawStreamOverlays();
              if (isStreamingActiveRef.current) {
                streamAnimationFrameRef.current = requestAnimationFrame(renderOverlays);
              }
            });
          }
        };
        streamAnimationFrameRef.current = requestAnimationFrame(renderOverlays);
      }
      
      // Cleanup function - runs when isStreaming changes or component unmounts
      return () => {
        if (streamIntervalRef.current) {
          clearInterval(streamIntervalRef.current);
          streamIntervalRef.current = null;
        }
        if (streamAnimationFrameRef.current) {
          cancelAnimationFrame(streamAnimationFrameRef.current);
          streamAnimationFrameRef.current = null;
        }
      };
    }
  }, [isStreaming]); // Removed loadStreamDetections from dependencies to prevent infinite loop

  /**
   * Update configuration
   */
  const updateConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/vision/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          config: {
            confidenceThreshold,
            nmsThreshold,
            maxDetections,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Reload config to get updated values
        await loadConfig();
      }
    } catch (err) {
      console.error("Failed to update config:", err);
      setError("Failed to update configuration");
    }
  }, [confidenceThreshold, nmsThreshold, maxDetections, loadConfig]);

  /**
   * Calculate average inference time
   */
  const averageInferenceTime = inferenceTimes.length > 0
    ? inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length
    : 0;

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Header */}
      <header className="bg-panel-surface border-b border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-text-muted hover:text-accent-cyan transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to HUD</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-semibold tracking-wide">
              <span className="text-accent-cyan">YOLOE</span> Diagnostics
            </h1>
            {config?.initialized && (
              <span className="text-xs text-online-green bg-panel-surface-2 px-2 py-1 rounded">
                Model Loaded
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleStreaming}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isStreaming
                  ? "bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500/30"
                  : "bg-accent-cyan/20 border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/30"
              }`}
            >
              {isStreaming ? "Stop Streaming" : "Start Streaming"}
            </button>
            <button
              onClick={captureFrame}
              disabled={loading}
              className="px-4 py-2 bg-panel-surface border border-border rounded-lg text-text-muted hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Run Inference"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Image Display */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Display with Detections */}
            <div className="bg-panel-surface border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                  {isStreaming ? 'Live Camera Stream' : 'Detection Visualization'}
                </h3>
                {isStreaming && (
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${bridgeConnected ? 'bg-online-green animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-xs text-text-muted">
                      {bridgeConnected ? 'Bridge Connected' : 'Bridge Disconnected'}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="relative bg-black aspect-video flex items-center justify-center">
                {isStreaming ? (
                  <>
                    <img
                      ref={streamImageRef}
                      src={isStreaming ? streamImageSrc : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"}
                      alt="Live Camera Stream"
                      className="w-full h-full min-w-0 min-h-0 object-contain object-center"
                      style={{ display: "block" }}
                      crossOrigin="anonymous"
                      loading="eager"
                      decoding="async"
                      onLoad={() => {
                        // MJPEG stream connected - update connection status
                        if (isStreamingRef.current && isStreamingActiveRef.current) {
                          // #region agent log
                          fetch('http://127.0.0.1:7242/ingest/24c95070-093b-462b-aff8-5147492483af',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:1474',message:'streamImage onLoad: stream loaded successfully',data:{isStreaming:isStreamingRef.current,isActive:isStreamingActiveRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
                          // #endregion
                          // Stream loaded successfully - mark as connected
                          setBridgeConnected(true);
                          
                          // Reset reconnection attempts on successful connection
                          reconnectionAttemptsRef.current = 0;
                          setError(null); // Clear any previous errors
                          
                          // Also verify with status endpoint (async, don't block)
                          loadStatus();
                        }
                      }}
                      onError={() => {
                        // Stream error - handle reconnection with exponential backoff
                        console.debug("MJPEG stream error, attempting reconnection");
                        setBridgeConnected(false);
                        setStreamHealth('poor');
                        reconnectionAttemptsRef.current += 1;
                        
                        if (isStreamingActiveRef.current && isStreamingRef.current) {
                          // Use a ref to track retry attempts for exponential backoff
                          const retryCountRef = { current: 0 };
                          const maxRetries = 5;
                          
                          const attemptReconnect = () => {
                            if (!isStreamingActiveRef.current || !isStreamingRef.current) {
                              return; // Streaming stopped, don't retry
                            }
                            
                            if (retryCountRef.current >= maxRetries) {
                              console.error("Max reconnection attempts reached");
                              setError("Failed to connect to camera stream after multiple attempts");
                              setStreamHealth('poor');
                              return;
                            }
                            
                            // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 5s)
                            const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 5000);
                            retryCountRef.current += 1;
                            
                            setTimeout(() => {
                              if (isStreamingActiveRef.current && isStreamingRef.current) {
                                // Force reload by updating src (MJPEG stream headers prevent caching)
                                setStreamImageSrc(USE_VISUALIZATION_STREAM 
                                  ? '/api/vision/visualization/stream' 
                                  : '/api/vision/camera/stream');
                                
                                // If this retry also fails, onError will be called again
                                // and attemptReconnect will be called with incremented retry count
                              }
                            }, retryDelay);
                          };
                          
                          attemptReconnect();
                        }
                      }}
                      key={isStreaming ? 'streaming' : 'static'}
                    />
                    {/* Canvas overlay only when using raw camera stream; C++ visualization stream has overlays baked in */}
                    {!USE_VISUALIZATION_STREAM && (
                      <canvas
                        ref={streamCanvasRef}
                        className="absolute inset-0 pointer-events-none"
                        style={{ 
                          maxWidth: "100%", 
                          maxHeight: "100%",
                          objectFit: "contain"
                        }}
                      />
                    )}
                    {!bridgeConnected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <div className="text-center text-text-muted">
                          <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83M4.929 4.929a9 9 0 000 12.728m0 0l2.829-2.829m-2.829 2.829L3 21" />
                          </svg>
                          <p className="text-sm">Bridge server not connected</p>
                          <p className="text-xs mt-1 opacity-75">Start vision_pipeline.launch.py with diagnostics bridge</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : selectedImage ? (
                  <>
                    <img
                      ref={imageRef}
                      src={selectedImage}
                      alt="Input"
                      className="max-w-full max-h-full object-contain"
                      style={{ display: "block" }}
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 pointer-events-none"
                      style={{ maxWidth: "100%", maxHeight: "100%" }}
                    />
                  </>
                ) : (
                  <div className="text-center text-text-muted">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm">Start streaming or upload an image to test YOLO detection</p>
                  </div>
                )}
              </div>

              {/* Image Upload */}
              <div className="px-4 py-3 border-t border-border/50">
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <span className="inline-block px-4 py-2 bg-panel-surface-2 border border-border rounded-lg text-text-muted hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors cursor-pointer text-sm">
                    Upload Image
                  </span>
                </label>
              </div>
            </div>

            {/* Detection List */}
            {detections.length > 0 && (
              <div className="bg-panel-surface border border-border rounded-lg">
                <div className="px-4 py-3 border-b border-border/50">
                  <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                    Detections ({detections.length})
                  </h3>
                </div>
                <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                  {detections.map((det, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-panel-surface-2 rounded border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded"
                          style={{
                            backgroundColor: `hsl(${det.confidence * 120}, 70%, 50%)`,
                          }}
                        />
                        <div>
                          <div className="text-sm font-medium text-text-primary">
                            {det.className}
                          </div>
                          <div className="text-xs text-text-muted">
                            Class ID: {det.classId} | BBox: ({det.bbox.x}, {det.bbox.y}, {det.bbox.width}×{det.bbox.height})
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-mono text-accent-cyan">
                        {(det.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right Column - Controls & Stats */}
          <div className="space-y-6">
            {/* Model Configuration */}
            {config && (
              <div className="bg-panel-surface border border-border rounded-lg p-4">
                <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-4">
                  Model Configuration
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Model Path:</span>
                    <span className="text-text-primary font-mono text-xs truncate max-w-[200px]" title={config.modelPath}>
                      {config.modelPath.split("/").pop()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Input Size:</span>
                    <span className="text-text-primary font-mono">
                      {config.inputWidth}×{config.inputHeight}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Device:</span>
                    <span className="text-text-primary">{config.device}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Precision:</span>
                    <span className="text-text-primary">
                      {config.useInt8 ? "INT8" : config.useFp16 ? "FP16" : "FP32"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Classes:</span>
                    <span className="text-text-primary">{config.numClasses}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Visualization Controls */}
            <div className="bg-panel-surface border border-border rounded-lg p-4 mb-4">
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-4">
                Visualization
              </h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Show Labels</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.showLabels}
                    onChange={(e) => setVizSettings({...vizSettings, showLabels: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Show Confidence</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.showConfidence}
                    onChange={(e) => setVizSettings({...vizSettings, showConfidence: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Show Boxes</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.showBoxes}
                    onChange={(e) => setVizSettings({...vizSettings, showBoxes: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Corner Markers</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.cornerMarkers}
                    onChange={(e) => setVizSettings({...vizSettings, cornerMarkers: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Adaptive Sizing</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.adaptiveSizing}
                    onChange={(e) => setVizSettings({...vizSettings, adaptiveSizing: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-text-muted text-sm">Font Size</span>
                    <span className="text-text-primary font-mono text-sm">{vizSettings.fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="20"
                    step="1"
                    value={vizSettings.fontSize}
                    onChange={(e) => setVizSettings({...vizSettings, fontSize: parseInt(e.target.value)})}
                    className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                  />
                </div>
                <div>
                  <label className="block text-text-muted text-sm mb-2">Color Scheme</label>
                  <select
                    value={vizSettings.colorScheme}
                    onChange={(e) => setVizSettings({...vizSettings, colorScheme: e.target.value as 'class' | 'confidence'})}
                    className="w-full bg-panel-surface-2 border border-border rounded px-3 py-2 text-text-primary text-sm"
                  >
                    <option value="class">Class-based</option>
                    <option value="confidence">Confidence-based</option>
                  </select>
                </div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Show Detection IDs</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.showDetectionIds}
                    onChange={(e) => setVizSettings({...vizSettings, showDetectionIds: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Show BBox Area</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.showBboxArea}
                    onChange={(e) => setVizSettings({...vizSettings, showBboxArea: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Show Center Lines</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.showCenterLines}
                    onChange={(e) => setVizSettings({...vizSettings, showCenterLines: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Show Class Counts</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.showClassCounts}
                    onChange={(e) => setVizSettings({...vizSettings, showClassCounts: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
              </div>
            </div>

            {/* Threshold Controls */}
            <div className="bg-panel-surface border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                Detection Parameters
              </h3>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-muted">Confidence Threshold</span>
                  <span className="text-text-primary font-mono">{confidenceThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-muted">NMS Threshold</span>
                  <span className="text-text-primary font-mono">{nmsThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={nmsThreshold}
                  onChange={(e) => setNmsThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-muted">Max Detections</span>
                  <span className="text-text-primary font-mono">{maxDetections}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="500"
                  step="1"
                  value={maxDetections}
                  onChange={(e) => setMaxDetections(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                />
              </div>

              <button
                onClick={updateConfig}
                className="w-full py-2 bg-accent-cyan/20 border border-accent-cyan text-accent-cyan rounded-lg hover:bg-accent-cyan/30 transition-colors text-sm font-medium"
              >
                Update Configuration
              </button>
            </div>

            {/* Performance Stats */}
            <div className="bg-panel-surface border border-border rounded-lg p-4">
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-4">
                Performance Metrics
              </h3>
              <div className="space-y-3 text-sm">
                {isStreaming ? (
                  <>
                    {/* Streaming Metrics */}
                    <div className="flex justify-between">
                      <span className="text-text-muted">Detection FPS:</span>
                      <span className="text-text-primary font-mono">
                        {fps !== null ? fps.toFixed(1) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Stream FPS:</span>
                      <span className="text-text-primary font-mono">
                        {streamFps !== null ? streamFps.toFixed(1) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Overlay Render FPS:</span>
                      <span className="text-text-primary font-mono">
                        {overlayFps !== null ? overlayFps.toFixed(1) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Detection Update Rate:</span>
                      <span className="text-text-primary font-mono">
                        {detectionUpdateRate !== null ? detectionUpdateRate.toFixed(1) : "—"} Hz
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Stream Latency:</span>
                      <span className="text-text-primary font-mono">
                        {streamLatency !== null ? `${streamLatency.toFixed(1)}ms` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-text-muted">Stream Health:</span>
                      <span className={`font-mono text-xs px-2 py-1 rounded ${
                        streamHealth === 'excellent' ? 'bg-green-500/20 text-green-400' :
                        streamHealth === 'good' ? 'bg-blue-500/20 text-blue-400' :
                        streamHealth === 'fair' ? 'bg-yellow-500/20 text-yellow-400' :
                        streamHealth === 'poor' ? 'bg-red-500/20 text-red-400' :
                        'text-text-muted'
                      }`}>
                        {streamHealth ? streamHealth.toUpperCase() : "—"}
                      </span>
                    </div>
                    {reconnectionAttemptsRef.current > 0 && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Reconnections:</span>
                        <span className="text-text-primary font-mono text-yellow-400">
                          {reconnectionAttemptsRef.current}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Static Image Metrics */}
                    <div className="flex justify-between">
                      <span className="text-text-muted">FPS:</span>
                      <span className="text-text-primary font-mono">
                        {fps !== null ? fps.toFixed(1) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Avg Inference:</span>
                      <span className="text-text-primary font-mono">
                        {averageInferenceTime > 0 ? `${averageInferenceTime.toFixed(1)}ms` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Total Inferences:</span>
                      <span className="text-text-primary font-mono">{totalInferences}</span>
                    </div>
                    {stats && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Last Inference:</span>
                          <span className="text-text-primary font-mono">
                            {stats.inferenceTimeMs.toFixed(1)}ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Detections:</span>
                          <span className="text-text-primary font-mono">{stats.numDetections}</span>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Detection Analytics */}
            <div className="bg-panel-surface border border-border rounded-lg p-4">
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-4">
                Detection Analytics
              </h3>
              
              {/* Class Distribution */}
              {classDistribution.size > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs text-text-muted mb-2">Class Distribution</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {Array.from(classDistribution.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([className, count]) => {
                        const maxCount = Math.max(...Array.from(classDistribution.values()));
                        return (
                          <div key={className} className="flex items-center justify-between text-xs">
                            <span className="text-text-primary truncate flex-1">{className}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="w-20 h-2 bg-panel-surface-2 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-accent-cyan transition-all"
                                  style={{ width: `${(count / maxCount) * 100}%` }}
                                />
                              </div>
                              <span className="text-text-muted font-mono w-8 text-right">{count}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              
              {/* Confidence Statistics */}
              {confidenceDistribution.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs text-text-muted mb-2">Confidence Statistics</h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-text-muted">Min</div>
                      <div className="text-text-primary font-mono">
                        {Math.min(...confidenceDistribution).toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-muted">Avg</div>
                      <div className="text-text-primary font-mono">
                        {(confidenceDistribution.reduce((a, b) => a + b, 0) / confidenceDistribution.length).toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-muted">Max</div>
                      <div className="text-text-primary font-mono">
                        {Math.max(...confidenceDistribution).toFixed(3)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Detection Count Trend */}
              {detectionCountHistory.length > 0 && (
                <div>
                  <h4 className="text-xs text-text-muted mb-2">Detection Count Trend</h4>
                  <div className="h-16 bg-panel-surface-2 rounded flex items-end gap-1 p-1">
                    {detectionCountHistory.slice(-30).map((count, idx) => {
                      const maxCount = Math.max(...detectionCountHistory, 1);
                      return (
                        <div
                          key={idx}
                          className="flex-1 bg-accent-cyan rounded-t transition-all"
                          style={{ height: `${(count / maxCount) * 100}%` }}
                          title={`Frame ${idx}: ${count} detections`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Detection Filters */}
            <div className="bg-panel-surface border border-border rounded-lg p-4">
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-4">
                Detection Filters
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Min Confidence (Visual)</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={vizSettings.focusConfidenceMin}
                    onChange={(e) => setVizSettings({...vizSettings, focusConfidenceMin: parseFloat(e.target.value)})}
                    className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                  />
                  <div className="text-xs text-text-muted text-right mt-1">
                    {vizSettings.focusConfidenceMin.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Filter by Class</label>
                  <select
                    value={vizSettings.focusClass || ''}
                    onChange={(e) => setVizSettings({...vizSettings, focusClass: e.target.value || null})}
                    className="w-full bg-panel-surface-2 border border-border rounded px-3 py-2 text-text-primary text-sm"
                  >
                    <option value="">All Classes</option>
                    {Array.from(classDistribution.keys()).sort().map(className => (
                      <option key={className} value={className}>{className}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-text-muted text-sm">Dim Unfocused</span>
                  <input
                    type="checkbox"
                    checked={vizSettings.dimUnfocused}
                    onChange={(e) => setVizSettings({...vizSettings, dimUnfocused: e.target.checked})}
                    className="w-4 h-4 rounded border-border bg-panel-surface-2 text-accent-cyan focus:ring-accent-cyan"
                  />
                </label>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Max Detections to Render</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={maxDetectionsToRender || ''}
                    onChange={(e) => setMaxDetectionsToRender(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Unlimited"
                    className="w-full bg-panel-surface-2 border border-border rounded px-3 py-2 text-text-primary text-sm"
                  />
                  <div className="text-xs text-text-muted mt-1">
                    {maxDetectionsToRender ? `Showing max ${maxDetectionsToRender}` : 'Showing all detections'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setVizSettings({
                      ...vizSettings,
                      focusClass: null,
                      focusConfidenceMin: 0.0,
                      dimUnfocused: false,
                    });
                    setMaxDetectionsToRender(null);
                  }}
                  className="w-full py-2 bg-panel-surface-2 border border-border text-text-muted rounded-lg hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors text-sm font-medium"
                >
                  Show All
                </button>
              </div>
            </div>

            {/* Topic Status */}
            {topicStatus && (
              <div className="bg-panel-surface border border-border rounded-lg p-4">
                <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-4">
                  Topic Status
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-text-muted">Camera:</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${topicStatus.camera?.active ? 'bg-online-green' : 'bg-red-500'}`} />
                        <span className="text-text-primary font-mono text-xs">
                          {topicStatus.camera?.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    {topicStatus.camera?.active && (
                      <div className="text-xs text-text-muted pl-4">
                        {topicStatus.camera.width}×{topicStatus.camera.height} | 
                        {topicStatus.camera.last_update_seconds_ago !== null 
                          ? ` ${topicStatus.camera.last_update_seconds_ago.toFixed(1)}s ago`
                          : ' —'}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-text-muted">Detections:</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${topicStatus.detections?.active ? 'bg-online-green' : 'bg-red-500'}`} />
                        <span className="text-text-primary font-mono text-xs">
                          {topicStatus.detections?.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    {topicStatus.detections?.active && (
                      <div className="text-xs text-text-muted pl-4">
                        {topicStatus.detections.current_count} detected | 
                        {topicStatus.detections.average_count !== null 
                          ? ` Avg: ${topicStatus.detections.average_count.toFixed(1)}`
                          : ''} |
                        {topicStatus.detections.last_update_seconds_ago !== null 
                          ? ` ${topicStatus.detections.last_update_seconds_ago.toFixed(1)}s ago`
                          : ' —'}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-text-muted">Visualization:</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${topicStatus.visualization?.active ? 'bg-online-green' : 'bg-red-500'}`} />
                        <span className="text-text-primary font-mono text-xs">
                          {topicStatus.visualization?.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    {topicStatus.visualization?.active && topicStatus.visualization.last_update_seconds_ago !== null && (
                      <div className="text-xs text-text-muted pl-4">
                        {topicStatus.visualization.last_update_seconds_ago.toFixed(1)}s ago
                      </div>
                    )}
                  </div>
                  
                  {topicStatus.scene_description?.active && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-text-muted">Scene Description:</span>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-online-green" />
                          <span className="text-text-primary font-mono text-xs">Active</span>
                        </div>
                      </div>
                      {topicStatus.scene_description.text && (
                        <div className="text-xs text-text-muted pl-4 mt-1 line-clamp-2">
                          {topicStatus.scene_description.text}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
