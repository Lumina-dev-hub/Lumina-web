const emailjs = require('@emailjs/nodejs');

// EmailJS Config — fill in your keys from the EmailJS dashboard
const EMAILJS_SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

/**
 * Sends an OTP email to the specified recipient using EmailJS.
 *
 * @param {string} toEmail   - Recipient email address
 * @param {string} toName    - Recipient full name
 * @param {string} otp       - The one-time password to send
 */
const sendOTPEmail = async (toEmail, toName, otp) => {
  try {
    const templateParams = {
      to_name:  toName,
      to_email: toEmail,
      otp_code: otp,
      // You can add any extra variables your EmailJS template uses here,
      // e.g. app_name: 'Lumina AI', expires_in: '10 minutes'
      app_name:   'Lumina AI',
      expires_in: '10 minutes',
    };

    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams,
      {
        publicKey:  EMAILJS_PUBLIC_KEY,
        privateKey: EMAILJS_PRIVATE_KEY,
      }
    );

    console.log(`[EmailJS] OTP sent to ${toEmail} — status: ${response.status}`);
    return { success: true };
  } catch (error) {
    console.error('[EmailJS] Failed to send OTP email:', error?.text || error?.message || error);
    throw new Error('Failed to send OTP email. Please try again.');
  }
};

module.exports = { sendOTPEmail };
