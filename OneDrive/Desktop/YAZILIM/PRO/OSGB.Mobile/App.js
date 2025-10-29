import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import axios from 'axios';
import io from 'socket.io-client';
import NetInfo from '@react-native-community/netinfo';
import CONFIG from './config';
import { findBackendServer } from './utils/networkUtils';

// API Base URL - Will be updated dynamically
let API_BASE_URL = CONFIG.getApiBaseUrl();

export default function App() {
  const [experts, setExperts] = useState([]); // Initialize as empty array
  const [selectedExpert, setSelectedExpert] = useState(null);
  const [workplaces, setWorkplaces] = useState([]);
  const [visitStatus, setVisitStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [networkStatus, setNetworkStatus] = useState('unknown');
  const [backendIp, setBackendIp] = useState(CONFIG.DEFAULT_IP);
  
  // Default organization ID for testing (should be 1 based on backend code)
  const ORGANIZATION_ID = 1;

  // Get current month in YYYY-MM format
  const getCurrentMonth = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Get previous month in YYYY-MM format
  const getPreviousMonth = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Get next month in YYYY-MM format
  const getNextMonth = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const months = [
    { key: getPreviousMonth(), name: `${new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('tr-TR', { month: 'long' })} ${new Date().getFullYear()}` },
    { key: getCurrentMonth(), name: `${new Date().toLocaleDateString('tr-TR', { month: 'long' })} ${new Date().getFullYear()}` },
    { key: getNextMonth(), name: `${new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString('tr-TR', { month: 'long' })} ${new Date().getFullYear()}` }
  ];

  // Find and set the correct backend server IP
  const findAndSetBackendServer = async () => {
    console.log('Searching for backend server...');
    const possibleIps = [
      '192.168.1.88', // Current IP from ipconfig
      '192.168.1.103', // Previous IP
      '192.168.1.108', // Another previous IP
      'localhost'
    ];
    
    const foundIp = await findBackendServer(possibleIps, CONFIG.API_PORT);
    if (foundIp) {
      setBackendIp(foundIp);
      CONFIG.updateIpAddress(foundIp);
      API_BASE_URL = CONFIG.getApiBaseUrl();
      console.log('Backend server found at:', foundIp);
    } else {
      console.log('No backend server found, using default IP');
    }
  };

  // Initialize socket connection
  useEffect(() => {
    // First try to find the correct backend server
    findAndSetBackendServer().then(() => {
      const socketUrl = CONFIG.getWebSocketUrl();
      console.log('Connecting to socket at:', socketUrl);
      const newSocket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: 10, // Increase reconnection attempts
        reconnectionDelay: 2000, // Increase delay
        reconnectionDelayMax: 10000,
        timeout: 15000, // Increase timeout
        randomizationFactor: 0.5
      });
      
      newSocket.on('connect', () => {
        console.log('Socket connected successfully');
        setNetworkStatus('connected');
      });
      
      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        // Don't immediately set to disconnected, try to reconnect first
        console.log('Attempting to reconnect...');
      });
      
      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        if (reason === 'io server disconnect') {
          // Disconnection was initiated by the server, reconnect manually
          newSocket.connect();
        }
        // For other reasons, the reconnection logic will handle it
      });
      
      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
      });
      
      newSocket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected on attempt:', attemptNumber);
        setNetworkStatus('connected');
      });
      
      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Socket reconnect attempt:', attemptNumber);
      });
      
      newSocket.on('reconnect_failed', () => {
        console.log('Socket reconnect failed');
        setNetworkStatus('disconnected');
      });
      
      setSocket(newSocket);
      
      return () => {
        console.log('Disconnecting socket');
        newSocket.disconnect();
      };
    });
  }, []);

  // Test network connectivity with improved error handling
  const testNetworkConnectivity = async (retryCount = 0) => {
    try {
      console.log('Testing connectivity to backend server at:', API_BASE_URL);
      const response = await axios.get(`${API_BASE_URL}/experts`, { 
        timeout: 10000, // Increase timeout
        headers: {
          'x-organization-id': ORGANIZATION_ID
        }
      });
      console.log('Network test successful');
      setNetworkStatus('connected');
      return true;
    } catch (err) {
      console.error('Network test failed:', err.message);
      console.error('Error details:', {
        code: err.code,
        response: err.response ? {
          status: err.response.status,
          statusText: err.response.statusText
        } : null
      });
      
      // More specific error handling
      if (err.code === 'ECONNABORTED') {
        console.log('Request timeout - server might be slow');
      } else if (err.code === 'ENOTFOUND') {
        console.log('Server not found - check IP address');
      } else if (err.code === 'ECONNREFUSED') {
        console.log('Connection refused - server might be down');
      }
      
      if (retryCount < 5) { // Increase retry count
        console.log(`Retrying network test (${retryCount + 1}/5)`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Increase delay
        return testNetworkConnectivity(retryCount + 1);
      }
      
      setNetworkStatus('disconnected');
      return false;
    }
  };

  // Add a periodic network check
  useEffect(() => {
    const interval = setInterval(() => {
      testNetworkConnectivity();
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Fetch all experts
  useEffect(() => {
    testNetworkConnectivity().then(success => {
      if (success) {
        fetchExperts();
      }
    });
  }, []);

  const fetchExperts = async (retryCount = 0) => {
    try {
      setLoading(true);
      console.log('Fetching experts from:', `${API_BASE_URL}/experts`);
      
      const response = await axios.get(`${API_BASE_URL}/experts`, { 
        timeout: 10000,
        headers: {
          'x-organization-id': ORGANIZATION_ID
        }
      });
      console.log('Experts fetched successfully:', response.data);
      
      // Ensure we always have an array
      const expertsData = Array.isArray(response.data) ? response.data : [];
      setExperts(expertsData);
      setError('');
    } catch (err) {
      console.error('Error fetching experts:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        config: err.config ? {
          url: err.config.url,
          method: err.config.method,
          baseURL: err.config.baseURL
        } : null
      });
      
      // Retry up to 3 times
      if (retryCount < 3) {
        console.log(`Retrying fetchExperts (${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fetchExperts(retryCount + 1);
      }
      
      setError('Uzmanlar getirilirken hata oluştu. Lütfen ağ bağlantınızı kontrol edin.');
      // Set experts to empty array on error to prevent map error
      setExperts([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch workplaces and visit status for selected expert
  const fetchWorkplacesForExpert = async (expertId, retryCount = 0) => {
    try {
      setLoading(true);
      console.log('Fetching workplaces for expert:', expertId);
      
      // Fetch assigned workplaces
      const workplacesResponse = await axios.get(`${API_BASE_URL}/experts/${expertId}/assigned-workplaces`, { 
        timeout: 10000,
        headers: {
          'x-organization-id': ORGANIZATION_ID
        }
      });
      
      // Fetch visit summary
      const visitsResponse = await axios.get(`${API_BASE_URL}/experts/${expertId}/visit-summary`, { 
        timeout: 10000,
        headers: {
          'x-organization-id': ORGANIZATION_ID
        }
      });
      
      // Ensure we always have arrays
      const workplacesData = Array.isArray(workplacesResponse.data) ? workplacesResponse.data : [];
      setWorkplaces(workplacesData);
      
      // Initialize visit status from backend data
      const initialStatus = {};
      workplacesData.forEach((workplace) => {
        initialStatus[workplace.id] = {};
        months.forEach(month => {
          // Check if we have visit data for this workplace and month
          if (visitsResponse.data[workplace.id] && visitsResponse.data[workplace.id].visits[month.key]) {
            initialStatus[workplace.id][month.key] = visitsResponse.data[workplace.id].visits[month.key].visited;
          } else {
            // Default to not visited if no data exists
            initialStatus[workplace.id][month.key] = false;
          }
        });
      });
      
      setVisitStatus(initialStatus);
      setError('');
    } catch (err) {
      console.error('Error fetching data:', err);
      
      // Retry up to 3 times
      if (retryCount < 3) {
        console.log(`Retrying fetchWorkplacesForExpert (${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fetchWorkplacesForExpert(expertId, retryCount + 1);
      }
      
      setError('Veriler getirilirken hata oluştu. Lütfen ağ bağlantınızı kontrol edin.');
      // Set workplaces to empty array on error to prevent map error
      setWorkplaces([]);
    } finally {
      setLoading(false);
    }
  };

  // Toggle visit status for a workplace and month
  const toggleVisitStatus = async (workplaceId, monthKey) => {
    if (!selectedExpert) return;
    
    try {
      // Get the current status
      const isCurrentlyVisited = visitStatus[workplaceId]?.[monthKey] || false;
      
      // Update the UI immediately for better UX
      setVisitStatus(prev => ({
        ...prev,
        [workplaceId]: {
          ...prev[workplaceId],
          [monthKey]: !isCurrentlyVisited
        }
      }));
      
      if (!isCurrentlyVisited) {
        // If it was not visited, create a new visit record
        const visitData = {
          expertId: selectedExpert.id,
          workplaceId: workplaceId,
          visitDate: new Date().toISOString().split('T')[0], // Today's date
          startTime: '09:00',
          endTime: '10:00',
          visitMonth: monthKey,
          notes: `Ziyaret ${monthKey} için otomatik oluşturuldu`
        };
        
        await axios.post(`${API_BASE_URL}/visits`, visitData, { 
          timeout: 10000,
          headers: {
            'x-organization-id': ORGANIZATION_ID
          }
        });
      } else {
        // If it was visited, we need to find and delete the visit record
        // First, we need to find the visit record for this expert, workplace, and month
        const visitsResponse = await axios.get(`${API_BASE_URL}/visits/expert/${selectedExpert.id}`, { 
          timeout: 10000,
          headers: {
            'x-organization-id': ORGANIZATION_ID
          }
        });
        
        const visitToDelete = visitsResponse.data.find(visit => 
          visit.workplaceId === workplaceId && visit.visitMonth === monthKey
        );
        
        if (visitToDelete) {
          await axios.delete(`${API_BASE_URL}/visits/${visitToDelete.id}`, { 
            timeout: 10000,
            headers: {
              'x-organization-id': ORGANIZATION_ID
            }
          });
        }
      }
      
      // Emit visit update event to WebSocket server
      if (socket) {
        socket.emit('visitUpdate', {
          workplaceId: workplaceId,
          visitMonth: monthKey,
          visited: !isCurrentlyVisited
        });
      }
      
      Alert.alert('Başarılı', 'Ziyaret durumu güncellendi');
    } catch (err) {
      console.error('Error updating visit status:', err);
      // Revert the UI change if the backend update failed
      setVisitStatus(prev => ({
        ...prev,
        [workplaceId]: {
          ...prev[workplaceId],
          [monthKey]: isCurrentlyVisited
        }
      }));
      
      Alert.alert('Hata', 'Ziyaret durumu güncellenirken hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
    }
  };

  // Render expert list view
  const renderExpertList = () => (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Uzman Seçin</Text>
      <Text style={styles.networkStatus}>Backend IP: {backendIp} | Network: {networkStatus}</Text>
      {loading && <Text style={styles.loading}>Yükleniyor...</Text>}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      {/* Ensure experts is always an array before mapping */}
      {Array.isArray(experts) && experts.map(expert => (
        <TouchableOpacity
          key={expert.id}
          style={styles.expertCard}
          onPress={() => {
            setSelectedExpert(expert);
            fetchWorkplacesForExpert(expert.id);
          }}
        >
          <Text style={styles.expertName}>{expert.firstName} {expert.lastName}</Text>
          <Text style={styles.expertPhone}>{expert.phone}</Text>
          <View style={[
            styles.expertClassBadge,
            expert.expertiseClass === 'A' ? styles.classA :
            expert.expertiseClass === 'B' ? styles.classB :
            styles.classC
          ]}>
            <Text style={styles.expertClassText}>{expert.expertiseClass} Sınıfı</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // Render workplace visits view
  const renderWorkplaceVisits = () => (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => setSelectedExpert(null)}
        >
          <Text style={styles.backButtonText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{selectedExpert.firstName} {selectedExpert.lastName}</Text>
      </View>
      
      {loading && <Text style={styles.loading}>Yükleniyor...</Text>}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      {/* Ensure workplaces is always an array before mapping */}
      {Array.isArray(workplaces) && workplaces.map(workplace => (
        <View key={workplace.id} style={styles.workplaceCard}>
          <Text style={styles.workplaceName}>{workplace.name}</Text>
          
          {months.map(month => (
            <View key={month.key} style={styles.monthSection}>
              <Text style={styles.monthName}>{month.name}</Text>
              <TouchableOpacity
                style={[
                  styles.visitStatusButton,
                  visitStatus[workplace.id]?.[month.key] ? styles.visited : styles.notVisited
                ]}
                onPress={() => toggleVisitStatus(workplace.id, month.key)}
              >
                <Text style={styles.visitStatusText}>
                  {visitStatus[workplace.id]?.[month.key] ? '✓ Ziyaret Edildi' : '✕ Ziyaret Edilmedi'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {!selectedExpert ? renderExpertList() : renderWorkplaceVisits()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#333',
  },
  networkStatus: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    marginVertical: 10,
  },
  loading: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginVertical: 20,
  },
  error: {
    textAlign: 'center',
    fontSize: 16,
    color: '#d32f2f',
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 4,
    marginVertical: 10,
  },
  expertCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  expertName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  expertPhone: {
    fontSize: 14,
    color: '#666',
    marginVertical: 4,
  },
  expertClassBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  classA: {
    backgroundColor: '#d32f2f',
  },
  classB: {
    backgroundColor: '#1976d2',
  },
  classC: {
    backgroundColor: '#388e3c',
  },
  expertClassText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#0078d7',
  },
  workplaceCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  workplaceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  monthSection: {
    marginBottom: 16,
  },
  monthName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  visitStatusButton: {
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  visited: {
    backgroundColor: '#4caf50',
  },
  notVisited: {
    backgroundColor: '#f44336',
  },
  visitStatusText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});