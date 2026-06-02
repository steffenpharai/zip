#include "zip_vision/yoloe_engine.hpp"
#include <fstream>
#include <sstream>
#include <algorithm>
#include <numeric>
#include <cmath>
#include <cstring>
#include <set>
#include <chrono>
#include <iomanip>

namespace zip_vision
{

// Logger for TensorRT with configurable verbosity
class Logger : public nvinfer1::ILogger
{
public:
    void setSeverity(Severity severity) { severity_ = severity; }
    Severity getSeverity() const { return severity_; }
    
    void log(Severity severity, const char* msg) noexcept override
    {
        // Only log messages at or above the set severity level
        if (severity <= severity_) {
            const char* level = "UNKNOWN";
            switch (severity) {
                case Severity::kINTERNAL_ERROR: level = "INTERNAL_ERROR"; break;
                case Severity::kERROR: level = "ERROR"; break;
                case Severity::kWARNING: level = "WARNING"; break;
                case Severity::kINFO: level = "INFO"; break;
                case Severity::kVERBOSE: level = "VERBOSE"; break;
            }
            fprintf(stderr, "[TensorRT %s] %s\n", level, msg);
        }
    }
    
private:
    Severity severity_ = Severity::kWARNING;  // Default to warnings and above
} gLogger;

YOLOEEngine::YOLOEEngine()
    : initialized_(false)
    , input_width_(640)
    , input_height_(640)
    , num_classes_(80)  // Will be adjusted dynamically based on model (32 for v8L, 80 for 11s)
    , runtime_(nullptr)
    , engine_(nullptr)
    , context_(nullptr)
    , input_buffer_(nullptr)
    , output_buffer_(nullptr)
    , input_size_(0)
    , output_size_(0)
    , input_binding_index_(0)
    , output_binding_index_(0)
    , input_tensor_name_("")
    , output_tensor_name_("")
    , stream_(nullptr)
    , streams_()
    , input_buffers_()
    , output_buffers_()
    , contexts_()
    , available_streams_()
    , current_stream_index_(0)
    , preprocess_buffer_()
    , scale_x_(1.0f)
    , scale_y_(1.0f)
    , pad_x_(0)
    , pad_y_(0)
    , output_dims_cached_(false)
{
    class_names_ = loadClassNames();
    // Pre-allocate preprocess buffer
    preprocess_buffer_.reserve(640 * 640 * 3);
    // Initialize cached output dims
    cached_output_dims_.nbDims = 0;
}

YOLOEEngine::~YOLOEEngine()
{
    freeBuffers();
    
    // TensorRT 10.x: Objects are automatically destroyed (smart pointers)
    // No need to call destroy() explicitly
    context_ = nullptr;
    engine_ = nullptr;
    runtime_ = nullptr;
    
    if (stream_) {
        cudaStreamDestroy(stream_);
        stream_ = nullptr;
    }
}

bool YOLOEEngine::loadEngine(const std::string& engine_path)
{
    std::ifstream file(engine_path, std::ios::binary);
    if (!file.good()) {
        fprintf(stderr, "[YOLOE ERROR] Cannot open engine file: %s\n", engine_path.c_str());
        return false;
    }
    
    // Get file size and detect model variant
    file.seekg(0, std::ios::end);
    size_t size = file.tellg();
    file.seekg(0, std::ios::beg);
    
    // MODEL SIZE DETECTION: Estimate model variant based on engine file size
    // This helps adjust memory expectations and provides better diagnostics
    size_t engine_size_mb = size / (1024 * 1024);
    fprintf(stderr, "[YOLOE] Engine file size: %zu MB\n", engine_size_mb);
    
    if (engine_size_mb > 40) {
        fprintf(stderr, "[YOLOE] Large model detected (>40MB). Using conservative memory settings.\n");
        fprintf(stderr, "[YOLOE] Recommendation: Ensure sufficient GPU memory (600-800MB per context)\n");
    } else if (engine_size_mb > 15) {
        fprintf(stderr, "[YOLOE] Medium model detected (15-40MB). Standard memory settings.\n");
    } else {
        fprintf(stderr, "[YOLOE] Small model detected (<15MB). Memory-efficient settings.\n");
    }
    
    // Read engine data
    std::vector<char> engine_data(size);
    file.read(engine_data.data(), size);
    file.close();
    
    // Create TensorRT runtime with logger
    // Enable verbose logging for debugging (can be disabled in production)
    gLogger.setSeverity(nvinfer1::ILogger::Severity::kVERBOSE);
    runtime_ = nvinfer1::createInferRuntime(gLogger);
    if (!runtime_) {
        return false;
    }
    
    // Deserialize engine
    // TensorRT 10.x API: deserializeCudaEngine takes 2 parameters (no plugin factory)
    engine_ = runtime_->deserializeCudaEngine(engine_data.data(), size);
    if (!engine_) {
        return false;
    }
    
    // Create execution context
    context_ = engine_->createExecutionContext();
    if (!context_) {
        return false;
    }
    
    return true;
}

bool YOLOEEngine::allocateBuffers()
{
    // MEMORY-AWARE INITIALIZATION: Check available GPU memory before allocation
    // This prevents OOM errors and provides better error messages
    size_t free_mem = 0, total_mem = 0;
    cudaError_t mem_err = cudaMemGetInfo(&free_mem, &total_mem);
    
    if (mem_err == cudaSuccess) {
        // Estimate required memory:
        // - Input buffer: ~4.9MB (640x640x3x4 bytes)
        // - Output buffer: ~2.8MB (84x8400x4 bytes)
        // - Execution context: ~475MB (TensorRT 10.x typical)
        // - CUDA runtime overhead: ~100-200MB
        // Total: ~600-700MB per context
        size_t estimated_required = input_size_ + output_size_ + 
                                   (475ULL * 1024 * 1024) +  // Context overhead
                                   (150ULL * 1024 * 1024);   // CUDA runtime overhead
        
        // Require 20% safety margin
        size_t required_with_margin = estimated_required + (estimated_required / 5);
        
        fprintf(stderr, "[YOLOE MEMORY] GPU memory check: free=%zu MB, total=%zu MB, required=%zu MB\n",
                free_mem / (1024*1024), total_mem / (1024*1024), required_with_margin / (1024*1024));
        
        if (free_mem < required_with_margin) {
            fprintf(stderr, "[YOLOE ERROR] Insufficient GPU memory: %zu MB free, %zu MB required (with 20%% margin)\n",
                   free_mem / (1024*1024), required_with_margin / (1024*1024));
            fprintf(stderr, "[YOLOE ERROR] Recommendation: Close other GPU processes or use a smaller model\n");
            return false;
        }
    } else {
        // If we can't query memory, log warning but proceed (may be in non-CUDA environment)
        fprintf(stderr, "[YOLOE WARNING] Could not query GPU memory (error: %d). Proceeding with allocation.\n", mem_err);
    }
    
    // TensorRT 10.x uses tensor-based API instead of bindings
    // Get number of I/O tensors
    int num_tensors = engine_->getNbIOTensors();
    
    // TensorRT 10.x: Use tensor names via getIOTensorName()
    for (int i = 0; i < num_tensors; ++i) {
        const char* tensor_name = engine_->getIOTensorName(i);
        if (tensor_name == nullptr) {
            continue;  // Skip invalid tensor names
        }
        
        auto io_mode = engine_->getTensorIOMode(tensor_name);
        if (io_mode == nvinfer1::TensorIOMode::kINPUT) {
            input_tensor_name_ = tensor_name;
            input_binding_index_ = i;  // Keep for compatibility
        } else if (io_mode == nvinfer1::TensorIOMode::kOUTPUT) {
            output_tensor_name_ = tensor_name;
            output_binding_index_ = i;  // Keep for compatibility
        }
    }
    
    // Validate tensor names were found
    if (input_tensor_name_.empty() || output_tensor_name_.empty()) {
        fprintf(stderr, "[YOLOE ERROR] Failed to detect tensor names: input='%s', output='%s'\n",
                input_tensor_name_.c_str(), output_tensor_name_.c_str());
        return false;
    }
    
    // Log detected tensor names for debugging
    fprintf(stderr, "[YOLOE] Detected tensor names: input='%s', output='%s'\n",
            input_tensor_name_.c_str(), output_tensor_name_.c_str());
    
    // Get input/output dimensions using tensor names
    nvinfer1::Dims input_shape, output_shape;
    try {
        input_shape = engine_->getTensorShape(input_tensor_name_.c_str());
        output_shape = engine_->getTensorShape(output_tensor_name_.c_str());
    } catch (...) {
        return false;  // Failed to get tensor shapes
    }
    
    // Cache output dimensions for postprocessing (avoid querying engine during inference)
    cached_output_dims_ = output_shape;
    output_dims_cached_ = true;
    
    // Calculate buffer sizes
    // For input: [batch, channels, height, width] = [1, 3, 640, 640]
    input_size_ = std::accumulate(input_shape.d, input_shape.d + input_shape.nbDims, 1, std::multiplies<int>()) * sizeof(float);
    
    // For output: [batch, features, detections] = [1, 84, 8400]
    // Total elements = 1 * 84 * 8400 = 705,600
    output_size_ = std::accumulate(output_shape.d, output_shape.d + output_shape.nbDims, 1, std::multiplies<int>()) * sizeof(float);
    
    // Store output dimensions for postprocessing
    // Note: TensorRT stores dimensions in row-major order
    // For [1, 84, 8400], memory layout is: [batch][feature][detection]
    
    // Allocate CUDA buffers
    cudaError_t err;
    err = cudaMalloc(&input_buffer_, input_size_);
    if (err != cudaSuccess) {
        return false;
    }
    
    err = cudaMalloc(&output_buffer_, output_size_);
    if (err != cudaSuccess) {
        cudaFree(input_buffer_);
        return false;
    }
    
    // Create single CUDA stream (for backward compatibility)
    err = cudaStreamCreate(&stream_);
    if (err != cudaSuccess) {
        cudaFree(input_buffer_);
        cudaFree(output_buffer_);
        return false;
    }
    
    // Initialize multi-stream pipeline only if NUM_STREAMS > 1
    // For single stream (NUM_STREAMS=1), skip multi-stream initialization to save GPU memory
    // and use the main context_ with single-stream buffers
    if (NUM_STREAMS > 1) {
        if (!initializeStreams()) {
            // Cleanup single stream if multi-stream fails
            cudaStreamDestroy(stream_);
            stream_ = nullptr;
            cudaFree(input_buffer_);
            cudaFree(output_buffer_);
            return false;
        }
    }
    
    // CRITICAL FIX: TensorRT 10.x requires setTensorAddress() to be called before enqueueV3()
    // For single-stream inference: set addresses once here (used by infer() function)
    // For multi-stream inference: addresses are set per-inference in infer_pipelined()
    // Only set addresses for single-stream buffers if multi-stream is not available
    // This prevents conflicts when switching between single-stream and multi-stream modes
    if (streams_.empty()) {
        // Multi-stream not available, set addresses for single-stream buffers
        if (!context_->setTensorAddress(input_tensor_name_.c_str(), input_buffer_)) {
            destroyStreams();
            cudaFree(input_buffer_);
            cudaFree(output_buffer_);
            cudaStreamDestroy(stream_);
            stream_ = nullptr;
            return false;
        }
        
        if (!context_->setTensorAddress(output_tensor_name_.c_str(), output_buffer_)) {
            destroyStreams();
            cudaFree(input_buffer_);
            cudaFree(output_buffer_);
            cudaStreamDestroy(stream_);
            stream_ = nullptr;
            return false;
        }
    }
    // If multi-stream is available, addresses will be set per-inference in infer_pipelined()
    
    return true;
}

void YOLOEEngine::freeBuffers()
{
    // Destroy multi-stream resources
    destroyStreams();
    
    if (input_buffer_) {
        cudaFree(input_buffer_);
        input_buffer_ = nullptr;
    }
    if (output_buffer_) {
        cudaFree(output_buffer_);
        output_buffer_ = nullptr;
    }
    if (stream_) {
        cudaStreamDestroy(stream_);
        stream_ = nullptr;
    }
}

int YOLOEEngine::getNextStream()
{
    std::lock_guard<std::mutex> lock(stream_mutex_);
    
    if (available_streams_.empty()) {
        // All streams busy, use round-robin (not ideal, but safe)
        current_stream_index_ = (current_stream_index_ + 1) % NUM_STREAMS;
        return current_stream_index_;
    }
    
    int stream_id = available_streams_.front();
    available_streams_.pop();
    return stream_id;
}

void YOLOEEngine::returnStream(int stream_id)
{
    std::lock_guard<std::mutex> lock(stream_mutex_);
    if (stream_id >= 0 && stream_id < NUM_STREAMS) {
        available_streams_.push(stream_id);
    }
}

bool YOLOEEngine::initializeStreams()
{
    streams_.resize(NUM_STREAMS);
    input_buffers_.resize(NUM_STREAMS, nullptr);
    output_buffers_.resize(NUM_STREAMS, nullptr);
    contexts_.resize(NUM_STREAMS, nullptr);
    
    for (int i = 0; i < NUM_STREAMS; ++i) {
        // Create execution context for this stream
        // CRITICAL: TensorRT 10.x requires separate contexts per stream when using different buffers
        contexts_[i] = engine_->createExecutionContext();
        if (!contexts_[i]) {
            // Cleanup on failure
            for (int j = 0; j < i; ++j) {
                // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
                contexts_[j] = nullptr;
                cudaStreamDestroy(streams_[j]);
                if (input_buffers_[j]) cudaFree(input_buffers_[j]);
                if (output_buffers_[j]) cudaFree(output_buffers_[j]);
            }
            streams_.clear();
            input_buffers_.clear();
            output_buffers_.clear();
            contexts_.clear();
            return false;
        }
        
        // Create stream
        cudaError_t err = cudaStreamCreate(&streams_[i]);
        if (err != cudaSuccess) {
            // Cleanup on failure
            // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
            contexts_[i] = nullptr;
            for (int j = 0; j < i; ++j) {
                // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
                contexts_[j] = nullptr;
                cudaStreamDestroy(streams_[j]);
                if (input_buffers_[j]) cudaFree(input_buffers_[j]);
                if (output_buffers_[j]) cudaFree(output_buffers_[j]);
            }
            streams_.clear();
            input_buffers_.clear();
            output_buffers_.clear();
            contexts_.clear();
            return false;
        }
        
        // Allocate per-stream buffers
        err = cudaMalloc(&input_buffers_[i], input_size_);
        if (err != cudaSuccess) {
            // Cleanup
            // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
            contexts_[i] = nullptr;
            cudaStreamDestroy(streams_[i]);
            for (int j = 0; j < i; ++j) {
                // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
                contexts_[j] = nullptr;
                cudaStreamDestroy(streams_[j]);
            }
            for (int j = 0; j < i; ++j) {
                if (input_buffers_[j]) cudaFree(input_buffers_[j]);
                if (output_buffers_[j]) cudaFree(output_buffers_[j]);
            }
            streams_.clear();
            input_buffers_.clear();
            output_buffers_.clear();
            contexts_.clear();
            return false;
        }
        
        err = cudaMalloc(&output_buffers_[i], output_size_);
        if (err != cudaSuccess) {
            cudaFree(input_buffers_[i]);
            // Cleanup
            // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
            contexts_[i] = nullptr;
            cudaStreamDestroy(streams_[i]);
            for (int j = 0; j < i; ++j) {
                // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
                contexts_[j] = nullptr;
                cudaStreamDestroy(streams_[j]);
            }
            for (int j = 0; j < i; ++j) {
                if (input_buffers_[j]) cudaFree(input_buffers_[j]);
                if (output_buffers_[j]) cudaFree(output_buffers_[j]);
            }
            streams_.clear();
            input_buffers_.clear();
            output_buffers_.clear();
            contexts_.clear();
            return false;
        }
        
        // Set tensor addresses for this stream's context
        // CRITICAL: Each context needs its own tensor addresses set
        if (!contexts_[i]->setTensorAddress(input_tensor_name_.c_str(), input_buffers_[i])) {
            fprintf(stderr, "[YOLOE ERROR] Failed to set input tensor address for stream %d\n", i);
            // Cleanup
            cudaFree(input_buffers_[i]);
            cudaFree(output_buffers_[i]);
            // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
            contexts_[i] = nullptr;
            cudaStreamDestroy(streams_[i]);
            for (int j = 0; j < i; ++j) {
                // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
                contexts_[j] = nullptr;
                cudaStreamDestroy(streams_[j]);
                if (input_buffers_[j]) cudaFree(input_buffers_[j]);
                if (output_buffers_[j]) cudaFree(output_buffers_[j]);
            }
            streams_.clear();
            input_buffers_.clear();
            output_buffers_.clear();
            contexts_.clear();
            return false;
        }
        
        // Try detected name first, then fallback to "output0"
        bool output_set = contexts_[i]->setTensorAddress(output_tensor_name_.c_str(), output_buffers_[i]);
        if (!output_set && output_tensor_name_ != "output0") {
            output_set = contexts_[i]->setTensorAddress("output0", output_buffers_[i]);
        }
        
        if (!output_set) {
            fprintf(stderr, "[YOLOE ERROR] Failed to set output tensor address for stream %d (tried '%s' and 'output0')\n", 
                    i, output_tensor_name_.c_str());
            // Cleanup
            cudaFree(input_buffers_[i]);
            cudaFree(output_buffers_[i]);
            // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
            contexts_[i] = nullptr;
            cudaStreamDestroy(streams_[i]);
            for (int j = 0; j < i; ++j) {
                // TensorRT 10.x: Contexts are automatically managed, no destroy() needed
                contexts_[j] = nullptr;
                cudaStreamDestroy(streams_[j]);
                if (input_buffers_[j]) cudaFree(input_buffers_[j]);
                if (output_buffers_[j]) cudaFree(output_buffers_[j]);
            }
            streams_.clear();
            input_buffers_.clear();
            output_buffers_.clear();
            contexts_.clear();
            return false;
        }
        
        // Initialize stream queue
        available_streams_.push(i);
    }
    
    return true;
}

void YOLOEEngine::destroyStreams()
{
    // Wait for all streams to complete
    for (size_t i = 0; i < streams_.size(); ++i) {
        if (streams_[i]) {
            cudaStreamSynchronize(streams_[i]);
            cudaStreamDestroy(streams_[i]);
        }
        if (input_buffers_[i]) {
            cudaFree(input_buffers_[i]);
        }
        if (output_buffers_[i]) {
            cudaFree(output_buffers_[i]);
        }
    }
    
    streams_.clear();
    input_buffers_.clear();
    output_buffers_.clear();
    
    // Clear queue
    while (!available_streams_.empty()) {
        available_streams_.pop();
    }
}

bool YOLOEEngine::initialize(
    const std::string& model_path,
    int input_width,
    int input_height,
    bool use_int8)
{
    if (initialized_) {
        return true;
    }
    
    input_width_ = input_width;
    input_height_ = input_height;
    
    // Load TensorRT engine
    if (!loadEngine(model_path)) {
        return false;
    }
    
    // Allocate buffers
    if (!allocateBuffers()) {
        return false;
    }
    
    initialized_ = true;
    return true;
}

bool YOLOEEngine::infer(
    const cv::Mat& image,
    std::vector<Detection>& detections,
    float confidence_threshold,
    float nms_threshold)
{
    if (!initialized_) {
        return false;
    }
    
    // Thread safety: lock inference mutex to prevent concurrent access
    // This is critical for ROS 2 callbacks that may run in separate threads
    std::lock_guard<std::mutex> lock(inference_mutex_);
    
    int original_width = image.cols;
    int original_height = image.rows;
    
    // Preprocess image
    cv::Mat preprocessed = preprocessImage(image);
    
    // Validate preprocessed data
    if (preprocessed.empty() || preprocessed.data == nullptr) {
        return false;
    }
    
    // Validate preprocessed size matches input_size_
    size_t preprocessed_size = preprocessed.total() * preprocessed.elemSize();
    if (preprocessed_size != input_size_) {
        return false;  // Size mismatch
    }
    
    // Validate preprocessed data before CUDA operations
    if (preprocessed.empty() || preprocessed.data == nullptr) {
        return false;
    }
    
    if (input_buffer_ == nullptr || output_buffer_ == nullptr) {
        return false;
    }
    
    // Copy to GPU with error checking
    cudaError_t err = cudaMemcpyAsync(
        input_buffer_,
        preprocessed.data,
        input_size_,
        cudaMemcpyHostToDevice,
        stream_
    );
    if (err != cudaSuccess) {
        return false;
    }
    
    // Check for CUDA errors after memcpy
    err = cudaGetLastError();
    if (err != cudaSuccess) {
        return false;
    }
    
    // Execute inference
    // TensorRT 10.x: Use tensor-based API
    // Note: Tensor addresses are set once during initialization in allocateBuffers()
    // For single-stream inference with fixed buffers, no need to set addresses again
    try {
        // Execute inference
        bool success = context_->enqueueV3(stream_);
        
        if (!success) {
            // Check for TensorRT error details if available
            cudaError_t cuda_err = cudaGetLastError();
            if (cuda_err != cudaSuccess) {
                // CUDA error - log for debugging
                return false;
            }
            return false;
        }
        
        // CRITICAL: Synchronize immediately after enqueueV3 to catch errors early
        err = cudaStreamSynchronize(stream_);
        if (err != cudaSuccess) {
            // CUDA error during inference execution
            return false;
        }
        
        // Check for CUDA errors after enqueue and sync
        err = cudaGetLastError();
        if (err != cudaSuccess) {
            return false;
        }
    } catch (const std::exception& e) {
        // TensorRT API exception
        cudaGetLastError();  // Clear any pending CUDA errors
        return false;
    } catch (...) {
        // Unknown exception
        cudaGetLastError();  // Clear any pending CUDA errors
        return false;
    }
    
    // Copy output from GPU
    size_t output_elements = output_size_ / sizeof(float);
    if (output_elements == 0) {
        return false;
    }
    
    std::vector<float> output(output_elements);
    err = cudaMemcpyAsync(
        output.data(),
        output_buffer_,
        output_size_,
        cudaMemcpyDeviceToHost,
        stream_
    );
    if (err != cudaSuccess) {
        return false;
    }
    
    // Wait for stream to complete
    err = cudaStreamSynchronize(stream_);
    if (err != cudaSuccess) {
        return false;
    }
    
    // Validate output buffer before postprocessing
    if (output_size_ == 0 || output.data() == nullptr || output_elements == 0) {
        return false;
    }
    
    // CRITICAL DIAGNOSTIC: Log raw output values to diagnose bbox issue
    // This helps identify if TensorRT output is correct or if all values are identical
    static int diagnostic_call_count = 0;
    diagnostic_call_count++;
    bool should_diagnose = (diagnostic_call_count <= 5) || (diagnostic_call_count % 50 == 0);
    
    if (should_diagnose && output.data() != nullptr && output_elements > 0) {
        fprintf(stderr, "[YOLOE RAW OUTPUT DIAGNOSTIC] Call %d:\n", diagnostic_call_count);
        fprintf(stderr, "  Output elements: %zu, Expected: %zu (from output_size_=%zu / sizeof(float)=%zu)\n",
                output_elements, output_size_ / sizeof(float), output_size_, sizeof(float));
        
        // Check output dimensions from cached_dims
        if (output_dims_cached_) {
            fprintf(stderr, "  Cached output dims: nbDims=%d", cached_output_dims_.nbDims);
            for (int i = 0; i < cached_output_dims_.nbDims; ++i) {
                fprintf(stderr, ", d[%d]=%d", i, cached_output_dims_.d[i]);
            }
            fprintf(stderr, "\n");
        }
        
        // Sample first 20 detections' bbox values (feature-major layout)
        // Check if all bbox values are identical (which would cause the issue)
        int num_samples = std::min(20, static_cast<int>(output_elements / 84));
        bool all_bbox_identical = true;
        float first_x = 0.0f, first_y = 0.0f, first_w = 0.0f, first_h = 0.0f;
        
        if (output_elements >= 4) {
            // Assume feature-major: [1, 84, 8400]
            // Access: output[feature * 8400 + detection]
            int num_detections = (output_elements >= 8400) ? 8400 : output_elements / 84;
            if (num_detections > 0) {
                first_x = output[0 * num_detections + 0];
                first_y = output[1 * num_detections + 0];
                first_w = output[2 * num_detections + 0];
                first_h = output[3 * num_detections + 0];
                
                fprintf(stderr, "  First detection bbox (raw): x=%.6f, y=%.6f, w=%.6f, h=%.6f\n",
                        first_x, first_y, first_w, first_h);
                
                // Check if all detections have same bbox (the bug!)
                for (int i = 1; i < num_samples && i < num_detections; ++i) {
                    float x = output[0 * num_detections + i];
                    float y = output[1 * num_detections + i];
                    float w = output[2 * num_detections + i];
                    float h = output[3 * num_detections + i];
                    
                    if (std::abs(x - first_x) > 1e-6f || std::abs(y - first_y) > 1e-6f ||
                        std::abs(w - first_w) > 1e-6f || std::abs(h - first_h) > 1e-6f) {
                        all_bbox_identical = false;
                        if (i <= 5) {
                            fprintf(stderr, "  Det[%d] bbox: x=%.6f, y=%.6f, w=%.6f, h=%.6f (DIFFERENT)\n",
                                    i, x, y, w, h);
                        }
                        break;
                    }
                }
                
                if (all_bbox_identical) {
                    fprintf(stderr, "  ⚠⚠⚠ CRITICAL: All %d sampled detections have IDENTICAL bbox values!\n", num_samples);
                    fprintf(stderr, "     This indicates TensorRT engine output issue or incorrect buffer reading.\n");
                    fprintf(stderr, "     Possible causes:\n");
                    fprintf(stderr, "       1. INT8 quantization issue (engine may need re-export)\n");
                    fprintf(stderr, "       2. Output buffer not populated correctly\n");
                    fprintf(stderr, "       3. Wrong output format/layout assumption\n");
                } else {
                    fprintf(stderr, "  ✓ Bbox values vary across detections (expected behavior)\n");
                }
            }
        }
        
        // Check output value ranges
        float min_val = *std::min_element(output.begin(), output.end());
        float max_val = *std::max_element(output.begin(), output.end());
        fprintf(stderr, "  Output value range: [%.6f, %.6f]\n", min_val, max_val);
        
        // Check for NaN or Inf
        int nan_count = 0, inf_count = 0;
        for (size_t i = 0; i < std::min(output_elements, size_t(1000)); ++i) {
            if (!std::isfinite(output[i])) {
                if (std::isnan(output[i])) nan_count++;
                if (std::isinf(output[i])) inf_count++;
            }
        }
        if (nan_count > 0 || inf_count > 0) {
            fprintf(stderr, "  ⚠ Found %d NaN and %d Inf values in first 1000 elements\n", nan_count, inf_count);
        }
        
        fflush(stderr);
    }
    
    // Postprocess with bounds checking and exception handling
    try {
        detections = postprocess(
            output.data(),
            output_elements,
            confidence_threshold,
            nms_threshold,
            original_width,
            original_height
        );
    } catch (const std::exception& e) {
        // Postprocess exception - return empty detections
        return false;
    } catch (...) {
        // Unknown exception in postprocess
        return false;
    }
    
    return true;
}

bool YOLOEEngine::infer_pipelined(
    const cv::Mat& image,
    std::vector<Detection>& detections,
    float confidence_threshold,
    float nms_threshold)
{
    if (!initialized_ || streams_.empty()) {
        // Fallback to single-stream inference if multi-stream not available
        return infer(image, detections, confidence_threshold, nms_threshold);
    }
    
    // Thread safety for inference
    std::lock_guard<std::mutex> lock(inference_mutex_);
    
    int original_width = image.cols;
    int original_height = image.rows;
    
    // Get next available stream
    int stream_id = getNextStream();
    cudaStream_t stream = streams_[stream_id];
    void* input_buf = input_buffers_[stream_id];
    void* output_buf = output_buffers_[stream_id];
    nvinfer1::IExecutionContext* stream_context = contexts_[stream_id];
    
    if (!stream_context) {
        fprintf(stderr, "[YOLOE ERROR] No context available for stream %d\n", stream_id);
        returnStream(stream_id);
        return false;
    }
    
    // Preprocess on CPU (can overlap with previous frame's GPU work)
    cv::Mat preprocessed = preprocessImage(image);
    if (preprocessed.empty() || preprocessed.data == nullptr) {
        returnStream(stream_id);
        return false;
    }
    
    // CRITICAL FIX: Tensor addresses are already set in initializeStreams() for each context
    // No need to set them again - each context has its own buffers permanently bound
    
    // Async H2D copy (overlaps with CPU preprocessing of next frame)
    cudaError_t err = cudaMemcpyAsync(
        input_buf,
        preprocessed.data,
        input_size_,
        cudaMemcpyHostToDevice,
        stream
    );
    if (err != cudaSuccess) {
        returnStream(stream_id);
        return false;
    }
    
    // Async inference (overlaps with next frame preprocessing)
    // Use stream-specific context (addresses already set in initializeStreams)
    bool success = stream_context->enqueueV3(stream);
    if (!success) {
        returnStream(stream_id);
        return false;
    }
    
    // Async D2H copy (overlaps with postprocessing of previous frame)
    size_t output_elements = output_size_ / sizeof(float);
    std::vector<float> output(output_elements);
    err = cudaMemcpyAsync(
        output.data(),
        output_buf,
        output_size_,
        cudaMemcpyDeviceToHost,
        stream
    );
    if (err != cudaSuccess) {
        returnStream(stream_id);
        return false;
    }
    
    // Synchronize only when we need the results
    err = cudaStreamSynchronize(stream);
    if (err != cudaSuccess) {
        returnStream(stream_id);
        return false;
    }
    
    // Return stream to pool
    returnStream(stream_id);
    
    // Postprocess (CPU work, can overlap with next frame's GPU inference)
    try {
        detections = postprocess(
            output.data(),
            output_elements,
            confidence_threshold,
            nms_threshold,
            original_width,
            original_height
        );
    } catch (...) {
        return false;
    }
    
    return true;
}

cv::Mat YOLOEEngine::preprocessImage(const cv::Mat& image)
{
    if (image.empty() || image.data == nullptr) {
        return cv::Mat();
    }
    
    int original_width = image.cols;
    int original_height = image.rows;
    
    // ENVIRONMENT ROBUSTNESS: Handle various image conditions
    cv::Mat processed = image.clone();
    
    // Optional: Auto-brightness/contrast adjustment for difficult lighting
    // This helps YOLO work in dark/bright environments
    // Note: YOLOE is generally robust, but this can help in extreme cases
    // Uncomment if needed for very challenging environments:
    // cv::Mat lab;
    // cv::cvtColor(processed, lab, cv::COLOR_BGR2LAB);
    // std::vector<cv::Mat> lab_channels;
    // cv::split(lab, lab_channels);
    // cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(2.0, cv::Size(8, 8));
    // clahe->apply(lab_channels[0], lab_channels[0]);
    // cv::merge(lab_channels, lab);
    // cv::cvtColor(lab, processed, cv::COLOR_LAB2BGR);
    
    // Calculate scale factor to maintain aspect ratio (letterbox preprocessing)
    float scale = std::min(
        static_cast<float>(input_width_) / original_width,
        static_cast<float>(input_height_) / original_height
    );
    
    int new_width = static_cast<int>(original_width * scale);
    int new_height = static_cast<int>(original_height * scale);
    
    // Resize with aspect ratio preserved (high-quality interpolation)
    cv::Mat resized;
    cv::resize(processed, resized, cv::Size(new_width, new_height), 0, 0, cv::INTER_LINEAR);
    
    // Create letterbox (black padding) to fill to model input size
    cv::Mat letterbox = cv::Mat::zeros(input_height_, input_width_, CV_8UC3);
    
    // Calculate padding offsets (center the image)
    pad_x_ = (input_width_ - new_width) / 2;
    pad_y_ = (input_height_ - new_height) / 2;
    
    // Copy resized image to center of letterbox
    resized.copyTo(letterbox(cv::Rect(pad_x_, pad_y_, new_width, new_height)));
    
    // Store scale factors for postprocessing
    scale_x_ = static_cast<float>(new_width) / original_width;
    scale_y_ = static_cast<float>(new_height) / original_height;
    
    // Convert BGR to RGB (YOLOE expects RGB input)
    cv::Mat rgb;
    cv::cvtColor(letterbox, rgb, cv::COLOR_BGR2RGB);
    
    // Normalize to [0, 1] and convert to float
    // This normalization works across all lighting conditions
    rgb.convertTo(rgb, CV_32F, 1.0 / 255.0);
    
    // Convert HWC to CHW format for TensorRT
    std::vector<cv::Mat> channels(3);
    cv::split(rgb, channels);
    
    // Allocate output tensor data (CHW format) using member variable
    size_t data_size = static_cast<size_t>(input_width_) * static_cast<size_t>(input_height_) * 3;
    preprocess_buffer_.resize(data_size);
    
    // Copy channels in CHW format
    size_t idx = 0;
    for (int c = 0; c < 3; ++c) {
        for (int h = 0; h < input_height_; ++h) {
            for (int w = 0; w < input_width_; ++w) {
                if (idx < data_size && h < channels[c].rows && w < channels[c].cols) {
                    preprocess_buffer_[idx++] = channels[c].at<float>(h, w);
                } else {
                    return cv::Mat();  // Invalid dimensions
                }
            }
        }
    }
    
    // Create Mat that owns the data - allocate new memory and copy
    cv::Mat tensor(1, static_cast<int>(data_size), CV_32F);
    if (tensor.data == nullptr) {
        return cv::Mat();  // Allocation failed
    }
    
    std::memcpy(tensor.data, preprocess_buffer_.data(), data_size * sizeof(float));
    
    // Clone to ensure Mat owns the data independently
    cv::Mat tensor_owned = tensor.clone();
    
    return tensor_owned;
}

std::vector<Detection> YOLOEEngine::postprocess(
    const float* output,
    size_t output_elements,
    float confidence_threshold,
    float nms_threshold,
    int original_width,
    int original_height)
{
    std::vector<Detection> detections;
    
    // Validate inputs
    if (output == nullptr || output_elements == 0 || engine_ == nullptr) {
        return detections;
    }
    
    // Use cached output dimensions instead of querying engine
    // This avoids potential crashes from engine access during inference
    if (!output_dims_cached_) {
        return detections;  // Dimensions not cached yet
    }
    
    nvinfer1::Dims output_dims = cached_output_dims_;
    
    // Check dimensions
    if (output_dims.nbDims < 2 || output_dims.nbDims > 4) {
        return detections;  // Invalid dimensions
    }
    
    // YOLOE TensorRT output format from Ultralytics: [1, 84, 8400]
    // Migrated to YOLOE for potential open-vocabulary detection (zero overhead in closed mode)
    // Where: 84 = 4 (bbox: x, y, w, h) + 80 (class scores)
    //        8400 = number of grid cells/detections
    // Layout: [features, detections] - feature-major order
    // To access detection i, feature j: output[j * 8400 + i]
    
    int batch_size = (output_dims.nbDims >= 1) ? output_dims.d[0] : 1;
    int features = 84;  // Default for YOLOE (same as YOLO11)
    int num_detections = 8400;  // Default for YOLOE (same as YOLO11)
    
    // Determine layout: [batch, dim1, dim2]
    // Could be [1, 84, 8400] (feature-major) or [1, 8400, 84] (detection-major)
    bool is_feature_major = false;
    
    if (output_dims.nbDims == 3) {
        batch_size = output_dims.d[0];
        int dim1 = output_dims.d[1];
        int dim2 = output_dims.d[2];
        
        // CRITICAL: Log actual dimensions for debugging
        static bool logged_dims = false;
        if (!logged_dims) {
            fprintf(stderr, "[YOLOE LAYOUT] Output dims: [%d, %d, %d]\n", batch_size, dim1, dim2);
            logged_dims = true;
        }
        
        // Determine layout based on dimensions
        // YOLOE variants: 84 features (YOLOE-11s) or 37 features (YOLOE-v8L)
        // YOLOE-v8L: 37 = 4 bbox + 1 objectness + 32 class scores
        // YOLOE-11s: 84 = 4 bbox + 80 class scores (no objectness)
        if (dim1 == 84 && dim2 == 8400) {
            // Feature-major: [1, 84, 8400]
            features = dim1;
            num_detections = dim2;
            is_feature_major = true;
            if (!logged_dims) {
                fprintf(stderr, "[YOLOE LAYOUT] Detected feature-major: [1, 84, 8400]\n");
            }
        } else if (dim1 == 8400 && dim2 == 84) {
            // Detection-major: [1, 8400, 84]
            num_detections = dim1;
            features = dim2;
            is_feature_major = false;
            if (!logged_dims) {
                fprintf(stderr, "[YOLOE LAYOUT] Detected detection-major: [1, 8400, 84]\n");
            }
        } else {
            // Unknown layout - try to infer from values
            // Check if dim1 or dim2 matches known feature counts (37 for v8L, 84 for 11s) or 8400 (detections)
            fprintf(stderr, "[YOLOE LAYOUT] ⚠ Unknown layout: [%d, %d, %d]\n", batch_size, dim1, dim2);
            fprintf(stderr, "[YOLOE LAYOUT] Attempting to infer from values...\n");
            
            // Sample a few values to determine layout
            // If feature-major: output[0*num_detections + i] should vary for different i
            // If detection-major: output[i*features + 0] should vary for different i
            bool likely_feature_major = false;
            if (output_elements >= static_cast<size_t>(dim1 * dim2)) {
                // Try feature-major interpretation
                float x0 = output[0 * dim2 + 0];
                float x1 = output[0 * dim2 + 1];
                float x2 = output[0 * dim2 + std::min(10, dim2 - 1)];
                
                // Try detection-major interpretation
                float y0 = output[0 * dim2 + 0];
                float y1 = output[1 * dim2 + 0];
                float y2 = output[std::min(10, dim1 - 1) * dim2 + 0];
                
                // If feature-major, x values should be similar (same feature, different detections)
                // If detection-major, y values should be similar (same detection, different features)
                // Actually, we want to check if bbox coordinates vary across detections
                float x_variance = std::abs(x1 - x0) + std::abs(x2 - x0);
                float y_variance = std::abs(y1 - y0) + std::abs(y2 - y0);
                
                // If x_variance is small but y_variance is large, likely feature-major
                // If y_variance is small but x_variance is large, likely detection-major
                likely_feature_major = (x_variance < y_variance);
                
                fprintf(stderr, "[YOLOE LAYOUT] Variance test: x_var=%.6f, y_var=%.6f, likely_feature_major=%d\n",
                        x_variance, y_variance, likely_feature_major);
            }
            
            if (likely_feature_major || dim1 < dim2) {
                // Assume feature-major: [1, features, detections]
                features = dim1;
                num_detections = dim2;
                is_feature_major = true;
                fprintf(stderr, "[YOLOE LAYOUT] Assuming feature-major: [1, %d, %d]\n", features, num_detections);
            } else {
                // Assume detection-major: [1, detections, features]
                num_detections = dim1;
                features = dim2;
                is_feature_major = false;
                fprintf(stderr, "[YOLOE LAYOUT] Assuming detection-major: [1, %d, %d]\n", num_detections, features);
            }
            fflush(stderr);
        }
    } else if (output_dims.nbDims == 2) {
        features = output_dims.d[0];
        num_detections = output_dims.d[1];
        is_feature_major = true;  // Default assumption
        static bool logged_2d = false;
        if (!logged_2d) {
            fprintf(stderr, "[YOLOE LAYOUT] 2D output: [%d, %d], assuming feature-major\n", features, num_detections);
            logged_2d = true;
        }
    }
    
    // Safety check
    if (num_detections <= 0 || features < 4) {
        return detections;
    }
    
    // Scale factors (normalize from model input size to original image size)
    float scale_x = static_cast<float>(original_width) / input_width_;
    float scale_y = static_cast<float>(original_height) / input_height_;
    
    // Validate output buffer size
    size_t expected_elements = static_cast<size_t>(batch_size) * static_cast<size_t>(features) * static_cast<size_t>(num_detections);
    if (output_elements < expected_elements) {
        return detections;
    }
    
    // Parse detections based on layout
    // CRITICAL FIX: Process ALL detections, not just first 1000
    // YOLOE has 8400 detections, we need to check all of them (same as YOLO11)
    int max_process = num_detections;
    
    // Debug statistics
    static int total_processed = 0;
    static int valid_bbox_count = 0;
    static int valid_class_count = 0;
    static int passed_confidence_count = 0;
    static float max_conf_seen = 0.0f;
    static float max_class_score_seen = 0.0f;
    static float max_raw_class_score = -999.0f;
    static int calls = 0;
    calls++;
    
    // Enhanced debug: Log raw output values for first few calls to diagnose issues
    static int debug_call_count = 0;
    static bool logged_raw_values = false;
    debug_call_count++;
    
    // Log detailed info for first 10 calls, then every 50 calls (more aggressive for debugging)
    bool should_log = (debug_call_count <= 10) || (debug_call_count % 50 == 0);
    
    if (should_log && output != nullptr && output_elements > 0) {
        fprintf(stderr, "[YOLOE DEBUG] Call %d - Raw output analysis:\n", debug_call_count);
        fprintf(stderr, "  Output elements: %zu, Features: %d, Detections: %d\n", output_elements, features, num_detections);
        fprintf(stderr, "  Layout: %s, Confidence threshold: %.4f\n", 
                is_feature_major ? "feature-major" : "detection-major", confidence_threshold);
        
        if (is_feature_major) {
            // Analyze first 10 detections
            int detections_to_analyze = std::min(10, max_process);
            int detections_with_valid_bbox = 0;
            int detections_with_high_conf = 0;
            float global_max_conf = 0.0f;
            
            for (int i = 0; i < detections_to_analyze; ++i) {
                size_t idx_x = 0 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
                size_t idx_y = 1 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
                size_t idx_w = 2 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
                size_t idx_h = 3 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
                
                if (idx_h >= output_elements) break;
                
                float x_c = output[idx_x];
                float y_c = output[idx_y];
                float w = output[idx_w];
                float h = output[idx_h];
                
                // Check if bbox is valid
                bool valid_bbox = std::isfinite(x_c) && std::isfinite(y_c) && 
                                 std::isfinite(w) && std::isfinite(h) &&
                                 w > 0.0f && h > 0.0f;
                
                if (valid_bbox) {
                    detections_with_valid_bbox++;
                    
                    // Find max class score for this detection
                    float max_class_raw = -999.0f;
                    for (int c = 4; c < features; ++c) {
                        size_t idx_c = static_cast<size_t>(c) * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
                        if (idx_c < output_elements) {
                            float raw_score = output[idx_c];
                            // Apply sigmoid
                            float sigmoid_score = 1.0f / (1.0f + std::exp(-std::max(-10.0f, std::min(10.0f, raw_score))));
                            if (sigmoid_score > max_class_raw) {
                                max_class_raw = sigmoid_score;
                            }
                        }
                    }
                    
                    if (max_class_raw > global_max_conf) {
                        global_max_conf = max_class_raw;
                    }
                    if (max_class_raw >= confidence_threshold) {
                        detections_with_high_conf++;
                    }
                    
                    if (i < 5) {  // Detailed log for first 5
                        // Get raw logit before sigmoid for debugging
                        float raw_logit_sample = -999.0f;
                        for (int c = 4; c < features; ++c) {
                            size_t idx_c = static_cast<size_t>(c) * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
                            if (idx_c < output_elements) {
                                float raw = output[idx_c];
                                float sigmoid_val = 1.0f / (1.0f + std::exp(-std::max(-10.0f, std::min(10.0f, raw))));
                                if (sigmoid_val > raw_logit_sample) {
                                    raw_logit_sample = raw;
                                }
                            }
                        }
                        fprintf(stderr, "  Det[%d] bbox: x=%.6f y=%.6f w=%.6f h=%.6f, raw_logit=%.6f, max_conf=%.6f\n", 
                               i, x_c, y_c, w, h, raw_logit_sample, max_class_raw);
                    }
                }
            }
            
            fprintf(stderr, "  Summary: %d/%d detections with valid bbox, %d with conf>=%.4f, global_max_conf=%.6f\n",
                    detections_with_valid_bbox, detections_to_analyze, detections_with_high_conf, 
                    confidence_threshold, global_max_conf);
            fflush(stderr);  // Ensure output appears immediately
        }
        
        if (debug_call_count <= 3) {
            logged_raw_values = true;
        }
    }
    
    for (int i = 0; i < max_process; ++i) {
        total_processed++;
        float x_center, y_center, width, height;
        
        if (is_feature_major) {
            // Feature-major: [batch][feature][detection]
            // Access: output[feature * num_detections + detection]
            size_t idx_0 = 0 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
            size_t idx_1 = 1 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
            size_t idx_2 = 2 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
            size_t idx_3 = 3 * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
            
            if (idx_3 >= output_elements) break;
            
            x_center = output[idx_0];
            y_center = output[idx_1];
            width = output[idx_2];
            height = output[idx_3];
        } else {
            // Detection-major: [batch][detection][feature]
            // Access: output[detection * features + feature]
            size_t base_idx = static_cast<size_t>(i) * static_cast<size_t>(features);
            if (base_idx + 3 >= output_elements) break;
            
            x_center = output[base_idx + 0];
            y_center = output[base_idx + 1];
            width = output[base_idx + 2];
            height = output[base_idx + 3];
        }
        
        // YOLOE output format varies by variant:
        // YOLOE-v8L: [1, 37, 8400] = 4 bbox + 1 objectness + 32 class scores
        // YOLOE-11s: [1, 84, 8400] = 4 bbox + 80 class scores (no objectness)
        // Detect format dynamically based on features count
        // The class scores (features 4-83) ARE the confidence scores
        // Format: features 0-3 = bbox (normalized 0-1), features 4-83 = class confidence scores (80 classes)
        
        // Validate bbox values are finite
        if (!std::isfinite(x_center) || !std::isfinite(y_center) || 
            !std::isfinite(width) || !std::isfinite(height) ||
            width <= 0.0f || height <= 0.0f) {
            continue;
        }
        
        valid_bbox_count++;
        
        // CRITICAL FIX: Check if coordinates are normalized
        // YOLOE outputs normalized coordinates (0-1) by default (same as YOLO11)
        // However, INT8 quantization may output values in model input space (0-640)
        // We need to detect the actual format by checking if values are within model input bounds
        // If values are > 1.0 but < input_width/height, they might be pixel coords in model space
        // If values are <= 1.0, they are normalized
        // If values are > input_width/height, they are likely normalized but incorrectly interpreted
        bool is_normalized = (x_center <= 1.0f && y_center <= 1.0f && width <= 1.0f && height <= 1.0f);
        
        // Additional check: if values are small (< 100) but > 1.0, they might be normalized
        // YOLOE typically outputs normalized coords, so values like 4.0 are likely 4.0/640 = 0.00625 (normalized)
        // But we're seeing them as 4.0, which suggests they're already in pixel space OR the model output format changed
        // For now, trust the <= 1.0 check, but log if we see unexpected values
        if (!is_normalized && (x_center < static_cast<float>(input_width_) && y_center < static_cast<float>(input_height_))) {
            // Values are in pixel space (model input dimensions)
            // This is the INT8 engine behavior we observed
        }
        
        // Only clamp if coordinates are actually normalized
        if (is_normalized) {
            // Clamp normalized bbox coordinates to [0, 1] range
            x_center = std::max(0.0f, std::min(1.0f, x_center));
            y_center = std::max(0.0f, std::min(1.0f, y_center));
            width = std::max(0.01f, std::min(1.0f, width));
            height = std::max(0.01f, std::min(1.0f, height));
        }
        // If not normalized (pixel coordinates), don't clamp - use values as-is
        
        // Debug: Track raw bbox values (first call only, first 5 detections)
        if (calls == 1 && i < 5) {
            // Note: Can't use RCLCPP here, will log in node
        }
        
        // Find class with highest confidence score
        // YOLOE-v8L: features 5-36 (32 classes), feature 4 is objectness
        // YOLOE-11s: features 4-83 (80 classes), no objectness
        int class_id = 0;
        float max_class_score = 0.0f;
        
        // Determine class start based on model variant
        int class_start = (features == 37) ? 5 : 4;  // v8L has objectness at 4, 11s starts classes at 4
        int num_model_classes = (features == 37) ? 32 : 80;  // v8L has 32 classes, 11s has 80
        int max_class_idx = std::min(features, class_start + num_model_classes);
        
        for (int c = class_start; c < max_class_idx; ++c) {
            float class_score;
            
            if (is_feature_major) {
                size_t idx_c = static_cast<size_t>(c) * static_cast<size_t>(num_detections) + static_cast<size_t>(i);
                if (idx_c >= output_elements) break;
                class_score = output[idx_c];
            } else {
                size_t idx_c = static_cast<size_t>(i) * static_cast<size_t>(features) + static_cast<size_t>(c);
                if (idx_c >= output_elements) break;
                class_score = output[idx_c];
            }
            
            // YOLOE class scores - check if logits or already sigmoided
            if (!std::isfinite(class_score)) {
                continue;
            }
            
            float original_score = class_score;
            
            // CRITICAL FIX: YOLOE TensorRT outputs raw logits that MUST have sigmoid applied
            // Based on Ultralytics YOLOE documentation and TensorRT export behavior,
            // the model outputs logits that need sigmoid activation to become probabilities
            // ALWAYS apply sigmoid to ensure proper probability interpretation
            // Note: Applying sigmoid to already-sigmoided values is safe (just compresses range slightly)
            float raw_logit = class_score;
            class_score = std::max(-10.0f, std::min(10.0f, class_score));
            class_score = 1.0f / (1.0f + std::exp(-class_score));
            
            if (class_score > max_class_score) {
                max_class_score = class_score;
                class_id = c - class_start;
            }
        }
        
        // For YOLOE: confidence IS the max class score (no objectness multiplication)
        float conf = max_class_score;
        
        // Debug tracking
        if (conf > max_conf_seen) {
            max_conf_seen = conf;
        }
        if (max_class_score > 0.0f) {
            valid_class_count++;
        }
        
        // CRITICAL: Filter by confidence threshold
        // Only add detections that meet the minimum confidence requirement
        if (conf < confidence_threshold) {
            continue;  // Skip this detection - confidence too low
        }
        
        // CRITICAL FIX: Only increment once per detection, not per class check
        // This was causing the massive passed_confidence_count value
        static int last_detection_index = -1;
        if (i != last_detection_index) {
            passed_confidence_count++;
            last_detection_index = i;
        }
        
        // Additional validation: ensure confidence is reasonable (0-1 range)
        if (!std::isfinite(conf) || conf < 0.0f || conf > 1.0f) {
            continue;  // Skip invalid confidence values
        }
        
        // Debug: Log first few high-confidence detections
        static int high_conf_logged = 0;
        if (high_conf_logged < 5 && conf >= confidence_threshold) {
            fprintf(stderr, "[YOLOE DEBUG] High-conf detection[%d]: class=%d, conf=%.4f (threshold=%.4f)\n",
                    high_conf_logged, class_id, conf, confidence_threshold);
            high_conf_logged++;
        }
        
        // Convert from center+size format to x,y,w,h and scale to original image
        // CRITICAL FIX: INT8 TensorRT engine outputs pixel coordinates directly, NOT normalized!
        // Raw output shows values like x=4.064190 which are already in pixel space (0-640)
        // FP16 engine may output normalized (0-1), but INT8 outputs absolute pixel coordinates
        // Following Ultralytics/NVIDIA standard coordinate transformation:
        // 1. Use is_normalized flag determined BEFORE clamping
        // 2. Convert to pixel coordinates in model space if needed
        // 3. Subtract padding to get coordinates in resized image space
        // 4. Scale back to original image space using scale factors
        
        // Step 1: Convert to pixel coordinates in model space
        // is_normalized was determined BEFORE clamping, so it's accurate
        float x_center_px, y_center_px, width_px, height_px;
        if (is_normalized) {
            // Normalized coordinates: convert to pixels
            x_center_px = x_center * static_cast<float>(input_width_);
            y_center_px = y_center * static_cast<float>(input_height_);
            width_px = width * static_cast<float>(input_width_);
            height_px = height * static_cast<float>(input_height_);
        } else {
            // Already in pixel coordinates (INT8 engine behavior)
            x_center_px = x_center;
            y_center_px = y_center;
            width_px = width;
            height_px = height;
        }
        
        // Step 2: Convert from center+size to top-left+size in model space
        float x1_px = x_center_px - width_px / 2.0f;
        float y1_px = y_center_px - height_px / 2.0f;
        
        // Step 3: Subtract padding to get coordinates in resized (non-padded) image space
        // The resized image is placed at (pad_x_, pad_y_) in the model input
        float x1_resized = x1_px - static_cast<float>(pad_x_);
        float y1_resized = y1_px - static_cast<float>(pad_y_);
        float width_resized = width_px;
        float height_resized = height_px;
        
        // Step 4: Scale back to original image space
        // scale_x_ and scale_y_ are the ratios: resized_size / original_size
        // So to get original coordinates: resized_coord / scale_factor
        float x = x1_resized / scale_x_;
        float y = y1_resized / scale_y_;
        float w = width_resized / scale_x_;
        float h = height_resized / scale_y_;
        
        // Clamp to image bounds
        x = std::max(0.0f, std::min(static_cast<float>(original_width - 1), x));
        y = std::max(0.0f, std::min(static_cast<float>(original_height - 1), y));
        w = std::max(1.0f, std::min(static_cast<float>(original_width - x), w));
        h = std::max(1.0f, std::min(static_cast<float>(original_height - y), h));
        
        // Validate bbox dimensions before creating Rect
        int bbox_x = static_cast<int>(x);
        int bbox_y = static_cast<int>(y);
        int bbox_w = static_cast<int>(w);
        int bbox_h = static_cast<int>(h);
        
        // Ensure positive dimensions
        if (bbox_w <= 0 || bbox_h <= 0) {
            continue;
        }
        
        // Ensure bbox is within image bounds
        if (bbox_x < 0) bbox_x = 0;
        if (bbox_y < 0) bbox_y = 0;
        if (bbox_x + bbox_w > original_width) bbox_w = original_width - bbox_x;
        if (bbox_y + bbox_h > original_height) bbox_h = original_height - bbox_y;
        
        if (bbox_w <= 0 || bbox_h <= 0) {
            continue;
        }
        
        // Validate class_id is within valid range for this model variant
        int model_num_classes = (features == 37) ? 32 : 80;
        if (class_id < 0 || class_id >= model_num_classes) {
            // Log error but continue - this indicates a serious bug
            static int invalid_class_logged = 0;
            if (invalid_class_logged < 5) {
                fprintf(stderr, "[YOLOE ERROR] Invalid class_id=%d (expected 0-%d for %d-feature model), feature_idx=%d, max_class_idx=%d\n",
                        class_id, model_num_classes - 1, features, class_id + class_start, max_class_idx);
                invalid_class_logged++;
            }
            continue;  // Skip invalid class_id
        }
        
        Detection detection;
        detection.class_id = class_id;
        detection.confidence = conf;
        
        // Create Rect with validated dimensions
        try {
            detection.bbox = cv::Rect(bbox_x, bbox_y, bbox_w, bbox_h);
        } catch (...) {
            continue;  // Skip if Rect creation fails
        }
        
        // Map class_id to class name (COCO 80 classes, indices 0-79)
        detection.class_name = (class_id >= 0 && class_id < static_cast<int>(class_names_.size())) 
                                ? class_names_[class_id] : "unknown";
        
        // #region agent log
        {
            auto now = std::chrono::system_clock::now();
            auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
            std::ostringstream log_json;
            log_json << "{\"id\":\"log_" << ms << "_bbox" << i << "\",\"timestamp\":" << ms 
                     << ",\"location\":\"yolo11_engine.cpp:1348\",\"message\":\"bbox created\","
                     << "\"data\":{\"detectionIndex\":" << i << ",\"classId\":" << class_id 
                     << ",\"className\":\"" << detection.class_name << "\",\"confidence\":" << conf 
                     << ",\"rawCoords\":{\"xCenter\":" << x_center << ",\"yCenter\":" << y_center 
                     << ",\"width\":" << width << ",\"height\":" << height 
                     << ",\"isNormalized\":" << (is_normalized ? "true" : "false") 
                     << "},\"transformedCoords\":{\"x\":" << x << ",\"y\":" << y 
                     << ",\"w\":" << w << ",\"h\":" << h 
                     << "},\"finalBbox\":{\"x\":" << bbox_x << ",\"y\":" << bbox_y 
                     << ",\"width\":" << bbox_w << ",\"height\":" << bbox_h 
                     << "},\"originalSize\":{\"width\":" << original_width 
                     << ",\"height\":" << original_height 
                     << "},\"scaleFactors\":{\"scaleX\":" << scale_x_ 
                     << ",\"scaleY\":" << scale_y_ << "},\"padding\":{\"padX\":" << pad_x_ 
                     << ",\"padY\":" << pad_y_ << "}},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"C\"}\n";
            fprintf(stderr, "%s", log_json.str().c_str());
            std::ofstream log_file("/tmp/debug.log", std::ios::app);
            if (log_file.is_open()) {
                log_file << log_json.str();
                log_file.close();
            }
        }
        // #endregion
        
        // Debug: Log first few detections with actual bbox values and class mapping
        static int bbox_logged = 0;
        if (bbox_logged < 10) {
            std::string class_name_debug = (class_id >= 0 && class_id < static_cast<int>(class_names_.size())) 
                                         ? class_names_[class_id] : "unknown";
            fprintf(stderr, "[YOLOE BBOX DEBUG] Detection[%d]: class_id=%d (%s), conf=%.4f, bbox=(%d,%d,%d,%d), feature_idx=%d->%d\n",
                    bbox_logged, class_id, class_name_debug.c_str(), conf, bbox_x, bbox_y, bbox_w, bbox_h, 
                    class_start, class_id + class_start);
            bbox_logged++;
        }
        
        detections.push_back(detection);
    }
    
    // Apply NMS only if we have detections
    size_t detections_before_nms = detections.size();
    
    // Enhanced logging before NMS
    static int nms_log_counter = 0;
    nms_log_counter++;
    if (nms_log_counter % 30 == 0 || (nms_log_counter <= 10)) {
        fprintf(stderr, "[YOLOE PRE-NMS] Detections after confidence filter: %zu (conf_thresh=%.4f, nms_thresh=%.3f, passed_conf=%d)\n",
                detections_before_nms, confidence_threshold, nms_threshold, passed_confidence_count);
        
        // Log confidence distribution for first 20 detections
        if (detections_before_nms > 0) {
            size_t log_count = std::min(detections_before_nms, size_t(20));
            fprintf(stderr, "  Top %zu detections by confidence:\n", log_count);
            for (size_t i = 0; i < log_count; ++i) {
                fprintf(stderr, "    [%zu]: class=%d (%s), conf=%.4f, bbox=(%d,%d,%d,%d)\n",
                        i, detections[i].class_id, detections[i].class_name.c_str(), 
                        detections[i].confidence,
                        detections[i].bbox.x, detections[i].bbox.y,
                        detections[i].bbox.width, detections[i].bbox.height);
            }
            
            // Count unique classes
            std::set<int> unique_classes;
            for (size_t i = 0; i < detections_before_nms; ++i) {
                unique_classes.insert(detections[i].class_id);
            }
            fprintf(stderr, "  Unique classes detected: %zu\n", unique_classes.size());
        }
        fflush(stderr);
    }
    
    if (!detections.empty()) {
        try {
            applyNMS(detections, nms_threshold);
        } catch (...) {
            // If NMS fails, return detections without NMS
        }
    }
    size_t detections_after_nms = detections.size();
    
    // Enhanced logging after NMS
    if (nms_log_counter % 30 == 0 || (nms_log_counter <= 10)) {
        if (detections_before_nms > 1 && detections_after_nms < detections_before_nms) {
            fprintf(stderr, "[YOLOE POST-NMS] Before: %zu, After: %zu, Suppressed: %zu (NMS threshold: %.3f)\n",
                    detections_before_nms, detections_after_nms, 
                    detections_before_nms - detections_after_nms, nms_threshold);
            if (detections_after_nms > 0 && detections_after_nms <= 20) {
                // Log remaining detections
                for (size_t i = 0; i < detections_after_nms; ++i) {
                    fprintf(stderr, "  Post-NMS[%zu]: class=%d, conf=%.3f, bbox=(%d,%d,%d,%d)\n",
                            i, detections[i].class_id, detections[i].confidence,
                            detections[i].bbox.x, detections[i].bbox.y,
                            detections[i].bbox.width, detections[i].bbox.height);
                }
            }
            fflush(stderr);
        }
    }
    
    // Enhanced statistics logging
    static int total_postprocess_calls = 0;
    static int calls_with_detections = 0;
    total_postprocess_calls++;
    
    if (!detections.empty()) {
        calls_with_detections++;
    }
    
    // Log statistics periodically
    if (total_postprocess_calls % 30 == 0 || (total_postprocess_calls <= 10)) {
        float detection_rate = (total_postprocess_calls > 0) ? 
            (100.0f * calls_with_detections / total_postprocess_calls) : 0.0f;
        fprintf(stderr, "[YOLOE STATS] Calls: %d, With detections: %d (%.1f%%), "
                "Max conf seen: %.4f, Current detections: %zu\n",
                total_postprocess_calls, calls_with_detections, detection_rate,
                max_conf_seen, detections.size());
        
        if (detections.empty() && total_postprocess_calls <= 10) {
            fprintf(stderr, "[YOLOE WARNING] No detections found! "
                    "Conf threshold: %.4f, Processed: %d detections, "
                    "Valid bbox: %d, Passed conf: %d\n",
                    confidence_threshold, total_processed, valid_bbox_count, passed_confidence_count);
            fflush(stderr);  // Ensure output appears immediately
        }
    }
    
    return detections;
}

void YOLOEEngine::applyNMS(
    std::vector<Detection>& detections,
    float nms_threshold)
{
    if (detections.empty()) {
        return;
    }
    
    // Sort by confidence (descending)
    std::sort(detections.begin(), detections.end(),
              [](const Detection& a, const Detection& b) {
                  return a.confidence > b.confidence;
              });
    
    // Apply class-aware NMS: only suppress detections of the SAME class
    // This allows multiple different objects to be detected simultaneously
    // Per Ultralytics YOLOE best practices for multi-object detection
    std::vector<bool> suppressed(detections.size(), false);
    size_t num_suppressed = 0;
    
    for (size_t i = 0; i < detections.size(); ++i) {
        if (suppressed[i]) {
            continue;
        }
        
        for (size_t j = i + 1; j < detections.size(); ++j) {
            if (suppressed[j]) {
                continue;
            }
            
            // CRITICAL: Only suppress if same class AND overlapping
            // This allows different objects (different classes) to coexist
            if (detections[i].class_id != detections[j].class_id) {
                continue;  // Different classes - keep both
            }
            
            // Calculate IoU (Intersection over Union)
            cv::Rect box1 = detections[i].bbox;
            cv::Rect box2 = detections[j].bbox;
            
            // Calculate intersection
            int x1 = std::max(box1.x, box2.x);
            int y1 = std::max(box1.y, box2.y);
            int x2 = std::min(box1.x + box1.width, box2.x + box2.width);
            int y2 = std::min(box1.y + box1.height, box2.y + box2.height);
            
            int intersection = std::max(0, x2 - x1) * std::max(0, y2 - y1);
            
            // Calculate union
            int area1 = box1.width * box1.height;
            int area2 = box2.width * box2.height;
            int union_area = area1 + area2 - intersection;
            
            // Calculate IoU
            float iou = (union_area > 0) ? static_cast<float>(intersection) / static_cast<float>(union_area) : 0.0f;
            
            // Suppress lower confidence detection if IoU exceeds threshold
            // Only suppress if same class (already checked above)
            if (iou > nms_threshold) {
                suppressed[j] = true;
                num_suppressed++;
            }
        }
    }
    
    // Remove suppressed detections
    std::vector<Detection> filtered;
    filtered.reserve(detections.size() - num_suppressed);
    for (size_t i = 0; i < detections.size(); ++i) {
        if (!suppressed[i]) {
            filtered.push_back(detections[i]);
        }
    }
    
    detections = std::move(filtered);
}

std::vector<std::string> YOLOEEngine::loadClassNames()
{
    // COCO dataset class names (80 classes)
    return {
        "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
        "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
        "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
        "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
        "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
        "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
        "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
        "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
        "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
        "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
        "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
        "toothbrush"
    };
}

} // namespace zip_vision
