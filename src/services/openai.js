import OpenAI from 'openai';

/**
 * OpenAI Service - Reusable service for OpenAI API interactions
 * Supports both JSON and plain text responses with easy model switching
 */
class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Available models with GPT-5 as default
    this.models = {
      'gpt-5': 'gpt-5',
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-4': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5-turbo'
    };
    
    this.defaultModel = 'gpt-5';
  }

  /**
   * Get a response from OpenAI
   * @param {string} prompt - The input prompt
   * @param {Object} options - Configuration options
   * @param {string} options.model - Model to use (default: gpt-5)
   * @param {boolean} options.jsonResponse - Whether to return JSON response (default: true)
   * @param {number} options.temperature - Temperature for response generation (default: 0.7)
   * @param {number} options.maxTokens - Maximum tokens in response (default: 1000)
   * @param {string} options.systemMessage - System message to set context
   * @returns {Promise<Object|string>} - JSON object or plain text based on jsonResponse flag
   */
  async getResponse(prompt, options = {}) {
    const {
      model = this.defaultModel,
      jsonResponse = true,
      temperature = 0.7,
      maxTokens = 1000,
      systemMessage = null
    } = options;

    // Validate model
    if (!this.models[model]) {
      throw new Error(`Invalid model: ${model}. Available models: ${Object.keys(this.models).join(', ')}`);
    }

    try {
      const messages = [];
      
      // Add system message if provided
      if (systemMessage) {
        messages.push({
          role: 'system',
          content: systemMessage
        });
      }

      // Add user message
      messages.push({
        role: 'user',
        content: prompt
      });

      const requestConfig = {
        model: this.models[model],
        messages,
        temperature,
        max_tokens: maxTokens,
      };

      // Add response format for JSON responses
      if (jsonResponse) {
        requestConfig.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(requestConfig);
      
      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No response content received from OpenAI');
      }

      // Parse JSON if jsonResponse is true
      if (jsonResponse) {
        try {
          return JSON.parse(content);
        } catch (parseError) {
          console.warn('Failed to parse JSON response, returning as text:', parseError.message);
          return content;
        }
      }

      return content;

    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }

  /**
   * Get a JSON response from OpenAI
   * @param {string} prompt - The input prompt
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async getJSONResponse(prompt, options = {}) {
    return this.getResponse(prompt, { ...options, jsonResponse: true });
  }

  /**
   * Get a plain text response from OpenAI
   * @param {string} prompt - The input prompt
   * @param {Object} options - Configuration options
   * @returns {Promise<string>} - Plain text response
   */
  async getTextResponse(prompt, options = {}) {
    return this.getResponse(prompt, { ...options, jsonResponse: false });
  }

  /**
   * Get available models
   * @returns {Object} - Available models
   */
  getAvailableModels() {
    return { ...this.models };
  }

  /**
   * Set default model
   * @param {string} model - Model to set as default
   */
  setDefaultModel(model) {
    if (!this.models[model]) {
      throw new Error(`Invalid model: ${model}. Available models: ${Object.keys(this.models).join(', ')}`);
    }
    this.defaultModel = model;
  }

  /**
   * Get current default model
   * @returns {string} - Current default model
   */
  getDefaultModel() {
    return this.defaultModel;
  }
}

// Create and export a singleton instance
const openaiService = new OpenAIService();

export default openaiService;

// Also export the class for custom instances
export { OpenAIService };
