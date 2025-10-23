// Loadero Nightwatch.js Test Script
module.exports = {
  "Mediasoup App Test with Zustand Store": (client) => {
    // Use Loadero's participantId to make each user unique
    const participantId = client.globals.participant.globalID;
    const MOCK_USER_DATA = {
      id: `loadero-user-${participantId}`,
      name: `Loadero Bot ${participantId}`,
    };

    const APP_URL = "https://video-streaming-v3.orz8okx-kyt.xyz";
    const ROOM_NAME = "662bc926-39a6-43e7-a9e3-d47adfe95214";
    const ROOM_2_NAME = "d5ca2ed7-a020-42ee-ad79-9fafa0accf8d";
    let USER_ROLE = "Admin"; // Added user role (Admin/Teacher/Student)

    // It's best practice to pass tokens as a variable from Loadero.
    // This example uses a hardcoded one for simplicity, based on your script.
    const TEACHER_ROOM1_TOKEN = "qZ7lAocGtox9Dk41YO56gPMnSlUtLE8Enn6Qb3Go";
    const STUDENT_ROOM1_TOKEN =
      "26259|djXw4kzrUKG6EKg743QZMvPIvXlnAV40OCa4OGMD";

    const TEACHER_ROOM2_TOKEN = "oi6DuTgmHssiKLL3tSRPNaw1Upf74FL3BP7htj08";
    const STUDENT_ROOM2_TOKEN =
      "26294|T9ehx1jFVmNeIlgDVKwnexXQwaQohm4BBU54roCG";

    let APP_URL_WITH_TOKEN = `${APP_URL}/room/${ROOM_NAME}?token=${TEACHER_ROOM1_TOKEN}`;
    if (participantId !== 0) {
      APP_URL_WITH_TOKEN = `${APP_URL}/room/${ROOM_NAME}?token=${STUDENT_ROOM1_TOKEN}`;
      USER_ROLE = "Student";
      if (participantId > 4) {
        APP_URL_WITH_TOKEN = `${APP_URL}/room/${ROOM_2_NAME}?token=${STUDENT_ROOM2_TOKEN}`;
        USER_ROLE = "Student";
        if (participantId === 5) {
          APP_URL_WITH_TOKEN = `${APP_URL}/room/${ROOM_2_NAME}?token=${TEACHER_ROOM2_TOKEN}`;
          USER_ROLE = "Teacher";
        }
      }
    }

    client.url(APP_URL_WITH_TOKEN).waitForElementVisible("body", 10000);

    // 1. Wait until the test API is available on the window object
    // FIX: Replaced unsupported wait commands with a manual polling mechanism.
    client.perform(function (done) {
      const startTime = new Date().getTime();
      const pollForApi = function () {
        if (new Date().getTime() - startTime > 15000) {
          client.assert.fail(
            "Test API (window.testApi) was not found on the page."
          );
          done();
        } else {
          client.execute(
            'return window.testApi && typeof window.testApi.getState === "function"',
            [],
            function (result) {
              if (result.value) {
                done();
              } else {
                client.pause(500, pollForApi);
              }
            }
          );
        }
      };
      pollForApi();
    });

    // 2. Wait for device loading to finish and select the first camera
    if (USER_ROLE === "Student") {
      client.executeAsync(
        function (done) {
          const api = window.testApi;
          let unsubscribe;

          const timeoutId = setTimeout(() => {
            if (unsubscribe) unsubscribe();
            console.error(
              "Loadero Log: Timed out waiting for devices to become available."
            );
            done(false); // Signal failure
          }, 25000); // 25s timeout

          unsubscribe = api.subscribe((state) => {
            console.log(
              `Loadero Log: Checking device state... Loading: ${state.isDeviceLoading}, Devices found: ${state.videoDevices.length}`
            );
            if (
              state.isDeviceLoading === false &&
              state.videoDevices.length > 0
            ) {
              // FIX: Unsubscribe BEFORE changing state to prevent an infinite loop.
              unsubscribe();
              clearTimeout(timeoutId);

              const firstDeviceId = state.videoDevices[0].deviceId;
              console.log(
                "Loadero Log: Devices loaded. Selecting device:",
                firstDeviceId
              );

              api.getState().setSelectedDevice(firstDeviceId);

              done(true); // Signal success
            }
          });
        },
        [],
        function (result) {
          client.assert.ok(
            result.value,
            "Successfully selected the first video device."
          );
        }
      );
    }

    // 3. Join the room
    client.execute(
      function (roomName, userData, peerId, live_role) {
        window.testApi
          .getState()
          .handleJoin(roomName, userData, peerId, live_role);
      },
      [
        ROOM_NAME,
        MOCK_USER_DATA,
        `peer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        USER_ROLE,
      ]
    );

    // 4. Assert that the join was successful
    // FIX: Replaced unsupported wait commands with a manual polling mechanism.
    client.perform(function (done) {
      const startTime = new Date().getTime();
      const pollForJoin = function () {
        if (new Date().getTime() - startTime > 20000) {
          client.assert.fail("Failed to join the room within the time limit.");
          done();
        } else {
          client.execute(
            "return window.testApi.getState().isRoomJoined === true",
            [],
            function (result) {
              if (result.value) {
                done();
              } else {
                client.pause(500, pollForJoin);
              }
            }
          );
        }
      };
      pollForJoin();
    });

    client.execute(
      "return window.testApi.getState().isRoomJoined",
      [],
      function (result) {
        client.assert.equal(
          result.value,
          true,
          "Verified from store state that the room was joined successfully."
        );
      }
    );

    // 5. Collect WebRTC stats for performance analysis
    // FIX: Corrected the Loadero command syntax. Older environments use this direct camelCase command.
    //client.loaderoGetWebRtcStats();

    // 6. Keep the session active for the test duration
    // Stay in the call for 100 minutes
    client.pause(6000000);

    // 7. End the test session
    client.end();
  },
};
