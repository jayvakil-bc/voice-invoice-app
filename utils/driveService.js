const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Google Drive Service
 * Save invoices and contracts directly to user's Google Drive
 */

/**
 * Create Google Drive client from user's OAuth tokens
 * @param {Object} user - User object with Google tokens
 * @returns {Object} Google Drive API client
 */
const getDriveClient = (user) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  // Set credentials from user's tokens
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

/**
 * Upload invoice PDF to Google Drive
 * @param {Object} user - User object with Google tokens
 * @param {string} pdfPath - Path to PDF file
 * @param {string} fileName - Name for the file in Drive
 * @param {string} folderId - Optional folder ID to save to
 * @returns {Promise<Object>} Drive file metadata
 */
const uploadInvoiceToDrive = async (user, pdfPath, fileName, folderId = null) => {
  try {
    const drive = getDriveClient(user);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF file not found');
    }

    const fileMetadata = {
      name: fileName,
      mimeType: 'application/pdf'
    };

    // Add to specific folder if provided
    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const media = {
      mimeType: 'application/pdf',
      body: fs.createReadStream(pdfPath)
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink'
    });

    console.log(`✅ Uploaded to Drive: ${fileName} (ID: ${response.data.id})`);
    return response.data;
  } catch (error) {
    console.error('❌ Error uploading to Drive:', error.message);
    throw error;
  }
};

/**
 * Create or get "Invoices" folder in Drive
 * @param {Object} user - User object with Google tokens
 * @returns {Promise<string>} Folder ID
 */
const getOrCreateInvoicesFolder = async (user) => {
  try {
    const drive = getDriveClient(user);

    // Search for existing "Invoices" folder
    const response = await drive.files.list({
      q: "name='Invoices' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    // Create folder if doesn't exist
    const folderMetadata = {
      name: 'Invoices',
      mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    });

    console.log('✅ Created "Invoices" folder in Drive');
    return folder.data.id;
  } catch (error) {
    console.error('❌ Error creating folder:', error.message);
    throw error;
  }
};

/**
 * Create or get "Contracts" folder in Drive
 * @param {Object} user - User object with Google tokens
 * @returns {Promise<string>} Folder ID
 */
const getOrCreateContractsFolder = async (user) => {
  try {
    const drive = getDriveClient(user);

    // Search for existing "Contracts" folder
    const response = await drive.files.list({
      q: "name='Contracts' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    // Create folder if doesn't exist
    const folderMetadata = {
      name: 'Contracts',
      mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    });

    console.log('✅ Created "Contracts" folder in Drive');
    return folder.data.id;
  } catch (error) {
    console.error('❌ Error creating folder:', error.message);
    throw error;
  }
};

/**
 * Save invoice to Google Drive
 * @param {Object} user - User object
 * @param {Object} invoice - Invoice object
 * @param {string} pdfPath - Path to generated PDF
 * @returns {Promise<Object>} Drive file info
 */
const saveInvoiceToDrive = async (user, invoice, pdfPath) => {
  try {
    const folderId = await getOrCreateInvoicesFolder(user);
    const fileName = `Invoice-${invoice.invoiceNumber}.pdf`;
    
    const driveFile = await uploadInvoiceToDrive(user, pdfPath, fileName, folderId);
    
    return {
      success: true,
      fileId: driveFile.id,
      fileName: driveFile.name,
      viewLink: driveFile.webViewLink,
      downloadLink: driveFile.webContentLink
    };
  } catch (error) {
    console.error('Error saving invoice to Drive:', error);
    throw error;
  }
};

/**
 * Save contract to Google Drive
 * @param {Object} user - User object
 * @param {Object} contract - Contract object
 * @param {string} pdfPath - Path to generated PDF
 * @returns {Promise<Object>} Drive file info
 */
const saveContractToDrive = async (user, contract, pdfPath) => {
  try {
    const folderId = await getOrCreateContractsFolder(user);
    const fileName = `Contract-${contract.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    
    const driveFile = await uploadInvoiceToDrive(user, pdfPath, fileName, folderId);
    
    return {
      success: true,
      fileId: driveFile.id,
      fileName: driveFile.name,
      viewLink: driveFile.webViewLink,
      downloadLink: driveFile.webContentLink
    };
  } catch (error) {
    console.error('Error saving contract to Drive:', error);
    throw error;
  }
};

/**
 * Check if user has Drive access
 * @param {Object} user - User object
 * @returns {boolean} True if user has tokens
 */
const hasDriveAccess = (user) => {
  return !!(user.googleAccessToken && user.googleRefreshToken);
};

module.exports = {
  uploadInvoiceToDrive,
  saveInvoiceToDrive,
  saveContractToDrive,
  getOrCreateInvoicesFolder,
  getOrCreateContractsFolder,
  hasDriveAccess
};
