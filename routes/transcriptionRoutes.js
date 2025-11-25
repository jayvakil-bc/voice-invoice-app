const express = require('express');
const multer = require('multer');
const transcriptionController = require('../controllers/transcriptionController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 25 * 1024 * 1024 }
});

router.post('/api/transcribe-audio', requireAuth, upload.single('audio'), transcriptionController.transcribeAudio);

module.exports = router;
