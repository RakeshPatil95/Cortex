/**
 * Service Configuration
 * Centralized configuration for all services
 */

export const config = {
  openai: {
    // Default model configuration
    defaultModel: 'gpt-5',
    
    // Available models
    models: {
      'gpt-5': 'gpt-5',
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-4': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5-turbo'
    },
    
    // Default parameters
    defaultTemperature: 0.7,
    defaultMaxTokens: 1000,
    defaultJsonResponse: true
  }
};

export default config;
