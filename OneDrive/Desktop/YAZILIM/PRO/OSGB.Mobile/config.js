// config.js - Configuration file for API endpoints
const CONFIG = {
  // Default development IP (will be updated dynamically)
  DEFAULT_IP: '192.168.1.88',
  
  // API Configuration
  API_PORT: 5005,
  
  // Get the current API base URL
  getApiBaseUrl: function() {
    return `http://${this.DEFAULT_IP}:${this.API_PORT}/api`;
  },
  
  // Get the WebSocket URL
  getWebSocketUrl: function() {
    return `http://${this.DEFAULT_IP}:${this.API_PORT}`;
  },
  
  // Update IP address
  updateIpAddress: function(newIp) {
    this.DEFAULT_IP = newIp;
  }
};

export default CONFIG;