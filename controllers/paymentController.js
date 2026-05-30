const axios = require('axios');
const User = require('../models/User');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Plan prices in Kobo (Paystack uses smallest currency unit)
const PLAN_PRICES = {
  Pro: 300000,      // ₦3,000
  Ultimate: 500000, // ₦5,000
};

// @desc    Initialize a Paystack transaction
// @route   POST /api/payments/initialize
// @access  Private
exports.initializePayment = async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user;

    if (!PLAN_PRICES[plan]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected. Only Pro and Ultimate require payment.',
      });
    }

    const amount = PLAN_PRICES[plan];
    const email = user.email;
    const reference = `lumina_${plan.toLowerCase()}_${user._id}_${Date.now()}`;

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount,
        reference,
        metadata: {
          userId: user._id.toString(),
          plan,
          custom_fields: [
            {
              display_name: 'Plan',
              variable_name: 'plan',
              value: plan,
            },
            {
              display_name: 'User ID',
              variable_name: 'user_id',
              value: user._id.toString(),
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { authorization_url, access_code, reference: txRef } = response.data.data;

    res.status(200).json({
      success: true,
      data: {
        authorization_url,
        access_code,
        reference: txRef,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      },
    });
  } catch (error) {
    console.error('Paystack init error:', error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment. Please try again.',
    });
  }
};

// @desc    Verify a Paystack transaction and upgrade user plan
// @route   GET /api/payments/verify/:reference
// @access  Private
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = response.data.data;

    if (data.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Payment was not successful. Please try again.',
      });
    }

    // Extract plan from metadata
    const plan = data.metadata?.plan;
    const userId = data.metadata?.userId;

    if (!plan || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment metadata.',
      });
    }

    // Upgrade user subscription plan with 30-day expiry
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        'settings.subscriptionPlan': plan,
        'settings.subscriptionStartedAt': now,
        'settings.subscriptionExpiresAt': expiresAt,
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully upgraded to ${plan} plan!`,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Paystack verify error:', error?.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment. Please contact support.',
    });
  }
};
