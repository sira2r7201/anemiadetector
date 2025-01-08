// Frontend Code (main.js)
let model;
let selectedImageFile;

// Model loading with better error handling and loading state
async function loadModel() {
    try {
        const loadingIndicator = document.getElementById('modelLoadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
        
        model = await tf.loadLayersModel('https://abc123.ngrok.io/model/model.json');
        console.log("Model loaded successfully!");
        
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        document.getElementById('chooseImageButton')?.removeAttribute('disabled');
    } catch (error) {
        console.error("Error loading the model:", error);
        if (loadingIndicator) {
            loadingIndicator.innerHTML = 'Error loading model. Please refresh the page.';
        }
    }
}

// Image validation
function validateImage(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
        throw new Error('Invalid file type. Please upload JPEG, PNG, or GIF.');
    }
    if (file.size > maxSize) {
        throw new Error('File too large. Maximum size is 5MB.');
    }
}

// Image preview with validation
function previewImage(file) {
    return new Promise((resolve, reject) => {
        try {
            validateImage(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewContainer = document.getElementById('imagePreview');
                if (!previewContainer) return reject(new Error('Preview container not found'));
                
                previewContainer.innerHTML = '';
                const img = document.createElement('img');
                img.src = e.target.result;
                img.alt = "Selected Image";
                img.style.maxWidth = '100%';
                img.style.maxHeight = '300px';
                previewContainer.appendChild(img);
                resolve(e.target.result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        } catch (error) {
            reject(error);
        }
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadModel();
    setupEventListeners();
    loadStoredImages();
});

function setupEventListeners() {
    const chooseImageButton = document.getElementById('chooseImageButton');
    const imageInput = document.getElementById('imageInput');
    const predictButton = document.getElementById('predictButton');

    chooseImageButton?.addEventListener('click', () => {
        imageInput?.click();
    });

    imageInput?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const imageDataUrl = await previewImage(file);
            selectedImageFile = file;
            
            localStorage.setItem('capturedImage', imageDataUrl);
            localStorage.setItem('leftEyeImage', imageDataUrl);
            
            if (predictButton) {
                predictButton.disabled = false;
            }
        } catch (error) {
            alert(error.message);
            if (predictButton) {
                predictButton.disabled = true;
            }
        }
    });

    predictButton?.addEventListener('click', handlePrediction);
}

// Prediction handling
async function handlePrediction() {
    if (!selectedImageFile || !model) {
        alert('Please select an image and ensure the model is loaded.');
        return;
    }

    const resultElement = document.getElementById('result');
    if (!resultElement) return;

    try {
        resultElement.innerHTML = '<p>Analyzing image...</p>';
        const image = await loadImage(selectedImageFile);
        const prediction = await makePrediction(image);
        displayResults(prediction, resultElement);
    } catch (error) {
        console.error("Error during prediction:", error);
        resultElement.innerHTML = "<p>Error during analysis. Please try again.</p>";
    }
}

async function makePrediction(image) {
    const tensor = tf.tidy(() => {
        return tf.browser.fromPixels(image)
            .resizeBilinear([224, 224])
            .toFloat()
            .expandDims();
    });

    const prediction = await model.predict(tensor).data();
    tensor.dispose();
    return prediction;
}

function displayResults(prediction, resultElement) {
    const predictedClass = prediction.indexOf(Math.max(...prediction));
    const accuracy = Math.max(...prediction);
    
    const bloodValue = predictedClass === 0
        ? (12.4 - (accuracy * (12.4 - 9.0))).toFixed(1)
        : (12.5 + (accuracy * (16.0 - 12.5))).toFixed(1);

    const resultMessage = predictedClass === 0
        ? "คุณมีความเสี่ยงต่อการเป็นภาวะโลหิตจาง"
        : "คุณไม่มีความเสี่ยงต่อการเป็นภาวะโลหิตจาง";

    resultElement.innerHTML = `
        <strong>ผลการวิเคราะห์</strong><br>
        ${resultMessage}<br>
        ค่าเลือดของท่านคือ ${bloodValue} g/dL`;
}

// Backend Code (server.js)
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { body, validationResult } = require('express-validator');

const app = express();

// MongoDB connection with retry logic
async function connectDB() {
    try {
        await mongoose.connect('mongodb://localhost:27017/registration', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
}

connectDB();

// Enhanced User Schema with validation
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long']
    },
    surname: {
        type: String,
        required: [true, 'Surname is required'],
        trim: true
    },
    nationality: {
        type: String,
        required: [true, 'Nationality is required'],
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        match: [/^\+?[\d\s-]{8,}$/, 'Please enter a valid phone number']
    },
    dob: {
        type: Date,
        required: [true, 'Date of birth is required'],
        max: [Date.now(), 'Date of birth cannot be in the future']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema);

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Validation middleware
const validateUser = [
    body('name').trim().isLength({ min: 2 }).escape(),
    body('surname').trim().notEmpty().escape(),
    body('nationality').trim().notEmpty().escape(),
    body('phone').matches(/^\+?[\d\s-]{8,}$/),
    body('dob').isISO8601().toDate()
];

// Routes
app.post('/api/register', validateUser, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const newUser = new User(req.body);
        await newUser.save();
        res.status(201).json({
            message: 'ข้อมูลถูกบันทึกแล้ว',
            userId: newUser._id
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
            error: error.message
        });
    }
});

app.post('/api/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        res.json({
            message: 'ภาพถูกอัปโหลดแล้ว',
            filePath: req.file.path
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์',
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'เกิดข้อผิดพลาดในระบบ',
        error: err.message
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));