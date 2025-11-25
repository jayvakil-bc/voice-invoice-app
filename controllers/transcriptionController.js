const fs = require('fs');
const { getOpenAIClient } = require('../utils/openai');

const transcribeAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }
        
        console.log('[Transcribe] Processing audio file:', req.file.originalname, req.file.size, 'bytes');
        
        const openai = getOpenAIClient();
        
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(req.file.path),
            model: 'whisper-1'
        });
        
        fs.unlinkSync(req.file.path);
        
        console.log('[Transcribe] Success');
        res.json({ transcription: transcription.text });
        
    } catch (error) {
        console.error('[Transcribe] Error:', error.message);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to transcribe audio' });
    }
};

module.exports = {
    transcribeAudio
};
