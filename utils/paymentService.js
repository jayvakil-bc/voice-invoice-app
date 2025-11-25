/**
 * Payment Service for Stripe integration
 * Handles payment link generation and payment status tracking
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
 * Create a Stripe payment link for an invoice
 * @param {Object} invoice - Invoice object with amount and details
 * @returns {Promise<string>} Stripe payment link URL
 */
const createPaymentLink = async (invoice) => {
  const stripeClient = getStripeClient();
  
  if (!stripeClient) {
    throw new Error('Stripe not configured. Please add STRIPE_SECRET_KEY to .env');
  }

  try {
    const currency = (invoice.currency || 'USD').toLowerCase();
    const amount = Math.round(invoice.total * 100); // Convert to cents

    // Create a payment link
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
      }
    });

    console.log(`✅ Created Stripe payment link for invoice ${invoice.invoiceNumber}`);
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
  createPaymentLink,
  handlePaymentWebhook,
  getPaymentStatus,
  testStripeConfig
};
