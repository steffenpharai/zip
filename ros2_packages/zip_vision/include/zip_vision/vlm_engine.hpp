#ifndef ZIP_VISION_VLM_ENGINE_HPP
#define ZIP_VISION_VLM_ENGINE_HPP

#include <string>
#include <vector>
#include <memory>
#include <opencv2/opencv.hpp>

namespace zip_vision
{

/**
 * @brief VLM Engine using TensorRT-LLM
 * 
 * Handles loading and inference with Qwen2.5-VL-3B using TensorRT-LLM.
 * Optimized for Jetson Orin Nano with quantization support.
 */
class VLMEngine
{
public:
    VLMEngine();
    ~VLMEngine();

    /**
     * @brief Initialize the engine with a TensorRT-LLM model
     * @param model_path Path to TensorRT-LLM engine directory
     * @param quantization Quantization level ("int4", "int8", "fp16")
     * @return true if initialization successful
     */
    bool initialize(
        const std::string& model_path,
        const std::string& quantization = "int4"
    );

    /**
     * @brief Generate scene description from image
     * @param image Input image (BGR format)
     * @param prompt Text prompt for the model
     * @param detections Optional: YOLOE detections for context
     * @param max_tokens Maximum number of tokens in response
     * @param temperature Temperature for text generation
     * @return Generated scene description
     */
    std::string generateDescription(
        const cv::Mat& image,
        const std::string& prompt,
        const std::vector<std::string>& detections = {},
        int max_tokens = 512,
        float temperature = 0.7f
    );

    /**
     * @brief Check if engine is initialized
     */
    bool isInitialized() const { return initialized_; }

private:
    bool initialized_;
    std::string quantization_;
    
    // TensorRT-LLM engine and runtime (to be implemented with TensorRT-LLM API)
    void* trtllm_engine_;  // TensorRT-LLM engine handle
    void* trtllm_runtime_;  // TensorRT-LLM runtime handle
    
    // Preprocessing
    cv::Mat preprocessImage(const cv::Mat& image);
    
    // Tokenization (using model's tokenizer)
    std::vector<int> tokenize(const std::string& text);
    
    // Detokenization
    std::string detokenize(const std::vector<int>& tokens);
    
    // Format prompt with detections context
    std::string formatPrompt(
        const std::string& base_prompt,
        const std::vector<std::string>& detections
    );
};

} // namespace zip_vision

#endif // ZIP_VISION_VLM_ENGINE_HPP
