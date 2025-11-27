const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

/**
 * Email Service for sending invoices and contracts
 * Uses nodemailer with SMTP configuration from environment variables
 */

// Create transporter with SMTP settings
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD // Support both names
    }
  };

  // If no SMTP configured, log warning and return null
  if (!config.auth.user || !config.auth.pass) {
    console.warn('⚠️  SMTP credentials not configured. Email sending will be disabled.');
    console.warn('Add SMTP_USER and SMTP_PASS to .env to enable email features.');
    return null;
  }

  return nodemailer.createTransport(config);
};

/**
 * Send invoice via email with PDF attachment
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {Object} options.invoice - Invoice object with details
 * @param {string} options.pdfPath - Path to PDF file
 * @param {string} options.paymentLink - Optional Stripe payment link
 * @returns {Promise<Object>} Email send result
 */
const sendInvoiceEmail = async ({ to, invoice, pdfPath, paymentLink = null }) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    throw new Error('Email service not configured. Please add SMTP credentials to .env');
  }

  // Check if PDF exists
  if (!fs.existsSync(pdfPath)) {
    throw new Error('PDF file not found');
  }

  // Build email content
  const invoiceNumber = invoice.invoiceNumber || 'N/A';
  const total = invoice.total?.toFixed(2) || '0.00';
  const currency = invoice.currency || 'USD';
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A';

  let htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Invoice ${invoiceNumber}</h2>
      
      <p>Hello,</p>
      
      <p>Please find attached your invoice for the following:</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;"><strong>Invoice Number:</strong></td>
            <td style="text-align: right;">${invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
            <td style="text-align: right;">${dueDate}</td>
          </tr>
          <tr style="border-top: 2px solid #e5e7eb;">
            <td style="padding: 12px 0;"><strong>Total Amount:</strong></td>
            <td style="text-align: right; font-size: 18px; color: #2563eb;"><strong>${currency} ${total}</strong></td>
          </tr>
        </table>
      </div>
  `;

  // Add payment link if provided
  if (paymentLink) {
    htmlContent += `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${paymentLink}" 
           style="background: #2563eb; color: white; padding: 12px 30px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;
                  font-weight: bold;">
          Pay Now
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Click the button above to pay securely with Stripe.</p>
    `;
  }

  htmlContent += `
      <p>If you have any questions, please don't hesitate to contact us.</p>
      
      <p>Thank you for your business!</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  `;

  // Email options
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'Invoice System'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `Invoice ${invoiceNumber} - ${currency} ${total}`,
    html: htmlContent,
    attachments: [
      {
        filename: `Invoice-${invoiceNumber}.pdf`,
        path: pdfPath
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Invoice email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending invoice email:', error);
    throw error;
  }
};

/**
 * Send contract via email with PDF attachment
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {Object} options.contract - Contract object with details
 * @param {string} options.pdfPath - Path to PDF file
 * @returns {Promise<Object>} Email send result
 */
const sendContractEmail = async ({ to, contract, pdfPath }) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    throw new Error('Email service not configured. Please add SMTP credentials to .env');
  }

  // Check if PDF exists
  if (!fs.existsSync(pdfPath)) {
    throw new Error('PDF file not found');
  }

  // Build email content
  const contractTitle = contract.title || 'Service Agreement';
  const serviceProvider = contract.parties?.serviceProvider?.name || 'N/A';
  const client = contract.parties?.client?.name || 'N/A';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">${contractTitle}</h2>
      
      <p>Hello,</p>
      
      <p>Please find attached the contract for your review:</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;"><strong>Service Provider:</strong></td>
            <td style="text-align: right;">${serviceProvider}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Client:</strong></td>
            <td style="text-align: right;">${client}</td>
          </tr>
        </table>
      </div>
      
      <p>Please review the contract carefully. If you have any questions or concerns, feel free to reach out.</p>
      
      <p>Thank you!</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  `;

  // Email options
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'Contract System'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `Contract: ${contractTitle}`,
    html: htmlContent,
    attachments: [
      {
        filename: `${contractTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`,
        path: pdfPath
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Contract email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending contract email:', error);
    throw error;
  }
};

/**
 * Test email configuration
 * @returns {Promise<boolean>} True if SMTP is configured and working
 */
const testEmailConfig = async () => {
  const transporter = createTransporter();
  
  if (!transporter) {
    return false;
  }

  try {
    await transporter.verify();
    console.log('✅ SMTP configuration is valid');
    return true;
  } catch (error) {
    console.error('❌ SMTP configuration error:', error.message);
    return false;
  }
};

/**
 * Send payment confirmation email after successful Stripe payment
 * @param {Object} options - Email options
 * @param {string} options.to - User's email
 * @param {string} options.invoiceNumber - Invoice number
 * @param {number} options.amount - Payment amount
 * @param {string} options.currency - Currency code
 * @param {string} options.customerName - Customer name
 * @param {Date} options.paymentDate - Payment date
 * @returns {Promise<Object>} Email send result
 */
const sendPaymentConfirmationEmail = async ({ 
  to, 
  invoiceNumber, 
  amount, 
  currency = 'USD', 
  customerName,
  paymentDate 
}) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    throw new Error('Email service not configured. Please add SMTP credentials to .env');
  }

  const formattedAmount = amount?.toFixed(2) || '0.00';
  const formattedDate = paymentDate ? new Date(paymentDate).toLocaleString() : new Date().toLocaleString();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">💰 Payment Received!</h1>
      </div>
      
      <div style="background: #f3f4f6; padding: 30px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #1f2937;">Great news! A payment has been received for your invoice.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;"><strong>Invoice Number:</strong></td>
              <td style="text-align: right; color: #1f2937;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;"><strong>Customer:</strong></td>
              <td style="text-align: right; color: #1f2937;">${customerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;"><strong>Payment Date:</strong></td>
              <td style="text-align: right; color: #1f2937;">${formattedDate}</td>
            </tr>
            <tr style="border-top: 2px solid #e5e7eb;">
              <td style="padding: 12px 0; color: #1f2937;"><strong>Amount Paid:</strong></td>
              <td style="text-align: right; font-size: 24px; color: #10b981;"><strong>${currency} ${formattedAmount}</strong></td>
            </tr>
          </table>
        </div>
        
        <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            ✅ The invoice has been automatically marked as <strong>PAID</strong> in your dashboard.
          </p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          You can view the full invoice details in your dashboard at any time.
        </p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        This is an automated notification from your Voice Invoice system.
      </p>
    </div>
  `;

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'Voice Invoice'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `🎉 Payment Received - Invoice ${invoiceNumber}`,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Payment confirmation email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending payment confirmation email:', error);
    throw error;
  }
};

module.exports = {
  sendInvoiceEmail,
  sendContractEmail,
  testEmailConfig,
  sendPaymentConfirmationEmail
};

