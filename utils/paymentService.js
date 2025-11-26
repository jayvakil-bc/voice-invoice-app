/**
 * Payment Service for Stripe Connect integration
 * Each user connects their own Stripe account to receive payments directly
 */

// Initialize Stripe lazily to avoid errors when API key is not set
let stripe = null;

const getStripeClient = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

/**
 * Create a Stripe Connect account link for onboarding
 * @param {string} userId - User ID from database
 * @param {string} email - User's email
 * @returns {Promise<Object>} Account link URL and account ID
 */
const createConnectAccount = async (userId, email) => {
  const stripeClient = getStripeClient();
  
  if (!stripeClient) {
    throw new Error('Stripe not configured. Please add STRIPE_SECRET_KEY to .env');
  }

  try {
    // Create a connected account
    const account = await stripeClient.accounts.create({
      type: 'express', // Express account = easy onboarding
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        userId: userId
      }
    });

    // Create account link for onboarding
    const accountLink = await stripeClient.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings?stripe_refresh=true`,
      return_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings?stripe_setup=success`,
      type: 'account_onboarding',
    });

    console.log(`✅ Created Stripe Connect account for user ${userId}`);
    return {
      accountId: account.id,
      onboardingUrl: accountLink.url
    };
  } catch (error) {
    console.error('❌ Error creating Stripe Connect account:', error);
    throw error;
  }
};

/**
 * Get account link for existing account (if onboarding incomplete)
 * @param {string} accountId - Stripe account ID
 * @returns {Promise<string>} Onboarding URL
 */
const getAccountLink = async (accountId) => {
  const stripeClient = getStripeClient();
  
  if (!stripeClient) {
    throw new Error('Stripe not configured');
  }

  try {
    const accountLink = await stripeClient.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings?stripe_refresh=true`,
      return_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings?stripe_setup=success`,
      type: 'account_onboarding',
    });

    return accountLink.url;
  } catch (error) {
    console.error('Error creating account link:', error);
    throw error;
  }
};

/**
 * Check if connected account is fully onboarded
 * @param {string} accountId - Stripe account ID
 * @returns {Promise<Object>} Account status
 */
const getAccountStatus = async (accountId) => {
  const stripeClient = getStripeClient();
  
  if (!stripeClient) {
    throw new Error('Stripe not configured');
  }

  try {
    const account = await stripeClient.accounts.retrieve(accountId);
    
    return {
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      requirements: account.requirements
    };
  } catch (error) {
    console.error('Error retrieving account status:', error);
    throw error;
  }
};

/**
 * Create a Stripe payment link for an invoice (using connected account)
 * @param {Object} invoice - Invoice object with amount and details
 * @param {string} connectedAccountId - User's Stripe Connect account ID
 * @returns {Promise<string>} Stripe payment link URL
 */
const createPaymentLink = async (invoice, connectedAccountId) => {
  const stripeClient = getStripeClient();
  
  if (!stripeClient) {
    throw new Error('Stripe not configured. Please add STRIPE_SECRET_KEY to .env');
  }

  if (!connectedAccountId) {
    throw new Error('User has not connected their Stripe account. Please complete Stripe setup in Settings.');
  }

  try {
    const currency = (invoice.currency || 'USD').toLowerCase();
    const amount = Math.round(invoice.total * 100); // Convert to cents

    // Create a payment link on the connected account
    const paymentLink = await stripeClient.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
              description: invoice.items?.map(item => 
                `${item.description} (${item.quantity}x ${currency.toUpperCase()} ${item.rate})`
              ).join(', ').substring(0, 500) || 'Invoice payment'
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoiceId: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        userId: invoice.userId.toString()
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.APP_URL || 'http://localhost:3000'}/invoice-success?invoice=${invoice.invoiceNumber}`
        }
      },
      // Apply fee (optional - you can take a platform fee)
      application_fee_amount: Math.round(amount * 0.01), // 1% platform fee (optional)
    }, {
      stripeAccount: connectedAccountId // Create on connected account
    });

    console.log(`✅ Created Stripe payment link for invoice ${invoice.invoiceNumber} on account ${connectedAccountId}`);
    return paymentLink.url;
  } catch (error) {
    console.error('❌ Error creating payment link:', error);
    throw error;
  }
};

/**
 * Create a Stripe webhook to handle payment events
 * Call this endpoint from Stripe webhook configuration
 * @param {Object} event - Stripe webhook event
 * @returns {Promise<Object>} Processing result
 */
const handlePaymentWebhook = async (event) => {
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const invoiceId = session.metadata?.invoiceId;
      
      if (invoiceId) {
        console.log(`✅ Payment successful for invoice ${session.metadata.invoiceNumber}`);
        // Return invoice ID so controller can update status
        return {
          success: true,
          invoiceId: invoiceId,
          status: 'paid',
          paymentDate: new Date()
        };
      }
      break;
      
    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object;
      console.log(`❌ Payment failed for intent ${failedIntent.id}`);
      return {
        success: false,
        error: failedIntent.last_payment_error?.message || 'Payment failed'
      };
      
    default:
      console.log(`Unhandled webhook event type: ${event.type}`);
  }
  
  return { success: true, message: 'Event processed' };
};

/**
 * Retrieve payment status from Stripe
 * @param {string} paymentLinkId - Stripe payment link ID
 * @returns {Promise<Object>} Payment status
 */
const getPaymentStatus = async (paymentLinkId) => {
  const stripeClient = getStripeClient();
  
  if (!stripeClient) {
    throw new Error('Stripe not configured');
  }

  try {
    const paymentLink = await stripeClient.paymentLinks.retrieve(paymentLinkId);
    return {
      active: paymentLink.active,
      url: paymentLink.url
    };
  } catch (error) {
    console.error('Error retrieving payment status:', error);
    throw error;
  }
};

/**
 * Test Stripe configuration
 * @returns {Promise<boolean>} True if Stripe is configured
 */
const testStripeConfig = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  Stripe not configured. Add STRIPE_SECRET_KEY to .env');
    return false;
  }
  
  const keyPrefix = process.env.STRIPE_SECRET_KEY.substring(0, 7);
  if (keyPrefix === 'sk_test') {
    console.log('✅ Stripe configured (TEST mode)');
  } else if (keyPrefix === 'sk_live') {
    console.log('✅ Stripe configured (LIVE mode)');
  } else {
    console.warn('⚠️  Invalid Stripe key format');
    return false;
  }
  
  return true;
};

module.exports = {
  createConnectAccount,
  getAccountLink,
  getAccountStatus,
  createPaymentLink,
  handlePaymentWebhook,
  getPaymentStatus,
  testStripeConfig
};
