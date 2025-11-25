const crypto = require('crypto');
const { Contract, User } = require('../models');
const { getOpenAIClient } = require('../utils/openai');
const { learnFromContract } = require('../utils/aiLearning');
const { getContractGenerationPrompt } = require('../utils/contractPrompts');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { saveContractToDrive, hasDriveAccess } = require('../utils/driveService');

const generateContract = async (req, res) => {
    try {
        const { transcript, userId } = req.body;
        
        console.log('[Contract] Generating contract for user:', userId);
        
        const user = await User.findById(userId);
        const businessContext = user?.businessContext || null;
        
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0];
        
        const openai = getOpenAIClient();
        const prompt = getContractGenerationPrompt(transcript, todayFormatted, businessContext);
        
        if (businessContext && businessContext.confidenceScore >= 30) {
            console.log('[Contract] 🧠 Using AI-learned business context (confidence:', businessContext.confidenceScore + ')');
        }
        
        console.log('[Contract] Sending to OpenAI...');

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }    
        });

        const contractData = JSON.parse(completion.choices[0].message.content);
        
        if (!contractData.effectiveDate) {
            contractData.effectiveDate = todayFormatted;
        }
        
        // Auto-fill service provider from user's business info
        let serviceProviderInfo = {
            name: 'Service Provider',
            address: 'To be determined',
            email: 'To be determined',
            phone: 'To be determined'
        };
        
        if (user && user.businessInfo && user.businessInfo.setupCompleted) {
            console.log('[Contract] Auto-filling service provider from business info');
            serviceProviderInfo = {
                name: user.businessInfo.businessName,
                address: user.businessInfo.businessAddress,
                email: user.businessInfo.businessEmail,
                phone: user.businessInfo.businessPhone
            };
        }
        
        const contractToSave = {
            userId,
            originalTranscript: transcript,
            contractTitle: contractData.title || 'Service Agreement',
            effectiveDate: contractData.effectiveDate,
            parties: contractData.parties || {
                serviceProvider: serviceProviderInfo,
                client: {
                    name: 'Client',
                    signingAuthority: '',
                    address: 'To be determined',
                    email: 'To be determined',
                    phone: 'To be determined'
                }
            },
            sections: contractData.sections || []
        };
        
        if (contractToSave.parties.serviceProvider.name === 'Service Provider' && 
            user && user.businessInfo && user.businessInfo.setupCompleted) {
            contractToSave.parties.serviceProvider = serviceProviderInfo;
        }
        
        const contract = await Contract.create(contractToSave);
        
        console.log('[Contract] Contract created:', contract._id);
        
        // AI Learning Agent - Learn from this contract
        learnFromContract(userId, transcript, contractToSave).catch(err => {
            console.error('[AI Learning] Error:', err);
        });
        
        res.json({ 
            contractId: contract._id, 
            contractData: {
                contractTitle: contract.contractTitle,
                effectiveDate: contract.effectiveDate,
                parties: contract.parties,
                sections: contract.sections
            }
        });
        
    } catch (error) {
        console.error('[Contract] Generation error:', error);
        res.status(500).json({ error: 'Failed to generate contract' });
    }
};

const getContractsByUser = async (req, res) => {
    try {
        const contracts = await Contract.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(contracts);
    } catch (error) {
        console.error('[Contract] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch contracts' });
    }
};

const getContract = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        res.json(contract);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch contract' });
    }
};

const updateContract = async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        
        Object.assign(contract, req.body);
        await contract.save();
        
        res.json(contract);
    } catch (error) {
        console.error('[Contract] Update error:', error);
        res.status(500).json({ error: 'Failed to update contract' });
    }
};

const deleteContract = async (req, res) => {
    try {
        await Contract.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete contract' });
    }
};

