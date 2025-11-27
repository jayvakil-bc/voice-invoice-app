const express = require('express');
const contractController = require('../controllers/contractController');
const { requireAuth } = require('../middleware/auth');
const { Contract } = require('../models');
const PDFDocument = require('pdfkit');

const router = express.Router();

// Core contract routes
router.post('/api/contracts/generate', contractController.generateContract);
router.get('/api/contracts/user/:userId', contractController.getContractsByUser);
router.get('/api/contracts/:id', contractController.getContract);
router.put('/api/contracts/:id', contractController.updateContract);
router.delete('/api/contracts/:id', contractController.deleteContract);

// Signature routes
router.post('/api/contracts/:id/sign', requireAuth, contractController.addSignature);
router.delete('/api/contracts/:id/sign/:party', requireAuth, contractController.removeSignature);

// Shareable link routes
router.post('/api/contracts/:id/share', requireAuth, contractController.generateShareableLink);
router.get('/api/contracts/shared/:token', contractController.getSharedContract);
router.post('/api/contracts/shared/:token/sign', contractController.signSharedContract);

// PDF routes
router.get('/api/contracts/:id/pdf', contractController.generateContractPDF);

// Google Drive integration
router.post('/api/contracts/:id/save-to-drive', requireAuth, contractController.saveToGoogleDrive);

// Frontend view route
router.get('/contract/view/:token', (req, res) => {
    res.sendFile('contract-view.html', { root: 'public' });
});

// Compatibility aliases
router.get('/api/contracts', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const contracts = await Contract.find({ userId }).sort({ createdAt: -1 });
        res.json(contracts);
    } catch (error) {
        console.error('[Contracts Alias] Error:', error);
        res.status(500).json({ error: 'Failed to fetch contracts' });
    }
});

router.post('/api/generate-contract', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        req.body.userId = userId;
        
        console.log('[Contract Alias] Generating contract for user:', userId);
        
        // Forward to main controller
        return contractController.generateContract(req, res);
    } catch (error) {
        console.error('[Contract Alias] Error:', error);
        res.status(500).json({ error: 'Failed to generate contract' });
    }
});

router.get('/api/contracts/:id/download', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const contractId = req.params.id;
        
        console.log(`[Contract Download] Fetching contract ${contractId} for user ${userId}`);
        
        const contract = await Contract.findOne({ _id: contractId, userId });
        
        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        const doc = new PDFDocument({ 
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Contract_${contract.contractTitle.replace(/\s+/g, '_')}.pdf"`);
        
        doc.pipe(res);
        
        doc.fontSize(20).text(contract.contractTitle, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Effective Date: ${contract.effectiveDate}`, { align: 'center' });
        doc.moveDown(2);
        
        // Parties
        doc.fontSize(14).text('PARTIES', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        doc.text(`Service Provider: ${contract.parties.serviceProvider.name}`);
        if (contract.parties.serviceProvider.address && contract.parties.serviceProvider.address !== 'To be determined') {
            doc.text(`Address: ${contract.parties.serviceProvider.address}`);
        }
        if (contract.parties.serviceProvider.email && contract.parties.serviceProvider.email !== 'To be determined') {
            doc.text(`Email: ${contract.parties.serviceProvider.email}`);
        }
        if (contract.parties.serviceProvider.phone && contract.parties.serviceProvider.phone !== 'To be determined') {
            doc.text(`Phone: ${contract.parties.serviceProvider.phone}`);
        }
        doc.moveDown();
        
        doc.text(`Client: ${contract.parties.client.name}`);
        if (contract.parties.client.address && contract.parties.client.address !== 'To be determined') {
            doc.text(`Address: ${contract.parties.client.address}`);
        }
        if (contract.parties.client.email && contract.parties.client.email !== 'To be determined') {
            doc.text(`Email: ${contract.parties.client.email}`);
        }
        if (contract.parties.client.phone && contract.parties.client.phone !== 'To be determined') {
            doc.text(`Phone: ${contract.parties.client.phone}`);
        }
        doc.moveDown(2);
        
        // Sections
        if (contract.sections && contract.sections.length > 0) {
            contract.sections.forEach((section, index) => {
                doc.fontSize(14).text(section.title, { underline: true });
                doc.moveDown(0.5);
                doc.fontSize(11).text(section.content, { align: 'justify' });
                doc.moveDown(1.5);
                
                if (index < contract.sections.length - 1 && doc.y > 650) {
                    doc.addPage();
                }
            });
        }
        
        doc.end();
        
        console.log(`[Contract Download] PDF generated successfully for contract ${contractId}`);
        
    } catch (error) {
        console.error('[Contract Download] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
        }
    }
});

module.exports = router;
