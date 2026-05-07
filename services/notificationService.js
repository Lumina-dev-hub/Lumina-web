const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
let expo = new Expo();

/**
 * Sends a push notification to a specific user
 * @param {string} pushToken - The recipient's Expo push token
 * @param {string} title - Notification title
 * @param {string} body - Notification message body
 * @param {Object} data - Optional data payload
 */
const sendPushNotification = async (pushToken, title, body, data = {}) => {
  // Check that all your push tokens appear to be valid Expo push tokens
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Push token ${pushToken} is not a valid Expo push token`);
    return;
  }

  // Create the messages that you want to send to clients
  const messages = [{
    to: pushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  }];

  // The Expo push notification service accepts batches of notifications.
  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];

  (async () => {
    // Send the chunks to the Expo push notification service.
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log('Push ticket:', ticketChunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push chunk:', error);
      }
    }
  })();

  // Note: For a production app, you should check the receipts later 
  // to handle expired tokens or errors.
};

module.exports = {
  sendPushNotification,
};
