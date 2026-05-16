const emailjs = require('@emailjs/nodejs');

// EmailJS Config — fill in your keys from the EmailJS dashboard
const EMAILJS_SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

const IS_DEV = process.env.NODE_ENV !== 'production';

// Returns true if all EmailJS keys look like they've been configured
const isEmailJSConfigured = () =>
  EMAILJS_SERVICE_ID &&
  EMAILJS_TEMPLATE_ID &&
  EMAILJS_PUBLIC_KEY &&
  EMAILJS_PRIVATE_KEY &&
  !EMAILJS_SERVICE_ID.startsWith('your_') &&
  !EMAILJS_PUBLIC_KEY.startsWith('your_');

/**
 * Sends an OTP email to the specified recipient using EmailJS.
 * In development mode with unconfigured keys, falls back to console logging.
 *
 * @param {string} toEmail   - Recipient email address
 * @param {string} toName    - Recipient full name
 * @param {string} otp       - The one-time password to send
 */
const sendOTPEmail = async (toEmail, toName, otp) => {
  // ── Development fallback ────────────────────────────────────────────────────
  if (!isEmailJSConfigured()) {
    if (IS_DEV) {
      console.log('\n─────────────────────────────────────────');
      console.log('📧  [DEV] EmailJS not configured — OTP logged instead');
      console.log(`    To:      ${toEmail}`);
      console.log(`    Name:    ${toName}`);
      console.log(`    OTP:     ${otp}`);
      console.log('─────────────────────────────────────────\n');
      return { success: true, dev: true };
    }
    throw new Error('Email service is not configured. Please contact support.');
  }

  // ── Production send ─────────────────────────────────────────────────────────
  try {
    const templateParams = {
      to_name:    toName,
      to_email:   toEmail,
      otp_code:   otp,
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
