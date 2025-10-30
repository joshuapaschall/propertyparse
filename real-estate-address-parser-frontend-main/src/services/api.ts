import axios from 'axios';

const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000';

console.log('API Base URL:', API_BASE_URL); // Debug log

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout
  headers: {
    'Content-Type': 'application/json',
  },
  // Add this to help debug
  validateStatus: function (status) {
    return status >= 200 && status < 500; // Accept all responses to handle errors properly
  }
});

// Modified health check
export const checkServerHealth = async () => {
  try {
    console.log('Attempting health check...'); // Debug log
    // Try a simple GET request to root endpoint
    const response = await api.get('/');
    console.log('Health check response:', response); // Debug log
    return response.data;
  } catch (error: any) {
    console.error('Health check error:', {
      message: error.message,
      code: error.code,
      response: error.response,
      config: error.config
    });
    throw error;
  }
};

export const uploadFile = async (formData: FormData) => {
  try {
    console.log('Attempting file upload...'); // Debug log
    console.log('FormData contents:', Array.from(formData.entries())); // Debug log

    const response = await api.post('/upload/file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent: any) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 0));
        console.log('Upload progress:', percentCompleted);
      },
    });
    
    console.log('Upload response:', response); // Debug log
    return response.data;
  } catch (error: any) {
    console.error('Upload error:', {
      message: error.message,
      code: error.code,
      response: error.response,
      config: error.config
    });
    
    if (error.code === 'ERR_NETWORK') {
      throw new Error(`Connection failed to ${API_BASE_URL}. Please check if the backend is running.`);
    }
    throw new Error(error.response?.data?.message || `Upload failed: ${error.message}`);
  }
};
export const checkNetworkConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    console.log('Server health check:', data);
    return true;
  } catch (error) {
    console.error('Server health check failed:', error);
    return false;
  }
}; 

export const checkApiKeys = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/validate-api-keys`);
    const data = await response.json();
    console.log('API keys check response:', data);
    if (data.error) {
      throw new Error(JSON.stringify(data.details));
    }
    return true;
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message.includes('API Key Error') 
        ? 'API keys are invalid or expired. Please contact support.'
        : 'Error validating API keys. Please try again later.';
      
      console.error(errorMessage);
      return false;
    }
  }
};