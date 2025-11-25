/**
 * Centralized error handling middleware
 */

const errorHandler = (err, req, res, next) => {
    console.error('[Error Handler]', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            details: Object.values(err.errors).map(e => e.message)
        });
    }

    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'Invalid ID format'
        });
    }

    // Duplicate key error
    if (err.code === 11000) {
        return res.status(409).json({
            error: 'Duplicate entry',
            field: Object.keys(err.keyPattern)[0]
        });
    }

    // Default error
    res.status(err.statusCode || 500).json({
        error: err.message || 'Internal server error'
    });
};

const notFoundHandler = (req, res) => {
    res.status(404).json({ error: 'Route not found' });
};

module.exports = {
    errorHandler,
    notFoundHandler
};