const addSignature = async (req, res) => {
    try {
        const { party, signatureData, signedBy } = req.body;
        
        if (!party || !signatureData || !signedBy) {
            return res.status(400).json({ error: 'Missing required fields: party, signatureData, signedBy' });
        }
        
        if (party !== 'serviceProvider' && party !== 'client') {
            return res.status(400).json({ error: 'Party must be either "serviceProvider" or "client"' });
        }
        
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        
        if (!contract.signatures) contract.signatures = {};
        
        contract.signatures[party] = {
            signatureData,
            signedBy,
            signedAt: new Date(),
            ipAddress: req.ip || req.connection.remoteAddress
        };
        
        const serviceProviderSigned = contract.signatures.serviceProvider?.signatureData;
        const clientSigned = contract.signatures.client?.signatureData;
        
        if (serviceProviderSigned && clientSigned) {
            contract.status = 'fully_signed';
        } else if (serviceProviderSigned || clientSigned) {
            contract.status = 'partially_signed';
        }
        
        await contract.save();
        
        console.log(`[Contract] Signature added for ${party} on contract:`, contract._id);
        
        res.json({ 
            success: true, 
            status: contract.status,
            signatures: contract.signatures
        });
        
    } catch (error) {
        console.error('[Contract] Signature error:', error);
        res.status(500).json({ error: 'Failed to add signature' });
    }
};

const removeSignature = async (req, res) => {
    try {
        const { party } = req.params;
        
        if (party !== 'serviceProvider' && party !== 'client') {
            return res.status(400).json({ error: 'Party must be either "serviceProvider" or "client"' });
        }
        
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        
        if (contract.signatures && contract.signatures[party]) {
            contract.signatures[party] = undefined;
        }
        
        const serviceProviderSigned = contract.signatures?.serviceProvider?.signatureData;
        const clientSigned = contract.signatures?.client?.signatureData;
        
        if (!serviceProviderSigned && !clientSigned) {
            contract.status = 'draft';
        } else if (serviceProviderSigned || clientSigned) {
            contract.status = 'partially_signed';
        }
        
        await contract.save();
        
        console.log(`[Contract] Signature removed for ${party} on contract:`, contract._id);
        
        res.json({ 
            success: true, 
            status: contract.status
        });
        
    } catch (error) {
        console.error('[Contract] Remove signature error:', error);
        res.status(500).json({ error: 'Failed to remove signature' });
    }
};

