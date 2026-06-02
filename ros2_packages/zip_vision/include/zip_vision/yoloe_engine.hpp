#ifndef ZIP_VISION_YOLOE_ENGINE_HPP
#define ZIP_VISION_YOLOE_ENGINE_HPP

#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <queue>
#include <opencv2/opencv.hpp>
#include <cuda_runtime.h>
#include <NvInfer.h>
#include <NvInferRuntime.h>

namespace zip_vision
{

/**
 * @brief Detection result structure
 */
struct Detection
{
    int class_id;
    float confidence;
    cv::Rect bbox;  // Bounding box (x, y, width, height)
    std::string class_name;
};

/**
 * @brief YOLOE TensorRT Engine Wrapper
 * 
 * Handles loading and inference with YOLOE TensorRT engine.
 * Supports open-vocabulary detection with zero overhead in closed mode.
 * Optimized for Jetson Orin Nano with INT8 quantization.
 */
class YOLOEEngine
{
public:
    YOLOEEngine();
    ~YOLOEEngine();

    /**
     * @brief Initialize the engine with a TensorRT model file
     * @param model_path Path to TensorRT engine file (.engine)
     * @param input_width Model input width
     * @param input_height Model input height
     * @param use_int8 Whether to use INT8 precision
     * @return true if initialization successful
     */
    bool initialize(
        const std::string& model_path,
        int input_width = 640,
        int input_height = 640,
        bool use_int8 = true
    );

    /**
     * @brief Run inference on an image
     * @param image Input image (BGR format)
     * @param detections Output vector of detections
     * @param confidence_threshold Minimum confidence for detections
     * @param nms_threshold Non-maximum suppression threshold
     * @return true if inference successful
     */
    bool infer(
        const cv::Mat& image,
        std::vector<Detection>& detections,
        float confidence_threshold = 0.5f,
        float nms_threshold = 0.4f
    );

    /**
     * @brief Run pipelined inference using multiple CUDA streams
     * @param image Input image (BGR format)
     * @param detections Output vector of detections
     * @param confidence_threshold Minimum confidence for detections
     * @param nms_threshold Non-maximum suppression threshold
     * @return true if inference successful
     */
    bool infer_pipelined(
        const cv::Mat& image,
        std::vector<Detection>& detections,
        float confidence_threshold = 0.5f,
        float nms_threshold = 0.4f
    );

    /**
     * @brief Check if engine is initialized
     */
    bool isInitialized() const { return initialized_; }

    /**
     * @brief Get input width
     */
    int getInputWidth() const { return input_width_; }

    /**
     * @brief Get input height
     */
    int getInputHeight() const { return input_height_; }

private:
    bool initialized_;
    int input_width_;
    int input_height_;
    int num_classes_;
    
    // TensorRT engine and context
    nvinfer1::IRuntime* runtime_;
    nvinfer1::ICudaEngine* engine_;
    nvinfer1::IExecutionContext* context_;  // Single context for single-stream inference
    
    // Multi-stream contexts (one per stream)
    std::vector<nvinfer1::IExecutionContext*> contexts_;
    
    // Input/output buffers (CUDA)
    void* input_buffer_;
    void* output_buffer_;
    size_t input_size_;
    size_t output_size_;
    
    // Binding indices (for compatibility)
    int input_binding_index_;
    int output_binding_index_;
    
    // Tensor names (TensorRT 10.x)
    std::string input_tensor_name_;
    std::string output_tensor_name_;
    
    // CUDA stream (single stream for backward compatibility)
    cudaStream_t stream_;
    
    // Multi-stream pipeline support
    // Using single stream to avoid GPU memory issues
    // Each execution context uses ~475MB, so multiple contexts exceed Jetson memory
    static constexpr int NUM_STREAMS = 1;
    std::vector<cudaStream_t> streams_;
    std::vector<void*> input_buffers_;   // Per-stream input buffers
    std::vector<void*> output_buffers_;  // Per-stream output buffers
    std::queue<int> available_streams_;  // Available stream indices
    std::mutex stream_mutex_;             // Protect stream queue
    int current_stream_index_;
    
    // Preprocessing buffer (member variable to ensure data persistence)
    std::vector<float> preprocess_buffer_;
    
    // Letterbox preprocessing offsets (for aspect ratio preservation)
    float scale_x_;
    float scale_y_;
    int pad_x_;
    int pad_y_;
    
    // Cached output dimensions (to avoid querying engine every time)
    nvinfer1::Dims cached_output_dims_;
    bool output_dims_cached_;
    
    // Thread safety mutex for inference operations
    mutable std::mutex inference_mutex_;
    
    // Preprocessing
    cv::Mat preprocessImage(const cv::Mat& image);
    
    // Postprocessing
    std::vector<Detection> postprocess(
        const float* output,
        size_t output_elements,
        float confidence_threshold,
        float nms_threshold,
        int original_width,
        int original_height
    );
    
    // NMS implementation
    void applyNMS(
        std::vector<Detection>& detections,
        float nms_threshold
    );
    
    // Load TensorRT engine from file
    bool loadEngine(const std::string& engine_path);
    
    // Allocate CUDA buffers
    bool allocateBuffers();
    
    // Free CUDA buffers
    void freeBuffers();
    
    // Multi-stream helpers
    int getNextStream();
    void returnStream(int stream_id);
    bool initializeStreams();
    void destroyStreams();
    
    // Load class names (COCO dataset by default)
    std::vector<std::string> loadClassNames();
    std::vector<std::string> class_names_;
};

} // namespace zip_vision

#endif // ZIP_VISION_YOLOE_ENGINE_HPP
