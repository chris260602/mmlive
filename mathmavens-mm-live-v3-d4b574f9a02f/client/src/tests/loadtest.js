// Loadero Nightwatch.js Test Script

module.exports = {
    'Mediasoup App Test with Zustand Store': function(browser) {
      // These variables can be passed from Loadero's configuration
      const APP_URL = 'https://your-mediasoup-app.com/';
      const ROOM_NAME = 'test-room-123';
      const USER_ROLE = 'Student'; // or 'Admin', 'Teacher', etc.
      
      // Mock user data required by your handleJoin function
      const MOCK_USER_DATA = {
          id: `test-user-${Math.floor(Math.random() * 1000)}`,
          name: 'Loadero Bot'
          // ... any other properties your userData object needs
      };
  
      browser
        .url(APP_URL)
        .waitForElementVisible('body', 10000); // Wait for the page to load
  
      // 1. Wait until our custom test hook is available on the window object
      browser.waitUntil(
        'execute',
        ['return window.testApi && typeof window.testApi.getState === "function"'],
        {
          timeout: 15000,
          message: 'Test API (window.testApi) was not found on the page.'
        }
      );
  
      // 2. Wait for device loading to finish and select the first available camera
      browser.executeAsync(function(done) {
        const api = window.testApi;
        // Wait until device scan is complete
        const unsubscribe = api.subscribe(state => {
          if (state.isDeviceLoading === false && state.videoDevices.length > 0) {
            const firstDeviceId = state.videoDevices[0].deviceId;
            console.log('Loadero: Devices loaded. Selecting device:', firstDeviceId);
            api.getState().setSelectedDevice(firstDeviceId);
            unsubscribe(); // Clean up the listener
            done(true);
          }
        });
      }, [], function(result) {
          browser.assert.ok(result.value, 'Successfully selected the first video device.');
      });
  
      // 3. Call handleJoin with the necessary parameters
      browser.execute(
        function(room, user, role) {
          window.testApi.getState().handleJoin(room, user, role);
        },
        [ROOM_NAME, MOCK_USER_DATA, USER_ROLE]
      );
  
      // 4. Assert that the join was successful by checking the store's state
      browser.waitUntil(
          'execute',
          ['return window.testApi.getState().isRoomJoined === true'],
          {
            timeout: 20000,
            message: 'Failed to join the room within the time limit.'
          }
      );
      
      browser.assert.execute(
        'return window.testApi.getState().isRoomJoined', 
        [],
        'Verified from store state that the room was joined successfully.'
      );
  
      // 5. Collect WebRTC stats for performance analysis
      browser.perform(() => {
        browser.loadero.getWebRtcStats();
      });
  
      // 6. Keep the session active for the test duration
      browser.pause(300000); // Stay in the call for 5 minutes
    }
  };