const generateShareableLink = async (req, res) => {
    try {
        console.log('[Contract] Share request for contract:', req.params.id);
        
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            console.log('[Contract] Contract not found:', req.params.id);
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        console.log('[Contract] Contract found, user:', req.user._id, 'owner:', contract.userId);
        
        if (contract.userId.toString() !== req.user._id.toString()) {
            console.log('[Contract] Unauthorized access attempt');
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const token = crypto.randomBytes(32).toString('hex');
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        contract.shareableLink = {
            token,
            createdAt: new Date(),
            expiresAt,
            accessCount: 0
        };
        
        await contract.save();
        
        const PORT = process.env.PORT || 3000;
        const baseUrl = process.env.CLIENT_URL || `http://localhost:${PORT}`;
        const shareableUrl = `${baseUrl}/contract/view/${token}`;
        
        console.log('[Contract] Shareable link generated for contract:', contract._id);
        
        res.json({
            success: true,
            shareableUrl,
            expiresAt
        });
        
    } catch (error) {
        console.error('[Contract] Share link error:', error);
        res.status(500).json({ error: 'Failed to generate shareable link' });
    }
};

const getSharedContract = async (req, res) => {
    try {
        console.log('[Contract] Loading shared contract with token:', req.params.token);
        
        const contract = await Contract.findOne({ 'shareableLink.token': req.params.token });
        
        if (!contract) {
            console.log('[Contract] Contract not found for token:', req.params.token);
            return res.status(404).json({ error: 'Contract not found or link expired' });
        }
        
        console.log('[Contract] Contract found:', contract._id);
        
        if (contract.shareableLink.expiresAt < new Date()) {
            console.log('[Contract] Link expired for contract:', contract._id);
            return res.status(410).json({ error: 'This link has expired' });
        }
        
        contract.shareableLink.accessCount += 1;
        await contract.save();
        
        console.log('[Contract] Shared contract accessed:', contract._id, 'Count:', contract.shareableLink.accessCount);
        
        res.json({
            contractId: contract._id,
            contractTitle: contract.contractTitle,
            effectiveDate: contract.effectiveDate,
            parties: contract.parties,
            sections: contract.sections,
            signatures: contract.signatures,
            status: contract.status
        });
        
    } catch (error) {
        console.error('[Contract] Shared contract error:', error);
        res.status(500).json({ error: 'Failed to load contract' });
    }
};

const signSharedContract = async (req, res) => {
    try {
        const { party, signatureData, signedBy } = req.body;
        
        if (!party || !signatureData || !signedBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (party !== 'client') {
            return res.status(400).json({ error: 'Only client can sign via shareable link' });
        }
        
        const contract = await Contract.findOne({ 'shareableLink.token': req.params.token });
        
        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        if (contract.shareableLink.expiresAt < new Date()) {
            return res.status(410).json({ error: 'This link has expired' });
        }
        
        if (!contract.signatures) contract.signatures = {};
        
        contract.signatures.client = {
            signatureData,
            signedBy,
            signedAt: new Date(),
            ipAddress: req.ip || req.connection.remoteAddress
        };
        
        const serviceProviderSigned = contract.signatures.serviceProvider?.signatureData;
        const clientSigned = contract.signatures.client?.signatureData;
        
        if (serviceProviderSigned && clientSigned) {
            contract.status = 'fully_signed';
        } else if (clientSigned) {
            contract.status = 'partially_signed';
        }
        
        await contract.save();
        
        console.log('[Contract] Client signature added via shared link:', contract._id);
        
        res.json({
            success: true,
            status: contract.status,
            message: 'Contract signed successfully!'
        });
        
    } catch (error) {
        console.error('[Contract] Shared sign error:', error);
        res.status(500).json({ error: 'Failed to sign contract' });
    }
};

const generateContractPDF = async (req, res) => {
    try {
        console.log('[Contract] Generating PDF for contract:', req.params.id);
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            console.log('[Contract] Contract not found:', req.params.id);
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=contract-${contract._id}.pdf`);
        
        doc.pipe(res);
        
        const brandColor = '#667eea';
        const darkGray = '#333333';
        const mediumGray = '#666666';
        const lightGray = '#999999';
        
        // Header
        doc.rect(0, 0, 612, 100).fill(brandColor);
        doc.fontSize(28).font('Helvetica-Bold').fillColor('white')
           .text(contract.contractTitle || 'Professional Services Contract', 50, 35, { width: 512, align: 'center' });
        
        let yPos = 130;
        doc.fontSize(10).font('Helvetica').fillColor(darkGray)
           .text(`Effective Date: ${contract.effectiveDate}`, 50, yPos);
        
        yPos += 30;
        
        // Parties
        doc.fontSize(12).font('Helvetica-Bold').fillColor(brandColor)
           .text('PARTIES TO THIS AGREEMENT', 50, yPos);
        yPos += 20;
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('Service Provider:', 50, yPos);
        yPos += 15;
        doc.font('Helvetica').fillColor(mediumGray);
        if (contract.parties?.serviceProvider?.name) {
            doc.text(contract.parties.serviceProvider.name, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.serviceProvider?.address) {
            doc.text(contract.parties.serviceProvider.address, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.serviceProvider?.email) {
            doc.text(contract.parties.serviceProvider.email, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.serviceProvider?.phone) {
            doc.text(contract.parties.serviceProvider.phone, 50, yPos);
            yPos += 14;
        }
        
        yPos += 10;
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('Client:', 50, yPos);
        yPos += 15;
        doc.font('Helvetica').fillColor(mediumGray);
        if (contract.parties?.client?.name) {
            doc.text(contract.parties.client.name, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.signingAuthority) {
            doc.text(`Signing Authority: ${contract.parties.client.signingAuthority}`, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.address) {
            doc.text(contract.parties.client.address, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.email) {
            doc.text(contract.parties.client.email, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.phone) {
            doc.text(contract.parties.client.phone, 50, yPos);
            yPos += 14;
        }
        
        yPos += 20;
        
        // Sections
        if (contract.sections && contract.sections.length > 0) {
            contract.sections.sort((a, b) => a.order - b.order).forEach(section => {
                if (yPos > 680) {
                    doc.addPage();
                    yPos = 50;
                }
                
                doc.fontSize(11).font('Helvetica-Bold').fillColor(brandColor)
                   .text(`${section.order}. ${section.title}`, 50, yPos);
                yPos += 18;
                
                doc.fontSize(10).font('Helvetica').fillColor(darkGray);
                const lines = section.content.split('\n');
                lines.forEach(line => {
                    if (yPos > 720) {
                        doc.addPage();
                        yPos = 50;
                    }
                    
                    if (line.trim()) {
                        doc.text(line, 50, yPos, { width: 512, align: 'left' });
                        yPos += doc.heightOfString(line, { width: 512 }) + 5;
                    } else {
                        yPos += 8;
                    }
                });
                
                yPos += 15;
            });
        }
        
        // Signatures
        yPos += 30;
        if (yPos > 600) {
            doc.addPage();
            yPos = 50;
        }
        
        doc.fontSize(14).font('Helvetica-Bold').fillColor(brandColor).text('SIGNATURES', 50, yPos);
        yPos += 25;
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('Service Provider:', 50, yPos);
        yPos += 20;
        
        if (contract.signatures?.serviceProvider?.signatureData) {
            try {
                const signatureBuffer = Buffer.from(contract.signatures.serviceProvider.signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                doc.image(signatureBuffer, 50, yPos, { width: 200, height: 60 });
                yPos += 70;
            } catch (err) {
                console.error('[Contract PDF] Signature image error:', err);
                yPos += 60;
            }
            
            doc.moveTo(50, yPos).lineTo(250, yPos).stroke();
            yPos += 5;
            doc.fontSize(9).font('Helvetica').fillColor(mediumGray)
               .text(`Signed by: ${contract.signatures.serviceProvider.signedBy}`, 50, yPos);
            yPos += 12;
            
            if (contract.signatures.serviceProvider.signedAt) {
                const signedDate = new Date(contract.signatures.serviceProvider.signedAt).toLocaleDateString();
                doc.text(`Date: ${signedDate}`, 50, yPos);
            }
            yPos += 20;
        } else {
            doc.moveTo(50, yPos + 60).lineTo(250, yPos + 60).stroke();
            yPos += 65;
            doc.fontSize(9).font('Helvetica-Oblique').fillColor(lightGray)
               .text('Signature (Not yet signed)', 50, yPos);
            yPos += 20;
        }
        
        yPos += 20;
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('Client:', 50, yPos);
        yPos += 20;
        
        if (contract.signatures?.client?.signatureData) {
            try {
                const signatureBuffer = Buffer.from(contract.signatures.client.signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                doc.image(signatureBuffer, 50, yPos, { width: 200, height: 60 });
                yPos += 70;
            } catch (err) {
                console.error('[Contract PDF] Signature image error:', err);
                yPos += 60;
            }
            
            doc.moveTo(50, yPos).lineTo(250, yPos).stroke();
            yPos += 5;
            doc.fontSize(9).font('Helvetica').fillColor(mediumGray)
               .text(`Signed by: ${contract.signatures.client.signedBy}`, 50, yPos);
            yPos += 12;
            
            if (contract.signatures.client.signedAt) {
                const signedDate = new Date(contract.signatures.client.signedAt).toLocaleDateString();
                doc.text(`Date: ${signedDate}`, 50, yPos);
            }
        } else {
            doc.moveTo(50, yPos + 60).lineTo(250, yPos + 60).stroke();
            yPos += 65;
            doc.fontSize(9).font('Helvetica-Oblique').fillColor(lightGray)
               .text('Signature (Not yet signed)', 50, yPos);
        }
        
        // Footer
        doc.fontSize(8).fillColor('#999999')
           .text(`Contract Status: ${contract.status || 'draft'}`, 50, 750, { width: 512, align: 'center' })
           .text('This contract was generated electronically.', 50, 760, { width: 512, align: 'center' });
        
        doc.end();
        
        console.log('[Contract] PDF generation completed');
        
    } catch (error) {
        console.error('[Contract] PDF error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
        }
    }
};

// Save contract to Google Drive
const saveToGoogleDrive = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        // Check if user has Drive access
        if (!hasDriveAccess(user)) {
            return res.status(403).json({ 
                error: 'Google Drive access not available. Please re-login to grant permissions.' 
            });
        }

        const contract = await Contract.findById(id);
        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        // Generate PDF to temp file
        const tempDir = path.join(__dirname, '../uploads/temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const contractTitle = contract.title.replace(/[^a-z0-9]/gi, '_');
        const pdfPath = path.join(tempDir, `contract-${contractTitle}-${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(writeStream);

        // Generate PDF (simplified version for Drive upload)
        const brandColor = '#667eea';
        const darkGray = '#333333';
        const lightGray = '#999999';
        
        doc.rect(0, 0, 612, 100).fill(brandColor);
        doc.fontSize(28).font('Helvetica-Bold').fillColor('white').text('SERVICE CONTRACT', 50, 35);
        
        let yPos = 130;
        doc.fontSize(18).font('Helvetica-Bold').fillColor(darkGray).text(contract.title, 50, yPos);
        yPos += 40;
        
        // Parties
        doc.fontSize(12).font('Helvetica-Bold').fillColor(brandColor).text('SERVICE PROVIDER', 50, yPos);
        yPos += 20;
        doc.fontSize(10).font('Helvetica').fillColor(darkGray)
           .text(contract.parties?.serviceProvider?.name || 'N/A', 50, yPos);
        yPos += 15;
        doc.fontSize(9).fillColor(lightGray)
           .text(contract.parties?.serviceProvider?.address || '', 50, yPos);
        yPos += 15;
        doc.text(contract.parties?.serviceProvider?.email || '', 50, yPos);
        yPos += 30;
        
        doc.fontSize(12).font('Helvetica-Bold').fillColor(brandColor).text('CLIENT', 50, yPos);
        yPos += 20;
        doc.fontSize(10).font('Helvetica').fillColor(darkGray)
           .text(contract.parties?.client?.name || 'N/A', 50, yPos);
        yPos += 15;
        doc.fontSize(9).fillColor(lightGray)
           .text(contract.parties?.client?.address || '', 50, yPos);
        yPos += 15;
        doc.text(contract.parties?.client?.email || '', 50, yPos);
        yPos += 40;
        
        // Sections
        if (contract.sections && contract.sections.length > 0) {
            contract.sections.forEach(section => {
                if (yPos > 680) {
                    doc.addPage();
                    yPos = 50;
                }
                
                doc.fontSize(12).font('Helvetica-Bold').fillColor(brandColor)
                   .text(section.title, 50, yPos);
                yPos += 20;
                
                doc.fontSize(10).font('Helvetica').fillColor(darkGray)
                   .text(section.content, 50, yPos, { width: 512, align: 'justify' });
                yPos += doc.heightOfString(section.content, { width: 512 }) + 20;
            });
        }
        
        doc.fontSize(8).fillColor('#999999')
           .text(`Contract Status: ${contract.status || 'draft'}`, 50, 750, { width: 512, align: 'center' });
        
        doc.end();

        // Wait for PDF to finish writing
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Upload to Drive
        const driveResult = await saveContractToDrive(user, contract, pdfPath);

        // Cleanup temp file
        setTimeout(() => {
            try {
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            } catch (err) {
                console.error('Error cleaning up temp PDF:', err);
            }
        }, 5000);

        res.json({
            success: true,
            drive: driveResult
        });

    } catch (error) {
        console.error('[Contract] Drive save error:', error);
        res.status(500).json({ error: error.message || 'Failed to save to Google Drive' });
    }
};

module.exports = {
    generateContract,
    getContractsByUser,
    getContract,
    updateContract,
    deleteContract,
    addSignature,
    removeSignature,
    generateShareableLink,
    getSharedContract,
    signSharedContract,
    generateContractPDF,
    saveToGoogleDrive
};
