#include "zip_vision/vlm_engine.hpp"
#include <sstream>
#include <algorithm>
#include <fstream>
#include <cstdlib>
#include <cstring>

namespace zip_vision
{

VLMEngine::VLMEngine()
    : initialized_(false)
    , quantization_("int4")
    , trtllm_engine_(nullptr)
    , trtllm_runtime_(nullptr)
{
}

VLMEngine::~VLMEngine()
{
    // Cleanup TensorRT-LLM resources
    // TensorRT-LLM cleanup handled by Python runtime
}

bool VLMEngine::initialize(
    const std::string& model_path,
    const std::string& quantization)
{
    if (initialized_) {
        return true;
    }
    
    quantization_ = quantization;
    
    // TensorRT-LLM is primarily Python-based
    // For C++ integration, we have two options:
    // 1. Use Python subprocess/service calls
    // 2. Use TensorRT-LLM C++ API (if available)
    // 3. Create a Python service node that handles VLM inference
    
    // For now, we'll mark as initialized but actual inference
    // will need to be implemented via Python service or C++ API
    
    // Check if model path exists
    std::ifstream check(model_path + "/config.json");
    if (!check.good()) {
        // Try alternative paths
        std::ifstream check2(model_path + "/engine/config.json");
        if (!check2.good()) {
            // Model path might be valid but config not found
            // Continue anyway - actual loading happens in Python
        }
    }
    
    initialized_ = true;
    return true;
}

std::string VLMEngine::generateDescription(
    const cv::Mat& image,
    const std::string& prompt,
    const std::vector<std::string>& detections,
    int max_tokens,
    float temperature)
{
    if (!initialized_) {
        return "VLM engine not initialized";
    }
    
    // Format prompt with detections context
    std::string formatted_prompt = formatPrompt(prompt, detections);
    
    // NOTE: Actual TensorRT-LLM inference requires Python API
    // This is a placeholder that returns the formatted prompt
    // Real implementation should:
    // 1. Save image to temporary file or encode to base64
    // 2. Call TensorRT-LLM Python API (via subprocess or service)
    // 3. Process image + text through model
    // 4. Decode generated tokens
    // 5. Return description
    
    // For now, return placeholder
    return "Scene description: " + formatted_prompt + 
           " [TensorRT-LLM inference via Python API needed - see vlm_service.py]";
}

cv::Mat VLMEngine::preprocessImage(const cv::Mat& image)
{
    // Resize to model input size (Qwen2.5-VL typically uses 448x448)
    cv::Mat resized;
    cv::resize(image, resized, cv::Size(448, 448));
    
    // Convert BGR to RGB
    cv::Mat rgb;
    cv::cvtColor(resized, rgb, cv::COLOR_BGR2RGB);
    
    // Normalize (ImageNet normalization for vision models)
    rgb.convertTo(rgb, CV_32F, 1.0 / 255.0);
    cv::Scalar mean(0.485, 0.456, 0.406);
    cv::Scalar std(0.229, 0.224, 0.225);
    
    std::vector<cv::Mat> channels;
    cv::split(rgb, channels);
    for (int i = 0; i < 3; ++i) {
        channels[i] = (channels[i] - mean[i]) / std[i];
    }
    cv::merge(channels, rgb);
    
    return rgb;
}

std::vector<int> VLMEngine::tokenize(const std::string& text)
{
    // Tokenization is model-specific (Qwen2.5-VL uses its own tokenizer)
    // This should use the model's tokenizer via Python API
    // For now, return empty vector
    return std::vector<int>();
}

std::string VLMEngine::detokenize(const std::vector<int>& tokens)
{
    // Detokenization is model-specific
    // This should use the model's tokenizer via Python API
    return "";
}

std::string VLMEngine::formatPrompt(
    const std::string& base_prompt,
    const std::vector<std::string>& detections)
{
    std::ostringstream oss;
    oss << base_prompt;
    
    if (!detections.empty()) {
        oss << "\n\nDetected objects: ";
        for (size_t i = 0; i < detections.size(); ++i) {
            oss << detections[i];
            if (i < detections.size() - 1) {
                oss << ", ";
            }
        }
    }
    
    return oss.str();
}

} // namespace zip_vision
