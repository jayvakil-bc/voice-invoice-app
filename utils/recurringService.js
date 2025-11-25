const cron = require('node-cron');
const Invoice = require('../models/Invoice');

/**
 * Recurring Invoice Service
 * Handles automatic generation of recurring invoices using cron jobs
 */

/**
 * Calculate next invoice date based on frequency
 * @param {Date} currentDate - Current date
 * @param {string} frequency - Frequency type
 * @returns {Date} Next invoice date
 */
const calculateNextDate = (currentDate, frequency) => {
  const date = new Date(currentDate);
  
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'bi-weekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }
  
  return date;
};

/**
 * Generate invoice number based on parent invoice
 * @param {string} parentNumber - Parent invoice number
 * @param {number} count - Recurrence count
 * @returns {string} New invoice number
 */
const generateRecurringInvoiceNumber = (parentNumber, count) => {
  const baseParts = parentNumber.split('-');
  if (baseParts.length >= 2) {
    return `${baseParts[0]}-${String(parseInt(baseParts[1]) + count).padStart(4, '0')}`;
  }
  return `${parentNumber}-R${count}`;
};

/**
 * Create a new invoice from recurring template
 * @param {Object} parentInvoice - Original invoice to duplicate
 * @returns {Promise<Object>} New invoice
 */
const createRecurringInvoice = async (parentInvoice) => {
  try {
    // Count existing recurring invoices from this parent
    const recurringCount = await Invoice.countDocuments({
      parentInvoiceId: parentInvoice._id
    });

    // Generate new invoice number
    const newInvoiceNumber = generateRecurringInvoiceNumber(
      parentInvoice.invoiceNumber,
      recurringCount + 1
    );

    // Calculate new dates
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

    // Create new invoice
    const newInvoice = new Invoice({
      userId: parentInvoice.userId,
      invoiceNumber: newInvoiceNumber,
      date: today.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      from: parentInvoice.from,
      to: parentInvoice.to,
      items: parentInvoice.items,
      subtotal: parentInvoice.subtotal,
      tax: parentInvoice.tax,
      total: parentInvoice.total,
      notes: parentInvoice.notes,
      currency: parentInvoice.currency,
      paymentStatus: 'pending',
      parentInvoiceId: parentInvoice._id,
      isRecurring: false // Generated invoices are not themselves recurring
    });

    await newInvoice.save();

    // Update parent's last generated date and next invoice date
    const nextDate = calculateNextDate(
      today,
      parentInvoice.recurringSchedule.frequency
    );

    parentInvoice.recurringSchedule.lastGeneratedDate = today;
    parentInvoice.recurringSchedule.nextInvoiceDate = nextDate;
    await parentInvoice.save();

    console.log(`✅ Generated recurring invoice: ${newInvoiceNumber} from ${parentInvoice.invoiceNumber}`);
    return newInvoice;
  } catch (error) {
    console.error(`❌ Error generating recurring invoice:`, error);
    throw error;
  }
};

/**
 * Process all due recurring invoices
 * Called by cron job
 */
const processRecurringInvoices = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all recurring invoices that are due
    const dueInvoices = await Invoice.find({
      isRecurring: true,
      'recurringSchedule.nextInvoiceDate': { $lte: today },
      $or: [
        { 'recurringSchedule.endDate': { $exists: false } },
        { 'recurringSchedule.endDate': { $gte: today } }
      ]
    });

    console.log(`🔄 Processing ${dueInvoices.length} recurring invoices...`);

    const results = [];
    for (const invoice of dueInvoices) {
      try {
        const newInvoice = await createRecurringInvoice(invoice);
        results.push({ success: true, invoiceNumber: newInvoice.invoiceNumber });
      } catch (error) {
        results.push({ 
          success: false, 
          invoiceNumber: invoice.invoiceNumber, 
          error: error.message 
        });
      }
    }

    console.log(`✅ Processed ${results.filter(r => r.success).length}/${results.length} recurring invoices`);
    return results;
  } catch (error) {
    console.error('❌ Error in processRecurringInvoices:', error);
    throw error;
  }
};

/**
 * Start the cron job for recurring invoices
 * Runs daily at 2:00 AM
 */
const startRecurringInvoiceCron = () => {
  // Run every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🕒 Running scheduled recurring invoice generation...');
    try {
      await processRecurringInvoices();
    } catch (error) {
      console.error('❌ Cron job error:', error);
    }
  });

  console.log('✅ Recurring invoice cron job started (runs daily at 2:00 AM)');
};

/**
 * Setup recurring schedule for an invoice
 * @param {Object} invoice - Invoice to make recurring
 * @param {Object} schedule - Recurring schedule config
 * @returns {Promise<Object>} Updated invoice
 */
const setupRecurringInvoice = async (invoiceId, schedule) => {
  try {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Calculate first next invoice date
    const nextDate = calculateNextDate(new Date(), schedule.frequency);

    invoice.isRecurring = true;
    invoice.recurringSchedule = {
      frequency: schedule.frequency,
      nextInvoiceDate: nextDate,
      endDate: schedule.endDate || null,
      lastGeneratedDate: null
    };

    await invoice.save();
    console.log(`✅ Set up recurring schedule for invoice ${invoice.invoiceNumber}`);
    return invoice;
  } catch (error) {
    console.error('❌ Error setting up recurring invoice:', error);
    throw error;
  }
};

/**
 * Cancel recurring schedule for an invoice
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<Object>} Updated invoice
 */
const cancelRecurringInvoice = async (invoiceId) => {
  try {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    invoice.isRecurring = false;
    invoice.recurringSchedule = undefined;
    await invoice.save();

    console.log(`✅ Cancelled recurring schedule for invoice ${invoice.invoiceNumber}`);
    return invoice;
  } catch (error) {
    console.error('❌ Error cancelling recurring invoice:', error);
    throw error;
  }
};

module.exports = {
  calculateNextDate,
  createRecurringInvoice,
  processRecurringInvoices,
  startRecurringInvoiceCron,
  setupRecurringInvoice,
  cancelRecurringInvoice
};
